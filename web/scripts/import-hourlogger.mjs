import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function usage() {
  console.error(
    [
      "Usage:",
      "  node scripts/import-hourlogger.mjs --file \"/absolute/path/hourlogger-data.json\" --email \"user@example.com\"",
      "",
      "Required env vars:",
      "  NEXT_PUBLIC_SUPABASE_URL",
      "  SUPABASE_SERVICE_ROLE_KEY",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function sanitizeMins(value) {
  const mins = Number.parseInt(String(value ?? 0), 10);
  return Number.isFinite(mins) && mins >= 0 ? mins : 0;
}

async function findUserIdByEmail(adminClient, email) {
  let page = 1;
  const perPage = 200;
  const normalized = email.trim().toLowerCase();

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw new Error(`Failed to list users: ${error.message}`);

    const users = data?.users ?? [];
    const match = users.find((user) => (user.email ?? "").toLowerCase() === normalized);
    if (match) return match.id;
    if (users.length < perPage) break;
    page += 1;
  }

  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = args.file;
  const userEmail = args.email;

  if (!inputPath || !userEmail) {
    usage();
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const adminClient = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const resolvedPath = path.resolve(inputPath);
  const raw = await fs.readFile(resolvedPath, "utf8");
  const parsed = JSON.parse(raw);
  const work = parsed?.work ?? {};
  const comp = parsed?.comp ?? {};

  const userId = await findUserIdByEmail(adminClient, userEmail);
  if (!userId) {
    throw new Error(`No Supabase user found for email: ${userEmail}`);
  }

  const dayRows = Object.entries(work)
    .filter(([date]) => isValidDate(date))
    .map(([date, entry]) => ({
      user_id: userId,
      work_date: date,
      start_time: typeof entry?.start === "string" ? entry.start : "",
      stop_time: typeof entry?.stop === "string" ? entry.stop : "",
      net_mins: sanitizeMins(entry?.netMins),
      holiday: Boolean(entry?.holiday),
      source: "hourlogger_import",
    }));

  if (dayRows.length > 0) {
    const { error } = await adminClient
      .from("time_day_logs")
      .upsert(dayRows, { onConflict: "user_id,work_date" });
    if (error) throw new Error(`Failed to upsert day logs: ${error.message}`);
  }

  const { data: dayLogRows, error: dayLogError } = await adminClient
    .from("time_day_logs")
    .select("id, work_date")
    .eq("user_id", userId);
  if (dayLogError) throw new Error(`Failed to fetch day log ids: ${dayLogError.message}`);

  const dayIdByDate = new Map((dayLogRows ?? []).map((row) => [row.work_date, row.id]));
  const allDayLogIds = (dayLogRows ?? []).map((row) => row.id);

  if (allDayLogIds.length > 0) {
    const { error } = await adminClient.from("time_day_breaks").delete().in("day_log_id", allDayLogIds);
    if (error) throw new Error(`Failed to clear existing breaks: ${error.message}`);
  }

  const breakRows = [];
  for (const [date, entry] of Object.entries(work)) {
    if (!isValidDate(date)) continue;
    const dayLogId = dayIdByDate.get(date);
    if (!dayLogId) continue;
    const breaks = Array.isArray(entry?.breaks) ? entry.breaks : [];
    breaks.forEach((breakEntry, index) => {
      breakRows.push({
        day_log_id: dayLogId,
        position: index,
        name: typeof breakEntry?.name === "string" ? breakEntry.name : "",
        mins: sanitizeMins(breakEntry?.mins),
      });
    });
  }

  if (breakRows.length > 0) {
    const { error } = await adminClient.from("time_day_breaks").insert(breakRows);
    if (error) throw new Error(`Failed to insert breaks: ${error.message}`);
  }

  const compRows = Object.entries(comp)
    .filter(([date]) => isValidDate(date))
    .map(([date, entry]) => ({
      user_id: userId,
      work_date: date,
      mins: sanitizeMins(entry?.mins),
      note: typeof entry?.note === "string" ? entry.note : "",
      source: "hourlogger_import",
    }));

  if (compRows.length > 0) {
    const { error } = await adminClient
      .from("time_comp_adjustments")
      .upsert(compRows, { onConflict: "user_id,work_date" });
    if (error) throw new Error(`Failed to upsert comp adjustments: ${error.message}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        user_email: userEmail,
        user_id: userId,
        imported_day_logs: dayRows.length,
        imported_break_rows: breakRows.length,
        imported_comp_rows: compRows.length,
        source_file: resolvedPath,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

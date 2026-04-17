import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { guardAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeUserRole, type UserRole } from "@/lib/user-role";
import { readWorkspaceSettings, type WorkspaceSettings } from "@/lib/workspace-settings";
import { sanitizeMins } from "@/lib/time-tracker-queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReminderRow = {
  sent_at: string;
  email: string;
  status: "sent" | "failed" | "skipped_dry_run";
  mode: "cron" | "admin";
  forced: boolean;
  dry_run: boolean;
};

type CronRunSummary = {
  sent_at: string;
  sent: number;
  failed: number;
  skipped_dry_run: number;
} | null;

type ReminderStats = {
  total_logged: number;
  last_cron_run: CronRunSummary;
  last_7_days: { sent: number; failed: number; skipped_dry_run: number };
  last_30_days: { sent: number; failed: number; skipped_dry_run: number; total: number };
  failure_rate_30d: number;
  top_reminded_90d: Array<{ email: string; count: number }>;
};

type WorkspaceKpis = {
  total_users: number;
  users_by_role: Record<string, number>;
  active_last_7_days: number;
  hours_logged_last_7_days: number;
  hours_logged_this_month: number;
};

type InsightsResponse = {
  generated_at: string;
  settings: WorkspaceSettings;
  reminders: ReminderStats;
  workspace: WorkspaceKpis;
};

const REMINDER_ROW_FETCH_LIMIT = 1000;

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function startOfMonthIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

async function fetchReminderRows(admin: SupabaseClient): Promise<ReminderRow[] | null> {
  const cutoff = daysAgoIso(90);
  const { data, error } = await admin
    .from("time_log_reminder_sends")
    .select("sent_at, email, status, mode, forced, dry_run")
    .gte("sent_at", cutoff)
    .order("sent_at", { ascending: false })
    .limit(REMINDER_ROW_FETCH_LIMIT);
  if (error) {
    // Table might not be migrated yet — return null so the UI can render a
    // "migration pending" hint instead of crashing the whole insights view.
    console.error("time_log_reminder_sends read failed", error);
    return null;
  }
  return (data as ReminderRow[] | null) ?? [];
}

function summarizeReminders(rows: ReminderRow[]): ReminderStats {
  // Only real production sends count toward stats. Dry runs and test-send
  // traffic (mode='admin') are excluded so charts aren't polluted by
  // debugging activity.
  const realSends = rows.filter(
    (row) => row.mode === "cron" && !row.dry_run && row.status !== "skipped_dry_run",
  );

  const lastCronRows = (() => {
    if (rows.length === 0) return [];
    // "A cron run" = every row with the same mode='cron' sent_at ± 5 min.
    // Since rows are already sorted desc by sent_at, group by the first
    // cron row's timestamp window.
    const cronRows = rows.filter((row) => row.mode === "cron");
    if (cronRows.length === 0) return [];
    const latest = new Date(cronRows[0].sent_at).getTime();
    return cronRows.filter((row) => {
      const delta = latest - new Date(row.sent_at).getTime();
      return delta >= 0 && delta <= 5 * 60 * 1000;
    });
  })();

  const lastCronRun: CronRunSummary =
    lastCronRows.length > 0
      ? {
          sent_at: lastCronRows[0].sent_at,
          sent: lastCronRows.filter((row) => row.status === "sent").length,
          failed: lastCronRows.filter((row) => row.status === "failed").length,
          skipped_dry_run: lastCronRows.filter((row) => row.status === "skipped_dry_run").length,
        }
      : null;

  const cutoff7 = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const cutoff30 = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const within = (row: ReminderRow, cutoffMs: number) =>
    new Date(row.sent_at).getTime() >= cutoffMs;

  const bucket = (source: ReminderRow[]) => ({
    sent: source.filter((row) => row.status === "sent").length,
    failed: source.filter((row) => row.status === "failed").length,
    skipped_dry_run: source.filter((row) => row.status === "skipped_dry_run").length,
  });

  const last7 = bucket(realSends.filter((row) => within(row, cutoff7)));
  const last30Real = realSends.filter((row) => within(row, cutoff30));
  const last30 = { ...bucket(last30Real), total: last30Real.length };
  const failureRate30d = last30.total > 0 ? last30.failed / last30.total : 0;

  const countsByEmail = new Map<string, number>();
  for (const row of realSends) {
    if (row.status !== "sent") continue;
    countsByEmail.set(row.email, (countsByEmail.get(row.email) ?? 0) + 1);
  }
  const topReminded = [...countsByEmail.entries()]
    .map(([email, count]) => ({ email, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    total_logged: rows.length,
    last_cron_run: lastCronRun,
    last_7_days: last7,
    last_30_days: last30,
    failure_rate_30d: failureRate30d,
    top_reminded_90d: topReminded,
  };
}

function extractRole(metadata: unknown): UserRole | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const record = metadata as Record<string, unknown>;
  return normalizeUserRole(record.role);
}

async function fetchWorkspaceKpis(admin: SupabaseClient): Promise<WorkspaceKpis> {
  const perPage = 200;
  let page = 1;
  let totalUsers = 0;
  let activeLast7Days = 0;
  const usersByRole: Record<string, number> = { sales: 0, eu_pilot: 0, us_pilot: 0, hr: 0, none: 0 };
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const pageUsers = data?.users ?? [];
    for (const user of pageUsers) {
      totalUsers += 1;
      const role = extractRole(user.user_metadata);
      const key = role ?? "none";
      usersByRole[key] = (usersByRole[key] ?? 0) + 1;
      if (user.last_sign_in_at) {
        const ts = new Date(user.last_sign_in_at).getTime();
        if (Number.isFinite(ts) && ts >= sevenDaysAgo) activeLast7Days += 1;
      }
    }
    if (pageUsers.length < perPage) break;
    page += 1;
    if (page > 50) break;
  }

  const monthStart = startOfMonthIso();
  const sevenDaysAgoIsoDate = daysAgoIso(7).slice(0, 10);
  const monthStartDate = monthStart.slice(0, 10);

  const [weekRes, monthRes] = await Promise.all([
    admin.from("time_day_logs").select("net_mins").gte("work_date", sevenDaysAgoIsoDate),
    admin.from("time_day_logs").select("net_mins").gte("work_date", monthStartDate),
  ]);

  const sumMinutes = (rows: Array<{ net_mins: unknown }> | null | undefined) => {
    if (!rows) return 0;
    let total = 0;
    for (const row of rows) total += sanitizeMins(row.net_mins);
    return total;
  };

  const weekMinutes = weekRes.error ? 0 : sumMinutes(weekRes.data);
  const monthMinutes = monthRes.error ? 0 : sumMinutes(monthRes.data);

  return {
    total_users: totalUsers,
    users_by_role: usersByRole,
    active_last_7_days: activeLast7Days,
    hours_logged_last_7_days: Math.round((weekMinutes / 60) * 10) / 10,
    hours_logged_this_month: Math.round((monthMinutes / 60) * 10) / 10,
  };
}

export async function GET() {
  const guard = await guardAdmin();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();

  const [rows, settings, workspace] = await Promise.all([
    fetchReminderRows(admin),
    readWorkspaceSettings(admin),
    fetchWorkspaceKpis(admin).catch((error: unknown) => {
      console.error("insights workspace kpis failed", error);
      return {
        total_users: 0,
        users_by_role: {},
        active_last_7_days: 0,
        hours_logged_last_7_days: 0,
        hours_logged_this_month: 0,
      } satisfies WorkspaceKpis;
    }),
  ]);

  const reminders = rows
    ? summarizeReminders(rows)
    : {
        total_logged: 0,
        last_cron_run: null,
        last_7_days: { sent: 0, failed: 0, skipped_dry_run: 0 },
        last_30_days: { sent: 0, failed: 0, skipped_dry_run: 0, total: 0 },
        failure_rate_30d: 0,
        top_reminded_90d: [],
      };

  const payload: InsightsResponse = {
    generated_at: new Date().toISOString(),
    settings,
    reminders,
    workspace,
  };

  return NextResponse.json(payload);
}

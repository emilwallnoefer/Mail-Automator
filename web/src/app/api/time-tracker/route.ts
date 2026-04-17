import { createClient } from "@/lib/supabase/server";
import { fetchTravelByDate, type TravelSheetColumnMapping } from "@/lib/google-sheets";
import { sanitizeText } from "@/lib/security/input-sanitize";
import { checkRateLimit, createRateLimitHeaders, getClientIp } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";
import { z } from "zod";
import { TIME_TRACKER_TARGET_MINS } from "@/lib/time-tracker-rules";
import { fetchWeekForUser, getWeekStartDate, sanitizeMins } from "@/lib/time-tracker-queries";

const TARGET_MINS = TIME_TRACKER_TARGET_MINS;

type ImportPayload = {
  work?: Record<
    string,
    {
      start?: string;
      stop?: string;
      breaks?: Array<{ name?: string; mins?: number }>;
      netMins?: number;
      holiday?: boolean;
    }
  >;
  comp?: Record<string, { mins?: number; note?: string }>;
};

const breakInputSchema = z.object({
  name: z.string().max(120).optional(),
  mins: z.number().int().min(0).max(1440).optional(),
});

const dayInputSchema = z.object({
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().max(8).optional(),
  stop_time: z.string().max(8).optional(),
  net_mins: z.number().int().min(0).max(1440).optional(),
  holiday: z.boolean().optional(),
  breaks: z.array(breakInputSchema).max(20).optional(),
});

const importPayloadSchema = z.object({
  work: z
    .record(
      z.string(),
      z.object({
        start: z.string().max(8).optional(),
        stop: z.string().max(8).optional(),
        breaks: z.array(breakInputSchema).max(20).optional(),
        netMins: z.number().int().min(0).max(1440).optional(),
        holiday: z.boolean().optional(),
      }),
    )
    .optional(),
  comp: z
    .record(
      z.string(),
      z.object({
        mins: z.number().int().min(0).max(1440).optional(),
        note: z.string().max(500).optional(),
      }),
    )
    .optional(),
});

const postPayloadSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save_day"), day: dayInputSchema }),
  z.object({ action: z.literal("reset_day"), work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({ action: z.literal("fill_missing"), work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({ action: z.literal("import_json"), data: importPayloadSchema }),
  z.object({ action: z.literal("export_json") }),
]);

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeColumnLetter(value: unknown) {
  const text = String(value ?? "").trim().toUpperCase();
  if (!text) return undefined;
  if (!/^[A-Z]+$/.test(text)) return undefined;
  return text;
}

function parseUserTravelMapping(rawMetadata: unknown): TravelSheetColumnMapping | undefined {
  if (!rawMetadata || typeof rawMetadata !== "object" || Array.isArray(rawMetadata)) return undefined;
  const metadata = rawMetadata as Record<string, unknown>;
  const rawMapping = metadata.travel_sheet_mapping;
  if (!rawMapping || typeof rawMapping !== "object" || Array.isArray(rawMapping)) return undefined;
  const mappingInput = rawMapping as Record<string, unknown>;

  const mapping: TravelSheetColumnMapping = {
    monthYearColumn: normalizeColumnLetter(mappingInput.monthYearColumn),
    dayColumn: normalizeColumnLetter(mappingInput.dayColumn),
    clientColumn: normalizeColumnLetter(mappingInput.clientColumn),
    locationColumn: normalizeColumnLetter(mappingInput.locationColumn),
    responsibleColumn: normalizeColumnLetter(mappingInput.responsibleColumn),
  };

  const range = String(mappingInput.range ?? "").trim();
  if (range) mapping.range = range;

  const gid = String(mappingInput.gid ?? "").trim();
  if (gid) mapping.gid = gid;

  const hasAnyConfig = Object.values(mapping).some((value) => Boolean(value));
  return hasAnyConfig ? mapping : undefined;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const weekStartDate = getWeekStartDate(url.searchParams.get("weekStart") ?? undefined);
  const includeTravel = url.searchParams.get("includeTravel") !== "0";
  const includeBank = url.searchParams.get("includeBank") !== "0";
  if (!weekStartDate) return NextResponse.json({ error: "Invalid weekStart date" }, { status: 400 });

  let week;
  try {
    week = await fetchWeekForUser(supabase, user.id, weekStartDate, { includeBank });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to load tracker week" },
      { status: 500 },
    );
  }

  const { week_start: weekStart, week_end: weekEnd, days: weekDays, week_hours_mins: weekHoursMins } = week;
  const overtimeBankMins = week.overtime_bank_mins;
  const includesBank = week.includes_bank;

  let travelByDate: Record<
    string,
    {
      client: string;
      location: string;
      responsible: string;
    }
  > = {};
  let travelDebug: {
    status:
      | "not_attempted"
      | "missing_refresh_token"
      | "ok"
      | "ok_empty"
      | "ok_no_week_match"
      | "error";
    message: string;
    fetched_dates: number;
    week_matches: number;
  } = {
    status: "not_attempted",
    message: "Not attempted yet.",
    fetched_dates: 0,
    week_matches: 0,
  };
  const weekDateSet = new Set(weekDays.map((day) => day.date));
  if (includeTravel) {
    try {
      const refreshToken = String(user.user_metadata?.gmail_refresh_token ?? "");
      if (!refreshToken) {
        travelDebug = {
          status: "missing_refresh_token",
          message: "No Google refresh token found. Reconnect Gmail/Google in Settings.",
          fetched_dates: 0,
          week_matches: 0,
        };
      } else {
        const userTravelMapping = parseUserTravelMapping(user.user_metadata);
        travelByDate = await fetchTravelByDate(refreshToken, userTravelMapping);
        const fetchedDates = Object.keys(travelByDate);
        const weekMatches = fetchedDates.filter((date) => weekDateSet.has(date)).length;
        if (fetchedDates.length === 0) {
          travelDebug = {
            status: "ok_empty",
            message: "Sheet fetch succeeded but no parseable travel rows were found.",
            fetched_dates: 0,
            week_matches: 0,
          };
        } else if (weekMatches === 0) {
          travelDebug = {
            status: "ok_no_week_match",
            message: "Travel rows loaded, but none match the currently selected week.",
            fetched_dates: fetchedDates.length,
            week_matches: 0,
          };
        } else {
          travelDebug = {
            status: "ok",
            message: "Travel rows loaded and matched at least one date in this week.",
            fetched_dates: fetchedDates.length,
            week_matches: weekMatches,
          };
        }
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown travel sheet error.";
      travelDebug = {
        status: "error",
        message: errMsg,
        fetched_dates: 0,
        week_matches: 0,
      };
      // Non-blocking: tracker remains available even if travel sheet access fails.
    }
  } else {
    travelDebug = {
      status: "not_attempted",
      message: "Travel fetch skipped for fast initial week load.",
      fetched_dates: 0,
      week_matches: 0,
    };
  }

  return NextResponse.json({
    week_start: weekStart,
    week_end: weekEnd,
    target_mins: TARGET_MINS,
    week_hours_mins: weekHoursMins,
    overtime_bank_mins: overtimeBankMins,
    days: weekDays,
    travel_by_date: travelByDate,
    travel_debug: travelDebug,
    includes_travel: includeTravel,
    includes_bank: includesBank,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const authedUser = user;
  const clientIp = getClientIp(request);
  const limitResult = checkRateLimit(`time-tracker-write:${authedUser.id}:${clientIp}`, {
    windowMs: 60 * 60 * 1000,
    max: 180,
  });
  if (!limitResult.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please retry later." },
      { status: 429, headers: createRateLimitHeaders(limitResult) },
    );
  }

  const parsedPayload = postPayloadSchema.safeParse(await request.json());
  if (!parsedPayload.success) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }
  const payload = parsedPayload.data;

  async function requireSnapshot(reason: string) {
    const snapshotRes = await supabase.rpc("create_time_tracker_snapshot", {
      p_user: authedUser.id,
      p_reason: reason,
    });
    if (snapshotRes.error) {
      const detail = snapshotRes.error.message ?? "";
      const looksLikeMissingDurabilityObjects =
        /create_time_tracker_snapshot|function .* does not exist|time_tracker_snapshots|relation .* does not exist/i.test(
          detail,
        );
      return NextResponse.json(
        {
          error: looksLikeMissingDurabilityObjects
            ? "Could not create safety snapshot before update. Run web/supabase/time-tracker-durability.sql in Supabase SQL Editor, then retry."
            : "Could not create safety snapshot before update. No data was changed. Please retry.",
          detail,
        },
        { status: 500 },
      );
    }
    return null;
  }

  if (payload.action === "save_day") {
    const day = payload.day;
    if (!day?.work_date || !isDateKey(day.work_date)) {
      return NextResponse.json({ error: "Invalid work_date" }, { status: 400 });
    }

    const snapshotErr = await requireSnapshot(`before_save_day_${day.work_date}`);
    if (snapshotErr) return snapshotErr;

    const saveRes = await supabase
      .from("time_day_logs")
      .upsert(
        {
          user_id: authedUser.id,
          work_date: day.work_date,
          start_time: sanitizeText(day.start_time, { maxLen: 8 }),
          stop_time: sanitizeText(day.stop_time, { maxLen: 8 }),
          net_mins: sanitizeMins(day.net_mins),
          holiday: Boolean(day.holiday),
          source: "ui",
        },
        { onConflict: "user_id,work_date" },
      )
      .select("id")
      .single();

    if (saveRes.error) return NextResponse.json({ error: saveRes.error.message }, { status: 500 });

    const dayLogId = saveRes.data.id;
    const clearBreaksRes = await supabase.from("time_day_breaks").delete().eq("day_log_id", dayLogId);
    if (clearBreaksRes.error) return NextResponse.json({ error: clearBreaksRes.error.message }, { status: 500 });

    const breaks = (day.breaks ?? []).map((item, index) => ({
      day_log_id: dayLogId,
      position: index,
      name: sanitizeText(item?.name, { maxLen: 120 }),
      mins: sanitizeMins(item?.mins),
    }));

    if (breaks.length > 0) {
      const addBreaksRes = await supabase.from("time_day_breaks").insert(breaks);
      if (addBreaksRes.error) return NextResponse.json({ error: addBreaksRes.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  if (payload.action === "reset_day") {
    const date = payload.work_date;
    if (!date || !isDateKey(date)) return NextResponse.json({ error: "Invalid work_date" }, { status: 400 });

    const snapshotErr = await requireSnapshot(`before_reset_day_${date}`);
    if (snapshotErr) return snapshotErr;

    const deleteLogRes = await supabase
      .from("time_day_logs")
      .delete()
      .eq("user_id", authedUser.id)
      .eq("work_date", date);
    if (deleteLogRes.error) return NextResponse.json({ error: deleteLogRes.error.message }, { status: 500 });

    const deleteCompRes = await supabase
      .from("time_comp_adjustments")
      .delete()
      .eq("user_id", authedUser.id)
      .eq("work_date", date);
    if (deleteCompRes.error) return NextResponse.json({ error: deleteCompRes.error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  }

  if (payload.action === "fill_missing") {
    const date = payload.work_date;
    if (!date || !isDateKey(date)) return NextResponse.json({ error: "Invalid work_date" }, { status: 400 });

    const snapshotErr = await requireSnapshot(`before_fill_missing_${date}`);
    if (snapshotErr) return snapshotErr;

    const dayRes = await supabase
      .from("time_day_logs")
      .select("net_mins")
      .eq("user_id", authedUser.id)
      .eq("work_date", date)
      .maybeSingle();
    if (dayRes.error) return NextResponse.json({ error: dayRes.error.message }, { status: 500 });

    const worked = sanitizeMins(dayRes.data?.net_mins);
    const need = Math.max(0, TARGET_MINS - worked);

    const currentCompRes = await supabase
      .from("time_comp_adjustments")
      .select("mins")
      .eq("user_id", authedUser.id)
      .eq("work_date", date)
      .maybeSingle();
    if (currentCompRes.error) return NextResponse.json({ error: currentCompRes.error.message }, { status: 500 });

    const current = sanitizeMins(currentCompRes.data?.mins);
    const next = current === need ? 0 : need;

    if (next > 0) {
      const upsertCompRes = await supabase
        .from("time_comp_adjustments")
        .upsert(
          {
            user_id: authedUser.id,
            work_date: date,
            mins: next,
            note: "auto-fill",
            source: "ui",
          },
          { onConflict: "user_id,work_date" },
        );
      if (upsertCompRes.error) return NextResponse.json({ error: upsertCompRes.error.message }, { status: 500 });
    } else {
      const deleteCompRes = await supabase
        .from("time_comp_adjustments")
        .delete()
        .eq("user_id", authedUser.id)
        .eq("work_date", date);
      if (deleteCompRes.error) return NextResponse.json({ error: deleteCompRes.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, comp_mins: next });
  }

  if (payload.action === "import_json") {
    const snapshotErr = await requireSnapshot("before_import_json");
    if (snapshotErr) return snapshotErr;

    const input = payload.data;
    const workEntries = Object.entries(input.work ?? {}).filter(([date]) => isDateKey(date));
    const compEntries = Object.entries(input.comp ?? {}).filter(([date]) => isDateKey(date));

    const dayRows = workEntries.map(([date, item]) => ({
      user_id: authedUser.id,
      work_date: date,
      start_time: sanitizeText(item?.start, { maxLen: 8 }),
      stop_time: sanitizeText(item?.stop, { maxLen: 8 }),
      net_mins: sanitizeMins(item?.netMins),
      holiday: Boolean(item?.holiday),
      source: "hourlogger_import_ui",
    }));

    if (dayRows.length > 0) {
      const upsertDaysRes = await supabase.from("time_day_logs").upsert(dayRows, {
        onConflict: "user_id,work_date",
      });
      if (upsertDaysRes.error) return NextResponse.json({ error: upsertDaysRes.error.message }, { status: 500 });
    }

    const dayLookupRes = await supabase
      .from("time_day_logs")
      .select("id, work_date")
      .eq("user_id", authedUser.id)
      .in(
        "work_date",
        workEntries.map(([date]) => date),
      );
    if (dayLookupRes.error) return NextResponse.json({ error: dayLookupRes.error.message }, { status: 500 });

    const dayIdByDate = new Map((dayLookupRes.data ?? []).map((row) => [row.work_date, row.id]));
    const allDayIds = (dayLookupRes.data ?? []).map((row) => row.id);
    if (allDayIds.length > 0) {
      const clearRes = await supabase.from("time_day_breaks").delete().in("day_log_id", allDayIds);
      if (clearRes.error) return NextResponse.json({ error: clearRes.error.message }, { status: 500 });
    }

    const breakRows = workEntries.flatMap(([date, item]) => {
      const dayLogId = dayIdByDate.get(date);
      if (!dayLogId) return [];
      const breaks = Array.isArray(item?.breaks) ? item.breaks : [];
      return breaks.map((entry, index) => ({
        day_log_id: dayLogId,
        position: index,
        name: sanitizeText(entry?.name, { maxLen: 120 }),
        mins: sanitizeMins(entry?.mins),
      }));
    });

    if (breakRows.length > 0) {
      const addBreaksRes = await supabase.from("time_day_breaks").insert(breakRows);
      if (addBreaksRes.error) return NextResponse.json({ error: addBreaksRes.error.message }, { status: 500 });
    }

    const compRows = compEntries.map(([date, item]) => ({
      user_id: authedUser.id,
      work_date: date,
      mins: sanitizeMins(item?.mins),
      note: sanitizeText(item?.note, { maxLen: 500, allowNewlines: true }),
      source: "hourlogger_import_ui",
    }));

    if (compRows.length > 0) {
      const upsertCompRes = await supabase.from("time_comp_adjustments").upsert(compRows, {
        onConflict: "user_id,work_date",
      });
      if (upsertCompRes.error) return NextResponse.json({ error: upsertCompRes.error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      imported_day_logs: dayRows.length,
      imported_break_rows: breakRows.length,
      imported_comp_rows: compRows.length,
    });
  }

  if (payload.action === "export_json") {
    const [dayLogsRes, compRes] = await Promise.all([
      supabase
        .from("time_day_logs")
        .select("id, work_date, start_time, stop_time, net_mins, holiday")
        .eq("user_id", authedUser.id)
        .order("work_date", { ascending: true }),
      supabase
        .from("time_comp_adjustments")
        .select("work_date, mins, note")
        .eq("user_id", authedUser.id)
        .order("work_date", { ascending: true }),
    ]);
    if (dayLogsRes.error) return NextResponse.json({ error: dayLogsRes.error.message }, { status: 500 });
    if (compRes.error) return NextResponse.json({ error: compRes.error.message }, { status: 500 });

    const dayLogs = dayLogsRes.data ?? [];
    const dayLogIds = dayLogs.map((row) => row.id);
    const breaksRes =
      dayLogIds.length > 0
        ? await supabase
            .from("time_day_breaks")
            .select("day_log_id, position, name, mins")
            .in("day_log_id", dayLogIds)
            .order("position", { ascending: true })
        : { data: [], error: null };
    if (breaksRes.error) return NextResponse.json({ error: breaksRes.error.message }, { status: 500 });

    const breaksByLogId = new Map<number, Array<{ name: string; mins: number }>>();
    for (const row of breaksRes.data ?? []) {
      const list = breaksByLogId.get(row.day_log_id) ?? [];
      list.push({ name: row.name ?? "", mins: sanitizeMins(row.mins) });
      breaksByLogId.set(row.day_log_id, list);
    }

    const work: ImportPayload["work"] = {};
    for (const row of dayLogs) {
      work[row.work_date] = {
        start: row.start_time ?? "",
        stop: row.stop_time ?? "",
        breaks: breaksByLogId.get(row.id) ?? [],
        netMins: sanitizeMins(row.net_mins),
        holiday: Boolean(row.holiday),
      };
    }

    const comp: ImportPayload["comp"] = {};
    for (const row of compRes.data ?? []) {
      comp[row.work_date] = {
        mins: sanitizeMins(row.mins),
        note: row.note ?? "",
      };
    }

    return NextResponse.json({ work, comp });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const TARGET_MINS = 504;

type BreakInput = {
  name?: string;
  mins?: number;
};

type DayInput = {
  work_date: string;
  start_time?: string;
  stop_time?: string;
  net_mins?: number;
  holiday?: boolean;
  breaks?: BreakInput[];
};

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

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function sanitizeMins(value: unknown) {
  const mins = Number.parseInt(String(value ?? 0), 10);
  return Number.isFinite(mins) && mins >= 0 ? mins : 0;
}

function getWeekStart(dateInput?: string) {
  const base = dateInput ? new Date(dateInput) : new Date();
  if (Number.isNaN(base.getTime())) return null;
  const date = new Date(base);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function toDateString(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const weekStartDate = getWeekStart(url.searchParams.get("weekStart") ?? undefined);
  if (!weekStartDate) return NextResponse.json({ error: "Invalid weekStart date" }, { status: 400 });

  const weekStart = toDateString(weekStartDate);
  const weekEnd = toDateString(addDays(weekStartDate, 6));

  const [logsWeekRes, compWeekRes, logsAllRes, compAllRes] = await Promise.all([
    supabase
      .from("time_day_logs")
      .select("id, work_date, start_time, stop_time, net_mins, holiday")
      .eq("user_id", user.id)
      .gte("work_date", weekStart)
      .lte("work_date", weekEnd)
      .order("work_date", { ascending: true }),
    supabase
      .from("time_comp_adjustments")
      .select("work_date, mins, note")
      .eq("user_id", user.id)
      .gte("work_date", weekStart)
      .lte("work_date", weekEnd)
      .order("work_date", { ascending: true }),
    supabase.from("time_day_logs").select("work_date, net_mins, holiday").eq("user_id", user.id),
    supabase.from("time_comp_adjustments").select("work_date, mins").eq("user_id", user.id),
  ]);

  if (logsWeekRes.error) return NextResponse.json({ error: logsWeekRes.error.message }, { status: 500 });
  if (compWeekRes.error) return NextResponse.json({ error: compWeekRes.error.message }, { status: 500 });
  if (logsAllRes.error) return NextResponse.json({ error: logsAllRes.error.message }, { status: 500 });
  if (compAllRes.error) return NextResponse.json({ error: compAllRes.error.message }, { status: 500 });

  const weekLogs = logsWeekRes.data ?? [];
  const weekLogIds = weekLogs.map((row) => row.id);
  const breaksRes =
    weekLogIds.length > 0
      ? await supabase
          .from("time_day_breaks")
          .select("day_log_id, position, name, mins")
          .in("day_log_id", weekLogIds)
          .order("position", { ascending: true })
      : { data: [], error: null };

  if (breaksRes.error) return NextResponse.json({ error: breaksRes.error.message }, { status: 500 });

  const breaksByLogId = new Map<number, Array<{ name: string; mins: number }>>();
  for (const row of breaksRes.data ?? []) {
    const list = breaksByLogId.get(row.day_log_id) ?? [];
    list.push({ name: row.name ?? "", mins: sanitizeMins(row.mins) });
    breaksByLogId.set(row.day_log_id, list);
  }

  const compByDate = new Map<string, { mins: number; note: string }>();
  for (const row of compWeekRes.data ?? []) {
    compByDate.set(row.work_date, { mins: sanitizeMins(row.mins), note: row.note ?? "" });
  }

  const weekDays = Array.from({ length: 7 }).map((_, idx) => {
    const date = toDateString(addDays(weekStartDate, idx));
    const log = weekLogs.find((item) => item.work_date === date);
    const comp = compByDate.get(date);
    return {
      date,
      start_time: log?.start_time ?? "",
      stop_time: log?.stop_time ?? "",
      net_mins: sanitizeMins(log?.net_mins),
      holiday: Boolean(log?.holiday),
      comp_mins: comp?.mins ?? 0,
      comp_note: comp?.note ?? "",
      breaks: log ? breaksByLogId.get(log.id) ?? [] : [],
    };
  });

  const weekHoursMins = weekDays.reduce((sum, day) => sum + day.net_mins, 0);

  const allWorkByDate = new Map<string, { net: number; holiday: boolean }>();
  for (const row of logsAllRes.data ?? []) {
    allWorkByDate.set(row.work_date, {
      net: sanitizeMins(row.net_mins),
      holiday: Boolean(row.holiday),
    });
  }
  const allCompByDate = new Map<string, number>();
  for (const row of compAllRes.data ?? []) {
    allCompByDate.set(row.work_date, sanitizeMins(row.mins));
  }
  const allDates = new Set([...allWorkByDate.keys(), ...allCompByDate.keys()]);

  let overtimeBankMins = 0;
  for (const date of allDates) {
    const work = allWorkByDate.get(date);
    const comp = allCompByDate.get(date) ?? 0;
    if (work?.holiday) continue;
    const overtime = Math.max(0, (work?.net ?? 0) - TARGET_MINS);
    overtimeBankMins += overtime - comp;
  }

  return NextResponse.json({
    week_start: weekStart,
    week_end: weekEnd,
    target_mins: TARGET_MINS,
    week_hours_mins: weekHoursMins,
    overtime_bank_mins: overtimeBankMins,
    days: weekDays,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const authedUser = user;

  const payload = (await request.json()) as
    | { action: "save_day"; day: DayInput }
    | { action: "reset_day"; work_date: string }
    | { action: "fill_missing"; work_date: string }
    | { action: "import_json"; data: ImportPayload };

  async function requireSnapshot(reason: string) {
    const snapshotRes = await supabase.rpc("create_time_tracker_snapshot", {
      p_user: authedUser.id,
      p_reason: reason,
    });
    if (snapshotRes.error) {
      return NextResponse.json(
        {
          error:
            "Could not create safety snapshot before update. No data was changed. Please retry.",
          detail: snapshotRes.error.message,
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
          start_time: day.start_time ?? "",
          stop_time: day.stop_time ?? "",
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
      name: item?.name ?? "",
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
      start_time: item?.start ?? "",
      stop_time: item?.stop ?? "",
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
        name: entry?.name ?? "",
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
      note: item?.note ?? "",
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

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}

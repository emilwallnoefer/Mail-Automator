import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getDayOvertimeContributionMins,
  TIME_TRACKER_TARGET_MINS,
} from "@/lib/time-tracker-rules";

const TARGET_MINS = TIME_TRACKER_TARGET_MINS;

export type WeekDay = {
  date: string;
  start_time: string;
  stop_time: string;
  net_mins: number;
  holiday: boolean;
  comp_mins: number;
  comp_note: string;
  breaks: Array<{ name: string; mins: number }>;
};

export type WeekForUser = {
  week_start: string;
  week_end: string;
  target_mins: number;
  week_hours_mins: number;
  overtime_bank_mins: number;
  includes_bank: boolean;
  days: WeekDay[];
};

export function sanitizeMins(value: unknown) {
  const mins = Number.parseInt(String(value ?? 0), 10);
  return Number.isFinite(mins) && mins >= 0 ? mins : 0;
}

export function parseInteger(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getWeekStartDate(dateInput?: string) {
  const base = dateInput ? new Date(dateInput) : new Date();
  if (Number.isNaN(base.getTime())) return null;
  const date = new Date(base);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function toDateString(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function looksLikeMissingStatsObjects(detail: string) {
  return /tt_refresh_overtime_bank_stats|time_tracker_user_stats|relation .* does not exist|function .* does not exist/i.test(
    detail,
  );
}

export async function computeOvertimeBankMinsForUser(
  supabase: SupabaseClient,
  userId: string,
) {
  const [logsAllRes, compAllRes] = await Promise.all([
    supabase.from("time_day_logs").select("work_date, net_mins, holiday").eq("user_id", userId),
    supabase.from("time_comp_adjustments").select("work_date, mins").eq("user_id", userId),
  ]);
  if (logsAllRes.error) throw new Error(logsAllRes.error.message);
  if (compAllRes.error) throw new Error(compAllRes.error.message);

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

  let overtimeBankMins = 0;
  const allDates = new Set([...allWorkByDate.keys(), ...allCompByDate.keys()]);
  for (const date of allDates) {
    const work = allWorkByDate.get(date);
    const comp = allCompByDate.get(date) ?? 0;
    overtimeBankMins += getDayOvertimeContributionMins(
      date,
      work?.net ?? 0,
      work?.holiday ?? false,
      comp,
    );
  }

  return overtimeBankMins;
}

export async function getOvertimeBankMinsForUser(
  supabase: SupabaseClient,
  userId: string,
  includeBank: boolean,
) {
  if (!includeBank) return { overtimeBankMins: 0, includesBank: false };

  const statsRes = await supabase
    .from("time_tracker_user_stats")
    .select("overtime_bank_mins, computed_for_day")
    .eq("user_id", userId)
    .maybeSingle();

  if (statsRes.error && !looksLikeMissingStatsObjects(statsRes.error.message ?? "")) {
    throw new Error(statsRes.error.message);
  }

  const hasFreshStats = !statsRes.error && statsRes.data?.overtime_bank_mins != null;
  if (hasFreshStats) {
    return {
      overtimeBankMins: parseInteger(statsRes.data?.overtime_bank_mins),
      includesBank: true,
    };
  }

  const refreshRes = await supabase.rpc("tt_refresh_overtime_bank_stats", {
    p_user: userId,
  });
  if (!refreshRes.error) {
    return {
      overtimeBankMins: parseInteger(refreshRes.data),
      includesBank: true,
    };
  }

  const detail = refreshRes.error.message ?? "";
  const overtimeBankMins = await computeOvertimeBankMinsForUser(supabase, userId);
  if (looksLikeMissingStatsObjects(detail)) {
    return { overtimeBankMins, includesBank: true };
  }

  const persistRes = await supabase.from("time_tracker_user_stats").upsert(
    {
      user_id: userId,
      overtime_bank_mins: overtimeBankMins,
      computed_for_day: toDateString(new Date()),
    },
    { onConflict: "user_id" },
  );
  if (persistRes.error && !looksLikeMissingStatsObjects(persistRes.error.message ?? "")) {
    throw new Error(persistRes.error.message);
  }

  return { overtimeBankMins, includesBank: true };
}

type RpcLogRow = {
  id: number;
  work_date: string;
  start_time: string | null;
  stop_time: string | null;
  net_mins: number | null;
  holiday: boolean | null;
};
type RpcCompRow = { work_date: string; mins: number | null; note: string | null };
type RpcBreakRow = { day_log_id: number; position: number; name: string | null; mins: number | null };
type TtUserWeekPayload = {
  logs?: RpcLogRow[];
  comp?: RpcCompRow[];
  breaks?: RpcBreakRow[];
  bank_mins?: number;
};

function looksLikeMissingTtUserWeekRpc(detail: string) {
  return /tt_user_week_v1|function .* does not exist|could not find the function/i.test(detail);
}

async function tryFetchWeekViaRpc(
  supabase: SupabaseClient,
  weekStartDate: Date,
): Promise<WeekForUser | null> {
  const weekStart = toDateString(weekStartDate);
  const weekEnd = toDateString(addDays(weekStartDate, 6));

  const { data, error } = await supabase.rpc("tt_user_week_v1", { p_week_start: weekStart });
  if (error) {
    if (looksLikeMissingTtUserWeekRpc(error.message ?? "")) return null;
    throw new Error(error.message);
  }

  const payload = (data ?? {}) as TtUserWeekPayload;
  const logs = Array.isArray(payload.logs) ? payload.logs : [];
  const comp = Array.isArray(payload.comp) ? payload.comp : [];
  const breaks = Array.isArray(payload.breaks) ? payload.breaks : [];

  const breaksByLogId = new Map<number, Array<{ name: string; mins: number }>>();
  for (const row of breaks) {
    const list = breaksByLogId.get(row.day_log_id) ?? [];
    list.push({ name: row.name ?? "", mins: sanitizeMins(row.mins) });
    breaksByLogId.set(row.day_log_id, list);
  }

  const compByDate = new Map<string, { mins: number; note: string }>();
  for (const row of comp) {
    compByDate.set(row.work_date, { mins: sanitizeMins(row.mins), note: row.note ?? "" });
  }

  const logsByDate = new Map<string, RpcLogRow>();
  for (const row of logs) {
    logsByDate.set(row.work_date, row);
  }

  const days: WeekDay[] = Array.from({ length: 7 }).map((_, idx) => {
    const date = toDateString(addDays(weekStartDate, idx));
    const log = logsByDate.get(date);
    const compRow = compByDate.get(date);
    return {
      date,
      start_time: log?.start_time ?? "",
      stop_time: log?.stop_time ?? "",
      net_mins: sanitizeMins(log?.net_mins),
      holiday: Boolean(log?.holiday),
      comp_mins: compRow?.mins ?? 0,
      comp_note: compRow?.note ?? "",
      breaks: log ? breaksByLogId.get(log.id) ?? [] : [],
    };
  });

  const weekHoursMins = days.reduce((sum, day) => sum + day.net_mins, 0);

  return {
    week_start: weekStart,
    week_end: weekEnd,
    target_mins: TARGET_MINS,
    week_hours_mins: weekHoursMins,
    overtime_bank_mins: parseInteger(payload.bank_mins, 0),
    includes_bank: true,
    days,
  };
}

/**
 * Fetch a 7-day week of time-tracker data for a specific user.
 * Bypasses no RLS: caller must supply a Supabase client that has
 * permission to read the target user's rows (either the user themselves
 * or a service-role client for admin access).
 *
 * When `useCurrentUserRpc` is true, the function first tries a single
 * `tt_user_week_v1` RPC call which collapses logs+comp+breaks+bank into
 * one round-trip. The RPC reads `auth.uid()` internally, so callers must
 * only opt in when `userId` is guaranteed to equal the session user.
 * If the RPC is missing (pre-migration), it falls back to the legacy
 * multi-query path automatically.
 */
export async function fetchWeekForUser(
  supabase: SupabaseClient,
  userId: string,
  weekStartDate: Date,
  options?: { includeBank?: boolean; useCurrentUserRpc?: boolean },
): Promise<WeekForUser> {
  if (options?.useCurrentUserRpc) {
    const rpcResult = await tryFetchWeekViaRpc(supabase, weekStartDate);
    if (rpcResult) return rpcResult;
  }

  const includeBank = options?.includeBank ?? true;
  const weekStart = toDateString(weekStartDate);
  const weekEnd = toDateString(addDays(weekStartDate, 6));

  const [logsWeekRes, compWeekRes] = await Promise.all([
    supabase
      .from("time_day_logs")
      .select("id, work_date, start_time, stop_time, net_mins, holiday")
      .eq("user_id", userId)
      .gte("work_date", weekStart)
      .lte("work_date", weekEnd)
      .order("work_date", { ascending: true }),
    supabase
      .from("time_comp_adjustments")
      .select("work_date, mins, note")
      .eq("user_id", userId)
      .gte("work_date", weekStart)
      .lte("work_date", weekEnd)
      .order("work_date", { ascending: true }),
  ]);

  if (logsWeekRes.error) throw new Error(logsWeekRes.error.message);
  if (compWeekRes.error) throw new Error(compWeekRes.error.message);

  const weekLogs = logsWeekRes.data ?? [];
  const weekLogIds = weekLogs.map((row) => row.id);
  const breaksRes =
    weekLogIds.length > 0
      ? await supabase
          .from("time_day_breaks")
          .select("day_log_id, position, name, mins")
          .in("day_log_id", weekLogIds)
          .order("position", { ascending: true })
      : { data: [], error: null as null };

  if (breaksRes.error) throw new Error(breaksRes.error.message);

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

  const days: WeekDay[] = Array.from({ length: 7 }).map((_, idx) => {
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

  const weekHoursMins = days.reduce((sum, day) => sum + day.net_mins, 0);

  const bank = await getOvertimeBankMinsForUser(supabase, userId, includeBank);

  return {
    week_start: weekStart,
    week_end: weekEnd,
    target_mins: TARGET_MINS,
    week_hours_mins: weekHoursMins,
    overtime_bank_mins: bank.overtimeBankMins,
    includes_bank: bank.includesBank,
    days,
  };
}

/**
 * Sum the raw `net_mins` for a user across an inclusive date range.
 * Cheap query (no breaks, no bank calc) — useful for bulk scans such
 * as the "did this user log anything last week?" cron reminder.
 */
export async function sumNetMinsForUserInRange(
  supabase: SupabaseClient,
  userId: string,
  startDate: Date,
  endDate: Date,
): Promise<number> {
  const start = toDateString(startDate);
  const end = toDateString(endDate);
  const { data, error } = await supabase
    .from("time_day_logs")
    .select("net_mins")
    .eq("user_id", userId)
    .gte("work_date", start)
    .lte("work_date", end);
  if (error) throw new Error(error.message);
  let total = 0;
  for (const row of data ?? []) total += sanitizeMins(row.net_mins);
  return total;
}

/**
 * Count how many weekdays (Mon-Fri) in the week are "missing":
 * not a holiday, and total logged + comp < target.
 */
export function countMissingWeekdays(days: WeekDay[]): number {
  let missing = 0;
  for (const day of days) {
    const date = new Date(day.date);
    const dow = (date.getDay() + 6) % 7;
    if (dow >= 5) continue;
    if (day.holiday) continue;
    if (day.net_mins + day.comp_mins >= TARGET_MINS) continue;
    missing += 1;
  }
  return missing;
}

import {
  getDayOvertimeContributionMins,
  TIME_TRACKER_TARGET_MINS,
} from "@/lib/time-tracker-rules";

import { toDateKey, fromDateKey, getMonday, addDays } from "@/lib/date";
export { toDateKey, fromDateKey, getMonday, addDays };

export const TARGET_MINS = TIME_TRACKER_TARGET_MINS;
export const PREFETCH_WEEKS_EACH_SIDE = 1;
export const PREFETCH_IDLE_FALLBACK_MS = 600;
// After a burst of edits settles, run a single background reconcile against the
// server instead of one forced refetch per click. Keeps rapid compensate /
// overtime entry instant and free of mid-edit "snap back" hiccups.
export const RECONCILE_DEBOUNCE_MS = 700;

export type DayBreak = {
  name: string;
  mins: number;
};

export type DayData = {
  date: string;
  start_time: string;
  stop_time: string;
  net_mins: number;
  holiday: boolean;
  sick_leave: boolean;
  comp_mins: number;
  comp_note: string;
  breaks: DayBreak[];
};

export type WeekResponse = {
  week_start: string;
  week_end: string;
  target_mins: number;
  week_hours_mins: number;
  overtime_bank_mins: number;
  days: DayData[];
  travel_by_date?: Record<
    string,
    {
      client: string;
      location: string;
      responsible: string;
    }
  >;
  travel_debug?: {
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
  };
  // Per compensated day, the overtime-earning days that fund it (FIFO).
  // Keyed by the compensated day's date; each source carries the earning
  // day's date and the minutes drawn from it. Client/location for a source
  // are looked up from `travel_by_date`.
  comp_sources?: Record<string, Array<{ date: string; mins: number; earned: number }>>;
  includes_travel?: boolean;
  includes_bank?: boolean;
};

export type ToastState = { kind: "ok" | "error"; message: string } | null;

export type TimeTrackerPanelProps = {
  /** When true, hides all mutating controls (save, reset, fill, break editing). */
  readOnly?: boolean;
  /**
   * Base URL for the week-read endpoint. Defaults to `/api/time-tracker`.
   * The panel will append `?weekStart=...&includeTravel=...` (and any
   * extra query params already present in the URL, e.g. `user_id=...`).
   */
  apiBase?: string;
  /** Optional header to display when viewing another user's tracker. */
  viewingLabel?: string;
  /**
   * SSR-fetched current week to seed the local cache, so the first paint
   * skips the client-side fetch round-trip. Only applied when its
   * `week_start` matches the client-computed Monday for "today".
   */
  initialWeek?: WeekResponse | null;
};

export function fmtHM(mins: number) {
  const safe = Math.max(0, Math.round(mins));
  const h = Math.floor(safe / 60);
  const m = String(safe % 60).padStart(2, "0");
  return `${h}h ${m}m`;
}

export function fmtSignedHM(mins: number) {
  const sign = mins < 0 ? "-" : "";
  return `${sign}${fmtHM(Math.abs(mins))}`;
}

function parseTimeToMins(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hh = Number.parseInt(match[1], 10);
  const mm = Number.parseInt(match[2], 10);
  if (hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

export function computeNetMins(startTime: string, stopTime: string, breaks: DayBreak[]) {
  const start = parseTimeToMins(startTime);
  const stop = parseTimeToMins(stopTime);
  if (start == null || stop == null) return 0;
  let diff = stop - start;
  if (diff < 0) diff += 24 * 60;
  const breakMins = breaks.reduce((sum, item) => sum + Math.max(0, item.mins || 0), 0);
  return Math.max(0, diff - breakMins);
}

/**
 * How much a single day's edit shifts the cumulative overtime bank. Mirrors the
 * server-side rule exactly (`getDayOvertimeContributionMins`, also recomputed by
 * the DB trigger), so the optimistic bank we show matches what a later reconcile
 * refetch returns — no flicker when the server value lands.
 */
export function bankDeltaForDay(prev: DayData, next: DayData) {
  const before = getDayOvertimeContributionMins(
    prev.date,
    prev.net_mins,
    prev.holiday,
    prev.comp_mins,
    prev.sick_leave,
  );
  const after = getDayOvertimeContributionMins(
    next.date,
    next.net_mins,
    next.holiday,
    next.comp_mins,
    next.sick_leave,
  );
  return after - before;
}

export function dayLabel(dateKey: string) {
  const date = fromDateKey(dateKey);
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function getWeekDayKeys(weekStart: string) {
  const start = getMonday(weekStart);
  return Array.from({ length: 7 }, (_, index) => toDateKey(addDays(start, index)));
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Six Monday-aligned week rows that fully cover the given month, so the picker
// always renders a stable 6×7 grid regardless of which weekday the 1st lands on.
export function buildMonthWeeks(monthRef: string) {
  const ref = fromDateKey(monthRef);
  const firstOfMonth = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const gridStart = getMonday(toDateKey(firstOfMonth));
  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => addDays(gridStart, week * 7 + day)),
  );
}

export function addMonths(monthRef: string, delta: number) {
  const ref = fromDateKey(monthRef);
  return toDateKey(new Date(ref.getFullYear(), ref.getMonth() + delta, 1));
}

export function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

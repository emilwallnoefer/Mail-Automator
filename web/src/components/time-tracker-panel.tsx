"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { playUiSound, stopUiSound } from "@/lib/ui-sounds";
import {
  getDayOvertimeContributionMins,
  isPremiumOvertimeDay,
  isSaturdayDate,
  isSundayDate,
  isWeekendDate,
  TIME_TRACKER_TARGET_MINS,
} from "@/lib/time-tracker-rules";

const TARGET_MINS = TIME_TRACKER_TARGET_MINS;
const PREFETCH_WEEKS_EACH_SIDE = 1;
const PREFETCH_IDLE_FALLBACK_MS = 600;
// After a burst of edits settles, run a single background reconcile against the
// server instead of one forced refetch per click. Keeps rapid compensate /
// overtime entry instant and free of mid-edit "snap back" hiccups.
const RECONCILE_DEBOUNCE_MS = 700;

type DayBreak = {
  name: string;
  mins: number;
};

type DayData = {
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
  includes_travel?: boolean;
  includes_bank?: boolean;
};

type ToastState = { kind: "ok" | "error"; message: string } | null;

function fmtHM(mins: number) {
  const safe = Math.max(0, Math.round(mins));
  const h = Math.floor(safe / 60);
  const m = String(safe % 60).padStart(2, "0");
  return `${h}h ${m}m`;
}

function fmtSignedHM(mins: number) {
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

function computeNetMins(startTime: string, stopTime: string, breaks: DayBreak[]) {
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
function bankDeltaForDay(prev: DayData, next: DayData) {
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

function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromDateKey(value: string) {
  const [y, m, d] = value.split("-").map((item) => Number.parseInt(item, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

function getMonday(value?: string) {
  const base = value ? fromDateKey(value) : new Date();
  const day = (base.getDay() + 6) % 7;
  base.setDate(base.getDate() - day);
  base.setHours(0, 0, 0, 0);
  return base;
}

function addDays(value: Date, delta: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + delta);
  return next;
}

function dayLabel(dateKey: string) {
  const date = fromDateKey(dateKey);
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function getWeekDayKeys(weekStart: string) {
  const start = getMonday(weekStart);
  return Array.from({ length: 7 }, (_, index) => toDateKey(addDays(start, index)));
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

function useAnimatedNumber(target: number, durationMs = 280) {
  const [value, setValue] = useState(0);
  const valueRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (Math.abs(target - valueRef.current) < 0.001) {
      return;
    }
    const from = valueRef.current;
    const delta = target - from;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      const next = from + delta * easeInOutCubic(t);
      valueRef.current = next;
      setValue(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  return value;
}

function AnimatedNumber({
  value,
  durationMs,
  children,
}: {
  value: number;
  durationMs?: number;
  children: (value: number) => ReactNode;
}) {
  const animated = useAnimatedNumber(value, durationMs);
  return <>{children(animated)}</>;
}

type TimeTrackerPanelProps = {
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

export function TimeTrackerPanel({ readOnly = false, apiBase, viewingLabel, initialWeek }: TimeTrackerPanelProps = {}) {
  const bubbles = [
    { left: "6%", size: "10px", duration: "9s", delay: "0s" },
    { left: "14%", size: "8px", duration: "12s", delay: "-3s" },
    { left: "22%", size: "12px", duration: "10s", delay: "-1.2s" },
    { left: "34%", size: "9px", duration: "11s", delay: "-4s" },
    { left: "46%", size: "11px", duration: "13s", delay: "-2.2s" },
    { left: "58%", size: "7px", duration: "8.5s", delay: "-5s" },
    { left: "68%", size: "10px", duration: "10.5s", delay: "-2.8s" },
    { left: "79%", size: "8px", duration: "9.5s", delay: "-1.8s" },
    { left: "88%", size: "12px", duration: "14s", delay: "-6s" },
    { left: "94%", size: "9px", duration: "11.5s", delay: "-3.5s" },
  ];

  const [weekStart, setWeekStart] = useState<string>(toDateKey(getMonday()));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [data, setData] = useState<WeekResponse | null>(null);
  const [weekLoadTick, setWeekLoadTick] = useState(0);
  const [revealedDayCount, setRevealedDayCount] = useState(7);
  const [showUpToDateSweep, setShowUpToDateSweep] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPortalReady, setEditorPortalReady] = useState(false);
  const [dayDetailsLoading, setDayDetailsLoading] = useState(false);
  const weekCacheRef = useRef<Map<string, WeekResponse>>(new Map());
  const weekInflightRef = useRef<Map<string, Promise<WeekResponse>>>(new Map());
  const previousEditorOpenRef = useRef<boolean | null>(null);
  const initialWeekSeededRef = useRef(false);
  // Tracks which day the editor form has already been seeded for, so that
  // background week refreshes don't overwrite in-progress edits.
  const seededFormDateRef = useRef<string | null>(null);
  // Monotonic counter so a slow background refresh can't overwrite the result
  // of a newer one (e.g. when saving several days in quick succession).
  const refreshSeqRef = useRef(0);

  if (!initialWeekSeededRef.current) {
    initialWeekSeededRef.current = true;
    if (initialWeek && initialWeek.week_start === weekStart) {
      weekCacheRef.current.set(initialWeek.week_start, initialWeek);
    }
  }

  const selectedDay = useMemo(() => {
    if (!data?.days?.length) return null;
    if (!selectedDate) return null;
    return data.days.find((day) => day.date === selectedDate) ?? null;
  }, [data, selectedDate]);

  const selectedTravelInfo = useMemo(() => {
    if (!selectedDate) return null;
    return data?.travel_by_date?.[selectedDate] ?? null;
  }, [data?.travel_by_date, selectedDate]);

  const [formStart, setFormStart] = useState("");
  const [formStop, setFormStop] = useState("");
  const [formHoliday, setFormHoliday] = useState(false);
  const [formSickLeave, setFormSickLeave] = useState(false);
  const [formBreaks, setFormBreaks] = useState<DayBreak[]>([]);
  const currentWeekStartKey = toDateKey(getMonday());

  const applyWeekData = useCallback((weekData: WeekResponse) => {
    setData(weekData);
    const days = weekData.days ?? [];
    setSelectedDate((prev) => {
      if (prev && days.some((day) => day.date === prev)) return prev;
      return null;
    });
    setEditorOpen(false);
  }, []);

  const fetchWeekData = useCallback(async (
    targetWeekStart: string,
    options?: { force?: boolean; includeTravel?: boolean },
  ): Promise<WeekResponse> => {
    const force = options?.force ?? false;
    const includeTravel = options?.includeTravel ?? true;
    if (!force) {
      const cached = weekCacheRef.current.get(targetWeekStart);
      if (cached) return cached;
      const inflight = weekInflightRef.current.get(targetWeekStart);
      if (inflight) return inflight;
    }

    const requestPromise = (async () => {
      const base = apiBase ?? "/api/time-tracker";
      const separator = base.includes("?") ? "&" : "?";
      const url = `${base}${separator}weekStart=${encodeURIComponent(targetWeekStart)}&includeTravel=${includeTravel ? "1" : "0"}`;
      const response = await fetch(url);
      const payload = (await response.json()) as WeekResponse | { error: string };
      if (!response.ok) throw new Error((payload as { error: string }).error || "Failed to load tracker");
      const weekData = payload as WeekResponse;
      weekCacheRef.current.set(targetWeekStart, weekData);
      return weekData;
    })();

    weekInflightRef.current.set(targetWeekStart, requestPromise);
    try {
      return await requestPromise;
    } finally {
      weekInflightRef.current.delete(targetWeekStart);
    }
  }, [apiBase]);

  const prefetchNearbyWeeks = useCallback((centerWeekStart: string) => {
    const runPrefetch = () => {
      const center = getMonday(centerWeekStart);
      for (let i = -PREFETCH_WEEKS_EACH_SIDE; i <= PREFETCH_WEEKS_EACH_SIDE; i += 1) {
        if (i === 0) continue;
        const key = toDateKey(addDays(center, i * 7));
        if (weekCacheRef.current.has(key) || weekInflightRef.current.has(key)) continue;
        void fetchWeekData(key, { includeTravel: false }).catch(() => {
          // Silent prefetch failures should not interrupt UI interactions.
        });
      }
    };

    if (typeof window === "undefined") return;
    const idle = (window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
    }).requestIdleCallback;
    if (typeof idle === "function") {
      idle(runPrefetch, { timeout: PREFETCH_IDLE_FALLBACK_MS * 2 });
    } else {
      window.setTimeout(runPrefetch, PREFETCH_IDLE_FALLBACK_MS);
    }
  }, [fetchWeekData]);

  useEffect(() => {
    // Only seed the form when a day is freshly opened. Keying on the date
    // string (not the `selectedDay` object) means background week refreshes
    // — which replace the `data` object and therefore `selectedDay` — no
    // longer clobber values the user is actively editing.
    if (!editorOpen || !selectedDate) {
      seededFormDateRef.current = null;
      return;
    }
    if (seededFormDateRef.current === selectedDate) return;
    const day = data?.days.find((item) => item.date === selectedDate);
    if (!day) return; // details may still be loading; seed once they arrive.
    seededFormDateRef.current = selectedDate;
    setFormStart(day.start_time ?? "");
    setFormStop(day.stop_time ?? "");
    setFormHoliday(Boolean(day.holiday));
    setFormSickLeave(Boolean(day.sick_leave));
    const useBreakCounter = day.date >= currentWeekStartKey;
    if (useBreakCounter) {
      const totalBreakMins = (day.breaks ?? []).reduce((sum, item) => sum + Math.max(0, item.mins || 0), 0);
      setFormBreaks(totalBreakMins > 0 ? [{ name: "Break", mins: totalBreakMins }] : []);
      return;
    }
    setFormBreaks(day.breaks?.map((item) => ({ ...item })) ?? []);
  }, [editorOpen, selectedDate, data, currentWeekStartKey]);

  useEffect(() => {
    let active = true;
    async function loadWeek() {
      try {
        const cached = weekCacheRef.current.get(weekStart);
        if (cached) {
          if (!active) return;
          applyWeekData(cached);
          setWeekLoadTick((prev) => prev + 1);
          prefetchNearbyWeeks(weekStart);
          return;
        }
        setLoading(true);
        const weekData = await fetchWeekData(weekStart, { includeTravel: false });
        if (!active) return;
        applyWeekData(weekData);
        setWeekLoadTick((prev) => prev + 1);
        prefetchNearbyWeeks(weekStart);
      } catch (error) {
        if (!active) return;
        setToast({ kind: "error", message: (error as Error).message });
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadWeek();
    return () => {
      active = false;
    };
  }, [applyWeekData, fetchWeekData, prefetchNearbyWeeks, weekStart]);

  useEffect(() => {
    const total = data?.days?.length ?? 0;
    if (total === 0) return;
    playUiSound("daysAppearStart");
    setRevealedDayCount(0);
    setShowUpToDateSweep(false);
    let current = 0;
    const intervalId = window.setInterval(() => {
      current += 1;
      setRevealedDayCount(current);
      if (current >= total) {
        window.clearInterval(intervalId);
        setShowUpToDateSweep(true);
        window.setTimeout(() => setShowUpToDateSweep(false), 980);
      }
    }, 85);
    return () => window.clearInterval(intervalId);
  }, [weekLoadTick, data?.days?.length]);

  useEffect(() => {
    if (showUpToDateSweep) {
      playUiSound("weekReadyGlow");
      return () => stopUiSound("weekReadyGlow");
    }
    stopUiSound("weekReadyGlow");
    return undefined;
  }, [showUpToDateSweep]);

  useEffect(() => {
    setEditorPortalReady(true);
  }, []);

  useEffect(() => {
    const previous = previousEditorOpenRef.current;
    previousEditorOpenRef.current = editorOpen;
    if (previous == null || previous === editorOpen) return;
    playUiSound("dayLoggerSlide");
  }, [editorOpen]);

  const refreshWeek = useCallback(async () => {
    // Background reconciliation after a mutation. Unlike `applyWeekData`, this
    // must NOT close the editor or reset the selected day: the user may have
    // already opened another day while the previous save's POST was in flight.
    const seq = ++refreshSeqRef.current;
    const targetWeek = weekStart;
    const previous = weekCacheRef.current.get(targetWeek);
    // Reconcile hours / comp / bank only — never re-fetch the slow Google
    // Sheets travel data here. Re-pulling travel on every save was the main
    // source of the post-edit lag; we carry the already-loaded travel forward.
    const fresh = await fetchWeekData(targetWeek, { force: true, includeTravel: false });
    // Drop the result if a newer refresh started or the week changed meanwhile.
    if (seq !== refreshSeqRef.current) return;
    const merged: WeekResponse = previous?.includes_travel
      ? {
          ...fresh,
          travel_by_date: previous.travel_by_date,
          travel_debug: previous.travel_debug,
          includes_travel: true,
        }
      : fresh;
    weekCacheRef.current.set(targetWeek, merged);
    setData((prev) => (prev && prev.week_start !== targetWeek ? prev : merged));
    prefetchNearbyWeeks(targetWeek);
  }, [fetchWeekData, prefetchNearbyWeeks, weekStart]);

  // Debounced, coalesced background reconcile. A burst of compensate / save
  // clicks schedules at most one server refetch once writes have settled,
  // instead of the old "force-refresh after every click" which fought the
  // optimistic UI and caused the bars to snap back mid-entry.
  const pendingWritesRef = useRef(0);
  const reconcileTimerRef = useRef<number | null>(null);

  const runReconcile = useCallback(() => {
    if (pendingWritesRef.current > 0) {
      reconcileTimerRef.current = window.setTimeout(runReconcile, RECONCILE_DEBOUNCE_MS);
      return;
    }
    reconcileTimerRef.current = null;
    void refreshWeek().catch(() => {
      // Keep the optimistic UI if the background sync fails.
    });
  }, [refreshWeek]);

  const scheduleReconcile = useCallback(() => {
    if (reconcileTimerRef.current != null) window.clearTimeout(reconcileTimerRef.current);
    reconcileTimerRef.current = window.setTimeout(runReconcile, RECONCILE_DEBOUNCE_MS);
  }, [runReconcile]);

  useEffect(() => {
    return () => {
      if (reconcileTimerRef.current != null) window.clearTimeout(reconcileTimerRef.current);
    };
  }, []);

  const ensureWeekDetails = useCallback(async () => {
    const current = weekCacheRef.current.get(weekStart);
    if (current?.includes_travel) return;
    setDayDetailsLoading(true);
    try {
      const fullWeek = await fetchWeekData(weekStart, { force: true, includeTravel: true });
      setData(fullWeek);
    } catch {
      // Keep editor interaction responsive even if details fetch fails.
    } finally {
      setDayDetailsLoading(false);
    }
  }, [fetchWeekData, weekStart]);

  const returnToWeekdays = useCallback(() => {
    setEditorOpen(false);
    setSelectedDate(null);
  }, []);

  useEffect(() => {
    if (!editorOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [editorOpen]);

  useEffect(() => {
    if (!editorOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") returnToWeekdays();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editorOpen, returnToWeekdays]);

  const patchDayInCurrentWeek = useCallback(
    (date: string, updater: (day: DayData) => DayData, options?: { bankDeltaMins?: number }) => {
      const bankDelta = options?.bankDeltaMins ?? 0;
      setData((prev) => {
        if (!prev) return prev;
        const dayIndex = prev.days.findIndex((day) => day.date === date);
        if (dayIndex < 0) return prev;
        const prevDay = prev.days[dayIndex];
        const nextDay = updater(prevDay);
        const nextDays = [...prev.days];
        nextDays[dayIndex] = nextDay;

        const weekHoursDelta = nextDay.net_mins - prevDay.net_mins;

        const nextWeek: WeekResponse = {
          ...prev,
          week_hours_mins: prev.week_hours_mins + weekHoursDelta,
          overtime_bank_mins: prev.overtime_bank_mins + bankDelta,
          days: nextDays,
        };
        weekCacheRef.current.set(weekStart, nextWeek);
        return nextWeek;
      });

      // The overtime bank is a single cumulative total shown identically on
      // every week, so keep all other cached weeks in step with the same delta.
      // This avoids wiping the prefetch cache on each edit (the old behavior),
      // which is what made week navigation stutter after compensating.
      if (bankDelta) {
        for (const [key, week] of weekCacheRef.current) {
          if (key === weekStart) continue;
          weekCacheRef.current.set(key, {
            ...week,
            overtime_bank_mins: week.overtime_bank_mins + bankDelta,
          });
        }
      }
    },
    [weekStart],
  );

  async function postAction<T extends Record<string, unknown>>(body: unknown): Promise<T> {
    const response = await fetch("/api/time-tracker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as T & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Action failed");
    return payload as T;
  }

  // Fire a write and tie it into the debounced reconcile. The UI is already
  // updated optimistically by the caller, so this never blocks interaction;
  // it only tracks in-flight writes so the single reconcile waits for the
  // burst to finish before refetching the authoritative server state.
  async function commitWrite<T extends Record<string, unknown>>(body: unknown): Promise<T> {
    pendingWritesRef.current += 1;
    try {
      return await postAction<T>(body);
    } finally {
      pendingWritesRef.current -= 1;
      scheduleReconcile();
    }
  }

  function handleSaveDay() {
    if (readOnly) return;
    if (!selectedDay) return;
    const date = selectedDay.date;
    const nextBreaks = formBreaks.map((item) => ({ ...item }));
    const netMins = computeNetMins(formStart, formStop, nextBreaks);
    const breaksChanged =
      selectedDay.breaks.length !== nextBreaks.length ||
      selectedDay.breaks.some((item, index) => {
        const next = nextBreaks[index];
        if (!next) return true;
        return item.name !== next.name || item.mins !== next.mins;
      });
    const hasChanges =
      selectedDay.start_time !== formStart ||
      selectedDay.stop_time !== formStop ||
      Boolean(selectedDay.holiday) !== Boolean(formHoliday) ||
      Boolean(selectedDay.sick_leave) !== Boolean(formSickLeave) ||
      selectedDay.net_mins !== netMins ||
      breaksChanged;

    if (hasChanges) {
      playUiSound("saveConfirm");
    }

    const previousDaySnapshot: DayData = {
      ...selectedDay,
      breaks: selectedDay.breaks.map((item) => ({ ...item })),
    };
    const nextDaySnapshot: DayData = {
      ...previousDaySnapshot,
      start_time: formStart,
      stop_time: formStop,
      net_mins: netMins,
      holiday: formHoliday,
      sick_leave: formSickLeave,
      breaks: nextBreaks,
    };
    const bankDelta = bankDeltaForDay(previousDaySnapshot, nextDaySnapshot);

    // Optimistic save: close editor and update card (and bank) immediately.
    patchDayInCurrentWeek(
      date,
      (day) => ({
        ...day,
        start_time: formStart,
        stop_time: formStop,
        net_mins: netMins,
        holiday: formHoliday,
        sick_leave: formSickLeave,
        breaks: nextBreaks,
      }),
      { bankDeltaMins: bankDelta },
    );
    returnToWeekdays();

    void commitWrite<{ ok: boolean }>({
      action: "save_day",
      day: {
        work_date: date,
        start_time: formStart,
        stop_time: formStop,
        holiday: formHoliday,
        sick_leave: formSickLeave,
        net_mins: netMins,
        breaks: nextBreaks,
      },
    })
      .then(() => {
        setToast({ kind: "ok", message: "Day saved." });
      })
      .catch((error) => {
        // Roll back optimistic values (and the bank) if persistence failed.
        patchDayInCurrentWeek(
          date,
          () => ({
            ...previousDaySnapshot,
            breaks: previousDaySnapshot.breaks.map((item) => ({ ...item })),
          }),
          { bankDeltaMins: -bankDelta },
        );
        setToast({ kind: "error", message: `Save failed. ${String((error as Error).message)}` });
      });
  }

  async function handleFillMissing(date: string) {
    if (readOnly) return;
    const currentDay = data?.days.find((day) => day.date === date);
    if (!currentDay) return;
    const worked = Math.max(0, currentDay.net_mins);
    const currentComp = Math.max(0, currentDay.comp_mins);
    const previousCompNote = currentDay.comp_note ?? "";
    const need = Math.max(0, TARGET_MINS - worked);
    // Toggle: clear if already fully compensated, otherwise top up to target.
    const optimisticNext = currentComp === need ? 0 : need;
    const nextNote = optimisticNext > 0 ? "auto-fill" : "";
    const bankDelta = bankDeltaForDay(currentDay, {
      ...currentDay,
      comp_mins: optimisticNext,
      comp_note: nextNote,
    });

    // Fully optimistic: update the day, the week's bank, and every cached
    // week's bank instantly. The value is computed here, so the backend write
    // is a single direct `set_comp` (no read-modify-write, no forced reload).
    patchDayInCurrentWeek(
      date,
      (day) => ({ ...day, comp_mins: optimisticNext, comp_note: nextNote }),
      { bankDeltaMins: bankDelta },
    );
    playUiSound("fillSwoosh");

    try {
      await commitWrite<{ ok: boolean; comp_mins: number }>({
        action: "set_comp",
        work_date: date,
        mins: optimisticNext,
      });
    } catch (error) {
      // Roll back the optimistic value and bank if the request failed.
      patchDayInCurrentWeek(
        date,
        (day) => ({
          ...day,
          comp_mins: currentComp,
          comp_note: currentComp > 0 ? previousCompNote : "",
        }),
        { bankDeltaMins: -bankDelta },
      );
      setToast({ kind: "error", message: (error as Error).message });
    }
  }

  async function handleFillDay(date: string) {
    if (readOnly) return;
    const currentDay = data?.days.find((day) => day.date === date);
    if (!currentDay) return;

    const nextBreaks: DayBreak[] = [{ name: "Break", mins: 30 }];
    const nextStart = "09:00";
    const nextStop = "17:54";
    const nextHoliday = false;
    const nextSickLeave = false;
    const nextNetMins = computeNetMins(nextStart, nextStop, nextBreaks);
    const previousDaySnapshot: DayData = {
      ...currentDay,
      breaks: currentDay.breaks.map((item) => ({ ...item })),
    };
    const nextDaySnapshot: DayData = {
      ...previousDaySnapshot,
      start_time: nextStart,
      stop_time: nextStop,
      net_mins: nextNetMins,
      holiday: nextHoliday,
      sick_leave: nextSickLeave,
      breaks: nextBreaks.map((item) => ({ ...item })),
    };
    const bankDelta = bankDeltaForDay(previousDaySnapshot, nextDaySnapshot);

    patchDayInCurrentWeek(
      date,
      (day) => ({
        ...day,
        start_time: nextStart,
        stop_time: nextStop,
        net_mins: nextNetMins,
        holiday: nextHoliday,
        sick_leave: nextSickLeave,
        breaks: nextBreaks.map((item) => ({ ...item })),
      }),
      { bankDeltaMins: bankDelta },
    );
    playUiSound("fillSwoosh");

    try {
      await commitWrite<{ ok: boolean }>({
        action: "save_day",
        day: {
          work_date: date,
          start_time: nextStart,
          stop_time: nextStop,
          holiday: nextHoliday,
          sick_leave: nextSickLeave,
          net_mins: nextNetMins,
          breaks: nextBreaks,
        },
      });
      setToast({ kind: "ok", message: "Day filled." });
    } catch (error) {
      patchDayInCurrentWeek(
        date,
        () => ({
          ...previousDaySnapshot,
          breaks: previousDaySnapshot.breaks.map((item) => ({ ...item })),
        }),
        { bankDeltaMins: -bankDelta },
      );
      setToast({ kind: "error", message: `Fill day failed. ${String((error as Error).message)}` });
    }
  }

  async function handleResetDay() {
    if (readOnly) return;
    if (!selectedDay) return;
    const date = selectedDay.date;
    const previousDaySnapshot: DayData = {
      ...selectedDay,
      breaks: selectedDay.breaks.map((item) => ({ ...item })),
    };
    const clearedDay: DayData = {
      ...previousDaySnapshot,
      start_time: "",
      stop_time: "",
      net_mins: 0,
      holiday: false,
      sick_leave: false,
      comp_mins: 0,
      comp_note: "",
      breaks: [],
    };
    const bankDelta = bankDeltaForDay(previousDaySnapshot, clearedDay);

    // Optimistic reset: clear the day + bank and close the editor immediately.
    setSaving(true);
    patchDayInCurrentWeek(date, () => ({ ...clearedDay, breaks: [] }), { bankDeltaMins: bankDelta });
    returnToWeekdays();
    try {
      await commitWrite<{ ok: boolean }>({ action: "reset_day", work_date: date });
      setToast({ kind: "ok", message: "Day reset." });
    } catch (error) {
      patchDayInCurrentWeek(
        date,
        () => ({
          ...previousDaySnapshot,
          breaks: previousDaySnapshot.breaks.map((item) => ({ ...item })),
        }),
        { bankDeltaMins: -bankDelta },
      );
      setToast({ kind: "error", message: (error as Error).message });
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    function onImported(event: Event) {
      const detail = (event as CustomEvent<{ imported_day_logs?: number; error?: string }>).detail;
      if (detail?.error) {
        setToast({ kind: "error", message: detail.error });
        return;
      }
      // A JSON import rewrites days across many weeks, so the cached/prefetched
      // neighbor weeks can't be patched incrementally — drop them and let them
      // refetch on next visit. (Single-day edits keep their caches in step.)
      weekCacheRef.current.clear();
      weekInflightRef.current.clear();
      void refreshWeek()
        .then(() => {
          setToast({
            kind: "ok",
            message: `Import done (${String(detail?.imported_day_logs ?? 0)} days).`,
          });
        })
        .catch((error) => {
          setToast({ kind: "error", message: (error as Error).message });
        });
    }

    window.addEventListener("time-tracker-imported", onImported as EventListener);
    return () => window.removeEventListener("time-tracker-imported", onImported as EventListener);
  }, [refreshWeek]);

  function handleEditDay(date: string) {
    setSelectedDate(date);
    setEditorOpen(true);
    void ensureWeekDetails();
  }

  const selectedDaySupportsBreaks = Boolean(selectedDay);
  // New break-counter UX applies from current week onward; older logs keep legacy row editing.
  const selectedDayUsesBreakCounter = Boolean(
    selectedDay && selectedDay.date >= currentWeekStartKey,
  );
  const formTotalBreakMins = useMemo(
    () => formBreaks.reduce((sum, item) => sum + Math.max(0, item.mins || 0), 0),
    [formBreaks],
  );
  function setFormBreakCounter(totalMins: number) {
    const safeTotal = Math.max(0, totalMins);
    setFormBreaks(safeTotal > 0 ? [{ name: "Break", mins: safeTotal }] : []);
  }
  const computedNet = computeNetMins(formStart, formStop, selectedDaySupportsBreaks ? formBreaks : []);
  const panelDateLabel = selectedDay ? dayLabel(selectedDay.date) : "Select a day";
  const activeWeekData = data?.week_start === weekStart ? data : null;
  const hasActiveWeekData = Boolean(activeWeekData);
  const placeholderDayKeys = useMemo(() => getWeekDayKeys(weekStart), [weekStart]);
  const weekdayDays = useMemo(() => (activeWeekData?.days ?? []).slice(0, 5), [activeWeekData?.days]);
  const weekendDays = useMemo(() => (activeWeekData?.days ?? []).slice(5, 7), [activeWeekData?.days]);

  const dayLoggerOverlay =
    editorPortalReady && editorOpen ? (
      <>
        <div
          className="day-logger-overlay fixed inset-0 z-[200] bg-slate-950/70"
          aria-hidden="true"
          onClick={() => returnToWeekdays()}
        />
        <div className="day-logger-dialog-wrap fixed inset-0 z-[210] flex items-center justify-center overflow-y-auto p-4 pointer-events-none sm:p-6">
          <div
            className="glass-card day-logger-card day-logger-dialog my-auto w-full max-w-3xl rounded-2xl p-4 shadow-2xl shadow-black/50 md:p-5 pointer-events-auto max-h-[min(92vh,880px)] overflow-y-auto scroll-mt-24"
            role="dialog"
            aria-modal="true"
            aria-labelledby="day-logger-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="grid auto-rows-min items-start gap-4 lg:grid-cols-2">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 id="day-logger-title" className="text-base font-semibold">
                    Day Logger
                  </h3>
                  <button
                    type="button"
                    onClick={() => returnToWeekdays()}
                    className="group flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-lg leading-none text-slate-200 transition hover:bg-white/15"
                    aria-label="Close day editor"
                  >
                    <span className="inline-block transition-transform duration-200 group-hover:rotate-90" aria-hidden>
                      ×
                    </span>
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  <p className="text-xs text-slate-300/80">{panelDateLabel}</p>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-200/90">Start</span>
                    <input
                      type="time"
                      value={formStart}
                      disabled={!selectedDay || readOnly}
                      onChange={(event) => setFormStart(event.target.value)}
                      className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-200/90">Stop</span>
                    <input
                      type="time"
                      value={formStop}
                      disabled={!selectedDay || readOnly}
                      onChange={(event) => setFormStop(event.target.value)}
                      className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm"
                    />
                  </label>
                  <div>
                    <span className="mb-1.5 block text-xs text-slate-200/90">Day type</span>
                    <div
                      role="radiogroup"
                      aria-label="Day type"
                      className="grid grid-cols-3 gap-1 rounded-lg border border-white/15 bg-white/[0.04] p-1"
                    >
                      {([
                        { key: "normal", label: "Normal", active: "bg-white/15 text-slate-50 shadow-sm" },
                        { key: "holiday", label: "Holiday", active: "bg-amber-500/25 text-amber-50 shadow-sm" },
                        { key: "sick", label: "Sick leave", active: "bg-teal-500/25 text-teal-50 shadow-sm" },
                      ] as const).map((opt) => {
                        const isActive =
                          opt.key === "holiday" ? formHoliday : opt.key === "sick" ? formSickLeave : !formHoliday && !formSickLeave;
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            role="radio"
                            aria-checked={isActive}
                            disabled={!selectedDay || readOnly}
                            onClick={() => {
                              setFormHoliday(opt.key === "holiday");
                              setFormSickLeave(opt.key === "sick");
                            }}
                            className={`rounded-md px-2 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              isActive ? opt.active : "text-slate-300/70 hover:text-slate-100"
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    {formHoliday ? (
                      <p className="mt-1.5 text-xs leading-snug text-slate-400">
                        Excused from your target. Hours logged count as overtime (same as a weekend).
                      </p>
                    ) : formSickLeave ? (
                      <p className="mt-1.5 text-xs leading-snug text-slate-400">
                        Excused from your target. Hours logged don&apos;t count as overtime.
                      </p>
                    ) : null}
                  </div>

                  {selectedDaySupportsBreaks ? (
                    <div className="rounded-xl border border-white/15 bg-white/5 p-3">
                      <div className="mb-2.5 flex items-end justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-cyan-200/80">Breaks</p>
                        </div>
                      </div>
                      {readOnly ? (
                        <div className="space-y-1 text-xs text-slate-200/90">
                          {formBreaks.length === 0 ? (
                            <p className="text-slate-300/80">No breaks logged.</p>
                          ) : (
                            formBreaks.map((item, index) => (
                              <div key={`${index}-ro`} className="flex justify-between">
                                <span>{item.name || "Break"}</span>
                                <span className="tabular-nums">{item.mins} min</span>
                              </div>
                            ))
                          )}
                        </div>
                      ) : selectedDayUsesBreakCounter ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setFormBreakCounter(formTotalBreakMins - 15)}
                              className="h-9 rounded-lg border border-white/20 bg-white/10 px-2 text-sm font-semibold tabular-nums transition hover:bg-white/15"
                            >
                              -15
                            </button>
                            <button
                              type="button"
                              onClick={() => setFormBreakCounter(formTotalBreakMins + 15)}
                              className="h-9 rounded-lg border border-white/20 bg-white/10 px-2 text-sm font-semibold tabular-nums transition hover:bg-white/15"
                            >
                              +15
                            </button>
                          </div>
                          <div className="inline-flex w-full items-center justify-center rounded-lg border border-white/20 bg-white/10 px-2 py-2 text-sm font-semibold text-slate-100 tabular-nums">
                            Break {formTotalBreakMins} min
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {formBreaks.length === 0 ? (
                            <p className="text-xs text-slate-300/80">No breaks added.</p>
                          ) : (
                            formBreaks.map((item, index) => (
                              <div key={`${index}-${item.name}`} className="grid gap-2 sm:grid-cols-[1fr_90px_auto]">
                                <input
                                  placeholder="Name"
                                  value={item.name}
                                  onChange={(event) => {
                                    const name = event.target.value;
                                    setFormBreaks((prev) => prev.map((row, rowIdx) => (rowIdx === index ? { ...row, name } : row)));
                                  }}
                                  className="rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-xs"
                                />
                                <input
                                  type="number"
                                  min={0}
                                  placeholder="mins"
                                  value={item.mins}
                                  onChange={(event) => {
                                    const mins = Number.parseInt(event.target.value || "0", 10) || 0;
                                    setFormBreaks((prev) => prev.map((row, rowIdx) => (rowIdx === index ? { ...row, mins } : row)));
                                  }}
                                  className="rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-xs"
                                />
                                <button
                                  type="button"
                                  onClick={() => setFormBreaks((prev) => prev.filter((_, rowIdx) => rowIdx !== index))}
                                  className="rounded-lg border border-rose-300/40 bg-rose-500/10 px-2 py-1.5 text-xs text-rose-200 sm:px-2"
                                >
                                  Remove
                                </button>
                              </div>
                            ))
                          )}
                          <button
                            type="button"
                            onClick={() => setFormBreaks((prev) => [...prev, { name: "", mins: 0 }])}
                            className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-xs hover:bg-white/15"
                          >
                            Add break
                          </button>
                        </div>
                      )}
                    </div>
                  ) : null}

                  <p className="text-xs text-slate-300/80">Computed total: {fmtHM(computedNet)}</p>

                  {readOnly ? (
                    <p className="text-xs text-slate-400">Read-only view &mdash; saving is disabled.</p>
                  ) : (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => {
                          void handleSaveDay();
                        }}
                        disabled={saving || !selectedDay}
                        className="flex-1 rounded-lg bg-cyan-400/90 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:-translate-y-px hover:bg-cyan-300 disabled:translate-y-0 disabled:opacity-70"
                      >
                        {saving ? "Saving..." : "Save day"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          playUiSound("resetTap");
                          void handleResetDay();
                        }}
                        disabled={saving || !selectedDay}
                        className="flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm hover:bg-white/15 disabled:opacity-70"
                      >
                        Reset day
                      </button>
                    </div>
                  )}
                </div>

                {toast && (
                  <p className={`mt-4 text-sm ${toast.kind === "ok" ? "text-emerald-300" : "text-rose-300"}`}>{toast.message}</p>
                )}
              </div>

              <aside className="h-fit self-start rounded-xl border border-white/15 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-cyan-200/80">Travel info</p>
                <p className="mt-2 text-xs text-slate-300/80">{panelDateLabel}</p>
                {!selectedDay ? (
                  <p className="mt-4 text-sm text-slate-300/80">Select a day to edit details.</p>
                ) : dayDetailsLoading ? (
                  <p className="mt-4 text-sm text-slate-300/80">Loading travel details...</p>
                ) : !selectedTravelInfo ? (
                  <>
                    <p className="mt-4 text-sm text-slate-300/80">No travel info found for this date.</p>
                    {data?.travel_debug ? (
                      <p className="mt-3 text-xs text-slate-400/90">
                        Debug: {data.travel_debug.status} - {data.travel_debug.message}
                        {"  "}
                        ({data.travel_debug.fetched_dates} loaded, {data.travel_debug.week_matches} in week)
                      </p>
                    ) : null}
                  </>
                ) : (
                  <div className="mt-4 space-y-3 text-sm">
                    <div>
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-300/75">Client</p>
                      <p className="mt-1">{selectedTravelInfo.client || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-300/75">Location</p>
                      <p className="mt-1">{selectedTravelInfo.location || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-300/75">Responsible</p>
                      <p className="mt-1">{selectedTravelInfo.responsible || "-"}</p>
                    </div>
                  </div>
                )}
              </aside>
            </div>
          </div>
        </div>
      </>
    ) : null;

  function renderDayCard(day: DayData, index: number) {
    const isSelected = selectedDay?.date === day.date;
    const revealed = index < revealedDayCount;
    const isSickLeave = day.sick_leave;
    const isRelaxDay = isWeekendDate(day.date) || day.holiday || isSickLeave;
    // Sick leave is excused but never earns overtime, so no worked hours show on the bar.
    const premiumOvertimeDay = !isSickLeave && isPremiumOvertimeDay(day.date, day.net_mins, day.holiday);
    const workedBaseMins = Math.min(day.net_mins, TARGET_MINS);
    const overtimeWorkedMinsWeekday = premiumOvertimeDay
      ? Math.max(0, day.net_mins)
      : Math.max(0, day.net_mins - TARGET_MINS);
    const overtimeCompMins = Math.max(0, day.comp_mins);

    const displayDonePct = isRelaxDay
      ? 100
      : Math.round(((day.net_mins + day.comp_mins) / TARGET_MINS) * 100);

    let restPct = 0;
    let sandPct = 0;
    let algaePct = 0;
    let compPct = 0;
    let restDelayMs = 0;
    let restDurMs = 0;
    let sandDelayMs = 0;
    let sandDurMs = 0;
    let algaeDelayMs = 0;
    let algaeDurMs = 0;
    let compDelayMs = 0;
    let compDurMs = 0;

    const baseDelay = index * 80 + 65;
    const minDurMs = 80;
    const msPerPct = 6;
    const dur = (pct: number) => (pct > 0 ? Math.max(minDurMs, Math.round(pct * msPerPct)) : 0);

    if (isRelaxDay) {
      const otWork = isSickLeave ? 0 : Math.max(0, day.net_mins);
      const barTotalMins = TARGET_MINS + otWork + overtimeCompMins;
      restPct = (TARGET_MINS / barTotalMins) * 100;
      algaePct = (otWork / barTotalMins) * 100;
      compPct = (overtimeCompMins / barTotalMins) * 100;
      restDelayMs = baseDelay;
      restDurMs = dur(restPct);
      algaeDurMs = dur(algaePct);
      compDurMs = dur(compPct);
      algaeDelayMs = restDelayMs + restDurMs;
      compDelayMs = algaeDelayMs + algaeDurMs;
    } else {
      const barTotalMins = Math.max(
        TARGET_MINS,
        (premiumOvertimeDay ? 0 : workedBaseMins) + overtimeWorkedMinsWeekday + overtimeCompMins,
      );
      sandPct = ((premiumOvertimeDay ? 0 : workedBaseMins) / barTotalMins) * 100;
      algaePct = (overtimeWorkedMinsWeekday / barTotalMins) * 100;
      compPct = (overtimeCompMins / barTotalMins) * 100;
      sandDelayMs = baseDelay;
      sandDurMs = dur(sandPct);
      algaeDurMs = dur(algaePct);
      compDurMs = dur(compPct);
      algaeDelayMs = sandDelayMs + sandDurMs;
      compDelayMs = algaeDelayMs + algaeDurMs;
    }

    const isSat = isSaturdayDate(day.date);
    const isSun = isSundayDate(day.date);
    const isPh = day.holiday;
    const isSl = isSickLeave;

    return (
      <article
        key={day.date}
        className={`liquid-day-card rounded-xl p-3 transition-all duration-300 ease-out ${
          isSat ? "liquid-day-card--sat" : ""
        } ${isSun ? "liquid-day-card--sun" : ""} ${isPh ? "liquid-day-card--ph" : ""} ${
          isSl ? "liquid-day-card--sl" : ""
        } ${isSelected ? "day-card-selected" : ""
        } ${revealed ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"}`}
        style={{ "--day-sweep-delay": `${index * 58}ms` } as CSSProperties}
      >
        {showUpToDateSweep && revealed ? <span className="day-ready-sweep-beam" aria-hidden="true" /> : null}
        <button
          type="button"
          onClick={() => {
            handleEditDay(day.date);
          }}
          className="w-full text-left"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <p className="text-xs text-slate-300/80">{dayLabel(day.date)}</p>
              {isSat ? (
                <span className="shrink-0 rounded border border-indigo-400/35 bg-indigo-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-indigo-100/95">
                  Sat
                </span>
              ) : null}
              {isSun ? (
                <span className="shrink-0 rounded border border-rose-400/35 bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-rose-100/95">
                  Sun
                </span>
              ) : null}
              {isPh ? (
                <span className="shrink-0 rounded border border-amber-400/45 bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-100/95">
                  PH
                </span>
              ) : null}
              {isSl ? (
                <span className="shrink-0 rounded border border-teal-400/45 bg-teal-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-teal-100/95">
                  SL
                </span>
              ) : null}
            </div>
            <AnimatedNumber key={`day-pct-${day.date}-${weekLoadTick}`} value={displayDonePct}>
              {(value) => <p className="shrink-0 text-xs font-medium text-cyan-100/90">{Math.round(value)}%</p>}
            </AnimatedNumber>
          </div>
          <AnimatedNumber key={`day-worked-${day.date}-${weekLoadTick}`} value={day.net_mins}>
            {(value) => (
              <p className="mt-1 text-sm font-medium">
                {day.sick_leave
                  ? "Sick leave"
                  : day.holiday
                    ? day.net_mins > 0
                      ? `Public holiday · ${fmtHM(Math.round(value))} worked`
                      : "Public holiday"
                    : `${fmtHM(Math.round(value))} worked`}
              </p>
            )}
          </AnimatedNumber>
          <div className="day-progress mt-3" aria-label="Day progress bar">
            <AnimatedNumber key={`day-topdown-${day.date}-${weekLoadTick}`} value={Math.max(0, Math.min(100, displayDonePct))}>
              {(value) => (
                <span
                  className="day-progress-topdown"
                  style={{ height: `${value}%`, animationDelay: `${index * 80}ms` }}
                />
              )}
            </AnimatedNumber>
            {isRelaxDay ? (
              <AnimatedNumber key={`day-rest-${day.date}-${weekLoadTick}`} value={restPct}>
                {(value) => (
                  <span
                    className="day-progress-segment day-progress-rest"
                    style={{
                      width: `${Math.max(0, value)}%`,
                      animationDelay: `${restDelayMs}ms`,
                      animationDuration: `${restDurMs || minDurMs}ms`,
                      animationTimingFunction: "linear",
                    }}
                  />
                )}
              </AnimatedNumber>
            ) : (
              <AnimatedNumber key={`day-sand-${day.date}-${weekLoadTick}`} value={sandPct}>
                {(value) => (
                  <span
                    className="day-progress-segment day-progress-sand"
                    style={{
                      width: `${Math.max(0, value)}%`,
                      animationDelay: `${sandDelayMs}ms`,
                      animationDuration: `${sandDurMs || minDurMs}ms`,
                      animationTimingFunction: "linear",
                    }}
                  />
                )}
              </AnimatedNumber>
            )}
            <AnimatedNumber key={`day-algae-${day.date}-${weekLoadTick}`} value={algaePct}>
              {(value) => (
                <span
                  className="day-progress-segment day-progress-algae"
                  style={{
                    width: `${Math.max(0, value)}%`,
                    animationDelay: `${algaeDelayMs}ms`,
                    animationDuration: `${algaeDurMs || minDurMs}ms`,
                    animationTimingFunction: "linear",
                  }}
                />
              )}
            </AnimatedNumber>
            <AnimatedNumber key={`day-comp-${day.date}-${weekLoadTick}`} value={compPct}>
              {(value) => (
                <span
                  className="day-progress-segment day-progress-comp"
                  style={{
                    width: `${Math.max(0, value)}%`,
                    animationDelay: `${compDelayMs}ms`,
                    animationDuration: `${compDurMs || minDurMs}ms`,
                    animationTimingFunction: "linear",
                  }}
                />
              )}
            </AnimatedNumber>
          </div>
          {isRelaxDay ? (
            <div className="mt-2 space-y-1 text-[11px] font-medium text-white">
              {day.net_mins > 0 ? (
                <AnimatedNumber key={`day-ot-worked-${day.date}-${weekLoadTick}`} value={day.net_mins}>
                  {(overtimeValue) => (
                    <div className="flex w-full items-baseline justify-between gap-3">
                      <span className="shrink-0 text-left font-normal">Overtime worked</span>
                      <span className="tabular-nums text-right text-emerald-200/95">{fmtHM(Math.round(overtimeValue))}</span>
                    </div>
                  )}
                </AnimatedNumber>
              ) : null}
              {overtimeCompMins > 0 ? (
                <AnimatedNumber key={`day-ot-comp-${day.date}-${weekLoadTick}`} value={overtimeCompMins}>
                  {(compValue) => (
                    <div className="flex w-full items-baseline justify-between gap-3">
                      <span className="shrink-0 text-left font-normal">Overtime compensated</span>
                      <span className="tabular-nums text-right">{fmtHM(Math.round(compValue))}</span>
                    </div>
                  )}
                </AnimatedNumber>
              ) : null}
            </div>
          ) : (
            <AnimatedNumber key={`day-core-${day.date}-${weekLoadTick}`} value={premiumOvertimeDay ? 0 : workedBaseMins}>
              {(coreValue) => (
                <div className="mt-2 space-y-1 text-[11px] font-medium text-white">
                  <div className="flex w-full items-baseline justify-between gap-3">
                    <span className="shrink-0 text-left font-normal">Core hours</span>
                    <span className="tabular-nums text-right">{fmtHM(Math.round(coreValue))}</span>
                  </div>
                  {overtimeWorkedMinsWeekday > 0 ? (
                    <AnimatedNumber key={`day-ot-worked-${day.date}-${weekLoadTick}`} value={overtimeWorkedMinsWeekday}>
                      {(overtimeValue) => (
                        <div className="flex w-full items-baseline justify-between gap-3">
                          <span className="shrink-0 text-left font-normal">Overtime worked</span>
                          <span className="tabular-nums text-right">{fmtHM(Math.round(overtimeValue))}</span>
                        </div>
                      )}
                    </AnimatedNumber>
                  ) : null}
                  {overtimeCompMins > 0 ? (
                    <AnimatedNumber key={`day-ot-comp-${day.date}-${weekLoadTick}`} value={overtimeCompMins}>
                      {(compValue) => (
                        <div className="flex w-full items-baseline justify-between gap-3">
                          <span className="shrink-0 text-left font-normal">Overtime compensated</span>
                          <span className="tabular-nums text-right">{fmtHM(Math.round(compValue))}</span>
                        </div>
                      )}
                    </AnimatedNumber>
                  ) : null}
                </div>
              )}
            </AnimatedNumber>
          )}
        </button>
        {readOnly ? null : (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                void handleFillMissing(day.date);
              }}
              className="flex-1 rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-xs hover:bg-white/15"
            >
              Compensate
              <br />
              Day
            </button>
            <button
              type="button"
              onClick={() => {
                void handleFillDay(day.date);
              }}
              className="flex-1 rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-xs hover:bg-white/15"
            >
              Standard
              <br />
              Day
            </button>
          </div>
        )}
      </article>
    );
  }

  return (
    <>
    <section className="underwater-panel relative grid overflow-hidden rounded-2xl transition-all duration-500 ease-out gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,0fr)] lg:items-start">
      {/* One grid cell for bubbles + main card so the card stays in the wide column (not the 0fr track). */}
      <div className="relative min-h-0 min-w-0 w-full lg:col-start-1 lg:row-start-1">
        <div className="bubble-layer pointer-events-none absolute inset-0 z-0" aria-hidden="true">
          {bubbles.map((bubble, idx) => (
            <span
              key={`${bubble.left}-${idx}`}
              className="bubble"
              style={
                {
                  "--bubble-left": bubble.left,
                  "--bubble-size": bubble.size,
                  "--bubble-duration": bubble.duration,
                  "--bubble-delay": bubble.delay,
                } as CSSProperties
              }
            />
          ))}
        </div>
        <div className="glass-card hourlogger-surface relative z-[1] w-full min-w-0 rounded-2xl p-4 transition-all duration-500 ease-out md:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/80">Time Tracker</p>
            <h2 className="text-lg font-semibold md:text-xl">Hour Logger</h2>
            {viewingLabel ? (
              <p className="mt-1 text-xs text-amber-200/90">Viewing: {viewingLabel}</p>
            ) : null}
          </div>
          <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto sm:justify-end sm:gap-2">
            <button
              type="button"
              onClick={() => {
                const prev = addDays(fromDateKey(weekStart), -7);
                setWeekStart(toDateKey(prev));
              }}
              className="flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm hover:bg-white/15 sm:flex-none"
            >
              Prev week
            </button>
            <button
              type="button"
              onClick={() => {
                setWeekStart(toDateKey(getMonday()));
              }}
              className="flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm hover:bg-white/15 sm:flex-none"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                const next = addDays(fromDateKey(weekStart), 7);
                setWeekStart(toDateKey(next));
              }}
              className="flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm hover:bg-white/15 sm:flex-none"
            >
              Next week
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 sm:gap-3">
          <span className="flex min-w-0 items-center justify-between gap-3 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 tabular-nums">
            <span className="shrink-0">Weekly hours:</span>
            <span className="inline-block min-w-[8ch] text-right">
              {hasActiveWeekData ? (
                <AnimatedNumber key={`week-hours-${weekLoadTick}`} value={activeWeekData?.week_hours_mins ?? 0} durationMs={320}>
                  {(value) => fmtHM(Math.round(value))}
                </AnimatedNumber>
              ) : (
                <span className="inline-block h-4 w-16 animate-pulse rounded bg-white/20" aria-hidden="true" />
              )}
            </span>
          </span>
          <span className="flex min-w-0 items-center justify-between gap-3 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 tabular-nums">
            <span className="shrink-0">Overtime bank:</span>
            <span className="inline-block min-w-[9ch] text-right">
              {hasActiveWeekData ? (
                <AnimatedNumber key={`overtime-bank-${weekLoadTick}`} value={activeWeekData?.overtime_bank_mins ?? 0} durationMs={320}>
                  {(value) => fmtSignedHM(Math.round(value))}
                </AnimatedNumber>
              ) : (
                <span className="inline-block h-4 w-20 animate-pulse rounded bg-white/20" aria-hidden="true" />
              )}
            </span>
          </span>
        </div>

        <div className={`scroll-mt-24 mt-5 space-y-8 ${showUpToDateSweep ? "day-grid-ready" : ""}`}>
          {hasActiveWeekData ? (
            <>
              <div>
                <div className="mb-3 flex items-center gap-3">
                  <span className="h-px min-w-[1.5rem] flex-1 bg-gradient-to-r from-transparent to-white/20" aria-hidden />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Mon – Fri</span>
                  <span className="h-px min-w-[1.5rem] flex-1 bg-gradient-to-l from-transparent to-white/20" aria-hidden />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">{weekdayDays.map((day, i) => renderDayCard(day, i))}</div>
              </div>
              <div>
                <div className="mb-3 flex items-center gap-3">
                  <span className="h-px min-w-[1.5rem] flex-1 bg-gradient-to-r from-transparent to-white/20" aria-hidden />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Weekend</span>
                  <span className="h-px min-w-[1.5rem] flex-1 bg-gradient-to-l from-transparent to-white/20" aria-hidden />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {weekendDays.map((day, i) => renderDayCard(day, 5 + i))}
                </div>
              </div>
            </>
          ) : null}
          {!hasActiveWeekData ? (
            <>
              <div>
                <div className="mb-3 flex items-center gap-3">
                  <span className="h-px min-w-[1.5rem] flex-1 bg-gradient-to-r from-transparent to-white/15" aria-hidden />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-600">Mon – Fri</span>
                  <span className="h-px min-w-[1.5rem] flex-1 bg-gradient-to-l from-transparent to-white/15" aria-hidden />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {placeholderDayKeys.slice(0, 5).map((dateKey, index) => (
                    <article key={dateKey} className="liquid-day-card rounded-xl p-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs text-slate-300/80">{dayLabel(dateKey)}</p>
                        <span className="inline-block h-3 w-10 animate-pulse rounded bg-white/20" aria-hidden="true" />
                      </div>
                      <p className="mt-1">
                        <span className="inline-block h-4 w-28 animate-pulse rounded bg-white/20" aria-hidden="true" />
                      </p>
                      <div className="day-progress mt-3" aria-label="Loading day progress">
                        <span
                          className="day-progress-segment day-progress-sand animate-pulse"
                          style={{ width: `${18 + (index % 5) * 9}%` }}
                          aria-hidden="true"
                        />
                      </div>
                      <p className="mt-2">
                        <span className="inline-block h-3 w-36 animate-pulse rounded bg-white/20" aria-hidden="true" />
                      </p>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <span className="h-8 flex-1 animate-pulse rounded-lg border border-white/10 bg-white/10" aria-hidden="true" />
                        <span className="h-8 flex-1 animate-pulse rounded-lg border border-white/10 bg-white/10" aria-hidden="true" />
                      </div>
                    </article>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-3 flex items-center gap-3">
                  <span className="h-px min-w-[1.5rem] flex-1 bg-gradient-to-r from-transparent to-white/15" aria-hidden />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-600">Weekend</span>
                  <span className="h-px min-w-[1.5rem] flex-1 bg-gradient-to-l from-transparent to-white/15" aria-hidden />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {placeholderDayKeys.slice(5, 7).map((dateKey, index) => (
                    <article key={dateKey} className="liquid-day-card rounded-xl p-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs text-slate-300/80">{dayLabel(dateKey)}</p>
                        <span className="inline-block h-3 w-10 animate-pulse rounded bg-white/20" aria-hidden="true" />
                      </div>
                      <p className="mt-1">
                        <span className="inline-block h-4 w-28 animate-pulse rounded bg-white/20" aria-hidden="true" />
                      </p>
                      <div className="day-progress mt-3" aria-label="Loading day progress">
                        <span
                          className="day-progress-segment day-progress-sand animate-pulse"
                          style={{ width: `${18 + (index % 2) * 12}%` }}
                          aria-hidden="true"
                        />
                      </div>
                      <p className="mt-2">
                        <span className="inline-block h-3 w-36 animate-pulse rounded bg-white/20" aria-hidden="true" />
                      </p>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <span className="h-8 flex-1 animate-pulse rounded-lg border border-white/10 bg-white/10" aria-hidden="true" />
                        <span className="h-8 flex-1 animate-pulse rounded-lg border border-white/10 bg-white/10" aria-hidden="true" />
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
        {loading && !hasActiveWeekData ? <p className="mt-3 text-sm text-slate-200/80">Loading tracker week...</p> : null}
        </div>
      </div>
    </section>
    {dayLoggerOverlay ? createPortal(dayLoggerOverlay, document.body) : null}
    </>
  );
}

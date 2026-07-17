"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { playUiSound, stopUiSound } from "@/lib/ui-sounds";
import {
  addDays,
  bankDeltaForDay,
  buildMonthWeeks,
  computeNetMins,
  dayLabel,
  type DayBreak,
  type DayData,
  fromDateKey,
  getMonday,
  PREFETCH_IDLE_FALLBACK_MS,
  PREFETCH_WEEKS_EACH_SIDE,
  RECONCILE_DEBOUNCE_MS,
  TARGET_MINS,
  type TimeTrackerPanelProps,
  toDateKey,
  type ToastState,
  type WeekResponse,
} from "./types";

/** All Hour Logger state: week navigation + caching/prefetch, the reveal
 * cascade, the day editor form, optimistic writes with debounced reconcile,
 * and the week-picker calendar. */
export function useTimeTracker({
  readOnly = false,
  apiBase,
  initialWeek,
}: TimeTrackerPanelProps) {
  const [weekStart, setWeekStart] = useState<string>(toDateKey(getMonday()));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [data, setData] = useState<WeekResponse | null>(null);
  const [weekLoadTick, setWeekLoadTick] = useState(0);
  const [revealedDayCount, setRevealedDayCount] = useState(7);
  const [showUpToDateSweep, setShowUpToDateSweep] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarView, setCalendarView] = useState<"year" | "month">("year");
  const [calendarYear, setCalendarYear] = useState<number>(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState<string>(() => toDateKey(getMonday()));
  const calendarRef = useRef<HTMLDivElement | null>(null);
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

  // When the picker opens it starts on the year view, synced to the active
  // week's year. While open, dismiss it on Escape.
  useEffect(() => {
    if (!calendarOpen) return;
    setCalendarView("year");
    setCalendarYear(fromDateKey(weekStart).getFullYear());
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setCalendarOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // weekStart is intentionally only read on open, not tracked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarOpen]);

  const selectedDay = useMemo(() => {
    if (!data?.days?.length) return null;
    if (!selectedDate) return null;
    return data.days.find((day) => day.date === selectedDate) ?? null;
  }, [data, selectedDate]);

  const selectedTravelInfo = useMemo(() => {
    if (!selectedDate) return null;
    return data?.travel_by_date?.[selectedDate] ?? null;
  }, [data?.travel_by_date, selectedDate]);

  // Overtime-earning days that fund the selected day's compensation, joined
  // with the travel client/location for each source day (when the sheet has
  // a row for it).
  const compSourceRows = useMemo(() => {
    if (!selectedDate) return [];
    const sources = data?.comp_sources?.[selectedDate];
    if (!sources?.length) return [];
    return sources
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((source) => {
        const travel = data?.travel_by_date?.[source.date];
        return {
          date: source.date,
          mins: source.mins,
          earned: source.earned,
          client: travel?.client || "",
          location: travel?.location || "",
        };
      });
  }, [data?.comp_sources, data?.travel_by_date, selectedDate]);

  const compTotalMins = useMemo(
    () => compSourceRows.reduce((sum, source) => sum + source.mins, 0),
    [compSourceRows],
  );

  const [formStart, setFormStart] = useState("");
  const [formStop, setFormStop] = useState("");
  const [formHoliday, setFormHoliday] = useState(false);
  const [formPublicHoliday, setFormPublicHoliday] = useState(false);
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
    setFormPublicHoliday(Boolean(day.public_holiday));
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
      Boolean(selectedDay.public_holiday) !== Boolean(formPublicHoliday) ||
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
      public_holiday: formPublicHoliday,
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
        public_holiday: formPublicHoliday,
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
        public_holiday: formPublicHoliday,
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
    const nextPublicHoliday = false;
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
      public_holiday: nextPublicHoliday,
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
        public_holiday: nextPublicHoliday,
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
          public_holiday: nextPublicHoliday,
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
      public_holiday: false,
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

  useEffect(() => {
    // Saving/resetting the travel mapping in Settings changes what every
    // cached week's travel data means, so drop all caches and re-read the
    // sheet with the new columns for the visible week right away.
    function onTravelMappingChanged() {
      weekCacheRef.current.clear();
      weekInflightRef.current.clear();
      void fetchWeekData(weekStart, { force: true, includeTravel: true })
        .then((fullWeek) => {
          setData((prev) => (prev && prev.week_start !== fullWeek.week_start ? prev : fullWeek));
        })
        .catch(() => {
          // The next editor open re-fetches travel; no need to surface this.
        });
    }

    window.addEventListener("ma-travel-mapping-changed", onTravelMappingChanged);
    return () => window.removeEventListener("ma-travel-mapping-changed", onTravelMappingChanged);
  }, [fetchWeekData, weekStart]);

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
  const calendarTodayKey = toDateKey(new Date());
  const calendarMonthWeeks = useMemo(() => buildMonthWeeks(calendarMonth), [calendarMonth]);
  const weekdayDays = useMemo(() => (activeWeekData?.days ?? []).slice(0, 5), [activeWeekData?.days]);
  const weekendDays = useMemo(() => (activeWeekData?.days ?? []).slice(5, 7), [activeWeekData?.days]);

  return {
    readOnly,
    weekStart,
    setWeekStart,
    loading,
    saving,
    toast,
    setToast,
    data,
    weekLoadTick,
    revealedDayCount,
    showUpToDateSweep,
    selectedDate,
    calendarOpen,
    setCalendarOpen,
    calendarView,
    setCalendarView,
    calendarYear,
    setCalendarYear,
    calendarMonth,
    setCalendarMonth,
    calendarRef,
    editorOpen,
    editorPortalReady,
    dayDetailsLoading,
    selectedDay,
    selectedTravelInfo,
    compSourceRows,
    compTotalMins,
    formStart,
    setFormStart,
    formStop,
    setFormStop,
    formHoliday,
    setFormHoliday,
    formPublicHoliday,
    setFormPublicHoliday,
    formSickLeave,
    setFormSickLeave,
    formBreaks,
    setFormBreaks,
    currentWeekStartKey,
    returnToWeekdays,
    handleSaveDay,
    handleFillMissing,
    handleFillDay,
    handleResetDay,
    handleEditDay,
    selectedDaySupportsBreaks,
    selectedDayUsesBreakCounter,
    formTotalBreakMins,
    setFormBreakCounter,
    computedNet,
    panelDateLabel,
    activeWeekData,
    hasActiveWeekData,
    calendarTodayKey,
    calendarMonthWeeks,
    weekdayDays,
    weekendDays,
  };
}

export type TimeTrackerState = ReturnType<typeof useTimeTracker>;

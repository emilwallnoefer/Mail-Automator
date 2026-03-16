"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { playUiSound } from "@/lib/ui-sounds";

const TARGET_MINS = 504;
const PREFETCH_WEEKS_EACH_SIDE = 4;

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
  comp_mins: number;
  comp_note: string;
  breaks: DayBreak[];
};

type WeekResponse = {
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

function isWeekendDate(dateKey: string) {
  const date = fromDateKey(dateKey);
  const day = date.getDay();
  return day === 0 || day === 6;
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

function useAnimatedNumber(target: number, durationMs = 620) {
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

function getDayOvertimeContributionMins(date: string, netMins: number, holiday: boolean, compMins: number) {
  if (holiday) return 0;
  const todayKey = toDateKey(new Date());
  const weekendRuleApplies = isWeekendDate(date) && date >= todayKey;
  const overtime = weekendRuleApplies ? Math.max(0, netMins) : Math.max(0, netMins - TARGET_MINS);
  return overtime - compMins;
}

export function TimeTrackerPanel() {
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
  const dayLoggerRef = useRef<HTMLDivElement | null>(null);
  const weekGridRef = useRef<HTMLDivElement | null>(null);
  const weekCacheRef = useRef<Map<string, WeekResponse>>(new Map());
  const weekInflightRef = useRef<Map<string, Promise<WeekResponse>>>(new Map());

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
  const [formBreaks, setFormBreaks] = useState<DayBreak[]>([]);

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
    options?: { force?: boolean },
  ): Promise<WeekResponse> => {
    const force = options?.force ?? false;
    if (!force) {
      const cached = weekCacheRef.current.get(targetWeekStart);
      if (cached) return cached;
      const inflight = weekInflightRef.current.get(targetWeekStart);
      if (inflight) return inflight;
    }

    const requestPromise = (async () => {
      const response = await fetch(`/api/time-tracker?weekStart=${encodeURIComponent(targetWeekStart)}`);
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
  }, []);

  const prefetchNearbyWeeks = useCallback((centerWeekStart: string) => {
    const center = getMonday(centerWeekStart);
    for (let i = -PREFETCH_WEEKS_EACH_SIDE; i <= PREFETCH_WEEKS_EACH_SIDE; i += 1) {
      if (i === 0) continue;
      const key = toDateKey(addDays(center, i * 7));
      if (weekCacheRef.current.has(key) || weekInflightRef.current.has(key)) continue;
      void fetchWeekData(key).catch(() => {
        // Silent prefetch failures should not interrupt UI interactions.
      });
    }
  }, [fetchWeekData]);

  useEffect(() => {
    if (!selectedDay) return;
    setSelectedDate(selectedDay.date);
    setFormStart(selectedDay.start_time ?? "");
    setFormStop(selectedDay.stop_time ?? "");
    setFormHoliday(Boolean(selectedDay.holiday));
    setFormBreaks(selectedDay.breaks?.map((item) => ({ ...item })) ?? []);
  }, [selectedDay]);

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
        const weekData = await fetchWeekData(weekStart);
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

  const refreshWeek = useCallback(async () => {
    const weekData = await fetchWeekData(weekStart, { force: true });
    applyWeekData(weekData);
    prefetchNearbyWeeks(weekStart);
  }, [applyWeekData, fetchWeekData, prefetchNearbyWeeks, weekStart]);

  function returnToWeekdays() {
    setEditorOpen(false);
    setSelectedDate(null);
    window.setTimeout(() => {
      weekGridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  const patchDayInCurrentWeek = useCallback(
    (date: string, updater: (day: DayData) => DayData) => {
      setData((prev) => {
        if (!prev) return prev;
        const dayIndex = prev.days.findIndex((day) => day.date === date);
        if (dayIndex < 0) return prev;
        const prevDay = prev.days[dayIndex];
        const nextDay = updater(prevDay);
        const nextDays = [...prev.days];
        nextDays[dayIndex] = nextDay;

        const weekHoursDelta = nextDay.net_mins - prevDay.net_mins;
        const overtimeDelta =
          getDayOvertimeContributionMins(nextDay.date, nextDay.net_mins, nextDay.holiday, nextDay.comp_mins) -
          getDayOvertimeContributionMins(prevDay.date, prevDay.net_mins, prevDay.holiday, prevDay.comp_mins);

        const nextWeek: WeekResponse = {
          ...prev,
          week_hours_mins: prev.week_hours_mins + weekHoursDelta,
          overtime_bank_mins: prev.overtime_bank_mins + overtimeDelta,
          days: nextDays,
        };
        weekCacheRef.current.set(weekStart, nextWeek);
        return nextWeek;
      });
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

  async function handleSaveDay() {
    if (!selectedDay) return;
    setSaving(true);
    try {
      const netMins = formHoliday ? 0 : computeNetMins(formStart, formStop, formBreaks);
      await postAction<{ ok: boolean }>({
        action: "save_day",
        day: {
          work_date: selectedDay.date,
          start_time: formStart,
          stop_time: formStop,
          holiday: formHoliday,
          net_mins: netMins,
          breaks: formBreaks,
        },
      });
      patchDayInCurrentWeek(selectedDay.date, (day) => ({
        ...day,
        start_time: formStart,
        stop_time: formStop,
        net_mins: netMins,
        holiday: formHoliday,
        breaks: formBreaks.map((item) => ({ ...item })),
      }));
      returnToWeekdays();
      setToast({ kind: "ok", message: "Day saved." });
    } catch (error) {
      setToast({ kind: "error", message: (error as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function handleFillMissing(date: string) {
    const currentDay = data?.days.find((day) => day.date === date);
    const worked = Math.max(0, currentDay?.net_mins ?? 0);
    const currentComp = Math.max(0, currentDay?.comp_mins ?? 0);
    const previousCompNote = currentDay?.comp_note ?? "";
    const need = Math.max(0, TARGET_MINS - worked);
    const optimisticNext = currentComp === need ? 0 : need;

    // Optimistic local update so the bar starts animating immediately.
    patchDayInCurrentWeek(date, (day) => ({
      ...day,
      comp_mins: optimisticNext,
      comp_note: optimisticNext > 0 ? "auto-fill" : "",
    }));
    playUiSound("fillSwoosh");

    try {
      const payload = await postAction<{ ok: boolean; comp_mins: number }>({ action: "fill_missing", work_date: date });
      if (payload.comp_mins !== optimisticNext) {
        patchDayInCurrentWeek(date, (day) => ({
          ...day,
          comp_mins: payload.comp_mins,
          comp_note: payload.comp_mins > 0 ? "auto-fill" : "",
        }));
      }
      setToast({ kind: "ok", message: "Missing time updated." });
    } catch (error) {
      // Rollback optimistic value if request failed.
      patchDayInCurrentWeek(date, (day) => ({
        ...day,
        comp_mins: currentComp,
        comp_note: currentComp > 0 ? previousCompNote : "",
      }));
      setToast({ kind: "error", message: (error as Error).message });
    }
  }

  async function handleResetDay() {
    if (!selectedDay) return;
    setSaving(true);
    try {
      await postAction<{ ok: boolean }>({ action: "reset_day", work_date: selectedDay.date });
      patchDayInCurrentWeek(selectedDay.date, (day) => ({
        ...day,
        start_time: "",
        stop_time: "",
        net_mins: 0,
        holiday: false,
        comp_mins: 0,
        comp_note: "",
        breaks: [],
      }));
      returnToWeekdays();
      setToast({ kind: "ok", message: "Day reset." });
    } catch (error) {
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
    window.setTimeout(() => {
      const node = dayLoggerRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const alreadyMostlyVisible = rect.top >= 120 && rect.bottom <= window.innerHeight - 24;
      if (alreadyMostlyVisible) return;
      node.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 40);
  }

  const computedNet = formHoliday ? 0 : computeNetMins(formStart, formStop, formBreaks);

  return (
    <section className="underwater-panel grid gap-6 rounded-2xl p-2 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="bubble-layer" aria-hidden="true">
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
      <div className="glass-card hourlogger-surface p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/80">Time Tracker</p>
            <h2 className="text-lg font-semibold md:text-xl">Hour Logger</h2>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
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

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="flex min-w-[16.5rem] items-center justify-between rounded-full border border-white/20 bg-white/10 px-3 py-1.5 tabular-nums">
            <span>Weekly hours:</span>
            <span className="ml-2 inline-block min-w-[8ch] text-right">
              <AnimatedNumber key={`week-hours-${weekLoadTick}`} value={data?.week_hours_mins ?? 0} durationMs={760}>
                {(value) => fmtHM(Math.round(value))}
              </AnimatedNumber>
            </span>
          </span>
          <span className="flex min-w-[16.5rem] items-center justify-between rounded-full border border-white/20 bg-white/10 px-3 py-1.5 tabular-nums">
            <span>Overtime bank:</span>
            <span className="ml-2 inline-block min-w-[9ch] text-right">
              <AnimatedNumber key={`overtime-bank-${weekLoadTick}`} value={data?.overtime_bank_mins ?? 0} durationMs={760}>
                {(value) => fmtSignedHM(Math.round(value))}
              </AnimatedNumber>
            </span>
          </span>
        </div>

        {loading ? (
          <p className="mt-5 text-sm text-slate-200/80">Loading tracker week...</p>
        ) : (
          <div
            ref={weekGridRef}
            className={`scroll-mt-24 mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3 ${showUpToDateSweep ? "day-grid-ready" : ""}`}
          >
            {(data?.days ?? []).map((day, index) => {
              const donePct = Math.round(((day.net_mins + day.comp_mins) / TARGET_MINS) * 100);
              const isSelected = selectedDay?.date === day.date;
              const revealed = index < revealedDayCount;
              const todayKey = toDateKey(new Date());
              const weekendRuleApplies = isWeekendDate(day.date) && day.date >= todayKey;
              const workedBaseMins = Math.min(day.net_mins, TARGET_MINS);
              const overtimeWorkedMins = weekendRuleApplies ? Math.max(0, day.net_mins) : Math.max(0, day.net_mins - TARGET_MINS);
              const overtimeCompMins = Math.max(0, day.comp_mins);
              const barTotalMins = Math.max(
                TARGET_MINS,
                (weekendRuleApplies ? 0 : workedBaseMins) + overtimeWorkedMins + overtimeCompMins,
              );
              const sandPct = ((weekendRuleApplies ? 0 : workedBaseMins) / barTotalMins) * 100;
              const algaePct = (overtimeWorkedMins / barTotalMins) * 100;
              const compPct = (overtimeCompMins / barTotalMins) * 100;
              const baseDelay = index * 80 + 65;
              const sandDelayMs = baseDelay;
              const minDurMs = 80;
              const msPerPct = 6;
              const sandDurMs = sandPct > 0 ? Math.max(minDurMs, Math.round(sandPct * msPerPct)) : 0;
              const algaeDurMs = algaePct > 0 ? Math.max(minDurMs, Math.round(algaePct * msPerPct)) : 0;
              const compDurMs = compPct > 0 ? Math.max(minDurMs, Math.round(compPct * msPerPct)) : 0;
              const algaeDelayMs = sandDelayMs + sandDurMs;
              const compDelayMs = algaeDelayMs + algaeDurMs;
              return (
                <article
                  key={day.date}
                  className={`liquid-day-card rounded-xl p-3 transition-all duration-300 ease-out ${
                    isSelected ? "day-card-selected" : ""
                  } ${revealed ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"}`}
                  style={{ "--day-ready-delay": `${index * 70}ms` } as CSSProperties}
                >
                  {showUpToDateSweep && revealed ? <span className="day-ready-mask-sheen" aria-hidden="true" /> : null}
                  <button
                    type="button"
                    onClick={() => {
                      handleEditDay(day.date);
                    }}
                    className="w-full text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs text-slate-300/80">{dayLabel(day.date)}</p>
                      <AnimatedNumber key={`day-pct-${day.date}-${weekLoadTick}`} value={donePct}>
                        {(value) => <p className="text-xs font-medium text-cyan-100/90">{Math.round(value)}%</p>}
                      </AnimatedNumber>
                    </div>
                    <AnimatedNumber key={`day-worked-${day.date}-${weekLoadTick}`} value={day.net_mins}>
                      {(value) => (
                        <p className="mt-1 text-sm font-medium">
                          {day.holiday ? "Public holiday" : `${fmtHM(Math.round(value))} worked`}
                        </p>
                      )}
                    </AnimatedNumber>
                    <div className="day-progress mt-3" aria-label="Day progress bar">
                      <AnimatedNumber key={`day-topdown-${day.date}-${weekLoadTick}`} value={Math.max(0, Math.min(100, donePct))}>
                        {(value) => (
                          <span
                            className="day-progress-topdown"
                            style={{ height: `${value}%`, animationDelay: `${index * 80}ms` }}
                          />
                        )}
                      </AnimatedNumber>
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
                    <AnimatedNumber key={`day-core-${day.date}-${weekLoadTick}`} value={weekendRuleApplies ? 0 : workedBaseMins}>
                      {(coreValue) => (
                        <AnimatedNumber key={`day-ot-worked-${day.date}-${weekLoadTick}`} value={overtimeWorkedMins}>
                          {(overtimeValue) => (
                            <AnimatedNumber key={`day-ot-comp-${day.date}-${weekLoadTick}`} value={overtimeCompMins}>
                              {(compValue) => (
                                <p className="mt-2 text-[11px] text-slate-300/80">
                                  Core hours {fmtHM(Math.round(coreValue))}
                                  {Math.round(overtimeValue) > 0 ? ` · Overtime worked ${fmtHM(Math.round(overtimeValue))}` : ""}
                                  {Math.round(compValue) > 0 ? ` · Overtime compensated ${fmtHM(Math.round(compValue))}` : ""}
                                </p>
                              )}
                            </AnimatedNumber>
                          )}
                        </AnimatedNumber>
                      )}
                    </AnimatedNumber>
                  </button>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => {
                        void handleFillMissing(day.date);
                      }}
                      className="flex-1 rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-xs hover:bg-white/15"
                    >
                      Fill missing
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleEditDay(day.date);
                      }}
                      className="flex-1 rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-xs hover:bg-white/15"
                    >
                      Edit
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {editorOpen && selectedDay ? (
        <div ref={dayLoggerRef} className="scroll-mt-24 glass-card p-4 md:p-5">
          <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold">Day Logger</h3>
              </div>

              <div className="mt-4 space-y-3">
                <p className="text-xs text-slate-300/80">{dayLabel(selectedDay.date)}</p>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-200/90">Start</span>
                  <input
                    type="time"
                    value={formStart}
                    disabled={formHoliday}
                    onChange={(event) => setFormStart(event.target.value)}
                    className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-200/90">Stop</span>
                  <input
                    type="time"
                    value={formStop}
                    disabled={formHoliday}
                    onChange={(event) => setFormStop(event.target.value)}
                    className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={formHoliday}
                    onChange={(event) => setFormHoliday(event.target.checked)}
                  />
                  Public holiday (full day)
                </label>

                <div className="space-y-2 rounded-xl border border-white/15 bg-white/5 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.16em] text-cyan-200/80">Breaks</p>
                    <button
                      type="button"
                      onClick={() => setFormBreaks((prev) => [...prev, { name: "", mins: 0 }])}
                      className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-xs hover:bg-white/15"
                    >
                      Add break
                    </button>
                  </div>

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
                </div>

                <p className="text-xs text-slate-300/80">Computed total: {fmtHM(computedNet)}</p>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => {
                      playUiSound("saveConfirm");
                      void handleSaveDay();
                    }}
                    disabled={saving}
                    className="flex-1 rounded-lg bg-cyan-400/90 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-cyan-300 disabled:opacity-70"
                  >
                    {saving ? "Saving..." : "Save day"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playUiSound("resetTap");
                      void handleResetDay();
                    }}
                    disabled={saving}
                    className="flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm hover:bg-white/15 disabled:opacity-70"
                  >
                    Reset day
                  </button>
                </div>
              </div>

              {toast && (
                <p className={`mt-4 text-sm ${toast.kind === "ok" ? "text-emerald-300" : "text-rose-300"}`}>{toast.message}</p>
              )}
            </div>

            <aside className="rounded-xl border border-white/15 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-cyan-200/80">Travel info</p>
              <p className="mt-2 text-xs text-slate-300/80">{dayLabel(selectedDay.date)}</p>
              {!selectedTravelInfo ? (
                <p className="mt-4 text-sm text-slate-300/80">No travel info found for this date.</p>
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
      ) : null}
    </section>
  );
}

"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "framer-motion";
import {
  MOBILE_SHEET_EASE_IN,
  MOBILE_SHEET_EASE_OUT,
  MOBILE_SHEET_MS,
} from "@/config/mobile-sheet-easing";
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

function weekRangeLabel(weekStartKey: string) {
  const mon = getMonday(weekStartKey);
  const sun = addDays(mon, 6);
  const sameYear = mon.getFullYear() === sun.getFullYear();
  const optsShort: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
  const optsEnd: Intl.DateTimeFormatOptions = sameYear
    ? optsShort
    : { ...optsShort, year: "numeric" };
  return `${mon.toLocaleDateString(undefined, { ...optsShort, year: "numeric" })} → ${sun.toLocaleDateString(undefined, optsEnd)}`;
}

function isWeekendDate(dateKey: string) {
  const date = fromDateKey(dateKey);
  const day = date.getDay();
  return day === 0 || day === 6;
}

function getWeekDayKeys(weekStart: string) {
  const start = getMonday(weekStart);
  return Array.from({ length: 7 }, (_, index) => toDateKey(addDays(start, index)));
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

type DayEditorBodyProps = {
  layout: "panel" | "sheet";
  panelDateLabel: string;
  selectedDay: DayData | null;
  selectedTravelInfo: { client: string; location: string; responsible: string } | null;
  travelDebug: WeekResponse["travel_debug"] | undefined;
  formStart: string;
  formStop: string;
  formHoliday: boolean;
  formBreaks: DayBreak[];
  setFormStart: (v: string) => void;
  setFormStop: (v: string) => void;
  setFormHoliday: (v: boolean) => void;
  setFormBreaks: Dispatch<SetStateAction<DayBreak[]>>;
  selectedDaySupportsBreaks: boolean;
  selectedDayUsesBreakCounter: boolean;
  formTotalBreakMins: number;
  setFormBreakCounter: (totalMins: number) => void;
  computedNet: number;
  saving: boolean;
  onSaveDay: () => void;
  onResetDay: () => void;
  toast: ToastState;
};

function DayEditorBody({
  layout,
  panelDateLabel,
  selectedDay,
  selectedTravelInfo,
  travelDebug,
  formStart,
  formStop,
  formHoliday,
  formBreaks,
  setFormStart,
  setFormStop,
  setFormHoliday,
  setFormBreaks,
  selectedDaySupportsBreaks,
  selectedDayUsesBreakCounter,
  formTotalBreakMins,
  setFormBreakCounter,
  computedNet,
  saving,
  onSaveDay,
  onResetDay,
  toast,
}: DayEditorBodyProps) {
  const showPanelHeading = layout === "panel";

  const formFields = (
    <>
      <label className="block min-w-0">
        <span className="mb-1 block text-xs text-slate-200/90">Start</span>
        <input
          type="time"
          value={formStart}
          disabled={formHoliday || !selectedDay}
          onChange={(event) => setFormStart(event.target.value)}
          className="w-full min-w-0 rounded-lg border border-white/20 bg-white/10 px-3 py-2.5 text-base leading-normal lg:py-2 lg:text-sm"
        />
      </label>
      <label className="block min-w-0">
        <span className="mb-1 block text-xs text-slate-200/90">Stop</span>
        <input
          type="time"
          value={formStop}
          disabled={formHoliday || !selectedDay}
          onChange={(event) => setFormStop(event.target.value)}
          className="w-full min-w-0 rounded-lg border border-white/20 bg-white/10 px-3 py-2.5 text-base leading-normal lg:py-2 lg:text-sm"
        />
      </label>
      <label className="flex min-w-0 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={formHoliday}
          disabled={!selectedDay}
          onChange={(event) => setFormHoliday(event.target.checked)}
        />
        Public holiday (full day)
      </label>

        {selectedDaySupportsBreaks ? (
          <div className="min-w-0 overflow-hidden rounded-xl border border-white/15 bg-white/5 p-3">
            <div className="mb-2.5 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-cyan-200/80">Breaks</p>
              </div>
            </div>
            {selectedDayUsesBreakCounter ? (
              <div className="space-y-2">
                <div className="grid min-w-0 grid-cols-2 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFormBreakCounter(formTotalBreakMins - 15)}
                    className="min-h-11 rounded-lg border border-white/20 bg-white/10 px-2 text-base font-semibold tabular-nums transition hover:bg-white/15 lg:h-9 lg:min-h-0 lg:text-sm"
                  >
                    -15
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormBreakCounter(formTotalBreakMins + 15)}
                    className="min-h-11 rounded-lg border border-white/20 bg-white/10 px-2 text-base font-semibold tabular-nums transition hover:bg-white/15 lg:h-9 lg:min-h-0 lg:text-sm"
                  >
                    +15
                  </button>
                </div>
                <div className="flex w-full min-w-0 items-center justify-center rounded-lg border border-white/20 bg-white/10 px-2 py-2.5 text-base font-semibold text-slate-100 tabular-nums lg:py-2 lg:text-sm">
                  Break {formTotalBreakMins} min
                </div>
              </div>
            ) : (
              <div className="min-w-0 space-y-2">
                {formBreaks.length === 0 ? (
                  <p className="text-xs text-slate-300/80">No breaks added.</p>
                ) : (
                  formBreaks.map((item, index) => (
                    <div
                      key={`${index}-${item.name}`}
                      className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_auto] sm:items-center"
                    >
                      <input
                        placeholder="Name"
                        value={item.name}
                        onChange={(event) => {
                          const name = event.target.value;
                          setFormBreaks((prev) => prev.map((row, rowIdx) => (rowIdx === index ? { ...row, name } : row)));
                        }}
                        className="min-w-0 rounded-lg border border-white/20 bg-white/10 px-2 py-2.5 text-base leading-normal lg:py-1.5 lg:text-xs"
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
                        className="min-w-0 rounded-lg border border-white/20 bg-white/10 px-2 py-2.5 text-base leading-normal tabular-nums lg:py-1.5 lg:text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setFormBreaks((prev) => prev.filter((_, rowIdx) => rowIdx !== index))}
                        className="min-h-11 shrink-0 rounded-lg border border-rose-300/40 bg-rose-500/10 px-2 text-base text-rose-200 sm:min-h-0 lg:py-1.5 lg:text-xs"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
                <button
                  type="button"
                  onClick={() => setFormBreaks((prev) => [...prev, { name: "", mins: 0 }])}
                  className="rounded-lg border border-white/20 bg-white/10 px-2 py-2 text-base hover:bg-white/15 lg:py-1 lg:text-xs"
                >
                  Add break
                </button>
              </div>
            )}
          </div>
        ) : null}

      <p className="text-xs text-slate-300/80">Computed total: {fmtHM(computedNet)}</p>

      <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => {
            onSaveDay();
          }}
          disabled={saving || !selectedDay}
          className="min-h-11 flex-1 rounded-lg bg-cyan-400/90 px-3 py-2.5 text-base font-semibold text-slate-900 hover:bg-cyan-300 disabled:opacity-70 lg:min-h-0 lg:py-2 lg:text-sm"
        >
          {saving ? "Saving..." : "Save day"}
        </button>
        <button
          type="button"
          onClick={() => {
            playUiSound("resetTap");
            void onResetDay();
          }}
          disabled={saving || !selectedDay}
          className="min-h-11 flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2.5 text-base hover:bg-white/15 disabled:opacity-70 lg:min-h-0 lg:py-2 lg:text-sm"
        >
          Reset day
        </button>
      </div>
    </>
  );

  const toastLine =
    toast != null ? (
      <p className={`mt-4 break-words text-sm ${toast.kind === "ok" ? "text-emerald-300" : "text-rose-300"}`}>
        {toast.message}
      </p>
    ) : null;

  return (
    <div className="grid min-w-0 w-full max-w-full auto-rows-min grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <div className="min-w-0">
        {showPanelHeading ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold">Day Logger</h3>
            </div>
            <div className="mt-4 space-y-3">
              <p className="text-xs text-slate-300/80">{panelDateLabel}</p>
              {formFields}
              {toastLine}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            {formFields}
            {toastLine}
          </div>
        )}
      </div>

      <aside className="h-fit min-w-0 w-full max-w-full overflow-hidden break-words rounded-xl border border-white/15 bg-white/5 p-4 lg:w-auto">
        <p className="text-xs uppercase tracking-[0.16em] text-cyan-200/80">Travel info</p>
        <p className="mt-2 text-xs text-slate-300/80">{panelDateLabel}</p>
        {!selectedDay ? (
          <p className="mt-4 text-sm text-slate-300/80">Select a day to edit details.</p>
        ) : !selectedTravelInfo ? (
          <>
            <p className="mt-4 text-sm text-slate-300/80">No travel info found for this date.</p>
            {travelDebug ? (
              <p className="mt-3 break-words text-xs text-slate-400/90">
                Debug: {travelDebug.status} - {travelDebug.message}
                {"  "}
                ({travelDebug.fetched_dates} loaded, {travelDebug.week_matches} in week)
              </p>
            ) : null}
          </>
        ) : (
          <div className="mt-4 space-y-3 text-sm">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-300/75">Client</p>
              <p className="mt-1 break-words">{selectedTravelInfo.client || "-"}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-300/75">Location</p>
              <p className="mt-1 break-words">{selectedTravelInfo.location || "-"}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-300/75">Responsible</p>
              <p className="mt-1 break-words">{selectedTravelInfo.responsible || "-"}</p>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [mobileSheetEntered, setMobileSheetEntered] = useState(false);
  const weekCacheRef = useRef<Map<string, WeekResponse>>(new Map());
  const weekInflightRef = useRef<Map<string, Promise<WeekResponse>>>(new Map());
  const previousEditorOpenRef = useRef<boolean | null>(null);
  const mobileSheetTitleRef = useRef<HTMLHeadingElement>(null);
  const mobileSheetBackRef = useRef<HTMLButtonElement>(null);
  const mobileSheetCloseTimerRef = useRef<number | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const prevEditorOpenForFocusRef = useRef(false);

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
  const todayKey = toDateKey(new Date());
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
    options?: { force?: boolean; includeTravel?: boolean; includeBank?: boolean },
  ): Promise<WeekResponse> => {
    const force = options?.force ?? false;
    const includeTravel = options?.includeTravel ?? true;
    const includeBank = options?.includeBank ?? true;
    if (!force) {
      const cached = weekCacheRef.current.get(targetWeekStart);
      if (cached) return cached;
      const inflight = weekInflightRef.current.get(targetWeekStart);
      if (inflight) return inflight;
    }

    const requestPromise = (async () => {
      const response = await fetch(
        `/api/time-tracker?weekStart=${encodeURIComponent(targetWeekStart)}&includeTravel=${includeTravel ? "1" : "0"}&includeBank=${includeBank ? "1" : "0"}`,
      );
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
      void fetchWeekData(key, { includeTravel: false, includeBank: false }).catch(() => {
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
    const useBreakCounter = selectedDay.date >= currentWeekStartKey;
    if (useBreakCounter) {
      const totalBreakMins = (selectedDay.breaks ?? []).reduce((sum, item) => sum + Math.max(0, item.mins || 0), 0);
      setFormBreaks(totalBreakMins > 0 ? [{ name: "Break", mins: totalBreakMins }] : []);
      return;
    }
    setFormBreaks(selectedDay.breaks?.map((item) => ({ ...item })) ?? []);
  }, [selectedDay, currentWeekStartKey]);

  useEffect(() => {
    let active = true;
    async function loadWeek() {
      const hydrateWeekDetailsInBackground = (targetWeekStart: string) => {
        void fetchWeekData(targetWeekStart, { force: true, includeTravel: true, includeBank: true })
          .then((fullWeek) => {
            if (!active) return;
            if (fullWeek.week_start !== targetWeekStart) return;
            setData((prev) => {
              if (!prev || prev.week_start !== targetWeekStart) return prev;
              return {
                ...prev,
                overtime_bank_mins: fullWeek.overtime_bank_mins,
                travel_by_date: fullWeek.travel_by_date,
                travel_debug: fullWeek.travel_debug,
                includes_travel: fullWeek.includes_travel,
                includes_bank: fullWeek.includes_bank,
              };
            });
          })
          .catch(() => {
            // Keep quick week load even if background hydration fails.
          });
      };
      try {
        const cached = weekCacheRef.current.get(weekStart);
        if (cached) {
          if (!active) return;
          applyWeekData(cached);
          setWeekLoadTick((prev) => prev + 1);
          prefetchNearbyWeeks(weekStart);
          const needsHydration = !cached.includes_travel || !cached.includes_bank;
          if (needsHydration) {
            hydrateWeekDetailsInBackground(weekStart);
          }
          return;
        }
        setLoading(true);
        const weekData = await fetchWeekData(weekStart, { includeTravel: false, includeBank: false });
        if (!active) return;
        applyWeekData(weekData);
        setWeekLoadTick((prev) => prev + 1);
        prefetchNearbyWeeks(weekStart);
        hydrateWeekDetailsInBackground(weekStart);
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
    const previous = previousEditorOpenRef.current;
    previousEditorOpenRef.current = editorOpen;
    if (previous == null || previous === editorOpen) return;
    playUiSound("dayLoggerSlide");
  }, [editorOpen]);

  useEffect(() => {
    if (prevEditorOpenForFocusRef.current && !editorOpen && restoreFocusRef.current) {
      restoreFocusRef.current.focus({ preventScroll: true });
      restoreFocusRef.current = null;
    }
    prevEditorOpenForFocusRef.current = editorOpen;
  }, [editorOpen]);

  const [mobileSheetExiting, setMobileSheetExiting] = useState(false);
  const reduceMotion = useReducedMotion() ?? false;
  const mobileFadeMs = reduceMotion ? 0 : MOBILE_SHEET_MS;

  const closeDayEditorSheet = useCallback(() => {
    if (typeof window === "undefined" || !window.matchMedia("(max-width: 1023px)").matches) {
      if (mobileSheetCloseTimerRef.current != null) {
        clearTimeout(mobileSheetCloseTimerRef.current);
        mobileSheetCloseTimerRef.current = null;
      }
      setMobileSheetExiting(false);
      setEditorOpen(false);
      return;
    }
    if (mobileSheetCloseTimerRef.current != null) return;
    setMobileSheetExiting(true);
    setMobileSheetEntered(false);
    mobileSheetCloseTimerRef.current = window.setTimeout(() => {
      mobileSheetCloseTimerRef.current = null;
      setMobileSheetExiting(false);
      setEditorOpen(false);
    }, MOBILE_SHEET_MS);
  }, []);

  useLayoutEffect(() => {
    if (!editorOpen) {
      setMobileSheetEntered(false);
      setMobileSheetExiting(false);
      if (mobileSheetCloseTimerRef.current != null) {
        clearTimeout(mobileSheetCloseTimerRef.current);
        mobileSheetCloseTimerRef.current = null;
      }
      document.documentElement.style.overflow = "";
      document.documentElement.style.paddingRight = "";
      return;
    }

    if (mobileSheetCloseTimerRef.current != null) {
      clearTimeout(mobileSheetCloseTimerRef.current);
      mobileSheetCloseTimerRef.current = null;
    }
    setMobileSheetExiting(false);

    const mq = window.matchMedia("(max-width: 1023px)");
    const applyScrollLock = () => {
      if (!mq.matches) {
        document.documentElement.style.overflow = "";
        document.documentElement.style.paddingRight = "";
        return;
      }
      const gap = window.innerWidth - document.documentElement.clientWidth;
      document.documentElement.style.overflow = "hidden";
      document.documentElement.style.paddingRight = gap > 0 ? `${gap}px` : "";
    };
    applyScrollLock();
    mq.addEventListener("change", applyScrollLock);

    setMobileSheetEntered(false);
    const enterRaf = requestAnimationFrame(() => setMobileSheetEntered(true));

    return () => {
      cancelAnimationFrame(enterRaf);
      mq.removeEventListener("change", applyScrollLock);
      document.documentElement.style.overflow = "";
      document.documentElement.style.paddingRight = "";
    };
  }, [editorOpen]);

  useEffect(() => {
    if (!editorOpen) return;
    const mq = window.matchMedia("(max-width: 1023px)");
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && mq.matches) {
        event.preventDefault();
        closeDayEditorSheet();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    let raf = 0;
    if (mq.matches) {
      raf = requestAnimationFrame(() => mobileSheetBackRef.current?.focus());
    }
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      cancelAnimationFrame(raf);
    };
  }, [editorOpen, closeDayEditorSheet]);

  const refreshWeek = useCallback(async () => {
    const weekData = await fetchWeekData(weekStart, { force: true });
    applyWeekData(weekData);
    prefetchNearbyWeeks(weekStart);
  }, [applyWeekData, fetchWeekData, prefetchNearbyWeeks, weekStart]);

  function returnToWeekdays() {
    setEditorOpen(false);
    setSelectedDate(null);
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

  function handleSaveDay() {
    if (!selectedDay) return;
    const date = selectedDay.date;
    const nextBreaks = formBreaks.map((item) => ({ ...item }));
    const netMins = formHoliday ? 0 : computeNetMins(formStart, formStop, nextBreaks);
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
      selectedDay.net_mins !== netMins ||
      breaksChanged;

    if (hasChanges) {
      playUiSound("saveConfirm");
    }

    const previousDaySnapshot: DayData = {
      ...selectedDay,
      breaks: selectedDay.breaks.map((item) => ({ ...item })),
    };

    // Optimistic save: close editor and update card immediately.
    patchDayInCurrentWeek(date, (day) => ({
      ...day,
      start_time: formStart,
      stop_time: formStop,
      net_mins: netMins,
      holiday: formHoliday,
      breaks: nextBreaks,
    }));
    returnToWeekdays();

    void postAction<{ ok: boolean }>({
      action: "save_day",
      day: {
        work_date: date,
        start_time: formStart,
        stop_time: formStop,
        holiday: formHoliday,
        net_mins: netMins,
        breaks: nextBreaks,
      },
    })
      .then(() => {
        setToast({ kind: "ok", message: "Day saved." });
      })
      .catch((error) => {
        // Roll back optimistic values if persistence failed.
        patchDayInCurrentWeek(date, () => ({
          ...previousDaySnapshot,
          breaks: previousDaySnapshot.breaks.map((item) => ({ ...item })),
        }));
        setToast({ kind: "error", message: `Save failed. ${String((error as Error).message)}` });
      });
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

  async function handleFillDay(date: string) {
    const currentDay = data?.days.find((day) => day.date === date);
    if (!currentDay) return;

    const nextBreaks: DayBreak[] = [{ name: "Break", mins: 30 }];
    const nextStart = "09:00";
    const nextStop = "17:54";
    const nextHoliday = false;
    const nextNetMins = computeNetMins(nextStart, nextStop, nextBreaks);
    const previousDaySnapshot: DayData = {
      ...currentDay,
      breaks: currentDay.breaks.map((item) => ({ ...item })),
    };

    patchDayInCurrentWeek(date, (day) => ({
      ...day,
      start_time: nextStart,
      stop_time: nextStop,
      net_mins: nextNetMins,
      holiday: nextHoliday,
      breaks: nextBreaks.map((item) => ({ ...item })),
    }));
    playUiSound("fillSwoosh");

    try {
      await postAction<{ ok: boolean }>({
        action: "save_day",
        day: {
          work_date: date,
          start_time: nextStart,
          stop_time: nextStop,
          holiday: nextHoliday,
          net_mins: nextNetMins,
          breaks: nextBreaks,
        },
      });
      setToast({ kind: "ok", message: "Day filled." });
    } catch (error) {
      patchDayInCurrentWeek(date, () => ({
        ...previousDaySnapshot,
        breaks: previousDaySnapshot.breaks.map((item) => ({ ...item })),
      }));
      setToast({ kind: "error", message: `Fill day failed. ${String((error as Error).message)}` });
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
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      const active = document.activeElement;
      restoreFocusRef.current = active instanceof HTMLElement ? active : null;
    } else {
      restoreFocusRef.current = null;
    }
    setSelectedDate(date);
    setEditorOpen(true);
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
  const computedNet = formHoliday ? 0 : computeNetMins(formStart, formStop, selectedDaySupportsBreaks ? formBreaks : []);
  const isEditorVisible = editorOpen;
  const panelDateLabel = selectedDay ? dayLabel(selectedDay.date) : "Select a day";
  const activeWeekData = data?.week_start === weekStart ? data : null;
  const hasActiveWeekData = Boolean(activeWeekData);
  const placeholderDayKeys = useMemo(() => getWeekDayKeys(weekStart), [weekStart]);
  const viewingThisWeek = weekStart === toDateKey(getMonday());

  const dayEditorProps = {
    panelDateLabel,
    selectedDay,
    selectedTravelInfo,
    travelDebug: data?.travel_debug,
    formStart,
    formStop,
    formHoliday,
    formBreaks,
    setFormStart,
    setFormStop,
    setFormHoliday,
    setFormBreaks,
    selectedDaySupportsBreaks,
    selectedDayUsesBreakCounter,
    formTotalBreakMins,
    setFormBreakCounter,
    computedNet,
    saving,
    onSaveDay: handleSaveDay,
    onResetDay: handleResetDay,
    toast,
  } satisfies Omit<DayEditorBodyProps, "layout">;

  return (
    <section
      className={`underwater-panel grid rounded-2xl transition-all duration-500 ease-out ${
        isEditorVisible
          ? "gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-start"
          : "gap-6 lg:grid-cols-1 lg:items-start"
      }`}
    >
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
      <div
        className={`glass-card hourlogger-surface min-w-0 w-full max-w-full overflow-x-hidden rounded-2xl p-4 transition-all duration-500 ease-out md:p-5 ${
          isEditorVisible ? "justify-self-stretch lg:col-start-1 lg:row-start-1 lg:z-20" : "justify-self-stretch lg:col-start-1 lg:row-start-1 lg:z-20"
        }`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/80">Time Tracker</p>
            <h2 className="text-lg font-semibold md:text-xl">Hour Logger</h2>
            <p className="mt-1 text-xs text-slate-300/85">{weekRangeLabel(weekStart)}</p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap" role="group" aria-label="Week navigation">
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
              className={`flex-1 rounded-lg border px-3 py-2 text-sm sm:flex-none ${
                viewingThisWeek
                  ? "border-cyan-300/40 bg-cyan-400/15 text-cyan-50 hover:bg-cyan-400/25"
                  : "border-white/20 bg-white/10 hover:bg-white/15"
              }`}
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

        <div className="mt-4 flex w-full min-w-0 max-w-full flex-col gap-2 sm:flex-row sm:flex-wrap">
          <span className="flex w-full min-w-0 max-w-full items-center justify-between rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs tabular-nums sm:w-auto sm:min-w-[16.5rem] sm:max-w-none">
            <span className="shrink-0">Weekly hours:</span>
            <span className="ml-2 inline-block min-w-[8ch] shrink-0 text-right">
              {hasActiveWeekData ? (
                <AnimatedNumber key={`week-hours-${weekLoadTick}`} value={activeWeekData?.week_hours_mins ?? 0} durationMs={760}>
                  {(value) => fmtHM(Math.round(value))}
                </AnimatedNumber>
              ) : (
                <span className="inline-block h-4 w-16 animate-pulse rounded bg-white/20" aria-hidden="true" />
              )}
            </span>
          </span>
          <span className="flex w-full min-w-0 max-w-full items-center justify-between rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs tabular-nums sm:w-auto sm:min-w-[16.5rem] sm:max-w-none">
            <span className="shrink-0">Overtime bank:</span>
            <span className="ml-2 inline-block min-w-[9ch] shrink-0 text-right">
              {hasActiveWeekData ? (
                <AnimatedNumber key={`overtime-bank-${weekLoadTick}`} value={activeWeekData?.overtime_bank_mins ?? 0} durationMs={760}>
                  {(value) => fmtSignedHM(Math.round(value))}
                </AnimatedNumber>
              ) : (
                <span className="inline-block h-4 w-20 animate-pulse rounded bg-white/20" aria-hidden="true" />
              )}
            </span>
          </span>
        </div>

        <div className="scroll-mt-24 mt-5 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3">
          {hasActiveWeekData &&
            (activeWeekData?.days ?? []).map((day, index) => {
              const donePct = Math.round(((day.net_mins + day.comp_mins) / TARGET_MINS) * 100);
              const isSelected = selectedDay?.date === day.date;
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
                  className={`liquid-day-card min-w-0 max-w-full overflow-hidden rounded-xl p-3 transition-all duration-300 ease-out ${
                    isSelected ? "day-card-selected" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      handleEditDay(day.date);
                    }}
                    className="w-full min-w-0 text-left"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-2 sm:gap-3">
                      <p className="min-w-0 truncate text-xs text-slate-300/80">{dayLabel(day.date)}</p>
                      <AnimatedNumber key={`day-pct-${day.date}-${weekLoadTick}`} value={donePct}>
                        {(value) => (
                          <p className="shrink-0 text-xs font-medium tabular-nums text-cyan-100/90">{Math.round(value)}%</p>
                        )}
                      </AnimatedNumber>
                    </div>
                    <AnimatedNumber key={`day-worked-${day.date}-${weekLoadTick}`} value={day.net_mins}>
                      {(value) => (
                        <p className="mt-1 text-sm font-medium">
                          {day.holiday ? "Public holiday" : `${fmtHM(Math.round(value))} worked`}
                        </p>
                      )}
                    </AnimatedNumber>
                    <div className="day-progress mt-3 max-w-full overflow-hidden" aria-label="Day progress bar">
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
                    <div className="mt-2 flex min-w-0 max-w-full flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-400/90">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="day-progress-sand h-1.5 w-1.5 shrink-0 rounded-full opacity-90" aria-hidden />
                        Core
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="day-progress-algae h-1.5 w-1.5 shrink-0 rounded-full opacity-90" aria-hidden />
                        OT worked
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="day-progress-comp h-1.5 w-1.5 shrink-0 rounded-full opacity-90" aria-hidden />
                        OT comp
                      </span>
                    </div>
                    <AnimatedNumber key={`day-core-${day.date}-${weekLoadTick}`} value={weekendRuleApplies ? 0 : workedBaseMins}>
                      {(coreValue) => (
                        <AnimatedNumber key={`day-ot-worked-${day.date}-${weekLoadTick}`} value={overtimeWorkedMins}>
                          {(overtimeValue) => (
                            <AnimatedNumber key={`day-ot-comp-${day.date}-${weekLoadTick}`} value={overtimeCompMins}>
                              {(compValue) => (
                                <div className="mt-2 min-w-0 space-y-1 border-t border-white/10 pt-2 text-[11px] text-slate-300/80">
                                  <div className="flex min-w-0 justify-between gap-2 tabular-nums">
                                    <span className="min-w-0 shrink pr-1">Target {fmtHM(TARGET_MINS)}</span>
                                    <span className="shrink-0 font-medium text-slate-200/95">{fmtHM(Math.round(coreValue))}</span>
                                  </div>
                                  {Math.round(overtimeValue) > 0 ? (
                                    <div className="flex min-w-0 justify-between gap-2 tabular-nums">
                                      <span className="min-w-0 shrink pr-1">Overtime worked</span>
                                      <span className="shrink-0 font-medium text-slate-200/95">{fmtHM(Math.round(overtimeValue))}</span>
                                    </div>
                                  ) : null}
                                  {Math.round(compValue) > 0 ? (
                                    <div className="flex min-w-0 justify-between gap-2 tabular-nums">
                                      <span className="min-w-0 shrink pr-1">Overtime compensated</span>
                                      <span className="shrink-0 font-medium text-slate-200/95">{fmtHM(Math.round(compValue))}</span>
                                    </div>
                                  ) : null}
                                </div>
                              )}
                            </AnimatedNumber>
                          )}
                        </AnimatedNumber>
                      )}
                    </AnimatedNumber>
                  </button>
                  <div className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => {
                        void handleFillMissing(day.date);
                      }}
                      className="min-h-10 min-w-0 flex-1 rounded-lg border border-white/20 bg-white/10 px-2 py-2 text-xs hover:bg-white/15 sm:min-h-0 sm:py-1.5"
                    >
                      Fill missing
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleFillDay(day.date);
                      }}
                      className="min-h-10 min-w-0 flex-1 rounded-lg border border-white/20 bg-white/10 px-2 py-2 text-xs hover:bg-white/15 sm:min-h-0 sm:py-1.5"
                    >
                      Fill Day
                    </button>
                  </div>
                </article>
              );
            })}
          {!hasActiveWeekData &&
            placeholderDayKeys.map((dateKey, index) => (
              <article key={dateKey} className="liquid-day-card min-w-0 max-w-full overflow-hidden rounded-xl p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-200">{dayLabel(dateKey)}</p>
                  <span className="inline-block h-5 w-12 animate-pulse rounded-full bg-white/10" aria-hidden="true" />
                </div>
                <p className="mt-2">
                  <span className="inline-block h-6 w-32 animate-pulse rounded bg-white/10" aria-hidden="true" />
                </p>
                <div className="day-progress mt-3.5" aria-label="Loading day progress">
                  <span
                    className="day-progress-segment day-progress-sand animate-pulse"
                    style={{ width: `${18 + (index % 5) * 9}%` }}
                    aria-hidden="true"
                  />
                </div>
                <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                  <span className="block h-3 w-full animate-pulse rounded bg-white/10" aria-hidden="true" />
                  <span className="block h-3 w-[80%] max-w-[12rem] animate-pulse rounded bg-white/10" aria-hidden="true" />
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <span className="h-9 flex-1 animate-pulse rounded-lg border border-white/20 bg-white/10" aria-hidden="true" />
                  <span className="h-9 flex-1 animate-pulse rounded-lg border border-white/20 bg-white/10" aria-hidden="true" />
                </div>
              </article>
            ))}
          </div>
        {loading && !hasActiveWeekData ? <p className="mt-3 text-sm text-slate-200/80">Loading tracker week...</p> : null}
      </div>

      {isEditorVisible && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] h-[100dvh] max-h-[100dvh] w-full max-w-[100vw] overflow-hidden lg:hidden"
              role="dialog"
              aria-modal="true"
              aria-labelledby="day-editor-sheet-title"
            >
              <button
                type="button"
                className={`absolute inset-0 z-0 cursor-default border-0 bg-gradient-to-b from-slate-950/78 via-slate-950/58 to-slate-950/42 p-0 backdrop-blur-sm transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400/35 motion-reduce:transition-none ${
                  mobileSheetEntered ? "opacity-100" : "opacity-0"
                }`}
                style={{
                  transitionDuration: `${mobileFadeMs}ms`,
                  transitionTimingFunction:
                    !mobileSheetEntered && mobileSheetExiting ? MOBILE_SHEET_EASE_OUT : MOBILE_SHEET_EASE_IN,
                }}
                aria-label="Close day editor and return to week"
                onClick={closeDayEditorSheet}
              />
              <div
                className={`absolute inset-0 z-10 flex min-h-0 min-w-0 flex-col overflow-hidden border-t border-cyan-400/25 bg-slate-950/[0.96] shadow-[0_-16px_48px_rgba(0,0,0,0.45)] backdrop-blur-md transition-opacity motion-reduce:transition-none ${
                  mobileSheetEntered ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
                }`}
                style={{
                  transitionDuration: `${mobileFadeMs}ms`,
                  transitionTimingFunction:
                    !mobileSheetEntered && mobileSheetExiting ? MOBILE_SHEET_EASE_OUT : MOBILE_SHEET_EASE_IN,
                }}
              >
                <div className="flex shrink-0 flex-col border-b border-white/[0.08] px-4 pb-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
                  <div className="flex items-start gap-3">
                    <button
                      ref={mobileSheetBackRef}
                      type="button"
                      onClick={closeDayEditorSheet}
                      className="mt-1 shrink-0 rounded-lg border border-white/15 bg-white/5 px-2.5 py-2 text-sm text-slate-200 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/45"
                      aria-label="Back to week"
                    >
                      ←
                    </button>
                    <header className="min-w-0 flex-1 pt-0.5">
                      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-200/75">Time Tracker</p>
                      <h2
                        id="day-editor-sheet-title"
                        ref={mobileSheetTitleRef}
                        tabIndex={-1}
                        className="mt-1 text-lg font-semibold tracking-tight text-slate-50 outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 rounded-sm"
                      >
                        Day Logger
                      </h2>
                      <p className="mt-1 text-sm text-slate-400">{panelDateLabel}</p>
                    </header>
                  </div>
                </div>
                <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain bg-slate-950/50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
                  <DayEditorBody {...dayEditorProps} layout="sheet" />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      <div
        className={`scroll-mt-24 h-fit min-w-0 max-w-full self-start overflow-x-hidden rounded-2xl glass-card p-4 transition-all duration-500 ease-out md:p-5 lg:col-start-2 lg:row-start-1 lg:z-10 ${
          isEditorVisible ? "hidden opacity-100 lg:block lg:translate-x-0" : "hidden pointer-events-none"
        } ${isEditorVisible ? "lg:pointer-events-auto" : ""}`}
      >
        <DayEditorBody {...dayEditorProps} layout="panel" />
      </div>
    </section>
  );
}

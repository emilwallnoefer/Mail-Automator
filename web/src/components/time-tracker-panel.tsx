"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

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
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [data, setData] = useState<WeekResponse | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const weekCacheRef = useRef<Map<string, WeekResponse>>(new Map());
  const weekInflightRef = useRef<Map<string, Promise<WeekResponse>>>(new Map());

  const selectedDay = useMemo(() => {
    if (!data?.days?.length) return null;
    if (!selectedDate) return data.days[0];
    return data.days.find((day) => day.date === selectedDate) ?? data.days[0];
  }, [data, selectedDate]);

  const [formStart, setFormStart] = useState("");
  const [formStop, setFormStop] = useState("");
  const [formHoliday, setFormHoliday] = useState(false);
  const [formBreaks, setFormBreaks] = useState<DayBreak[]>([]);

  const applyWeekData = useCallback((weekData: WeekResponse) => {
    setData(weekData);
    const days = weekData.days ?? [];
    setSelectedDate((prev) => {
      if (prev && days.some((day) => day.date === prev)) return prev;
      return days[0]?.date ?? null;
    });
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
          prefetchNearbyWeeks(weekStart);
          return;
        }
        setLoading(true);
        const weekData = await fetchWeekData(weekStart);
        if (!active) return;
        applyWeekData(weekData);
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

  async function refreshWeek() {
    const weekData = await fetchWeekData(weekStart, { force: true });
    applyWeekData(weekData);
    prefetchNearbyWeeks(weekStart);
  }

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
      await refreshWeek();
      setToast({ kind: "ok", message: "Day saved." });
    } catch (error) {
      setToast({ kind: "error", message: (error as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function handleFillMissing(date: string) {
    try {
      await postAction<{ ok: boolean; comp_mins: number }>({ action: "fill_missing", work_date: date });
      await refreshWeek();
      setToast({ kind: "ok", message: "Missing time updated." });
    } catch (error) {
      setToast({ kind: "error", message: (error as Error).message });
    }
  }

  async function handleResetDay() {
    if (!selectedDay) return;
    setSaving(true);
    try {
      await postAction<{ ok: boolean }>({ action: "reset_day", work_date: selectedDay.date });
      await refreshWeek();
      setToast({ kind: "ok", message: "Day reset." });
    } catch (error) {
      setToast({ kind: "error", message: (error as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const payload = await postAction<{
        ok: boolean;
        imported_day_logs: number;
        imported_break_rows: number;
        imported_comp_rows: number;
      }>({ action: "import_json", data: parsed });
      await refreshWeek();
      setToast({
        kind: "ok",
        message: `Import done (${String(payload.imported_day_logs ?? 0)} days).`,
      });
    } catch (error) {
      setToast({ kind: "error", message: (error as Error).message });
    } finally {
      setImporting(false);
    }
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
      <div className="glass-card p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/80">Time Tracker</p>
            <h2 className="text-lg font-semibold md:text-xl">Hour Logger</h2>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                const prev = addDays(fromDateKey(weekStart), -7);
                setWeekStart(toDateKey(prev));
              }}
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
            >
              Prev week
            </button>
            <button
              type="button"
              onClick={() => setWeekStart(toDateKey(getMonday()))}
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                const next = addDays(fromDateKey(weekStart), 7);
                setWeekStart(toDateKey(next));
              }}
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
            >
              Next week
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">
            Weekly hours: {fmtHM(data?.week_hours_mins ?? 0)}
          </span>
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">
            Overtime bank: {fmtSignedHM(data?.overtime_bank_mins ?? 0)}
          </span>
        </div>

        {loading ? (
          <p className="mt-5 text-sm text-slate-200/80">Loading tracker week...</p>
        ) : (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(data?.days ?? []).map((day) => {
              const donePct = Math.round(Math.min(1, (day.net_mins + day.comp_mins) / TARGET_MINS) * 100);
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
              return (
                <article
                  key={day.date}
                  className={`rounded-xl border p-3 transition ${
                    isSelected ? "border-cyan-300/60 bg-cyan-500/10" : "border-white/15 bg-white/5"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedDate(day.date)}
                    className="w-full text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs text-slate-300/80">{dayLabel(day.date)}</p>
                      <p className="text-xs font-medium text-cyan-100/90">{donePct}%</p>
                    </div>
                    <p className="mt-1 text-sm font-medium">
                      {day.holiday ? "Public holiday" : `${fmtHM(day.net_mins)} worked`}
                    </p>
                    <div className="day-progress mt-3" aria-label="Day progress bar">
                      <span className="day-progress-segment day-progress-sand" style={{ width: `${sandPct}%` }} />
                      <span className="day-progress-segment day-progress-algae" style={{ width: `${algaePct}%` }} />
                      <span className="day-progress-segment day-progress-comp" style={{ width: `${compPct}%` }} />
                    </div>
                    <p className="mt-2 text-[11px] text-slate-300/80">
                      Core hours {fmtHM(weekendRuleApplies ? 0 : workedBaseMins)}
                      {overtimeWorkedMins > 0 ? ` · Overtime worked ${fmtHM(overtimeWorkedMins)}` : ""}
                      {overtimeCompMins > 0 ? ` · Overtime compensated ${fmtHM(overtimeCompMins)}` : ""}
                    </p>
                  </button>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleFillMissing(day.date)}
                      className="flex-1 rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-xs hover:bg-white/15"
                    >
                      Fill missing
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDate(day.date)}
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

      <div className="glass-card p-5 md:p-6">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold">Day Logger</h3>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs hover:bg-white/15 disabled:opacity-60"
          >
            {importing ? "Importing..." : "Upload time tracking data"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleImportFile(file);
              event.currentTarget.value = "";
            }}
          />
        </div>

        {!selectedDay ? (
          <p className="mt-4 text-sm text-slate-200/80">Select a day to edit.</p>
        ) : (
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
                  <div key={`${index}-${item.name}`} className="grid grid-cols-[1fr_90px_auto] gap-2">
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
                      className="rounded-lg border border-rose-300/40 bg-rose-500/10 px-2 py-1.5 text-xs text-rose-200"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>

            <p className="text-xs text-slate-300/80">Computed total: {fmtHM(computedNet)}</p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveDay}
                disabled={saving}
                className="flex-1 rounded-lg bg-cyan-400/90 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-cyan-300 disabled:opacity-70"
              >
                {saving ? "Saving..." : "Save day"}
              </button>
              <button
                type="button"
                onClick={handleResetDay}
                disabled={saving}
                className="flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm hover:bg-white/15 disabled:opacity-70"
              >
                Reset day
              </button>
            </div>
          </div>
        )}

        {toast && (
          <p className={`mt-4 text-sm ${toast.kind === "ok" ? "text-emerald-300" : "text-rose-300"}`}>{toast.message}</p>
        )}
      </div>
    </section>
  );
}

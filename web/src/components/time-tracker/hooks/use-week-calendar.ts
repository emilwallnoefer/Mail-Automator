"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildMonthWeeks, fromDateKey, getMonday, toDateKey } from "../types";

/**
 * Week-picker calendar concern: open/closed state, the year↔month view toggle,
 * the month grid, and the Escape-to-dismiss handler. Opening always resets to
 * the year view synced to the active week's year.
 */
export function useWeekCalendar(weekStart: string) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarView, setCalendarView] = useState<"year" | "month">("year");
  const [calendarYear, setCalendarYear] = useState<number>(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState<string>(() => toDateKey(getMonday()));
  const calendarRef = useRef<HTMLDivElement | null>(null);
  // "Today" is read once per mount: stable across renders, and a session
  // spanning midnight would be re-rendered by a week change anyway.
  const [calendarTodayKey] = useState(() => toDateKey(new Date()));

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

  const calendarMonthWeeks = useMemo(() => buildMonthWeeks(calendarMonth), [calendarMonth]);

  return {
    calendarOpen,
    setCalendarOpen,
    calendarView,
    setCalendarView,
    calendarYear,
    setCalendarYear,
    calendarMonth,
    setCalendarMonth,
    calendarRef,
    calendarTodayKey,
    calendarMonthWeeks,
  };
}

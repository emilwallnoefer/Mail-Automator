"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DayBreak, WeekResponse } from "../types";

type DayFormParams = {
  editorOpen: boolean;
  selectedDate: string | null;
  data: WeekResponse | null;
  /** Monday of the current week — days from here on use the break counter. */
  currentWeekStartKey: string;
};

/**
 * Day editor form concern: the editable fields and the seeding rule that fills
 * them when a day is freshly opened. Seeding keys on the date string (not the
 * day object) so background week refreshes can't clobber in-progress edits.
 */
export function useDayForm({ editorOpen, selectedDate, data, currentWeekStartKey }: DayFormParams) {
  const [formStart, setFormStart] = useState("");
  const [formStop, setFormStop] = useState("");
  const [formHoliday, setFormHoliday] = useState(false);
  const [formPublicHoliday, setFormPublicHoliday] = useState(false);
  const [formSickLeave, setFormSickLeave] = useState(false);
  const [formBreaks, setFormBreaks] = useState<DayBreak[]>([]);
  // Tracks which day the form has already been seeded for.
  const seededFormDateRef = useRef<string | null>(null);

  // Deliberately an effect rather than React's "adjust state during render"
  // pattern: the trigger isn't a prop change but week details *arriving*
  // asynchronously (the day may be missing on the first pass and seed only once
  // it loads), and the ref guard exists to protect edits the user has already
  // typed. Seeding during render here would risk clobbering those.
  useEffect(() => {
    if (!editorOpen || !selectedDate) {
      seededFormDateRef.current = null;
      return;
    }
    if (seededFormDateRef.current === selectedDate) return;
    const day = data?.days.find((item) => item.date === selectedDate);
    if (!day) return; // details may still be loading; seed once they arrive.
    seededFormDateRef.current = selectedDate;
    /* eslint-disable react-hooks/set-state-in-effect -- see note above the effect */
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
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [editorOpen, selectedDate, data, currentWeekStartKey]);

  const formTotalBreakMins = useMemo(
    () => formBreaks.reduce((sum, item) => sum + Math.max(0, item.mins || 0), 0),
    [formBreaks],
  );

  function setFormBreakCounter(totalMins: number) {
    const safeTotal = Math.max(0, totalMins);
    setFormBreaks(safeTotal > 0 ? [{ name: "Break", mins: safeTotal }] : []);
  }

  return {
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
    formTotalBreakMins,
    setFormBreakCounter,
  };
}

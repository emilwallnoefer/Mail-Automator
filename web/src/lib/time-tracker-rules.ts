/** Weekly target for “core” hours before overtime on weekdays (8h24m). */
export const TIME_TRACKER_TARGET_MINS = 504;
export const WEEKEND_OVERTIME_CUTOFF_DATE = "2026-04-01";

export function isWeekendDate(dateKey: string): boolean {
  const [y, m, d] = dateKey.split("-").map((x) => Number.parseInt(x, 10));
  const date = new Date(y, (m || 1) - 1, d || 1);
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** Monday = 0 … Sunday = 6 (ISO week order used by the tracker). */
export function getMondayBasedWeekdayIndex(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map((x) => Number.parseInt(x, 10));
  const date = new Date(y, (m || 1) - 1, d || 1);
  return (date.getDay() + 6) % 7;
}

export function isSaturdayDate(dateKey: string): boolean {
  return getMondayBasedWeekdayIndex(dateKey) === 5;
}

export function isSundayDate(dateKey: string): boolean {
  return getMondayBasedWeekdayIndex(dateKey) === 6;
}

/**
 * Sat/Sun only count as premium overtime from the weekend-aware tracker rollout onward.
 * Older weekend logs keep the legacy "worked minus target" behavior. Public holidays with
 * logged work still count fully as overtime regardless of date.
 */
export function isPremiumOvertimeDay(
  dateKey: string,
  netMins: number,
  holiday: boolean,
): boolean {
  const weekendRule = isWeekendDate(dateKey) && netMins > 0 && dateKey >= WEEKEND_OVERTIME_CUTOFF_DATE;
  const holidayWithWork = holiday && netMins > 0;
  return weekendRule || holidayWithWork;
}

export function getDayOvertimeContributionMins(
  date: string,
  netMins: number,
  holiday: boolean,
  compMins: number,
): number {
  if (holiday && netMins === 0) return 0;
  const premium = isPremiumOvertimeDay(date, netMins, holiday);
  const overtime = premium ? Math.max(0, netMins) : Math.max(0, netMins - TIME_TRACKER_TARGET_MINS);
  return overtime - compMins;
}

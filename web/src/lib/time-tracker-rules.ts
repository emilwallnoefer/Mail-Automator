/** Weekly target for “core” hours before overtime on weekdays (8h24m). */
export const TIME_TRACKER_TARGET_MINS = 504;

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
 * All logged minutes count as overtime (weekend-style) on future Sat/Sun, or on a public-holiday
 * day when there is actual logged work. Pure public-holiday days off (0 net) contribute nothing.
 */
export function isPremiumOvertimeDay(
  dateKey: string,
  netMins: number,
  holiday: boolean,
  todayKey: string,
): boolean {
  const weekendRule = isWeekendDate(dateKey) && dateKey >= todayKey;
  const holidayWithWork = holiday && netMins > 0;
  return weekendRule || holidayWithWork;
}

export function getDayOvertimeContributionMins(
  date: string,
  netMins: number,
  holiday: boolean,
  compMins: number,
  todayKey: string,
): number {
  if (holiday && netMins === 0) return 0;
  const premium = isPremiumOvertimeDay(date, netMins, holiday, todayKey);
  const overtime = premium ? Math.max(0, netMins) : Math.max(0, netMins - TIME_TRACKER_TARGET_MINS);
  return overtime - compMins;
}

import { describe, expect, it } from "vitest";
import {
  TIME_TRACKER_TARGET_MINS,
  getDayOvertimeContributionMins,
  getMondayBasedWeekdayIndex,
  isPremiumOvertimeDay,
  isSaturdayDate,
  isSundayDate,
  isWeekendDate,
} from "./time-tracker-rules";

// 2026-07-13 is a Monday; 2026-07-18/19 are Sat/Sun.

describe("weekday helpers", () => {
  it("detects weekends", () => {
    expect(isWeekendDate("2026-07-18")).toBe(true);
    expect(isWeekendDate("2026-07-19")).toBe(true);
    expect(isWeekendDate("2026-07-17")).toBe(false);
  });

  it("uses Monday-based indices", () => {
    expect(getMondayBasedWeekdayIndex("2026-07-13")).toBe(0);
    expect(getMondayBasedWeekdayIndex("2026-07-17")).toBe(4);
    expect(getMondayBasedWeekdayIndex("2026-07-19")).toBe(6);
  });

  it("distinguishes Saturday from Sunday", () => {
    expect(isSaturdayDate("2026-07-18")).toBe(true);
    expect(isSundayDate("2026-07-18")).toBe(false);
    expect(isSundayDate("2026-07-19")).toBe(true);
  });
});

describe("isPremiumOvertimeDay", () => {
  it("counts weekend work only from the 2026-04-01 rollout", () => {
    expect(isPremiumOvertimeDay("2026-07-18", 60, false)).toBe(true);
    // 2026-03-28 is a Saturday before the cutoff → legacy behavior.
    expect(isPremiumOvertimeDay("2026-03-28", 60, false)).toBe(false);
  });

  it("requires logged work", () => {
    expect(isPremiumOvertimeDay("2026-07-18", 0, false)).toBe(false);
  });

  it("treats worked holidays as premium regardless of date", () => {
    expect(isPremiumOvertimeDay("2026-03-25", 30, true)).toBe(true);
    expect(isPremiumOvertimeDay("2026-03-25", 0, true)).toBe(false);
  });
});

describe("getDayOvertimeContributionMins", () => {
  it("never earns overtime on sick leave", () => {
    expect(getDayOvertimeContributionMins("2026-07-17", 600, false, 0, true)).toBe(0);
    expect(getDayOvertimeContributionMins("2026-07-18", 600, false, 0, true)).toBe(0);
  });

  it("contributes nothing on an unworked holiday", () => {
    expect(getDayOvertimeContributionMins("2026-07-17", 0, true, 0)).toBe(0);
  });

  it("counts weekday overtime above the target", () => {
    expect(getDayOvertimeContributionMins("2026-07-17", TIME_TRACKER_TARGET_MINS + 60, false, 0)).toBe(60);
    expect(getDayOvertimeContributionMins("2026-07-17", TIME_TRACKER_TARGET_MINS - 30, false, 0)).toBe(0);
  });

  it("counts every premium-day minute as overtime", () => {
    expect(getDayOvertimeContributionMins("2026-07-18", 120, false, 0)).toBe(120);
  });

  it("subtracts compensation minutes", () => {
    expect(getDayOvertimeContributionMins("2026-07-17", TIME_TRACKER_TARGET_MINS, false, 90)).toBe(-90);
  });
});

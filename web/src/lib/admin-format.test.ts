import { afterEach, describe, expect, it, vi } from "vitest";
import { fmtAbsolute, fmtPct, fmtRelative } from "./admin-format";

const NOW = new Date("2026-09-15T12:00:00Z");

function at(offsetMs: number): string {
  return new Date(NOW.getTime() - offsetMs).toISOString();
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

afterEach(() => vi.useRealTimers());

describe("fmtRelative", () => {
  function freeze() {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  }

  it("says 'never' for a missing or unparseable timestamp", () => {
    expect(fmtRelative(null)).toBe("never");
    expect(fmtRelative("")).toBe("never");
    expect(fmtRelative("not a date")).toBe("never");
  });

  it("collapses anything under a minute to 'just now', in both directions", () => {
    freeze();
    expect(fmtRelative(at(0))).toBe("just now");
    expect(fmtRelative(at(59_000))).toBe("just now");
    expect(fmtRelative(at(-59_000))).toBe("just now");
  });

  it("steps up through minutes, hours and days", () => {
    freeze();
    expect(fmtRelative(at(MIN))).toBe("1m ago");
    expect(fmtRelative(at(59 * MIN))).toBe("59m ago");
    expect(fmtRelative(at(HOUR))).toBe("1h ago");
    expect(fmtRelative(at(23 * HOUR))).toBe("23h ago");
    expect(fmtRelative(at(DAY))).toBe("1d ago");
    expect(fmtRelative(at(29 * DAY))).toBe("29d ago");
  });

  it("truncates rather than rounds", () => {
    freeze();
    expect(fmtRelative(at(119_000))).toBe("1m ago");
    expect(fmtRelative(at(2 * DAY - 1))).toBe("1d ago");
  });

  it("says 'from now' for a future timestamp", () => {
    freeze();
    expect(fmtRelative(at(-5 * MIN))).toBe("5m from now");
    expect(fmtRelative(at(-3 * HOUR))).toBe("3h from now");
    expect(fmtRelative(at(-2 * DAY))).toBe("2d from now");
  });

  it("falls back to an absolute date beyond 30 days, in either direction", () => {
    freeze();
    const long = 40 * DAY;
    expect(fmtRelative(at(long))).toBe(new Date(at(long)).toLocaleDateString());
    expect(fmtRelative(at(-long))).toBe(new Date(at(-long)).toLocaleDateString());
    expect(fmtRelative(at(long))).not.toContain("ago");
  });
});

describe("fmtAbsolute", () => {
  it("renders an em dash for a missing timestamp", () => {
    expect(fmtAbsolute(null)).toBe("—");
    expect(fmtAbsolute("")).toBe("—");
  });

  it("formats a real timestamp in the local locale", () => {
    const iso = "2026-09-15T12:00:00Z";
    expect(fmtAbsolute(iso)).toBe(new Date(iso).toLocaleString());
  });

  it("returns the raw value when it is not a date, never 'Invalid Date'", () => {
    // `toLocaleString()` returns "Invalid Date" instead of throwing, so the
    // fallback has to be guarded explicitly.
    expect(fmtAbsolute("whenever")).toBe("whenever");
    expect(fmtAbsolute("2026-13-45T99:00:00Z")).toBe("2026-13-45T99:00:00Z");
  });
});

describe("fmtPct", () => {
  it("shows one decimal below 10% and none at or above", () => {
    expect(fmtPct(0.054)).toBe("5.4%");
    expect(fmtPct(0.0999)).toBe("10.0%"); // 9.99 rounds up into the whole-number band
    expect(fmtPct(0.1)).toBe("10%");
    expect(fmtPct(0.5)).toBe("50%");
    expect(fmtPct(1)).toBe("100%");
  });

  it("rounds rather than truncates", () => {
    expect(fmtPct(0.12345)).toBe("12%");
    expect(fmtPct(0.12945)).toBe("13%");
    expect(fmtPct(0.01449)).toBe("1.4%");
  });

  it("treats zero, negatives and non-finite values as 0%", () => {
    expect(fmtPct(0)).toBe("0%");
    expect(fmtPct(-0.5)).toBe("0%");
    expect(fmtPct(Number.NaN)).toBe("0%");
    expect(fmtPct(Number.POSITIVE_INFINITY)).toBe("0%");
  });

  it("does not cap above 100%", () => {
    expect(fmtPct(2.5)).toBe("250%");
  });
});

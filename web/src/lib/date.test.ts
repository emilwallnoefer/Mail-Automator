import { describe, expect, it } from "vitest";
import { addDays, fromDateKey, getMonday, toDateKey } from "./date";

describe("date keys", () => {
  it("round-trips and zero-pads", () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toDateKey(fromDateKey("2026-07-19"))).toBe("2026-07-19");
  });
});

describe("getMonday", () => {
  it("snaps any weekday to the ISO week's Monday", () => {
    expect(toDateKey(getMonday("2026-07-19"))).toBe("2026-07-13"); // Sunday
    expect(toDateKey(getMonday("2026-07-15"))).toBe("2026-07-13"); // Wednesday
    expect(toDateKey(getMonday("2026-07-13"))).toBe("2026-07-13"); // Monday stays
  });
});

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(toDateKey(addDays(fromDateKey("2026-01-31"), 1))).toBe("2026-02-01");
    expect(toDateKey(addDays(fromDateKey("2026-12-31"), 1))).toBe("2027-01-01");
    expect(toDateKey(addDays(fromDateKey("2026-03-01"), -1))).toBe("2026-02-28");
  });

  it("does not mutate its input", () => {
    const base = fromDateKey("2026-07-13");
    addDays(base, 7);
    expect(toDateKey(base)).toBe("2026-07-13");
  });
});

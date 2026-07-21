import { describe, expect, it } from "vitest";
import { isDateKey, normalizeColumnLetter, parseUserTravelMapping } from "./shared";

describe("isDateKey", () => {
  it("accepts YYYY-MM-DD and rejects anything else", () => {
    expect(isDateKey("2026-07-19")).toBe(true);
    expect(isDateKey("2026-7-9")).toBe(false);
    expect(isDateKey("not-a-date")).toBe(false);
    expect(isDateKey("")).toBe(false);
  });
});

describe("normalizeColumnLetter", () => {
  it("upper-cases and trims valid column letters", () => {
    expect(normalizeColumnLetter(" ab ")).toBe("AB");
    expect(normalizeColumnLetter("Z")).toBe("Z");
  });

  it("returns undefined for empty or non-letter input", () => {
    expect(normalizeColumnLetter("")).toBeUndefined();
    expect(normalizeColumnLetter("A1")).toBeUndefined();
    expect(normalizeColumnLetter(null)).toBeUndefined();
    expect(normalizeColumnLetter(undefined)).toBeUndefined();
  });
});

describe("parseUserTravelMapping", () => {
  it("returns the mapping only when all three columns are present and valid", () => {
    expect(
      parseUserTravelMapping({
        travel_sheet_mapping: { clientColumn: "d", locationColumn: "E", responsibleColumn: "f" },
      }),
    ).toEqual({ clientColumn: "D", locationColumn: "E", responsibleColumn: "F" });
  });

  it("returns undefined when a column is missing or the shape is wrong", () => {
    expect(
      parseUserTravelMapping({ travel_sheet_mapping: { clientColumn: "D", locationColumn: "E" } }),
    ).toBeUndefined();
    expect(parseUserTravelMapping({ travel_sheet_mapping: null })).toBeUndefined();
    expect(parseUserTravelMapping(null)).toBeUndefined();
    expect(parseUserTravelMapping([])).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { MAX_WINDOW_DAYS, MIN_WINDOW_DAYS, parseBoardWindow } from "./window";

const DEFAULT_DAYS = 28;
const parse = (query: string) =>
  parseBoardWindow(new Request(`https://example.test/api/fleet${query}`), DEFAULT_DAYS);

describe("parsing the calendar window off a request", () => {
  it("defaults to no explicit start and the default width", () => {
    expect(parse("")).toEqual({ windowStart: undefined, windowDays: DEFAULT_DAYS });
  });

  it("takes a well-formed start date", () => {
    expect(parse("?start=2026-09-14")).toEqual({
      windowStart: "2026-09-14",
      windowDays: DEFAULT_DAYS,
    });
  });

  it("normalises an impossible date rather than passing it through", () => {
    // 31 February rolls forward; what must never happen is it reaching the
    // query as-is.
    expect(parse("?start=2026-02-31")?.windowStart).toBe("2026-03-03");
  });

  it("rejects a malformed start date", () => {
    // null is the caller's signal: a 400 on the read path, the default window
    // on the write path.
    expect(parse("?start=not-a-date")).toBeNull();
    expect(parse("?start=2026-9-1")).toBeNull();
    expect(parse("?start=14-09-2026")).toBeNull();
  });

  it("clamps the width to something the grid can actually render", () => {
    expect(parse("?days=1")?.windowDays).toBe(MIN_WINDOW_DAYS);
    expect(parse("?days=9999")?.windowDays).toBe(MAX_WINDOW_DAYS);
    expect(parse("?days=30")?.windowDays).toBe(30);
    expect(parse("?days=30.9")?.windowDays).toBe(30);
  });

  it("falls back to the default for a non-numeric width", () => {
    expect(parse("?days=abc")?.windowDays).toBe(DEFAULT_DAYS);
  });

  it("does not let a bad width reject the request", () => {
    // Only the DATE can return null. A nonsense `days` still yields a usable
    // window, so a stray query string cannot fail a booking.
    expect(parse("?days=abc")).not.toBeNull();
    expect(parse("?start=2026-09-14&days=-5")).toEqual({
      windowStart: "2026-09-14",
      windowDays: MIN_WINDOW_DAYS,
    });
  });
});

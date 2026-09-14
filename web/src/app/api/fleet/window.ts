import { parseDateKey, toDateKey } from "@/lib/fleet-rules";

/**
 * The calendar window a request is asking about.
 *
 * Kept out of `route.ts` so it can be unit-tested: `route.ts` reaches the
 * service-role client, which is `"server-only"` and cannot be imported from a
 * test. Same split as `api/time-tracker/handlers/shared.ts`.
 */
export type BoardWindow = { windowStart?: string; windowDays: number };

/** Widest window the calendar will render: one column per day, capped at a quarter. */
export const MAX_WINDOW_DAYS = 92;
/** Narrowest window worth drawing. */
export const MIN_WINDOW_DAYS = 7;

/**
 * Reads `?start=&days=` off a request.
 *
 * Returns null for a malformed start date. The read path turns that into a 400;
 * the write path ignores it and falls back to the default window, because a bad
 * query string must never cost somebody their booking — the write has already
 * been validated by then, and the window only decides which days come back.
 */
export function parseBoardWindow(request: Request, defaultDays: number): BoardWindow | null {
  const url = new URL(request.url);
  const rawStart = url.searchParams.get("start");
  const rawDays = Number(url.searchParams.get("days") ?? defaultDays);

  let windowStart: string | undefined;
  if (rawStart) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawStart)) return null;
    // Round-trip through the parser so an impossible date (2026-02-31) is
    // normalised rather than reaching the query as-is.
    windowStart = toDateKey(parseDateKey(rawStart));
  }

  const windowDays = Number.isFinite(rawDays)
    ? Math.min(MAX_WINDOW_DAYS, Math.max(MIN_WINDOW_DAYS, Math.trunc(rawDays)))
    : defaultDays;

  return { windowStart, windowDays };
}

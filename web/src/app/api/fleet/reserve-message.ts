import type { ConflictCheck } from "@/lib/fleet-rules";

/** A `checkReservation` result that refused the span. */
export type ReserveRefusal = Exclude<ConflictCheck, { ok: true }>;

/**
 * Turns a refused booking into the sentence the person sees.
 *
 * Pure, and kept next to `window.ts` rather than inside the handler so it can be
 * unit-tested: these strings are the only explanation anybody gets for why they
 * could not book, and the horizon one has to name their actual score.
 */
export function reserveErrorMessage(
  check: ReserveRefusal,
  reliability: { score: number; horizonDays: number },
  assetName: string,
): string {
  switch (check.reason) {
    case "inverted":
      return "The last day cannot be before the first.";
    case "past":
      return "That day is already past.";
    case "too_long":
      return `A single booking can run at most ${check.maxDays} days. Split it, or ask an admin.`;
    case "beyond_horizon":
      return `Your reliability score (${reliability.score}) lets you book up to ${check.horizonDays} days ahead. Return material on time to book further out.`;
    case "overlap":
      return `${assetName} is already booked on those days. You can join the waitlist instead.`;
  }
}

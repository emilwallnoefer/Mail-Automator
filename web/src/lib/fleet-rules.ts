/**
 * Fleet module — pure business rules.
 *
 * Everything in here is deliberately free of Supabase, Next, and `Date.now()`
 * (callers pass `today`), so the reservation calendar, the reliability score and
 * the reminder cron all agree on one implementation and can be unit-tested.
 *
 * The three ideas the module is built around:
 *
 *  1. **Weeks, not days.** Material goes out for a mission and comes back; the
 *     old spreadsheet tried to track that per-day and nobody kept it current.
 *     A reservation is a run of ISO weeks, so booking is one or two clicks.
 *  2. **Every asset has one current location**, and every movement writes an
 *     event. "Where is it" is answered by the asset row; "how did it get there"
 *     by its event history.
 *  3. **Reliability score.** Bringing material back on time earns trust; not
 *     bringing it back costs it. The score sets how far ahead you may book and
 *     where you land in the queue for a contested week — so the person who
 *     never returns anything is last in line, automatically.
 */

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/* -------------------------------------------------------------------------- */
/* Week math                                                                   */
/* -------------------------------------------------------------------------- */

/** `YYYY-MM-DD` for the Monday of the ISO week containing `date` (UTC-safe). */
export function mondayOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // getUTCDay(): 0=Sun..6=Sat -> shift so Monday is 0.
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return toDateKey(d);
}

export function toDateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parses `YYYY-MM-DD` as a UTC midnight date. Throws on malformed input. */
export function parseDateKey(key: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new Error(`Invalid date key: ${key}`);
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date key: ${key}`);
  return date;
}

export function addWeeks(weekStart: string, weeks: number): string {
  const d = parseDateKey(weekStart);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return toDateKey(d);
}

export function addDays(dateKey: string, days: number): string {
  const d = parseDateKey(dateKey);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateKey(d);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDateKey(to).getTime() - parseDateKey(from).getTime()) / (24 * 60 * 60 * 1000));
}

export function weeksBetween(from: string, to: string): number {
  return Math.round((parseDateKey(to).getTime() - parseDateKey(from).getTime()) / WEEK_MS);
}

/** The `count` Monday keys starting at `startWeek`. */
export function weekRange(startWeek: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addWeeks(startWeek, i));
}

/** ISO week number + ISO year, for the calendar header ("KW 36"). */
export function isoWeekNumber(weekStart: string): { week: number; year: number } {
  const d = parseDateKey(weekStart);
  // Thursday of this week decides the ISO year.
  const thursday = new Date(d.getTime());
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / WEEK_MS);
  return { week, year };
}

/**
 * Fixed short-month names. Deliberately not `Intl.DateTimeFormat`: ICU renders
 * September as "Sept" in some locales/runtime versions and "Sep" in others, so
 * the calendar header would shift width between the server and the browser.
 */
const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** "31 Aug – 6 Sep" — the month is dropped from the start when the week sits in one month. */
export function formatWeekLabel(weekStart: string): string {
  const start = parseDateKey(weekStart);
  const end = parseDateKey(addDays(weekStart, 6));
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const startLabel = sameMonth
    ? `${start.getUTCDate()}`
    : `${start.getUTCDate()} ${SHORT_MONTHS[start.getUTCMonth()]}`;
  return `${startLabel} – ${end.getUTCDate()} ${SHORT_MONTHS[end.getUTCMonth()]}`;
}

/* -------------------------------------------------------------------------- */
/* Reservations                                                                */
/* -------------------------------------------------------------------------- */

export type ReservationStatus =
  | "reserved"
  | "waitlisted"
  | "picked_up"
  | "returned"
  | "cancelled";

export type ReservationSpan = {
  id: string;
  asset_id: string;
  user_id: string;
  /** Monday of the first booked week. */
  start_week: string;
  /** Monday of the last booked week (inclusive), so a 1-week booking has start === end. */
  end_week: string;
  status: ReservationStatus;
  /** `YYYY-MM-DD` the material actually came back, set on check-in. */
  returned_on?: string | null;
};

/** Half-open comparison on inclusive week spans. */
export function spansOverlap(a: ReservationSpan, b: ReservationSpan): boolean {
  return a.start_week <= b.end_week && b.start_week <= a.end_week;
}

/** A span is "holding" the asset when it is booked or physically out. */
export function isBlocking(status: ReservationStatus): boolean {
  return status === "reserved" || status === "picked_up";
}

/**
 * The last day the material is due back: the Sunday of the final booked week.
 * Everything overdue-related keys off this one definition.
 */
export function dueDateOf(span: Pick<ReservationSpan, "end_week">): string {
  return addDays(span.end_week, 6);
}

/**
 * Days overdue as of `today`. 0 while still within the booked span, and 0 once
 * the material is back — a late return is history, not a live debt.
 */
export function daysOverdue(span: ReservationSpan, today: string): number {
  if (span.status === "returned" || span.status === "cancelled") return 0;
  return Math.max(0, daysBetween(dueDateOf(span), today));
}

/** How late a completed return was; 0 when it landed on or before the due date. */
export function lateDays(span: ReservationSpan): number {
  if (span.status !== "returned" || !span.returned_on) return 0;
  return Math.max(0, daysBetween(dueDateOf(span), span.returned_on));
}

export type ConflictCheck =
  | { ok: true }
  | { ok: false; reason: "overlap"; conflicting: ReservationSpan[] }
  | { ok: false; reason: "inverted" }
  | { ok: false; reason: "past" }
  | { ok: false; reason: "too_long"; maxWeeks: number }
  | { ok: false; reason: "beyond_horizon"; horizonWeeks: number };

export const MAX_RESERVATION_WEEKS = 12;

/**
 * Validates a requested span against the asset's existing bookings and the
 * requester's booking horizon. `existing` should already be scoped to the asset.
 */
export function checkReservation(args: {
  startWeek: string;
  endWeek: string;
  today: string;
  horizonWeeks: number;
  existing: ReservationSpan[];
  /** Ignore this reservation when re-checking an edit of an existing booking. */
  ignoreId?: string;
}): ConflictCheck {
  const { startWeek, endWeek, today, horizonWeeks, existing, ignoreId } = args;
  if (endWeek < startWeek) return { ok: false, reason: "inverted" };

  const currentWeek = mondayOf(parseDateKey(today));
  if (startWeek < currentWeek) return { ok: false, reason: "past" };

  const length = weeksBetween(startWeek, endWeek) + 1;
  if (length > MAX_RESERVATION_WEEKS) {
    return { ok: false, reason: "too_long", maxWeeks: MAX_RESERVATION_WEEKS };
  }

  if (weeksBetween(currentWeek, startWeek) > horizonWeeks) {
    return { ok: false, reason: "beyond_horizon", horizonWeeks };
  }

  const candidate: ReservationSpan = {
    id: "candidate",
    asset_id: "",
    user_id: "",
    start_week: startWeek,
    end_week: endWeek,
    status: "reserved",
  };
  const conflicting = existing.filter(
    (span) => span.id !== ignoreId && isBlocking(span.status) && spansOverlap(span, candidate),
  );
  if (conflicting.length > 0) return { ok: false, reason: "overlap", conflicting };

  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Reliability score                                                           */
/* -------------------------------------------------------------------------- */

export type ReliabilityTier = "trusted" | "standard" | "watch" | "restricted";

export type ReliabilityScore = {
  score: number;
  tier: ReliabilityTier;
  /** Weeks ahead this person may book. */
  horizonWeeks: number;
  /** How many completed reservations fed the score. */
  completed: number;
  onTime: number;
  late: number;
  /** Currently past due and still out. */
  overdue: number;
  /** Human-readable one-liner for the UI badge. */
  summary: string;
};

/**
 * No history yet: start provisional rather than perfect, so a brand-new account
 * cannot outrank a colleague with a long clean record, and so the score has
 * somewhere to go up.
 */
export const PROVISIONAL_SCORE = 75;

const TIER_THRESHOLDS: ReadonlyArray<{ min: number; tier: ReliabilityTier; horizonWeeks: number }> = [
  { min: 85, tier: "trusted", horizonWeeks: 12 },
  { min: 60, tier: "standard", horizonWeeks: 8 },
  { min: 35, tier: "watch", horizonWeeks: 4 },
  { min: 0, tier: "restricted", horizonWeeks: 1 },
];

export function tierFor(score: number): { tier: ReliabilityTier; horizonWeeks: number } {
  const match = TIER_THRESHOLDS.find((t) => score >= t.min) ?? TIER_THRESHOLDS[TIER_THRESHOLDS.length - 1];
  return { tier: match.tier, horizonWeeks: match.horizonWeeks };
}

export const TIER_LABEL: Record<ReliabilityTier, string> = {
  trusted: "Trusted",
  standard: "Standard",
  watch: "Watch",
  restricted: "Restricted",
};

/** Penalty for a return that landed `d` days after the due date. */
function latePenalty(d: number): number {
  if (d <= 0) return 0;
  // A day or two late is a nudge; a month late is most of the score.
  return Math.min(30, 4 + 2 * d);
}

/** Penalty for material that is past due and *still out* — grows while it stays out. */
function overduePenalty(d: number): number {
  if (d <= 0) return 0;
  return Math.min(45, 6 + 3 * d);
}

/**
 * Computes one person's reliability from their reservation history.
 *
 * Scoring is intentionally simple and explainable — people have to trust it,
 * because it decides who gets the drone:
 *
 *   start at 100
 *   + 2  per on-time return   (rewards a long clean record, capped at 100)
 *   − latePenalty(days)       per late return
 *   − overduePenalty(days)    per item currently out past its due date
 *
 * Someone with no completed reservations and nothing overdue is `PROVISIONAL_SCORE`.
 */
export function computeReliability(spans: ReservationSpan[], today: string): ReliabilityScore {
  let onTime = 0;
  let late = 0;
  let overdue = 0;
  let penalty = 0;
  let bonus = 0;

  for (const span of spans) {
    if (span.status === "cancelled") continue;

    if (span.status === "returned") {
      const d = lateDays(span);
      if (d > 0) {
        late += 1;
        penalty += latePenalty(d);
      } else {
        onTime += 1;
        bonus += 2;
      }
      continue;
    }

    const d = daysOverdue(span, today);
    if (d > 0) {
      overdue += 1;
      penalty += overduePenalty(d);
    }
  }

  const completed = onTime + late;
  const base = completed === 0 && overdue === 0 ? PROVISIONAL_SCORE : 100;
  const score = clamp(Math.round(base + bonus - penalty), 0, 100);
  const { tier, horizonWeeks } = tierFor(score);

  return {
    score,
    tier,
    horizonWeeks,
    completed,
    onTime,
    late,
    overdue,
    summary: summarize({ score, completed, onTime, late, overdue, tier }),
  };
}

function summarize(s: {
  score: number;
  completed: number;
  onTime: number;
  late: number;
  overdue: number;
  tier: ReliabilityTier;
}): string {
  if (s.overdue > 0) {
    return `${s.overdue} item${s.overdue === 1 ? "" : "s"} still out past the due date`;
  }
  if (s.completed === 0) return "No return history yet";
  if (s.late === 0) return `${s.onTime} return${s.onTime === 1 ? "" : "s"}, all on time`;
  return `${s.onTime}/${s.completed} returns on time`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/* -------------------------------------------------------------------------- */
/* Queue ordering                                                              */
/* -------------------------------------------------------------------------- */

export type QueueEntry = {
  reservation_id: string;
  user_id: string;
  score: number;
  /** ISO timestamp the request came in. */
  requested_at: string;
};

/**
 * Orders a contested week's waitlist. Higher reliability first; ties broken by
 * who asked first, so the score never makes the queue non-deterministic.
 *
 * This is the visible consequence of the score: if you do not bring material
 * back, you drop below everyone who does.
 */
export function orderQueue(entries: QueueEntry[]): QueueEntry[] {
  return [...entries].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.requested_at !== b.requested_at) return a.requested_at < b.requested_at ? -1 : 1;
    return a.reservation_id < b.reservation_id ? -1 : 1;
  });
}

/* -------------------------------------------------------------------------- */
/* Reminders                                                                   */
/* -------------------------------------------------------------------------- */

export type ReminderKind = "due_soon" | "due_today" | "overdue";

/**
 * Which reminder (if any) a live reservation earns today.
 *
 * - `due_soon`  — the day before the due date, once.
 * - `due_today` — on the due date, once.
 * - `overdue`   — every day at first, then easing to every 3rd day after a week,
 *                 so a forgotten item keeps nagging without becoming noise the
 *                 recipient filters out.
 */
export function reminderFor(span: ReservationSpan, today: string): ReminderKind | null {
  if (!isBlocking(span.status)) return null;
  const due = dueDateOf(span);
  const delta = daysBetween(due, today);

  if (delta === -1) return "due_soon";
  if (delta === 0) return "due_today";
  if (delta < 0) return null;
  if (delta <= 7) return "overdue";
  return delta % 3 === 0 ? "overdue" : null;
}

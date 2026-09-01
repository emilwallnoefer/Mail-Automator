/**
 * Fleet module — pure business rules.
 *
 * Everything in here is deliberately free of Supabase, Next, and `Date.now()`
 * (callers pass `today`), so the reservation calendar, the reliability score and
 * the reminder cron all agree on one implementation and can be unit-tested.
 *
 * The three ideas the module is built around:
 *
 *  1. **Days.** A booking is an inclusive run of calendar days — pick it up
 *     Tuesday, back Thursday. Missions rarely line up with Monday-to-Sunday,
 *     and rounding a two-day job up to a whole week made the old sheet look
 *     fully booked while half the fleet sat on a shelf.
 *  2. **Every asset has one current location**, and every movement writes an
 *     event. "Where is it" is answered by the asset row; "how did it get there"
 *     by its event history.
 *  3. **Reliability score.** Bringing material back on time earns trust; not
 *     bringing it back costs it. The score sets how far ahead you may book and
 *     where you land in the queue for a contested day, so the person who never
 *     returns anything is last in line, automatically.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;

/* -------------------------------------------------------------------------- */
/* Date math                                                                   */
/* -------------------------------------------------------------------------- */

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

export function addDays(dateKey: string, days: number): string {
  const d = parseDateKey(dateKey);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateKey(d);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDateKey(to).getTime() - parseDateKey(from).getTime()) / DAY_MS);
}

/** Inclusive length of a span, in days. A single-day booking is 1. */
export function spanLength(startDate: string, endDate: string): number {
  return daysBetween(startDate, endDate) + 1;
}

/** The `count` day keys starting at `startDate`. */
export function dayRange(startDate: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(startDate, i));
}

/** `YYYY-MM-DD` for the Monday of the week containing `dateKey`. */
export function mondayOf(dateKey: string): string {
  const d = parseDateKey(dateKey);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return toDateKey(d);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(dateKey: string): number {
  return (parseDateKey(dateKey).getUTCDay() + 6) % 7;
}

export function isWeekend(dateKey: string): boolean {
  return weekdayIndex(dateKey) >= 5;
}

/** ISO week number + ISO year, for the calendar's week rule ("KW 36"). */
export function isoWeekNumber(dateKey: string): { week: number; year: number } {
  const d = parseDateKey(mondayOf(dateKey));
  const thursday = new Date(d.getTime());
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / WEEK_MS);
  return { week, year };
}

/**
 * Fixed name tables. Deliberately not `Intl.DateTimeFormat`: ICU renders
 * September as "Sept" in some locales/runtime versions and "Sep" in others, so
 * the calendar header would shift width between the server and the browser.
 */
const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const SHORT_WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

/** "4 Sep" — a single day, for column headers and inline dates. */
export function formatDay(dateKey: string): string {
  const d = parseDateKey(dateKey);
  return `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]}`;
}

/** "Th" — the weekday initial above a calendar column. */
export function formatWeekday(dateKey: string): string {
  return SHORT_WEEKDAYS[weekdayIndex(dateKey)];
}

/** "Thu 4 Sep" — a day with its weekday, for prose and emails. */
export function formatDayLong(dateKey: string): string {
  return `${SHORT_WEEKDAYS[weekdayIndex(dateKey)]} ${formatDay(dateKey)}`;
}

/**
 * "4 – 8 Sep", collapsing the month when the span sits inside one, and
 * collapsing entirely for a single day.
 */
export function formatSpan(startDate: string, endDate: string): string {
  if (startDate === endDate) return formatDay(startDate);
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear();
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
  /** First booked day, `YYYY-MM-DD`. */
  start_date: string;
  /** Last booked day, inclusive — a one-day booking has start === end. */
  end_date: string;
  status: ReservationStatus;
  /** `YYYY-MM-DD` the material actually came back, set on check-in. */
  returned_on?: string | null;
};

/** Half-open comparison on inclusive day spans. */
export function spansOverlap(a: ReservationSpan, b: ReservationSpan): boolean {
  return a.start_date <= b.end_date && b.start_date <= a.end_date;
}

/** A span is "holding" the asset when it is booked or physically out. */
export function isBlocking(status: ReservationStatus): boolean {
  return status === "reserved" || status === "picked_up";
}

/**
 * The last day the material is due back: the final booked day itself.
 * Everything overdue-related keys off this one definition.
 */
export function dueDateOf(span: Pick<ReservationSpan, "end_date">): string {
  return span.end_date;
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
  | { ok: false; reason: "too_long"; maxDays: number }
  | { ok: false; reason: "beyond_horizon"; horizonDays: number };

/** Twelve weeks. Longer than this is a transfer, not a booking. */
export const MAX_RESERVATION_DAYS = 84;

/**
 * Validates a requested span against the asset's existing bookings and the
 * requester's booking horizon. `existing` should already be scoped to the asset.
 */
export function checkReservation(args: {
  startDate: string;
  endDate: string;
  today: string;
  horizonDays: number;
  existing: ReservationSpan[];
  /** Ignore this reservation when re-checking an edit of an existing booking. */
  ignoreId?: string;
}): ConflictCheck {
  const { startDate, endDate, today, horizonDays, existing, ignoreId } = args;
  if (endDate < startDate) return { ok: false, reason: "inverted" };

  // Today itself is bookable — you can walk to the shelf and take something now.
  if (startDate < today) return { ok: false, reason: "past" };

  if (spanLength(startDate, endDate) > MAX_RESERVATION_DAYS) {
    return { ok: false, reason: "too_long", maxDays: MAX_RESERVATION_DAYS };
  }

  if (daysBetween(today, startDate) > horizonDays) {
    return { ok: false, reason: "beyond_horizon", horizonDays };
  }

  const candidate: ReservationSpan = {
    id: "candidate",
    asset_id: "",
    user_id: "",
    start_date: startDate,
    end_date: endDate,
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
  /** Days ahead this person may book. */
  horizonDays: number;
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

const TIER_THRESHOLDS: ReadonlyArray<{ min: number; tier: ReliabilityTier; horizonDays: number }> = [
  { min: 85, tier: "trusted", horizonDays: 84 },
  { min: 60, tier: "standard", horizonDays: 56 },
  { min: 35, tier: "watch", horizonDays: 28 },
  { min: 0, tier: "restricted", horizonDays: 7 },
];

export function tierFor(score: number): { tier: ReliabilityTier; horizonDays: number } {
  const match = TIER_THRESHOLDS.find((t) => score >= t.min) ?? TIER_THRESHOLDS[TIER_THRESHOLDS.length - 1];
  return { tier: match.tier, horizonDays: match.horizonDays };
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
  const { tier, horizonDays } = tierFor(score);

  return {
    score,
    tier,
    horizonDays,
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
 * Orders a contested span's waitlist. Higher reliability first; ties broken by
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

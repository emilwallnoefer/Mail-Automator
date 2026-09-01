import { describe, expect, it } from "vitest";
import {
  addWeeks,
  checkReservation,
  computeReliability,
  dueDateOf,
  daysOverdue,
  formatWeekLabel,
  isoWeekNumber,
  lateDays,
  mondayOf,
  orderQueue,
  parseDateKey,
  PROVISIONAL_SCORE,
  reminderFor,
  spansOverlap,
  tierFor,
  weekRange,
  weeksBetween,
  type ReservationSpan,
} from "./fleet-rules";

function span(partial: Partial<ReservationSpan> & { start_week: string; end_week: string }): ReservationSpan {
  return {
    id: partial.id ?? "r1",
    asset_id: partial.asset_id ?? "a1",
    user_id: partial.user_id ?? "u1",
    status: partial.status ?? "reserved",
    returned_on: partial.returned_on ?? null,
    start_week: partial.start_week,
    end_week: partial.end_week,
  };
}

describe("week math", () => {
  it("snaps any weekday to its Monday", () => {
    // 2026-09-01 is a Tuesday; 2026-09-06 the following Sunday.
    expect(mondayOf(parseDateKey("2026-09-01"))).toBe("2026-08-31");
    expect(mondayOf(parseDateKey("2026-08-31"))).toBe("2026-08-31");
    expect(mondayOf(parseDateKey("2026-09-06"))).toBe("2026-08-31");
    expect(mondayOf(parseDateKey("2026-09-07"))).toBe("2026-09-07");
  });

  it("steps whole weeks across a month boundary", () => {
    expect(addWeeks("2026-08-31", 1)).toBe("2026-09-07");
    expect(addWeeks("2026-09-07", -2)).toBe("2026-08-24");
    expect(weeksBetween("2026-08-31", "2026-10-05")).toBe(5);
  });

  it("survives a DST transition (Europe/Zurich clocks change 2026-10-25)", () => {
    // UTC-anchored arithmetic must not drift by an hour and land on a Sunday.
    expect(addWeeks("2026-10-19", 1)).toBe("2026-10-26");
    expect(mondayOf(parseDateKey("2026-10-26"))).toBe("2026-10-26");
  });

  it("builds a contiguous window", () => {
    expect(weekRange("2026-08-31", 3)).toEqual(["2026-08-31", "2026-09-07", "2026-09-14"]);
  });

  it("computes ISO week numbers", () => {
    expect(isoWeekNumber("2026-08-31")).toEqual({ week: 36, year: 2026 });
    // 2026-01-01 is a Thursday, so its Monday belongs to ISO week 1 of 2026.
    expect(isoWeekNumber("2025-12-29")).toEqual({ week: 1, year: 2026 });
  });

  it("labels a week, collapsing the month when it does not straddle one", () => {
    expect(formatWeekLabel("2026-09-07")).toBe("7 – 13 Sep");
    expect(formatWeekLabel("2026-08-31")).toBe("31 Aug – 6 Sep");
  });
});

describe("reservation spans", () => {
  it("is due on the Sunday of the last booked week", () => {
    expect(dueDateOf({ end_week: "2026-08-31" })).toBe("2026-09-06");
  });

  it("detects inclusive overlap, including single shared week", () => {
    const a = span({ start_week: "2026-08-31", end_week: "2026-09-07" });
    const b = span({ id: "r2", start_week: "2026-09-07", end_week: "2026-09-14" });
    const c = span({ id: "r3", start_week: "2026-09-14", end_week: "2026-09-21" });
    expect(spansOverlap(a, b)).toBe(true);
    expect(spansOverlap(a, c)).toBe(false);
  });

  it("rejects an overlap with a live booking but ignores cancelled and returned ones", () => {
    const existing = [
      span({ id: "live", start_week: "2026-09-07", end_week: "2026-09-14" }),
      span({ id: "dead", start_week: "2026-09-21", end_week: "2026-09-21", status: "cancelled" }),
      span({ id: "done", start_week: "2026-09-28", end_week: "2026-09-28", status: "returned" }),
    ];
    const base = { today: "2026-09-01", horizonWeeks: 12, existing };

    const clash = checkReservation({ ...base, startWeek: "2026-09-14", endWeek: "2026-09-14" });
    expect(clash.ok).toBe(false);
    if (!clash.ok && clash.reason === "overlap") {
      expect(clash.conflicting.map((s) => s.id)).toEqual(["live"]);
    } else {
      expect.unreachable("expected an overlap conflict");
    }

    expect(checkReservation({ ...base, startWeek: "2026-09-21", endWeek: "2026-09-21" }).ok).toBe(true);
    expect(checkReservation({ ...base, startWeek: "2026-09-28", endWeek: "2026-09-28" }).ok).toBe(true);
  });

  it("lets an edit ignore its own row", () => {
    const existing = [span({ id: "mine", start_week: "2026-09-07", end_week: "2026-09-07" })];
    const result = checkReservation({
      startWeek: "2026-09-07",
      endWeek: "2026-09-14",
      today: "2026-09-01",
      horizonWeeks: 12,
      existing,
      ignoreId: "mine",
    });
    expect(result.ok).toBe(true);
  });

  it("refuses inverted, past, over-long and beyond-horizon spans", () => {
    const base = { today: "2026-09-01", existing: [] as ReservationSpan[], horizonWeeks: 4 };
    expect(checkReservation({ ...base, startWeek: "2026-09-14", endWeek: "2026-09-07" })).toEqual({
      ok: false,
      reason: "inverted",
    });
    expect(checkReservation({ ...base, startWeek: "2026-08-24", endWeek: "2026-08-24" })).toEqual({
      ok: false,
      reason: "past",
    });
    expect(checkReservation({ ...base, startWeek: "2026-08-31", endWeek: "2026-12-07" })).toEqual({
      ok: false,
      reason: "too_long",
      maxWeeks: 12,
    });
    // horizon 4 => the 5th week out is refused, the 4th allowed.
    expect(checkReservation({ ...base, startWeek: "2026-09-28", endWeek: "2026-09-28" }).ok).toBe(true);
    expect(checkReservation({ ...base, startWeek: "2026-10-05", endWeek: "2026-10-05" })).toEqual({
      ok: false,
      reason: "beyond_horizon",
      horizonWeeks: 4,
    });
  });

  it("allows booking the week already in progress", () => {
    // today is Tuesday; the current week's Monday is in the past but bookable.
    const result = checkReservation({
      startWeek: "2026-08-31",
      endWeek: "2026-08-31",
      today: "2026-09-01",
      horizonWeeks: 8,
      existing: [],
    });
    expect(result.ok).toBe(true);
  });
});

describe("lateness", () => {
  it("counts days past the due Sunday only while the item is still out", () => {
    const out = span({ start_week: "2026-08-24", end_week: "2026-08-24", status: "picked_up" });
    expect(dueDateOf(out)).toBe("2026-08-30");
    expect(daysOverdue(out, "2026-08-30")).toBe(0);
    expect(daysOverdue(out, "2026-09-02")).toBe(3);

    const back = span({ ...out, status: "returned", returned_on: "2026-09-02" });
    expect(daysOverdue(back, "2026-09-10")).toBe(0);
    expect(lateDays(back)).toBe(3);
  });

  it("treats an early or on-time return as not late", () => {
    const onTime = span({
      start_week: "2026-08-24",
      end_week: "2026-08-24",
      status: "returned",
      returned_on: "2026-08-30",
    });
    expect(lateDays(onTime)).toBe(0);
    expect(lateDays(span({ ...onTime, returned_on: "2026-08-27" }))).toBe(0);
  });
});

describe("reliability score", () => {
  const today = "2026-09-01";

  it("starts provisional with no history", () => {
    const r = computeReliability([], today);
    expect(r.score).toBe(PROVISIONAL_SCORE);
    expect(r.tier).toBe("standard");
    expect(r.horizonWeeks).toBe(8);
    expect(r.summary).toBe("No return history yet");
  });

  it("rewards a clean record up to the cap", () => {
    const clean = Array.from({ length: 20 }, (_, i) =>
      span({
        id: `r${i}`,
        start_week: "2026-06-01",
        end_week: "2026-06-01",
        status: "returned",
        returned_on: "2026-06-07",
      }),
    );
    const r = computeReliability(clean, today);
    expect(r.score).toBe(100);
    expect(r.tier).toBe("trusted");
    expect(r.onTime).toBe(20);
    expect(r.summary).toBe("20 returns, all on time");
  });

  it("penalises a late return in proportion to how late it was", () => {
    const mild = computeReliability(
      [span({ start_week: "2026-06-01", end_week: "2026-06-01", status: "returned", returned_on: "2026-06-09" })],
      today,
    );
    // 2 days late => 100 - (4 + 2*2) = 92
    expect(mild.score).toBe(92);

    const bad = computeReliability(
      [span({ start_week: "2026-06-01", end_week: "2026-06-01", status: "returned", returned_on: "2026-07-20" })],
      today,
    );
    // 43 days late => penalty capped at 30 => 70
    expect(bad.score).toBe(70);
  });

  it("punishes material that is still out harder, and keeps growing the penalty", () => {
    const out = span({ start_week: "2026-08-10", end_week: "2026-08-10", status: "picked_up" });
    // due 2026-08-16; on 2026-09-01 that is 16 days => capped at 45 => 55
    const r = computeReliability([out], today);
    expect(r.score).toBe(55);
    expect(r.overdue).toBe(1);
    expect(r.tier).toBe("watch");
    expect(r.horizonWeeks).toBe(4);
    expect(r.summary).toBe("1 item still out past the due date");
  });

  it("drops a chronic offender to restricted, with a one-week horizon", () => {
    const spans = [
      span({ id: "a", start_week: "2026-06-01", end_week: "2026-06-01", status: "picked_up" }),
      span({ id: "b", start_week: "2026-06-08", end_week: "2026-06-08", status: "picked_up" }),
      span({
        id: "c",
        start_week: "2026-05-04",
        end_week: "2026-05-04",
        status: "returned",
        returned_on: "2026-06-20",
      }),
    ];
    const r = computeReliability(spans, today);
    expect(r.score).toBe(0);
    expect(r.tier).toBe("restricted");
    expect(r.horizonWeeks).toBe(1);
  });

  it("ignores cancelled bookings entirely", () => {
    const r = computeReliability(
      [span({ start_week: "2026-06-01", end_week: "2026-06-01", status: "cancelled" })],
      today,
    );
    expect(r.score).toBe(PROVISIONAL_SCORE);
    expect(r.completed).toBe(0);
  });

  it("does not penalise a booking that has not come due yet", () => {
    const r = computeReliability(
      [span({ start_week: "2026-09-07", end_week: "2026-09-14", status: "reserved" })],
      today,
    );
    expect(r.score).toBe(PROVISIONAL_SCORE);
    expect(r.overdue).toBe(0);
  });

  it("maps scores onto tiers at the documented boundaries", () => {
    expect(tierFor(85).tier).toBe("trusted");
    expect(tierFor(84).tier).toBe("standard");
    expect(tierFor(60).tier).toBe("standard");
    expect(tierFor(59).tier).toBe("watch");
    expect(tierFor(35).tier).toBe("watch");
    expect(tierFor(34).tier).toBe("restricted");
    expect(tierFor(0).tier).toBe("restricted");
  });
});

describe("queue ordering", () => {
  it("puts the higher score first and breaks ties by request time", () => {
    const ordered = orderQueue([
      { reservation_id: "c", user_id: "u3", score: 40, requested_at: "2026-09-01T08:00:00Z" },
      { reservation_id: "a", user_id: "u1", score: 90, requested_at: "2026-09-01T10:00:00Z" },
      { reservation_id: "b", user_id: "u2", score: 90, requested_at: "2026-09-01T09:00:00Z" },
    ]);
    expect(ordered.map((e) => e.reservation_id)).toEqual(["b", "a", "c"]);
  });

  it("is deterministic and does not mutate its input", () => {
    const input = [
      { reservation_id: "b", user_id: "u2", score: 50, requested_at: "2026-09-01T09:00:00Z" },
      { reservation_id: "a", user_id: "u1", score: 50, requested_at: "2026-09-01T09:00:00Z" },
    ];
    const snapshot = [...input];
    expect(orderQueue(input).map((e) => e.reservation_id)).toEqual(["a", "b"]);
    expect(input).toEqual(snapshot);
  });
});

describe("reminder schedule", () => {
  const out = span({ start_week: "2026-08-24", end_week: "2026-08-24", status: "picked_up" });
  // due 2026-08-30

  it("nudges the day before and on the due date", () => {
    expect(reminderFor(out, "2026-08-29")).toBe("due_soon");
    expect(reminderFor(out, "2026-08-30")).toBe("due_today");
  });

  it("stays quiet earlier in the booking", () => {
    expect(reminderFor(out, "2026-08-25")).toBeNull();
    expect(reminderFor(out, "2026-08-28")).toBeNull();
  });

  it("chases daily for a week, then every third day", () => {
    expect(reminderFor(out, "2026-08-31")).toBe("overdue"); // +1
    expect(reminderFor(out, "2026-09-06")).toBe("overdue"); // +7
    expect(reminderFor(out, "2026-09-07")).toBeNull(); // +8
    expect(reminderFor(out, "2026-09-08")).toBe("overdue"); // +9, divisible by 3
    expect(reminderFor(out, "2026-09-09")).toBeNull(); // +10
  });

  it("says nothing once the item is back or the booking is cancelled", () => {
    expect(reminderFor(span({ ...out, status: "returned", returned_on: "2026-09-02" }), "2026-09-02")).toBeNull();
    expect(reminderFor(span({ ...out, status: "cancelled" }), "2026-08-30")).toBeNull();
  });
});

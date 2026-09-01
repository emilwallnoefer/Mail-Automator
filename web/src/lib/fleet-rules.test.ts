import { describe, expect, it } from "vitest";
import {
  addDays,
  checkReservation,
  computeReliability,
  dayRange,
  daysBetween,
  daysOverdue,
  dueDateOf,
  formatDay,
  formatDayLong,
  formatSpan,
  formatWeekday,
  holderColorIndex,
  HOLDER_COLORS,
  holderLabelMatchesPerson,
  holderRgb,
  isBookable,
  isWeekend,
  isoWeekNumber,
  lateDays,
  mondayOf,
  normalizeHolderLabel,
  orderQueue,
  PROVISIONAL_SCORE,
  reminderFor,
  spanLength,
  spansOverlap,
  tierFor,
  weekdayIndex,
  type ReservationSpan,
} from "./fleet-rules";

function span(partial: Partial<ReservationSpan> & { start_date: string; end_date: string }): ReservationSpan {
  return {
    id: partial.id ?? "r1",
    asset_id: partial.asset_id ?? "a1",
    user_id: partial.user_id ?? "u1",
    status: partial.status ?? "reserved",
    returned_on: partial.returned_on ?? null,
    holder_label: partial.holder_label ?? null,
    source: partial.source,
    start_date: partial.start_date,
    end_date: partial.end_date,
  };
}

describe("date math", () => {
  it("steps days across month and year boundaries", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-09-01", -1)).toBe("2026-08-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-08-31", "2026-09-07")).toBe(7);
    expect(daysBetween("2026-09-07", "2026-08-31")).toBe(-7);
  });

  it("counts an inclusive span, so a single day is 1", () => {
    expect(spanLength("2026-09-01", "2026-09-01")).toBe(1);
    expect(spanLength("2026-09-01", "2026-09-03")).toBe(3);
  });

  it("survives a DST transition (Europe/Zurich clocks change 2026-10-25)", () => {
    // UTC-anchored arithmetic must not drift an hour and skip or repeat a day.
    expect(addDays("2026-10-24", 1)).toBe("2026-10-25");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(daysBetween("2026-10-24", "2026-10-27")).toBe(3);
  });

  it("handles a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
  });

  it("builds a contiguous window", () => {
    expect(dayRange("2026-08-31", 4)).toEqual(["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03"]);
  });

  it("snaps to Monday and indexes weekdays from Monday", () => {
    // 2026-09-01 is a Tuesday.
    expect(mondayOf("2026-09-01")).toBe("2026-08-31");
    expect(mondayOf("2026-08-31")).toBe("2026-08-31");
    expect(mondayOf("2026-09-06")).toBe("2026-08-31");
    expect(weekdayIndex("2026-08-31")).toBe(0);
    expect(weekdayIndex("2026-09-06")).toBe(6);
  });

  it("marks Saturday and Sunday as weekend", () => {
    expect(isWeekend("2026-09-04")).toBe(false); // Friday
    expect(isWeekend("2026-09-05")).toBe(true); // Saturday
    expect(isWeekend("2026-09-06")).toBe(true); // Sunday
    expect(isWeekend("2026-09-07")).toBe(false); // Monday
  });

  it("computes ISO week numbers from any day in the week", () => {
    expect(isoWeekNumber("2026-08-31")).toEqual({ week: 36, year: 2026 });
    expect(isoWeekNumber("2026-09-06")).toEqual({ week: 36, year: 2026 });
    expect(isoWeekNumber("2025-12-29")).toEqual({ week: 1, year: 2026 });
  });
});

describe("formatting", () => {
  it("renders single days", () => {
    expect(formatDay("2026-09-04")).toBe("4 Sep");
    expect(formatWeekday("2026-09-04")).toBe("Fr");
    expect(formatDayLong("2026-09-04")).toBe("Fr 4 Sep");
  });

  it("collapses the month inside one month, and keeps both across a boundary", () => {
    expect(formatSpan("2026-09-04", "2026-09-04")).toBe("4 Sep");
    expect(formatSpan("2026-09-04", "2026-09-08")).toBe("4 – 8 Sep");
    expect(formatSpan("2026-08-31", "2026-09-02")).toBe("31 Aug – 2 Sep");
  });

  it("does not collapse the same month number in different years", () => {
    expect(formatSpan("2026-09-28", "2027-09-02")).toBe("28 Sep – 2 Sep");
  });
});

describe("reservation spans", () => {
  it("is due on the last booked day itself", () => {
    expect(dueDateOf({ end_date: "2026-09-03" })).toBe("2026-09-03");
  });

  it("detects inclusive overlap, including a single shared day", () => {
    const a = span({ start_date: "2026-09-01", end_date: "2026-09-03" });
    const b = span({ id: "r2", start_date: "2026-09-03", end_date: "2026-09-05" });
    const c = span({ id: "r3", start_date: "2026-09-04", end_date: "2026-09-06" });
    expect(spansOverlap(a, b)).toBe(true);
    expect(spansOverlap(a, c)).toBe(false);
  });

  it("lets a booking start the day after another ends", () => {
    const existing = [span({ id: "live", start_date: "2026-09-01", end_date: "2026-09-03" })];
    const result = checkReservation({
      startDate: "2026-09-04",
      endDate: "2026-09-06",
      today: "2026-09-01",
      horizonDays: 56,
      existing,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an overlap with a live booking but ignores cancelled and returned ones", () => {
    const existing = [
      span({ id: "live", start_date: "2026-09-07", end_date: "2026-09-09" }),
      span({ id: "dead", start_date: "2026-09-14", end_date: "2026-09-14", status: "cancelled" }),
      span({ id: "done", start_date: "2026-09-21", end_date: "2026-09-21", status: "returned" }),
    ];
    const base = { today: "2026-09-01", horizonDays: 84, existing };

    const clash = checkReservation({ ...base, startDate: "2026-09-08", endDate: "2026-09-10" });
    expect(clash.ok).toBe(false);
    if (!clash.ok && clash.reason === "overlap") {
      expect(clash.conflicting.map((s) => s.id)).toEqual(["live"]);
    } else {
      expect.unreachable("expected an overlap conflict");
    }

    expect(checkReservation({ ...base, startDate: "2026-09-14", endDate: "2026-09-14" }).ok).toBe(true);
    expect(checkReservation({ ...base, startDate: "2026-09-21", endDate: "2026-09-21" }).ok).toBe(true);
  });

  it("lets an edit ignore its own row", () => {
    const existing = [span({ id: "mine", start_date: "2026-09-07", end_date: "2026-09-07" })];
    const result = checkReservation({
      startDate: "2026-09-07",
      endDate: "2026-09-09",
      today: "2026-09-01",
      horizonDays: 84,
      existing,
      ignoreId: "mine",
    });
    expect(result.ok).toBe(true);
  });

  it("refuses inverted, past, over-long and beyond-horizon spans", () => {
    const base = { today: "2026-09-01", existing: [] as ReservationSpan[], horizonDays: 28 };
    expect(checkReservation({ ...base, startDate: "2026-09-10", endDate: "2026-09-08" })).toEqual({
      ok: false,
      reason: "inverted",
    });
    expect(checkReservation({ ...base, startDate: "2026-08-31", endDate: "2026-08-31" })).toEqual({
      ok: false,
      reason: "past",
    });
    expect(checkReservation({ ...base, startDate: "2026-09-01", endDate: "2026-12-01" })).toEqual({
      ok: false,
      reason: "too_long",
      maxDays: 84,
    });
    // horizon 28 => day 28 out is allowed, day 29 refused.
    expect(checkReservation({ ...base, startDate: "2026-09-29", endDate: "2026-09-29" }).ok).toBe(true);
    expect(checkReservation({ ...base, startDate: "2026-09-30", endDate: "2026-09-30" })).toEqual({
      ok: false,
      reason: "beyond_horizon",
      horizonDays: 28,
    });
  });

  it("allows booking today itself", () => {
    const result = checkReservation({
      startDate: "2026-09-01",
      endDate: "2026-09-01",
      today: "2026-09-01",
      horizonDays: 56,
      existing: [],
    });
    expect(result.ok).toBe(true);
  });

  it("allows a booking exactly at the maximum length", () => {
    const result = checkReservation({
      startDate: "2026-09-01",
      endDate: addDays("2026-09-01", 83),
      today: "2026-09-01",
      horizonDays: 84,
      existing: [],
    });
    expect(result.ok).toBe(true);
  });
});

describe("lateness", () => {
  it("counts days past the due day only while the item is still out", () => {
    const out = span({ start_date: "2026-08-24", end_date: "2026-08-28", status: "picked_up" });
    expect(dueDateOf(out)).toBe("2026-08-28");
    expect(daysOverdue(out, "2026-08-28")).toBe(0);
    expect(daysOverdue(out, "2026-08-31")).toBe(3);

    const back = span({ ...out, status: "returned", returned_on: "2026-08-31" });
    expect(daysOverdue(back, "2026-09-10")).toBe(0);
    expect(lateDays(back)).toBe(3);
  });

  it("treats an early or on-time return as not late", () => {
    const onTime = span({
      start_date: "2026-08-24",
      end_date: "2026-08-28",
      status: "returned",
      returned_on: "2026-08-28",
    });
    expect(lateDays(onTime)).toBe(0);
    expect(lateDays(span({ ...onTime, returned_on: "2026-08-26" }))).toBe(0);
  });
});

describe("reliability score", () => {
  const today = "2026-09-01";

  it("starts provisional with no history", () => {
    const r = computeReliability([], today);
    expect(r.score).toBe(PROVISIONAL_SCORE);
    expect(r.tier).toBe("standard");
    expect(r.horizonDays).toBe(56);
    expect(r.summary).toBe("No return history yet");
  });

  it("rewards a clean record up to the cap", () => {
    const clean = Array.from({ length: 20 }, (_, i) =>
      span({
        id: `r${i}`,
        start_date: "2026-06-01",
        end_date: "2026-06-03",
        status: "returned",
        returned_on: "2026-06-03",
      }),
    );
    const r = computeReliability(clean, today);
    expect(r.score).toBe(100);
    expect(r.tier).toBe("trusted");
    expect(r.horizonDays).toBe(84);
    expect(r.summary).toBe("20 returns, all on time");
  });

  it("penalises a late return in proportion to how late it was", () => {
    const mild = computeReliability(
      [span({ start_date: "2026-06-01", end_date: "2026-06-03", status: "returned", returned_on: "2026-06-05" })],
      today,
    );
    // 2 days late => 100 - (4 + 2*2) = 92
    expect(mild.score).toBe(92);

    const bad = computeReliability(
      [span({ start_date: "2026-06-01", end_date: "2026-06-03", status: "returned", returned_on: "2026-07-20" })],
      today,
    );
    // 47 days late => penalty capped at 30 => 70
    expect(bad.score).toBe(70);
  });

  it("punishes material that is still out harder, and keeps growing the penalty", () => {
    const out = span({ start_date: "2026-08-10", end_date: "2026-08-16", status: "picked_up" });
    // due 2026-08-16; on 2026-09-01 that is 16 days => capped at 45 => 55
    const r = computeReliability([out], today);
    expect(r.score).toBe(55);
    expect(r.overdue).toBe(1);
    expect(r.tier).toBe("watch");
    expect(r.horizonDays).toBe(28);
    expect(r.summary).toBe("1 item still out past the due date");
  });

  it("drops a chronic offender to restricted, with a one-week horizon", () => {
    const spans = [
      span({ id: "a", start_date: "2026-06-01", end_date: "2026-06-01", status: "picked_up" }),
      span({ id: "b", start_date: "2026-06-08", end_date: "2026-06-08", status: "picked_up" }),
      span({
        id: "c",
        start_date: "2026-05-04",
        end_date: "2026-05-04",
        status: "returned",
        returned_on: "2026-06-20",
      }),
    ];
    const r = computeReliability(spans, today);
    expect(r.score).toBe(0);
    expect(r.tier).toBe("restricted");
    expect(r.horizonDays).toBe(7);
  });

  it("ignores cancelled bookings entirely", () => {
    const r = computeReliability(
      [span({ start_date: "2026-06-01", end_date: "2026-06-01", status: "cancelled" })],
      today,
    );
    expect(r.score).toBe(PROVISIONAL_SCORE);
    expect(r.completed).toBe(0);
  });

  it("does not penalise a booking that has not come due yet", () => {
    const r = computeReliability(
      [span({ start_date: "2026-09-07", end_date: "2026-09-14", status: "reserved" })],
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
  const out = span({ start_date: "2026-08-24", end_date: "2026-08-30", status: "picked_up" });
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

  it("fires for a single-day booking on the day itself", () => {
    const oneDay = span({ start_date: "2026-08-30", end_date: "2026-08-30", status: "picked_up" });
    expect(reminderFor(oneDay, "2026-08-29")).toBe("due_soon");
    expect(reminderFor(oneDay, "2026-08-30")).toBe("due_today");
    expect(reminderFor(oneDay, "2026-08-31")).toBe("overdue");
  });
});


describe("imported bookings are excluded from scoring", () => {
  const today = "2026-09-01";

  it("does not penalise a long-overdue sheet import", () => {
    // Exactly the shape the sheet importer writes: out, past due, provisional.
    const imported = span({
      id: "imported",
      start_date: "2026-06-01",
      end_date: "2026-06-08",
      status: "picked_up",
      source: "sheet_import",
    });
    const r = computeReliability([imported], today);
    expect(r.score).toBe(PROVISIONAL_SCORE);
    expect(r.overdue).toBe(0);
    expect(r.summary).toBe("No return history yet");
  });

  it("still scores the person's own app bookings alongside imported ones", () => {
    const spans = [
      span({ id: "imported", start_date: "2026-06-01", end_date: "2026-06-08", status: "picked_up", source: "sheet_import" }),
      span({
        id: "real",
        start_date: "2026-07-01",
        end_date: "2026-07-03",
        status: "returned",
        returned_on: "2026-07-05",
        source: "app",
      }),
    ];
    const r = computeReliability(spans, today);
    // Only the real one counts: 2 days late => 100 - (4 + 2*2) = 92.
    expect(r.score).toBe(92);
    expect(r.completed).toBe(1);
    expect(r.overdue).toBe(0);
  });

  it("treats a span with no source as an app booking", () => {
    const r = computeReliability(
      [span({ start_date: "2026-06-01", end_date: "2026-06-08", status: "picked_up" })],
      today,
    );
    expect(r.overdue).toBe(1);
    expect(r.score).toBeLessThan(PROVISIONAL_SCORE);
  });

  it("blocks the calendar even though it does not score", () => {
    // An imported booking must still stop someone else booking the same days.
    const imported = span({
      id: "imported",
      start_date: "2026-09-10",
      end_date: "2026-09-12",
      status: "picked_up",
      source: "sheet_import",
    });
    const result = checkReservation({
      startDate: "2026-09-11",
      endDate: "2026-09-11",
      today,
      horizonDays: 56,
      existing: [imported],
    });
    expect(result.ok).toBe(false);
  });
});

describe("holder label matching", () => {
  it("normalises case, accents, punctuation and spacing", () => {
    expect(normalizeHolderLabel("  Charles  ")).toBe("charles");
    expect(normalizeHolderLabel("Wataru.")).toBe("wataru");
    expect(normalizeHolderLabel("Fran\u00e7ois")).toBe("francois");
    expect(normalizeHolderLabel("Office   Paudex")).toBe("office paudex");
  });

  it("matches a first name, a full name and an email local part", () => {
    const person = { name: "Charles Rey", email: "charles.rey@flyability.com" };
    expect(holderLabelMatchesPerson("Charles", person)).toBe(true);
    expect(holderLabelMatchesPerson("charles rey", person)).toBe(true);
    expect(holderLabelMatchesPerson("Charles.Rey", person)).toBe(true);
  });

  it("falls back to the email when there is no display name", () => {
    const person = { name: null, email: "wataru@flyability.com" };
    expect(holderLabelMatchesPerson("Wataru", person)).toBe(true);
  });

  it("refuses group labels and other people's names", () => {
    const person = { name: "Charles Rey", email: "charles.rey@flyability.com" };
    expect(holderLabelMatchesPerson("APAC team", person)).toBe(false);
    expect(holderLabelMatchesPerson("FPS", person)).toBe(false);
    expect(holderLabelMatchesPerson("US Office", person)).toBe(false);
    expect(holderLabelMatchesPerson("Philipp", person)).toBe(false);
    expect(holderLabelMatchesPerson("Rey", person)).toBe(false);
  });

  it("does not match on a very short first name, which would be too loose", () => {
    expect(holderLabelMatchesPerson("Jo", { name: "Jo Smith", email: "jo@x.com" })).toBe(false);
  });

  it("refuses an empty or punctuation-only label", () => {
    const person = { name: "Charles Rey", email: "charles@x.com" };
    expect(holderLabelMatchesPerson("", person)).toBe(false);
    expect(holderLabelMatchesPerson("  -- ", person)).toBe(false);
  });
});


describe("what belongs in the booking calendar", () => {
  it("includes a pooled unit that is free or merely booked", () => {
    expect(isBookable({ pooled: true, status: "available" })).toBe(true);
    expect(isBookable({ pooled: true, status: "reserved" })).toBe(true);
    // Out on a booking is still pool stock — the calendar is how you see when
    // it comes back.
    expect(isBookable({ pooled: true, status: "out" })).toBe(true);
  });

  it("excludes an assigned unit whatever its status", () => {
    expect(isBookable({ pooled: false, status: "available" })).toBe(false);
    expect(isBookable({ pooled: false, status: "out" })).toBe(false);
  });

  it("excludes pooled units nobody could take", () => {
    expect(isBookable({ pooled: true, status: "in_repair" })).toBe(false);
    expect(isBookable({ pooled: true, status: "retired" })).toBe(false);
  });
});


describe("holder colours", () => {
  it("is stable for the same person across calls", () => {
    const a = holderColorIndex("Inga Khchoyan");
    const b = holderColorIndex("Inga Khchoyan");
    expect(a).toBe(b);
    expect(holderRgb("Inga Khchoyan")).toBe(holderRgb("Inga Khchoyan"));
  });

  it("ignores case, spacing and punctuation, so one person gets one colour", () => {
    // The sheet writes the same person several ways; they must not end up with
    // different colours in the calendar and the legend.
    expect(holderColorIndex("Emil Wallnofer")).toBe(holderColorIndex("  emil   wallnofer "));
    expect(holderColorIndex("François Theil")).toBe(holderColorIndex("Francois Theil"));
  });

  it("always lands inside the palette", () => {
    const names = [
      "Charles Rey", "Camilla Grosso", "François Theil", "Tiago Leconte Pais",
      "Emil Wallnofer", "Inga Khchoyan", "Lucas Senault", "Paul Samuel",
      "Fabio Fata", "Matteo Saglia", "Philipp Jaegle", "Igor Stapper",
      "USA", "Total Energies", "", "   ",
    ];
    for (const n of names) {
      const i = holderColorIndex(n);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(HOLDER_COLORS.length);
      expect(holderRgb(n)).toMatch(/^\d+ \d+ \d+$/);
    }
  });

  it("spreads the real roster across most of the palette", () => {
    // A hash that collapsed everyone onto two colours would defeat the point.
    const roster = [
      "Charles Rey", "Camilla Grosso", "François Theil", "Tiago Leconte Pais",
      "Emil Wallnofer", "Inga Khchoyan", "Lucas Senault", "Paul Samuel",
      "Fabio Fata", "Matteo Saglia", "Philipp Jaegle", "Igor Stapper",
    ];
    const used = new Set(roster.map(holderColorIndex));
    expect(used.size).toBeGreaterThanOrEqual(8);
  });
});

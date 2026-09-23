import { describe, expect, it } from "vitest";
import { MAX_PLAUSIBLE_SCORE } from "@/lib/elios-leaderboard";
import { mergePendingScore, parsePendingScore, pendingOutcome } from "@/lib/elios-pending-score";

describe("parsePendingScore", () => {
  it("reads a stored score", () => {
    expect(parsePendingScore("12")).toBe(12);
    expect(parsePendingScore(String(MAX_PLAUSIBLE_SCORE))).toBe(MAX_PLAUSIBLE_SCORE);
  });

  it("treats anything the server would refuse as nothing pending", () => {
    expect(parsePendingScore(null)).toBeNull();
    expect(parsePendingScore("")).toBeNull();
    expect(parsePendingScore("0")).toBeNull();
    expect(parsePendingScore("-3")).toBeNull();
    expect(parsePendingScore("4.5")).toBeNull();
    expect(parsePendingScore("abc")).toBeNull();
    expect(parsePendingScore(String(MAX_PLAUSIBLE_SCORE + 1))).toBeNull();
  });
});

describe("mergePendingScore", () => {
  it("keeps the higher score", () => {
    expect(mergePendingScore(null, 7)).toBe(7);
    expect(mergePendingScore(7, 12)).toBe(12);
    expect(mergePendingScore(12, 7)).toBe(12);
    expect(mergePendingScore(12, 12)).toBe(12);
  });

  it("ignores a score the server would refuse", () => {
    expect(mergePendingScore(null, 0)).toBeNull();
    expect(mergePendingScore(5, -1)).toBe(5);
    expect(mergePendingScore(5, 2.5)).toBe(5);
    expect(mergePendingScore(5, MAX_PLAUSIBLE_SCORE + 1)).toBe(5);
  });
});

describe("pendingOutcome", () => {
  it("clears once the server has decided", () => {
    expect(pendingOutcome(200)).toBe("clear");
  });

  it("drops a score the server calls nonsense", () => {
    expect(pendingOutcome(400)).toBe("drop");
  });

  it("keeps it for anything that can come right later", () => {
    expect(pendingOutcome(401)).toBe("keep");
    expect(pendingOutcome(429)).toBe("keep");
    expect(pendingOutcome(500)).toBe("keep");
    expect(pendingOutcome(503)).toBe("keep");
  });
});

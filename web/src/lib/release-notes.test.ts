import { describe, expect, it } from "vitest";
import { LATEST_RELEASE, RELEASE_NOTES } from "./release-notes";

/**
 * The "What's new" popup renders `LATEST_RELEASE` and is keyed by its
 * `version` in localStorage. The invariants below are what keep that honest:
 * a duplicated id hides a release from everyone who already dismissed the
 * other one, and an out-of-order list silently shows an old release as current.
 */

const DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})(?:-[a-z0-9-]+)?$/;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

describe("the list itself", () => {
  it("is non-empty and LATEST_RELEASE is its first element", () => {
    expect(RELEASE_NOTES.length).toBeGreaterThan(0);
    expect(LATEST_RELEASE).toBe(RELEASE_NOTES[0]);
  });

  it("gives every entry a unique version id", () => {
    const versions = RELEASE_NOTES.map((note) => note.version);
    const duplicates = versions.filter((v, i) => versions.indexOf(v) !== i);
    expect(duplicates).toEqual([]);
  });

  it("starts every version with a real YYYY-MM-DD date", () => {
    for (const note of RELEASE_NOTES) {
      expect(note.version, note.version).toMatch(DATE_PREFIX);
      const [, y, m, d] = DATE_PREFIX.exec(note.version)!;
      const parsed = new Date(`${y}-${m}-${d}T00:00:00Z`);
      expect(parsed.getUTCMonth() + 1, note.version).toBe(Number(m));
      expect(parsed.getUTCDate(), note.version).toBe(Number(d));
    }
  });

  it("is ordered newest first", () => {
    // Same-day releases are allowed (they carry distinct suffixes), so the
    // ordering is non-increasing on the date prefix rather than strict.
    const dates = RELEASE_NOTES.map((note) => note.version.slice(0, 10));
    expect(dates).toEqual([...dates].sort().reverse());
  });
});

describe("each entry", () => {
  it("has a title and at least one non-empty highlight", () => {
    for (const note of RELEASE_NOTES) {
      expect(note.title.trim(), note.version).not.toBe("");
      expect(note.highlights.length, note.version).toBeGreaterThan(0);
      for (const highlight of note.highlights) {
        expect(highlight.trim(), note.version).not.toBe("");
      }
    }
  });

  it("has a human date that agrees with the version's date prefix", () => {
    for (const note of RELEASE_NOTES) {
      const [, year, month, day] = DATE_PREFIX.exec(note.version)!;
      const expected = `${MONTHS[Number(month) - 1]} ${Number(day)}, ${year}`;
      expect(note.date, note.version).toBe(expected);
    }
  });
});

import { describe, expect, it } from "vitest";
import { stripLeadingGreeting } from "./greeting";

describe("stripLeadingGreeting", () => {
  it("strips an inline greeting that runs into the first sentence", () => {
    // The exact shape that shipped a duplicated welcome line in the live preview.
    expect(
      stripLeadingGreeting(
        "Hallo Roger, hallo Christoph, die Schulung im Kernkraftwerk Leibstadt hat mir wirklich Spaß gemacht.",
        "de",
      ),
    ).toBe("die Schulung im Kernkraftwerk Leibstadt hat mir wirklich Spaß gemacht.");
  });

  it("strips a greeting that sits on its own line", () => {
    expect(stripLeadingGreeting("Hallo Roger und Christoph,\n\nDie Schulung war klasse.", "de")).toBe(
      "Die Schulung war klasse.",
    );
  });

  it("strips a greeting line with no trailing punctuation", () => {
    expect(stripLeadingGreeting("Bonjour Roger\nLa formation était super.", "fr")).toBe(
      "La formation était super.",
    );
  });

  it("capitalises the remainder in English and French but not German", () => {
    expect(stripLeadingGreeting("Hi Roger, it was a pleasure training you.", "en")).toBe(
      "It was a pleasure training you.",
    );
    expect(stripLeadingGreeting("Bonjour Roger, la formation était super.", "fr")).toBe(
      "La formation était super.",
    );
    // German templates continue in lower case after the greeting comma — leave it alone.
    expect(stripLeadingGreeting("Hallo Roger, die Schulung war klasse.", "de")).toBe(
      "die Schulung war klasse.",
    );
  });

  it("handles the other greeting words and an exclamation terminator", () => {
    expect(stripLeadingGreeting("Dear Ms. Schmid, thanks for hosting us.", "en")).toBe(
      "Thanks for hosting us.",
    );
    expect(stripLeadingGreeting("Hey Roger! Great session yesterday.", "en")).toBe(
      "Great session yesterday.",
    );
    expect(stripLeadingGreeting("Guten Morgen Roger, das war stark.", "de")).toBe("das war stark.");
  });

  it("leaves prose that merely starts with a greeting word untouched", () => {
    const text = "Hello was the first thing the drone operator said when the Elios 3 powered up.";
    expect(stripLeadingGreeting(text, "en")).toBe(text);
  });

  it("does not swallow a long first sentence that opens with a greeting word", () => {
    const text =
      "Hi everyone who spent the last two days with me at the plant working through the inspection runs, it was great.";
    expect(stripLeadingGreeting(text, "en")).toBe(text);
  });

  it("leaves an opener with no greeting untouched, trimmed", () => {
    expect(stripLeadingGreeting("  Die Schulung war klasse.  ", "de")).toBe("Die Schulung war klasse.");
  });

  it("returns empty when the opener was nothing but a greeting", () => {
    expect(stripLeadingGreeting("Hallo Roger und Christoph,", "de")).toBe("");
  });

  it("strips only the first greeting, keeping a later one in the body", () => {
    expect(stripLeadingGreeting("Hallo Roger, du sagtest \"Hallo Welt\" zum Piloten.", "de")).toBe(
      'du sagtest "Hallo Welt" zum Piloten.',
    );
  });
});

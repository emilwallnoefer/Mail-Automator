import { describe, expect, it } from "vitest";
import { renderBriefMail } from "./render";
import type { BriefLlmResult } from "@/lib/mail-brief-llm";

const llm: BriefLlmResult = {
  subject: "KKL Schulungsrückblick",
  opener: "Hallo Roger, hallo Christoph, die Schulung hat mir wirklich Spaß gemacht.",
  recap_intro: "Wie versprochen findet ihr unten die Links zu den Unterlagen.",
  feedback_ask: "Scannt gerne den QR-Code für kurzes Feedback.",
  closing: "Viel Erfolg bei euren Inspektionen!",
  selected_change_ids: [],
};

describe("renderBriefMail", () => {
  it("renders the greeting exactly once when the model repeats it in the opener", () => {
    const result = renderBriefMail({ language: "de", recipient_name: "Roger und Christoph" }, llm);

    expect(result.body).toContain("Hallo Roger und Christoph,");
    expect(result.body).toContain("die Schulung hat mir wirklich Spaß gemacht.");
    expect(result.body).not.toContain("Hallo Roger, hallo Christoph");
    expect(result.body.match(/Hallo/g)).toHaveLength(1);
  });

  it("keeps a model opener that has no greeting", () => {
    const result = renderBriefMail(
      { language: "de", recipient_name: "Roger" },
      { ...llm, opener: "Die Schulung hat mir wirklich Spaß gemacht." },
    );

    expect(result.body).toContain("Hallo Roger,\n\nDie Schulung hat mir wirklich Spaß gemacht.");
  });

  it("leaves no blank gap when the opener was nothing but a greeting", () => {
    const result = renderBriefMail(
      { language: "de", recipient_name: "Roger" },
      { ...llm, opener: "Hallo Roger," },
    );

    expect(result.body).toContain("Hallo Roger,\n\nWie versprochen");
    expect(result.body).not.toMatch(/\n{3,}/);
  });
});

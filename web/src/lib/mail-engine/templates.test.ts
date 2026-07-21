import { describe, expect, it } from "vitest";
import {
  applyGrammaticalNumber,
  chooseTemplateId,
  extractSubjectAndBody,
  isSingularRecipient,
  normalize,
  parseTemplates,
  recipientCount,
  replacePlaceholders,
} from "./templates";

describe("parseTemplates", () => {
  it("splits sections keyed by TEMPLATE_ID", () => {
    const raw = [
      "## TEMPLATE_ID: post_en",
      "SUBJECT: Hello",
      "Body one",
      "## TEMPLATE_ID: pre_lausanne_en",
      "SUBJECT: Hi",
      "Body two",
    ].join("\n");
    const parsed = parseTemplates(raw);
    expect(Object.keys(parsed)).toEqual(["post_en", "pre_lausanne_en"]);
    expect(parsed.post_en).toContain("SUBJECT: Hello");
    expect(parsed.pre_lausanne_en).toContain("Body two");
  });
});

describe("chooseTemplateId", () => {
  it("derives ids for post and pre mails", () => {
    expect(chooseTemplateId({ mail_type: "post", language: "de" } as never)).toBe("post_de");
    expect(
      chooseTemplateId({ mail_type: "pre", template_variant: "abroad", language: "fr" } as never),
    ).toBe("pre_abroad_fr");
  });

  it("throws when a pre mail has no variant", () => {
    expect(() => chooseTemplateId({ mail_type: "pre", language: "en" } as never)).toThrow(
      /template_variant/,
    );
  });
});

describe("extractSubjectAndBody", () => {
  it("splits the SUBJECT line from the body and drops --- separators", () => {
    const { subject, body } = extractSubjectAndBody("SUBJECT: Welcome\n---\nHello there\n---");
    expect(subject).toBe("Welcome");
    expect(body).toBe("Hello there");
  });

  it("throws without a SUBJECT line", () => {
    expect(() => extractSubjectAndBody("No subject here")).toThrow(/SUBJECT/);
  });
});

describe("recipientCount / isSingularRecipient", () => {
  it("counts recipients and reports singular", () => {
    expect(recipientCount("Marco")).toBe(1);
    expect(isSingularRecipient("Marco")).toBe(true);
    expect(recipientCount("Marco und Hans")).toBe(2);
    expect(isSingularRecipient("Marco und Hans")).toBe(false);
  });
});

describe("applyGrammaticalNumber", () => {
  it("keeps only the singular block for a single recipient", () => {
    const t = "{{#sg}}du{{/sg}}{{#pl}}ihr{{/pl}}";
    expect(applyGrammaticalNumber(t, true)).toBe("du");
    expect(applyGrammaticalNumber(t, false)).toBe("ihr");
  });
});

describe("replacePlaceholders", () => {
  it("substitutes all occurrences and blanks nullish values", () => {
    expect(replacePlaceholders("{{A}}-{{A}}-{{B}}", { A: "x", B: "" })).toBe("x-x-");
  });
});

describe("normalize", () => {
  it("trims trailing whitespace, collapses blank runs, ends with newline", () => {
    expect(normalize("a  \n\n\n\nb  ")).toBe("a\n\nb\n");
  });
});

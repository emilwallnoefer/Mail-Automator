import { describe, expect, it } from "vitest";
import { recipientCount, renderMail, type MailInput } from "./mail-engine";

describe("recipientCount", () => {
  it("counts single and multiple recipients across separators", () => {
    expect(recipientCount("Marco")).toBe(1);
    expect(recipientCount("Marco and Hans")).toBe(2);
    expect(recipientCount("Marco, Hans & Lisa")).toBe(3);
  });

  it("understands German and French connectors", () => {
    expect(recipientCount("Marco und Hans")).toBe(2);
    expect(recipientCount("Marc et Jean")).toBe(2);
  });

  it("returns 0 for an empty field", () => {
    expect(recipientCount("")).toBe(0);
  });
});

describe("renderMail", () => {
  const postInput: MailInput = {
    mail_type: "post",
    language: "en",
    training_type: "intro_1day",
    recipient_name: "Marco",
    company_name: "Acme Robotics",
    date: "19 July 2026",
    location: "Lausanne",
  };

  it("renders the post template with placeholders resolved", () => {
    const result = renderMail(postInput);
    expect(result.template_id).toBe("post_en");
    expect(result.subject.length).toBeGreaterThan(0);
    expect(result.body).toContain("Marco");
    expect(result.body).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(result.html_body).toContain("<");
  });

  it("renders a pre Lausanne mail from day plan input", () => {
    const result = renderMail({
      mail_type: "pre",
      template_variant: "lausanne",
      language: "en",
      recipient_name: "Marco and Hans",
      company_name: "Acme Robotics",
      date: "19 July 2026",
      location: "Lausanne",
      day_count: 1,
      day1_disciplines: ["intro"],
      day1_site: "tridel",
    });
    expect(result.template_id).toBe("pre_lausanne_en");
    expect(result.body).toContain("Marco and Hans");
    expect(result.body).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it("throws for a pre mail without a template variant", () => {
    expect(() => renderMail({ ...postInput, mail_type: "pre", training_type: undefined })).toThrow(
      /template_variant/,
    );
  });
});

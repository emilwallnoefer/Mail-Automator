import { describe, expect, it } from "vitest";
import {
  buildCertificateEmail,
  certificateEmailSubject,
  formatCertificateSummary,
  formatTrainingDate,
  locationLabel,
  programmeLabel,
  type CertificateRequestDetails,
} from "./certificate-request";

const details: CertificateRequestDetails = {
  customerAccount: "Acme Aviation",
  participants: [
    { name: "Jane Doe", email: "jane@acme.example" },
    { name: "John Roe", email: "john@acme.example" },
  ],
  trainingDate: "2026-08-12",
  programme: "aiim",
  location: "flya_hq",
  trainer: { name: "Emil Wallnoefer", email: "emil@flya.example" },
};

describe("formatTrainingDate", () => {
  it("formats an ISO date without locale or timezone drift", () => {
    expect(formatTrainingDate("2026-08-12")).toBe("12 Aug 2026");
    expect(formatTrainingDate("2026-01-01")).toBe("1 Jan 2026");
    expect(formatTrainingDate("2026-12-31")).toBe("31 Dec 2026");
  });

  it("returns the input unchanged when it isn't a calendar date", () => {
    expect(formatTrainingDate("not-a-date")).toBe("not-a-date");
    expect(formatTrainingDate("2026-13-01")).toBe("2026-13-01");
  });
});

describe("labels", () => {
  it("maps ids to display labels", () => {
    expect(programmeLabel("intro")).toBe("Intro");
    expect(programmeLabel("aiim")).toBe("AIIM");
    expect(locationLabel("flya_hq")).toBe("Flya HQ");
    expect(locationLabel("customer_account")).toBe("Customer account");
  });
});

describe("formatCertificateSummary", () => {
  it("includes every field and numbers the participants", () => {
    const summary = formatCertificateSummary(details);
    expect(summary).toContain("Certificate request — Acme Aviation");
    expect(summary).toContain("Programme:    AIIM");
    expect(summary).toContain("Training date: 12 Aug 2026");
    expect(summary).toContain("Location:     Flya HQ");
    expect(summary).toContain("Trainer:      Emil Wallnoefer <emil@flya.example>");
    expect(summary).toContain("Participants (2):");
    expect(summary).toContain("  1. Jane Doe <jane@acme.example>");
    expect(summary).toContain("  2. John Roe <john@acme.example>");
  });

  it("omits the angle brackets for a participant without an email", () => {
    const summary = formatCertificateSummary({
      ...details,
      participants: [{ name: "Jane Doe", email: "" }],
    });
    expect(summary.endsWith("  1. Jane Doe")).toBe(true);
    expect(summary).not.toContain("Jane Doe <>");
  });
});

describe("buildCertificateEmail", () => {
  it("puts the customer, programme and date in the subject", () => {
    expect(certificateEmailSubject(details)).toBe(
      "Certificate request — Acme Aviation (AIIM, 12 Aug 2026)",
    );
  });

  it("repeats the plain summary verbatim in the text body", () => {
    const { text } = buildCertificateEmail(details);
    expect(text).toContain(formatCertificateSummary(details));
  });

  it("escapes user-supplied values in the HTML body", () => {
    const { html } = buildCertificateEmail({
      ...details,
      customerAccount: '<script>alert("x")</script>',
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders one list item per participant", () => {
    const { html } = buildCertificateEmail(details);
    expect(html.match(/<li>/g)).toHaveLength(2);
    expect(html).toContain("Participants (2)");
  });
});

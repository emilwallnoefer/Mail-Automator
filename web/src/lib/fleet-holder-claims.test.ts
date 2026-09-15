import { describe, expect, it } from "vitest";
import {
  buildHolderClaimMismatchEmail,
  claimEventNote,
  describeClaimedMaterial,
  describePerson,
  holderClaimMismatchSubject,
  reassignEventNote,
  releaseEventNote,
  type HolderClaim,
} from "./fleet-holder-claims";

const CLAIM: HolderClaim = {
  label: "Wataru",
  claimant: { name: "Emil Wallnöfer", email: "emil@example.com" },
  selfMatch: false,
  material: { bookings: 3, assets: 1 },
};

describe("describeClaimedMaterial", () => {
  it("pluralises each count on its own", () => {
    expect(describeClaimedMaterial({ bookings: 1, assets: 2 })).toBe(
      "1 booking and 2 assigned units",
    );
    expect(describeClaimedMaterial({ bookings: 2, assets: 1 })).toBe(
      "2 bookings and 1 assigned unit",
    );
  });

  it("drops a side that is empty rather than saying zero", () => {
    expect(describeClaimedMaterial({ bookings: 4, assets: 0 })).toBe("4 bookings");
    expect(describeClaimedMaterial({ bookings: 0, assets: 1 })).toBe("1 assigned unit");
  });

  it("says nothing when a label is linked but carries no material", () => {
    // A claim with nothing behind it is legitimate — the name is registered so
    // a later import resolves to the account — and must not render as "0".
    expect(describeClaimedMaterial({ bookings: 0, assets: 0 })).toBe("nothing");
  });
});

describe("describePerson", () => {
  it("appends the address when there is one", () => {
    expect(describePerson({ name: "Emil", email: "emil@example.com" })).toBe(
      "Emil <emil@example.com>",
    );
  });

  it("falls back to the bare name", () => {
    expect(describePerson({ name: "Emil", email: null })).toBe("Emil");
  });
});

describe("event notes", () => {
  it("flags a mismatch in the claim note and stays silent on a match", () => {
    expect(claimEventNote(CLAIM)).toBe(
      'Holder "Wataru" claimed by Emil Wallnöfer (name does not match theirs)',
    );
    expect(claimEventNote({ ...CLAIM, selfMatch: true })).toBe(
      'Holder "Wataru" claimed by Emil Wallnöfer',
    );
  });

  it("names the admin who reassigned or released, so the history is accountable", () => {
    expect(
      reassignEventNote({
        label: "Wataru",
        to: { name: "Wataru Sato", email: "wataru@example.com" },
        by: "admin@example.com",
      }),
    ).toBe('Holder "Wataru" reassigned to Wataru Sato by admin@example.com');

    expect(releaseEventNote({ label: "Wataru", by: "admin@example.com" })).toBe(
      'Holder "Wataru" released back to unclaimed by admin@example.com',
    );
  });
});

describe("buildHolderClaimMismatchEmail", () => {
  const url = "https://app.example.com/dashboard?view=admin&section=holder_claims";

  it("names the claimant and the label in the subject", () => {
    expect(holderClaimMismatchSubject(CLAIM)).toBe('Fleet: Emil Wallnöfer claimed "Wataru"');
    expect(buildHolderClaimMismatchEmail(CLAIM, url).subject).toBe(
      holderClaimMismatchSubject(CLAIM),
    );
  });

  it("states what moved, using the same wording as the table", () => {
    const { text, html } = buildHolderClaimMismatchEmail(CLAIM, url);
    const moved = describeClaimedMaterial(CLAIM.material);
    expect(text).toContain(moved);
    expect(html).toContain(moved);
  });

  it("links the admin table in both parts", () => {
    const { text, html } = buildHolderClaimMismatchEmail(CLAIM, url);
    expect(text).toContain(url);
    // The href is escaped, as an attribute value must be: `&` between query
    // params becomes `&amp;`, which every mail client resolves back.
    expect(html).toContain(`href="${url.replace(/&/g, "&amp;")}"`);
  });

  it("explains that the claim went through, so nobody 'fixes' the permissiveness", () => {
    const { text, html } = buildHolderClaimMismatchEmail(CLAIM, url);
    expect(text).toContain("permissive");
    expect(html).toContain("permissive");
  });

  it("escapes markup in a label or a name", () => {
    const { html } = buildHolderClaimMismatchEmail(
      {
        ...CLAIM,
        label: '<script>alert("x")</script>',
        claimant: { name: "A & B", email: null },
      },
      url,
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A &amp; B");
  });
});

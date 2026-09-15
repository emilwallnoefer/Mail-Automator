import { describe, expect, it } from "vitest";
import {
  ROLE_ASSIGNMENT_DEEP_LINK,
  describeNewUser,
  renderRoleAssignmentNotice,
  roleAssignmentUrl,
} from "./role-assignment-notice-email";

describe("describeNewUser", () => {
  it("uses name and address together when a name is known", () => {
    expect(describeNewUser({ email: "ada@flya.space", name: "Ada Lovelace" })).toBe(
      "Ada Lovelace (ada@flya.space)",
    );
  });

  it("falls back to the address alone for a brand-new sign-up with no name", () => {
    expect(describeNewUser({ email: "ada@flya.space", name: null })).toBe("ada@flya.space");
    expect(describeNewUser({ email: "ada@flya.space" })).toBe("ada@flya.space");
  });

  it("treats a whitespace-only name as absent", () => {
    // Supabase will happily store "   " as full_name; that must not render as
    // "    (ada@flya.space)".
    expect(describeNewUser({ email: "ada@flya.space", name: "   " })).toBe("ada@flya.space");
  });

  it("does not repeat the address when the name IS the address", () => {
    expect(describeNewUser({ email: "ada@flya.space", name: "Ada@Flya.Space" })).toBe("ada@flya.space");
  });

  it("trims a padded address", () => {
    expect(describeNewUser({ email: "  ada@flya.space  " })).toBe("ada@flya.space");
  });
});

describe("roleAssignmentUrl", () => {
  it("lands on Admin -> Users & roles", () => {
    expect(roleAssignmentUrl("https://app.flya.space")).toBe(
      `https://app.flya.space${ROLE_ASSIGNMENT_DEEP_LINK}`,
    );
  });

  it("does not double the slash when the origin carries one", () => {
    expect(roleAssignmentUrl("https://app.flya.space/")).toBe(
      `https://app.flya.space${ROLE_ASSIGNMENT_DEEP_LINK}`,
    );
    expect(roleAssignmentUrl("https://app.flya.space///")).not.toContain("space//");
  });
});

describe("renderRoleAssignmentNotice", () => {
  const base = { email: "ada@flya.space", name: "Ada Lovelace", baseUrl: "https://app.flya.space" };

  it("names the person in the subject so a mailbox list is readable", () => {
    expect(renderRoleAssignmentNotice(base).subject).toBe("ada@flya.space has signed up — assign a role");
  });

  it("puts the deep link in both bodies", () => {
    const mail = renderRoleAssignmentNotice(base);
    const url = roleAssignmentUrl(base.baseUrl);
    expect(mail.text).toContain(url);
    // The href carries `&` as `&amp;` — correct HTML, and the `&section=` half
    // of the deep link is exactly what a naive un-escaped build would drop.
    expect(mail.html).toContain(`href="${url.replace(/&/g, "&amp;")}"`);
    expect(mail.html).toContain("section=users");
  });

  it("says the user is blocked, which is why the mail is urgent", () => {
    const mail = renderRoleAssignmentNotice(base);
    expect(mail.text).toContain("waiting for a role");
    expect(mail.text).toContain("cannot reach any module");
  });

  it("escapes HTML in a hostile display name instead of injecting it", () => {
    const mail = renderRoleAssignmentNotice({
      ...base,
      name: '<img src=x onerror="alert(1)">',
    });
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("renders without a name", () => {
    const mail = renderRoleAssignmentNotice({ email: "ada@flya.space", baseUrl: base.baseUrl });
    expect(mail.text).toContain("ada@flya.space has signed up");
    expect(mail.subject).toContain("ada@flya.space");
  });

  it("is deterministic — same input, byte-identical output", () => {
    expect(renderRoleAssignmentNotice(base)).toEqual(renderRoleAssignmentNotice(base));
  });
});

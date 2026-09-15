import { describe, expect, it } from "vitest";
import { normalizeUserRole, userRoleLabel, type UserRole } from "./user-role";

const ROLES: UserRole[] = ["sales", "eu_pilot", "us_pilot", "hr"];

describe("normalizeUserRole", () => {
  it("accepts every known role", () => {
    for (const role of ROLES) expect(normalizeUserRole(role)).toBe(role);
  });

  it("maps the legacy `pilot` value to EU Pilot", () => {
    expect(normalizeUserRole("pilot")).toBe("eu_pilot");
  });

  it("rejects anything else, including absent, empty and non-string values", () => {
    for (const raw of [undefined, null, "", "admin", "HR", "Sales", " hr", "hr ", 0, 1, true, {}, ["hr"]]) {
      expect(normalizeUserRole(raw)).toBeNull();
    }
  });

  it("does not grant hr by a near-miss, since hr unlocks other people's time data", () => {
    // guardTimeViewer keys off `role === "hr"` — anything that normalizes to null
    // is refused, so these must not slip through.
    expect(normalizeUserRole("hr_admin")).toBeNull();
    expect(normalizeUserRole("Hr")).toBeNull();
  });
});

describe("userRoleLabel", () => {
  it("labels every role and the unset case", () => {
    expect(userRoleLabel("sales")).toBe("Sales");
    expect(userRoleLabel("eu_pilot")).toBe("EU Pilot");
    expect(userRoleLabel("us_pilot")).toBe("US Pilot");
    expect(userRoleLabel("hr")).toBe("HR");
    expect(userRoleLabel(null)).toBe("Not selected");
  });

  it("gives every role a distinct, non-empty label", () => {
    const labels = ROLES.map(userRoleLabel);
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) expect(label.trim().length).toBeGreaterThan(0);
  });
});

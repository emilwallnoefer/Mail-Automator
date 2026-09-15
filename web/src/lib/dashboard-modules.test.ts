import { describe, expect, it } from "vitest";
import { isModuleKey, MODULE_KEYS } from "./dashboard-modules";

describe("isModuleKey", () => {
  it("accepts every module the dashboard renders", () => {
    for (const key of MODULE_KEYS) expect(isModuleKey(key)).toBe(true);
  });

  it("rejects anything else a URL could carry", () => {
    for (const value of ["payroll", "", "MAIL", undefined, null, 3, ["mail"]]) {
      expect(isModuleKey(value)).toBe(false);
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  MAIL_SIGNATURE_CUSTOM_VALUE,
  MAIL_SIGNATURE_DEFAULT_NAME,
  MAIL_SIGNATURE_NAME_PRESETS,
  isPresetSignatureName,
} from "./mail-signature-presets";

describe("signature presets", () => {
  it("defaults to the first preset", () => {
    expect(MAIL_SIGNATURE_DEFAULT_NAME).toBe(MAIL_SIGNATURE_NAME_PRESETS[0]);
    expect(isPresetSignatureName(MAIL_SIGNATURE_DEFAULT_NAME)).toBe(true);
  });

  it("recognises every preset", () => {
    for (const name of MAIL_SIGNATURE_NAME_PRESETS) {
      expect(isPresetSignatureName(name)).toBe(true);
    }
  });

  it("treats any other name as custom — exact match, no trimming or case folding", () => {
    expect(isPresetSignatureName("Someone Else")).toBe(false);
    expect(isPresetSignatureName("")).toBe(false);
    expect(isPresetSignatureName(` ${MAIL_SIGNATURE_DEFAULT_NAME} `)).toBe(false);
    expect(isPresetSignatureName(MAIL_SIGNATURE_DEFAULT_NAME.toLowerCase())).toBe(false);
  });

  it("keeps the sentinel distinct from any real name, so it can't be chosen by accident", () => {
    expect(isPresetSignatureName(MAIL_SIGNATURE_CUSTOM_VALUE)).toBe(false);
    expect(MAIL_SIGNATURE_NAME_PRESETS).not.toContain(MAIL_SIGNATURE_CUSTOM_VALUE);
  });
});

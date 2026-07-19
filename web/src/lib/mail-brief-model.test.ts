import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAIL_BRIEF_MODEL,
  MAIL_BRIEF_MODELS,
  isMailBriefModel,
} from "./mail-brief-model";

describe("mail brief model allowlist", () => {
  it("keeps the default inside the allowlist", () => {
    expect(isMailBriefModel(DEFAULT_MAIL_BRIEF_MODEL)).toBe(true);
  });

  it("accepts every listed model id", () => {
    for (const model of MAIL_BRIEF_MODELS) {
      expect(isMailBriefModel(model.id)).toBe(true);
    }
  });

  it("rejects unknown ids and non-strings", () => {
    expect(isMailBriefModel("claude-3-haiku")).toBe(false);
    expect(isMailBriefModel("")).toBe(false);
    expect(isMailBriefModel(null)).toBe(false);
    expect(isMailBriefModel(42)).toBe(false);
    expect(isMailBriefModel(undefined)).toBe(false);
  });
});

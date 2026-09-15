import { describe, expect, it } from "vitest";
import { cn } from "./cn";

/**
 * `cn` is deliberately NOT tailwind-merge: it only drops falsy fragments and
 * joins. Conflicting utilities are the caller's problem (use the primitive's
 * variant props instead), and these tests pin that contract down so nobody
 * "fixes" it by assuming a later class wins.
 */
describe("cn", () => {
  it("joins fragments with a single space", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("skips every falsy value, including the empty string", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b");
    expect(cn()).toBe("");
    expect(cn(false, null, undefined)).toBe("");
  });

  it("keeps the caller's order and does not collapse duplicates", () => {
    expect(cn("p-2", "p-2")).toBe("p-2 p-2");
    expect(cn("b", "a")).toBe("b a");
  });

  it("does NOT resolve conflicting Tailwind utilities — both survive", () => {
    expect(cn("p-2", "p-4")).toBe("p-2 p-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-red-500 text-blue-500");
  });

  it("passes multi-class fragments through verbatim, whitespace and all", () => {
    expect(cn("flex items-center", "gap-2")).toBe("flex items-center gap-2");
    expect(cn(" a ")).toBe(" a ");
  });

  it("supports the conditional-class idiom", () => {
    const active = true;
    const disabled = false;
    expect(cn("btn", active && "btn-active", disabled && "btn-disabled")).toBe("btn btn-active");
  });
});

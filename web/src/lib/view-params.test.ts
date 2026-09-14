import { afterEach, describe, expect, it } from "vitest";
import { readViewParam, writeViewParams } from "./view-params";

const MODULES = ["mail", "time", "fleet", "settings", "admin"] as const;

/** Minimal stand-in for the two browser APIs the helpers touch. */
function stubWindow(href: string) {
  const calls: string[] = [];
  const state = { tree: "next-router-state" };
  (globalThis as unknown as { window: unknown }).window = {
    location: { get href() { return href; }, get search() { return new URL(href).search; } },
    history: {
      state,
      replaceState(nextState: unknown, _title: string, nextHref: string) {
        expect(nextState).toBe(state);
        href = nextHref;
        calls.push(nextHref);
      },
    },
  };
  return { calls, current: () => href };
}

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe("readViewParam", () => {
  it("returns a value listed as valid", () => {
    stubWindow("https://app.test/dashboard?module=fleet");
    expect(readViewParam("module", MODULES)).toBe("fleet");
  });

  it("ignores a value outside the allowed list", () => {
    stubWindow("https://app.test/dashboard?module=payroll");
    expect(readViewParam("module", MODULES)).toBeNull();
  });

  it("returns null when the param is absent", () => {
    stubWindow("https://app.test/dashboard");
    expect(readViewParam("module", MODULES)).toBeNull();
  });

  it("returns null on the server, where there is no URL to read", () => {
    expect(readViewParam("module", MODULES)).toBeNull();
  });
});

describe("writeViewParams", () => {
  it("sets a param and keeps the rest of the URL", () => {
    const win = stubWindow("https://app.test/dashboard?ref=mail");
    writeViewParams({ module: "admin" });
    expect(win.current()).toBe("https://app.test/dashboard?ref=mail&module=admin");
  });

  it("removes a param when the value is null", () => {
    const win = stubWindow("https://app.test/dashboard?module=admin&section=audit");
    writeViewParams({ module: null, section: null });
    expect(win.current()).toBe("https://app.test/dashboard");
  });

  it("does not touch history when nothing would change", () => {
    const win = stubWindow("https://app.test/dashboard?module=admin");
    writeViewParams({ module: "admin", section: null });
    expect(win.calls).toEqual([]);
  });

  it("is a no-op on the server", () => {
    expect(() => writeViewParams({ module: "admin" })).not.toThrow();
  });
});

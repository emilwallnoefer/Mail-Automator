// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Mirrors theme.test.ts — same cache/listener shape, different storage key. */

const syncAppearanceToServer = vi.fn();
vi.mock("@/lib/appearance-sync", () => ({
  syncAppearanceToServer: (...args: unknown[]) => syncAppearanceToServer(...args),
}));

const STORAGE_KEY = "ma_accent_light";

async function load() {
  vi.resetModules();
  return import("./accent");
}

let seen: string[] = [];
const onChange = (event: Event) => {
  seen.push((event as CustomEvent<{ accent: string }>).detail.accent);
};

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-accent");
  seen = [];
  syncAppearanceToServer.mockClear();
  window.addEventListener("ma-accent-changed", onChange);
});

afterEach(() => {
  window.removeEventListener("ma-accent-changed", onChange);
  vi.restoreAllMocks();
});

describe("the accent list", () => {
  it("offers exactly the two accepted values, each with a swatch", async () => {
    const { ACCENTS } = await load();
    expect(ACCENTS.map((a) => a.value)).toEqual(["amber", "blue"]);
    for (const accent of ACCENTS) {
      expect(accent.label.trim()).toBeTruthy();
      expect(accent.swatch).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("reading the stored accent", () => {
  it("defaults to amber when nothing is stored", async () => {
    const { getAccent } = await load();
    expect(getAccent()).toBe("amber");
  });

  it("returns a stored accent", async () => {
    window.localStorage.setItem(STORAGE_KEY, "blue");
    const { getAccent } = await load();
    expect(getAccent()).toBe("blue");
  });

  it("falls back to amber for anything unrecognised", async () => {
    for (const junk of ["", "green", "BLUE", "amber "]) {
      window.localStorage.setItem(STORAGE_KEY, junk);
      const { getAccent } = await load();
      expect(getAccent(), junk).toBe("amber");
    }
  });

  it("falls back to amber when localStorage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { getAccent } = await load();
    expect(getAccent()).toBe("amber");
  });
});

describe("setAccent", () => {
  it("persists, caches, stamps the attribute, syncs and announces", async () => {
    const { setAccent, getAccent } = await load();
    setAccent("blue");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("blue");
    expect(getAccent()).toBe("blue");
    expect(document.documentElement.dataset.accent).toBe("blue");
    expect(syncAppearanceToServer).toHaveBeenCalledWith({ accent: "blue" });
    expect(seen).toEqual(["blue"]);
  });

  it("stamps the attribute even for the default accent", async () => {
    // Unlike the dark theme, amber is not the attribute-free state.
    const { setAccent } = await load();
    setAccent("amber");
    expect(document.documentElement.dataset.accent).toBe("amber");
  });

  it("still applies the accent when the write is rejected", async () => {
    const { setAccent, getAccent } = await load();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    setAccent("blue");
    expect(getAccent()).toBe("blue");
    expect(document.documentElement.dataset.accent).toBe("blue");
  });
});

describe("another tab changing the accent", () => {
  // Earlier `load()` calls leave their own storage listeners on this window, so
  // the announced values are compared as a set rather than by count.
  it("adopts the new value and announces it", async () => {
    const { getAccent } = await load();
    expect(getAccent()).toBe("amber");
    window.localStorage.setItem(STORAGE_KEY, "blue");
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: "blue" }));
    expect(getAccent()).toBe("blue");
    expect(document.documentElement.dataset.accent).toBe("blue");
    expect([...new Set(seen)]).toEqual(["blue"]);
  });

  it("ignores a write to any other key", async () => {
    const { getAccent } = await load();
    expect(getAccent()).toBe("amber");
    window.localStorage.setItem(STORAGE_KEY, "blue");
    window.dispatchEvent(new StorageEvent("storage", { key: "ma_theme", newValue: "blue" }));
    expect(getAccent()).toBe("amber");
    expect(seen).toEqual([]);
  });
});

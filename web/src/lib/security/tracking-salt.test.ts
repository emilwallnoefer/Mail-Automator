import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  MIN_SALT_LENGTH,
  createIpHasher,
  hashIpWithSalt,
  isSaltRequired,
  resolveTrackingSalt,
} from "./tracking-salt";

const IP = "203.0.113.42";
const GOOD_SALT = "0123456789abcdef0123456789abcdef";
const UNSALTED = createHash("sha256").update(`|${IP}`).digest("hex");

const PROD = { NODE_ENV: "production", VERCEL_ENV: "production" } as const;
const DEV = { NODE_ENV: "development" } as const;

function hasher(env: Record<string, string | undefined>) {
  const logs: string[] = [];
  const h = createIpHasher(env, (m) => logs.push(m));
  return { ...h, logs };
}

describe("isSaltRequired", () => {
  it("requires a salt on real Vercel deployments", () => {
    expect(isSaltRequired({ VERCEL_ENV: "production", NODE_ENV: "production" })).toBe(true);
    expect(isSaltRequired({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe(true);
  });

  it("requires a salt on a non-Vercel production server", () => {
    expect(isSaltRequired({ NODE_ENV: "production" })).toBe(true);
  });

  it("does not require a salt locally, including under `vercel dev`", () => {
    expect(isSaltRequired({ NODE_ENV: "development" })).toBe(false);
    expect(isSaltRequired({ NODE_ENV: "test" })).toBe(false);
    expect(isSaltRequired({ VERCEL_ENV: "development", NODE_ENV: "production" })).toBe(false);
  });
});

describe("resolveTrackingSalt", () => {
  it("treats unset, empty and whitespace-only as missing", () => {
    for (const TRACKING_SALT of [undefined, "", "   ", "\t\n "]) {
      expect(resolveTrackingSalt({ ...PROD, TRACKING_SALT })).toEqual({
        ok: false,
        reason: "missing",
        required: true,
      });
    }
  });

  it("rejects an implausibly short salt", () => {
    expect(resolveTrackingSalt({ ...PROD, TRACKING_SALT: "x".repeat(MIN_SALT_LENGTH - 1) })).toEqual({
      ok: false,
      reason: "too_short",
      required: true,
    });
  });

  it("accepts a salt at the floor, and trims surrounding whitespace", () => {
    expect(resolveTrackingSalt({ ...PROD, TRACKING_SALT: `  ${GOOD_SALT}  ` })).toEqual({
      ok: true,
      salt: GOOD_SALT,
      weak: false,
    });
    expect(resolveTrackingSalt({ ...PROD, TRACKING_SALT: "y".repeat(MIN_SALT_LENGTH) })).toMatchObject({
      ok: true,
      weak: true,
    });
  });
});

describe("createIpHasher — no unsalted hash is ever produced", () => {
  it("unset: returns null and never the unsalted digest", () => {
    for (const env of [PROD, DEV]) {
      const h = hasher({ ...env });
      expect(h.hashIp(IP)).toBeNull();
      expect(h.hashIp(IP)).not.toBe(UNSALTED);
      expect(h.logs.join("\n")).toMatch(/TRACKING_SALT is not set/);
    }
  });

  it("empty and whitespace-only: same as unset", () => {
    for (const TRACKING_SALT of ["", "   "]) {
      const h = hasher({ ...PROD, TRACKING_SALT });
      expect(h.hashIp(IP)).toBeNull();
      expect(h.misconfigured).toBe(true);
    }
  });

  it("too short: refuses rather than hashing weakly", () => {
    const h = hasher({ ...PROD, TRACKING_SALT: "abc" });
    expect(h.hashIp(IP)).toBeNull();
    expect(h.misconfigured).toBe(true);
    expect(h.logs.join("\n")).toMatch(/shorter than 16 characters/);
  });

  it("set: produces a salted hash, and different salts differ for the same IP", () => {
    const a = hasher({ ...PROD, TRACKING_SALT: GOOD_SALT });
    const b = hasher({ ...PROD, TRACKING_SALT: "fedcba9876543210fedcba9876543210" });

    const digestA = a.hashIp(IP);
    const digestB = b.hashIp(IP);

    expect(digestA).toMatch(/^[0-9a-f]{64}$/);
    expect(digestA).toBe(hashIpWithSalt(GOOD_SALT, IP));
    expect(digestA).not.toBe(UNSALTED);
    expect(digestB).not.toBe(digestA);
    expect(a.misconfigured).toBe(false);
    expect(a.logs).toEqual([]);
  });

  it("set: is stable for the same IP, so de-duplication still works", () => {
    const h = hasher({ ...PROD, TRACKING_SALT: GOOD_SALT });
    expect(h.hashIp(IP)).toBe(h.hashIp(IP));
    expect(h.hashIp("198.51.100.7")).not.toBe(h.hashIp(IP));
  });

  it("keeps returning null for an unknown IP even with a good salt", () => {
    const h = hasher({ ...PROD, TRACKING_SALT: GOOD_SALT });
    expect(h.hashIp("unknown")).toBeNull();
    expect(h.hashIp("")).toBeNull();
    expect(h.hashIp(null)).toBeNull();
  });
});

describe("createIpHasher — deployment vs local behaviour", () => {
  it("flags a deployed environment as misconfigured so the click is dropped", () => {
    expect(hasher({ ...PROD }).misconfigured).toBe(true);
    expect(hasher({ VERCEL_ENV: "preview", NODE_ENV: "production" }).misconfigured).toBe(true);
  });

  it("does not break local development: click still recorded, warning explains why", () => {
    const h = hasher({ ...DEV });
    expect(h.misconfigured).toBe(false);
    expect(h.hashIp(IP)).toBeNull();
    expect(h.logs.join("\n")).toMatch(/fine for local development/);
  });

  it("logs exactly once per environment, not once per request", () => {
    const h = hasher({ ...PROD });
    h.hashIp(IP);
    h.hashIp(IP);
    h.hashIp(IP);
    expect(h.logs).toHaveLength(1);
  });

  it("defaults to console.error so a misconfiguration is greppable in logs", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      createIpHasher({ ...PROD });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(String(spy.mock.calls[0]?.[0])).toContain("[tracking-salt]");
    } finally {
      spy.mockRestore();
    }
  });
});

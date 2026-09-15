import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAdminEmails, isAdminEmail } from "./admin";

/**
 * `ADMIN_EMAILS` is the whole of admin authorization — `guardAdmin` asks nothing
 * else — so the parsing of that one env var is a security boundary.
 */
const original = process.env.ADMIN_EMAILS;

function setEnv(value: string | undefined) {
  if (value === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = value;
}

beforeEach(() => setEnv(undefined));
afterEach(() => setEnv(original));

describe("getAdminEmails", () => {
  it("splits on commas, trims, and lowercases", () => {
    setEnv(" Alice@Example.COM , bob@example.com ");
    expect(getAdminEmails()).toEqual(["alice@example.com", "bob@example.com"]);
  });

  it("drops empty entries from stray or trailing commas", () => {
    setEnv(",alice@example.com,,bob@example.com,");
    expect(getAdminEmails()).toEqual(["alice@example.com", "bob@example.com"]);
  });

  it("returns nothing for an unset, empty or whitespace-only var", () => {
    expect(getAdminEmails()).toEqual([]);
    setEnv("");
    expect(getAdminEmails()).toEqual([]);
    setEnv("   ");
    expect(getAdminEmails()).toEqual([]);
    setEnv(",,,");
    expect(getAdminEmails()).toEqual([]);
  });

  it("reads the env var on every call, not once at import", () => {
    setEnv("alice@example.com");
    expect(getAdminEmails()).toEqual(["alice@example.com"]);
    setEnv("bob@example.com");
    expect(getAdminEmails()).toEqual(["bob@example.com"]);
  });
});

describe("isAdminEmail", () => {
  beforeEach(() => setEnv("Alice@Example.com, bob@example.com"));

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    expect(isAdminEmail("alice@example.com")).toBe(true);
    expect(isAdminEmail("ALICE@EXAMPLE.COM")).toBe(true);
    expect(isAdminEmail("  Bob@Example.com  ")).toBe(true);
  });

  it("refuses a non-listed address", () => {
    expect(isAdminEmail("mallory@example.com")).toBe(false);
    expect(isAdminEmail("alice@example.com.evil.example")).toBe(false);
    expect(isAdminEmail("xalice@example.com")).toBe(false);
  });

  it("refuses missing, empty and whitespace-only addresses", () => {
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
    expect(isAdminEmail("")).toBe(false);
    expect(isAdminEmail("   ")).toBe(false);
  });

  it("grants nobody when the var is unset, even an empty-looking address", () => {
    setEnv(undefined);
    expect(isAdminEmail("alice@example.com")).toBe(false);
    expect(isAdminEmail("")).toBe(false);
    setEnv(",, ,");
    expect(isAdminEmail("alice@example.com")).toBe(false);
  });
});

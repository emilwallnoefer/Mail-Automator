import { describe, expect, it } from "vitest";
import { DEFAULT_REDIRECT_PATH, safeRedirectPath } from "./safe-redirect";

const FALLBACK = DEFAULT_REDIRECT_PATH;

describe("safeRedirectPath", () => {
  it("keeps ordinary rooted paths", () => {
    expect(safeRedirectPath("/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath("/settings")).toBe("/settings");
    expect(safeRedirectPath("/dashboard?tab=time#week")).toBe("/dashboard?tab=time#week");
    expect(safeRedirectPath("/")).toBe("/");
  });

  it("rejects absolute URLs (the F3 open redirect)", () => {
    expect(safeRedirectPath("https://evil.example")).toBe(FALLBACK);
    expect(safeRedirectPath("http://evil.example/phish")).toBe(FALLBACK);
    expect(safeRedirectPath("HTTPS://evil.example")).toBe(FALLBACK);
    expect(safeRedirectPath("javascript:alert(1)")).toBe(FALLBACK);
    expect(safeRedirectPath("data:text/html,<script>alert(1)</script>")).toBe(FALLBACK);
  });

  it("rejects protocol-relative and backslash-smuggled targets", () => {
    expect(safeRedirectPath("//evil.example")).toBe(FALLBACK);
    expect(safeRedirectPath("//evil.example/path")).toBe(FALLBACK);
    expect(safeRedirectPath("/\\evil.example")).toBe(FALLBACK);
    expect(safeRedirectPath("\\\\evil.example")).toBe(FALLBACK);
    expect(safeRedirectPath("/\\/evil.example")).toBe(FALLBACK);
  });

  it("rejects unrooted paths", () => {
    expect(safeRedirectPath("dashboard")).toBe(FALLBACK);
    expect(safeRedirectPath("evil.example")).toBe(FALLBACK);
  });

  it("rejects control characters that browsers strip before navigating", () => {
    expect(safeRedirectPath("/foo\nhttps://evil.example")).toBe(FALLBACK);
    expect(safeRedirectPath("/foo\rbar")).toBe(FALLBACK);
    expect(safeRedirectPath("/\tevil")).toBe(FALLBACK);
    // A plain space is not a control character and stays same-origin (the URL
    // parser percent-encodes it), so it is allowed through unchanged.
    expect(safeRedirectPath("/a b")).toBe("/a b");
  });

  it("falls back on empty and missing values", () => {
    expect(safeRedirectPath(null)).toBe(FALLBACK);
    expect(safeRedirectPath(undefined)).toBe(FALLBACK);
    expect(safeRedirectPath("")).toBe(FALLBACK);
    expect(safeRedirectPath("   ")).toBe(FALLBACK);
  });

  it("honours a caller-supplied fallback", () => {
    expect(safeRedirectPath("https://evil.example", "/login")).toBe("/login");
  });

  it("resolves to our own origin once validated", () => {
    const origin = "https://app.example.com";
    for (const candidate of ["https://evil.example", "//evil.example", "/\\evil.example"]) {
      const resolved = new URL(safeRedirectPath(candidate), origin);
      expect(resolved.origin).toBe(origin);
    }
  });
});

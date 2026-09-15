import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The guards are the single most important security invariant in the app: every
 * `/api/admin/*` route starts with one, and only then may touch the
 * service-role client. Supabase, the security-event writer and the breach
 * alerter are all faked here — what is under test is the decision.
 */

let currentUser: Record<string, unknown> | null = null;
let requestHeaders: Record<string, string> = {};

type SecurityEvent = { kind: string; actor_email: string; ip: string | null; user_agent: string | null; detail: unknown };

const getUser = vi.fn(async () => ({ data: { user: currentUser } }));
const recordSecurityEvent = vi.fn(async (_client: unknown, _event: SecurityEvent) => {});
const maybeAlertAdmins = vi.fn(async (_client: unknown, _event: SecurityEvent) => {});
const createAdminClient = vi.fn(() => ({ kind: "service-role" }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createAdminClient(),
}));
vi.mock("@/lib/security/security-events", () => ({
  recordSecurityEvent: (client: unknown, event: SecurityEvent) => recordSecurityEvent(client, event),
}));
vi.mock("@/lib/security/breach-alert", () => ({
  maybeAlertAdmins: (client: unknown, event: SecurityEvent) => maybeAlertAdmins(client, event),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(requestHeaders),
}));

const { guardAdmin, guardTimeViewer } = await import("./admin-guard");

const ADMIN_EMAILS = process.env.ADMIN_EMAILS;

type FakeUser = { id?: string; email?: string | null; app_metadata?: unknown; user_metadata?: unknown };

function signedInAs(user: FakeUser | null) {
  currentUser = user === null ? null : { id: "u1", email: null, app_metadata: {}, ...user };
}

beforeEach(() => {
  process.env.ADMIN_EMAILS = "Boss@Example.com";
  requestHeaders = {};
  currentUser = null;
  recordSecurityEvent.mockClear();
  maybeAlertAdmins.mockClear();
  recordSecurityEvent.mockResolvedValue(undefined);
});

afterEach(() => {
  if (ADMIN_EMAILS === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = ADMIN_EMAILS;
});

describe("guardAdmin", () => {
  it("401s an anonymous request without logging a security event", async () => {
    signedInAs(null);
    const result = await guardAdmin();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.response.status).toBe(401);
    // Anonymous 401s are noise and are deliberately not recorded.
    expect(recordSecurityEvent).not.toHaveBeenCalled();
  });

  it("admits a listed admin regardless of email casing", async () => {
    signedInAs({ id: "u9", email: "BOSS@example.COM" });
    const result = await guardAdmin();
    expect(result).toEqual({ ok: true, user: { id: "u9", email: "BOSS@example.COM" } });
    expect(recordSecurityEvent).not.toHaveBeenCalled();
  });

  it("403s a signed-in non-admin and records the attempt", async () => {
    signedInAs({ id: "u2", email: "member@example.com" });
    const result = await guardAdmin();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.response.status).toBe(403);
    expect(await result.response.json()).toEqual({ error: "Forbidden" });
    expect(recordSecurityEvent).toHaveBeenCalledTimes(1);
    expect(recordSecurityEvent.mock.calls[0][1]).toMatchObject({
      kind: "failed_admin_access",
      actor_email: "member@example.com",
      detail: { route: "guardAdmin" },
    });
    expect(maybeAlertAdmins).toHaveBeenCalledTimes(1);
  });

  it("403s when ADMIN_EMAILS is unset — an empty allowlist admits nobody", async () => {
    delete process.env.ADMIN_EMAILS;
    signedInAs({ id: "u2", email: "boss@example.com" });
    expect((await guardAdmin()).ok).toBe(false);
  });

  it("records the client IP from x-real-ip, else the first x-forwarded-for hop", async () => {
    signedInAs({ id: "u2", email: "member@example.com" });
    requestHeaders = { "x-real-ip": "203.0.113.9", "user-agent": "curl/8" };
    await guardAdmin();
    expect(recordSecurityEvent.mock.calls[0][1]).toMatchObject({
      ip: "203.0.113.9",
      user_agent: "curl/8",
    });

    recordSecurityEvent.mockClear();
    requestHeaders = { "x-forwarded-for": " 198.51.100.4 , 10.0.0.1 " };
    await guardAdmin();
    expect(recordSecurityEvent.mock.calls[0][1]).toMatchObject({ ip: "198.51.100.4", user_agent: null });
  });

  it("still returns 403 when the audit write blows up", async () => {
    // Best-effort logging must never turn a 403 into a 500.
    recordSecurityEvent.mockRejectedValueOnce(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    signedInAs({ id: "u2", email: "member@example.com" });
    const result = await guardAdmin();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.response.status).toBe(403);
    spy.mockRestore();
  });

  it("falls back to 'unknown' as the actor when the session carries no email", async () => {
    signedInAs({ id: "u3", email: null });
    const result = await guardAdmin();
    expect(result.ok).toBe(false);
    expect(recordSecurityEvent.mock.calls[0][1]).toMatchObject({ actor_email: "unknown" });
  });
});

describe("guardTimeViewer", () => {
  it("401s an anonymous request", async () => {
    signedInAs(null);
    const result = await guardTimeViewer();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.response.status).toBe(401);
  });

  it("admits hr from app_metadata, flagged as hr and not admin", async () => {
    signedInAs({ id: "u4", email: "hr@example.com", app_metadata: { role: "hr" } });
    const result = await guardTimeViewer();
    expect(result).toEqual({
      ok: true,
      user: { id: "u4", email: "hr@example.com" },
      isAdmin: false,
      isHr: true,
    });
  });

  it("admits an admin who has no role at all", async () => {
    signedInAs({ id: "u5", email: "boss@example.com" });
    const result = await guardTimeViewer();
    expect(result).toMatchObject({ ok: true, isAdmin: true, isHr: false });
  });

  it("flags an admin who is also hr as both", async () => {
    signedInAs({ id: "u6", email: "boss@example.com", app_metadata: { role: "hr" } });
    expect(await guardTimeViewer()).toMatchObject({ ok: true, isAdmin: true, isHr: true });
  });

  it("IGNORES user_metadata.role — users can rewrite it themselves", async () => {
    // SECURITY.md T0.1: the role must be read from app_metadata (service-role
    // writable only). A self-assigned `hr` in user_metadata must not open the
    // door to everyone else's day-level time records.
    signedInAs({ id: "u7", email: "member@example.com", user_metadata: { role: "hr" } });
    const result = await guardTimeViewer();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.response.status).toBe(403);
    expect(recordSecurityEvent.mock.calls[0][1]).toMatchObject({ detail: { route: "guardTimeViewer" } });
  });

  it("refuses every non-hr role", async () => {
    for (const role of ["sales", "eu_pilot", "us_pilot", "pilot", "HR", "hr_admin", "", null]) {
      signedInAs({ id: "u8", email: "member@example.com", app_metadata: { role } });
      const result = await guardTimeViewer();
      expect(result.ok, `role ${JSON.stringify(role)} must not pass`).toBe(false);
    }
  });

  it("survives an app_metadata that is not a plain object", async () => {
    for (const metadata of [null, undefined, ["hr"], "hr", 7]) {
      signedInAs({ id: "u8", email: "member@example.com", app_metadata: metadata });
      expect((await guardTimeViewer()).ok).toBe(false);
    }
  });
});

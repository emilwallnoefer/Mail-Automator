import "server-only";

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin";
import { normalizeUserRole } from "@/lib/user-role";
import { recordSecurityEvent } from "@/lib/security/security-events";
import { maybeAlertAdmins } from "@/lib/security/breach-alert";

/**
 * Record a blocked admin-route attempt by a logged-in-but-unauthorized user and
 * evaluate it for a breach alert. Best-effort: never throws, so it can't turn a
 * 403 into a 500. Only called for authenticated non-admins — anonymous 401s are
 * noise and are intentionally not logged.
 */
async function reportFailedAdminAccess(email: string, route: string): Promise<void> {
  try {
    let ip: string | null = null;
    let userAgent: string | null = null;
    try {
      const h = await headers();
      ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
      userAgent = h.get("user-agent");
    } catch {
      /* headers() unavailable outside a request scope — record without them */
    }

    const admin = createAdminClient();
    const event = {
      kind: "failed_admin_access" as const,
      actor_email: email,
      ip,
      user_agent: userAgent,
      detail: { route },
    };
    await recordSecurityEvent(admin, event);
    await maybeAlertAdmins(admin, event);
  } catch (error) {
    console.error("reportFailedAdminAccess threw", error);
  }
}

export type AdminGuardSuccess = {
  ok: true;
  user: { id: string; email: string };
};

export type AdminGuardFailure = {
  ok: false;
  response: NextResponse;
};

/**
 * Verifies the current request is from an admin (email listed in `ADMIN_EMAILS`).
 * Returns either the authed admin user, or a ready-to-return error response.
 */
export async function guardAdmin(): Promise<AdminGuardSuccess | AdminGuardFailure> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!isAdminEmail(user.email)) {
    await reportFailedAdminAccess(user.email ?? "unknown", "guardAdmin");
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, user: { id: user.id, email: user.email ?? "" } };
}

export type TimeViewerGuardSuccess = {
  ok: true;
  user: { id: string; email: string };
  isAdmin: boolean;
  isHr: boolean;
};

/**
 * Verifies the current request is from someone allowed to see other people's time
 * data: either an admin (via `ADMIN_EMAILS`) or a user with the `hr` role in
 * `app_metadata`.
 *
 * SCOPE — read this before adding a route behind this guard. HR is **read-only**
 * (no route behind this guard exports POST/PATCH/DELETE; every mutating admin
 * route uses `guardAdmin` instead), but "read-only" is not "summaries only".
 * A time viewer can currently reach, for ANY employee:
 *   - `/api/admin/time-overview` — per-user weekly totals, overtime bank, missing days
 *   - `/api/admin/onboarding`    — the full user directory and per-section progress
 *   - `/api/admin/time-user`     — **day-level detail**: start/stop times, break
 *     names, sick leave, and free-text comp-adjustment notes
 *
 * That day-level scope is deliberate and was confirmed as correct for HR
 * (security audit run-3, H8). It is also why `/api/admin/time-user` writes an
 * `employee_record_view` row to `admin_audit_log`: the access is legitimate, and
 * it is still worth knowing who looked at whose record.
 *
 * If you put a new route behind this guard, assume HR will read everything it
 * returns, and audit-log it if it exposes an individual's personal data.
 */
export async function guardTimeViewer(): Promise<TimeViewerGuardSuccess | AdminGuardFailure> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  // Role lives in app_metadata (service-role writable only), NOT user_metadata,
  // which the user can rewrite themselves via updateUser. See SECURITY.md T0.1.
  const metadata =
    user.app_metadata && typeof user.app_metadata === "object" && !Array.isArray(user.app_metadata)
      ? (user.app_metadata as Record<string, unknown>)
      : {};
  const role = normalizeUserRole(metadata.role);
  const isAdmin = isAdminEmail(user.email);
  const isHr = role === "hr";
  if (!isAdmin && !isHr) {
    await reportFailedAdminAccess(user.email ?? "unknown", "guardTimeViewer");
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return {
    ok: true,
    user: { id: user.id, email: user.email ?? "" },
    isAdmin,
    isHr,
  };
}

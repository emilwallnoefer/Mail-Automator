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
 * Verifies the current request is from someone allowed to see aggregated time data:
 * either an admin (via `ADMIN_EMAILS`) or a user with the `hr` role in metadata.
 * HR is read-only: they can only view summaries, not manage roles.
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
  const metadata =
    user.user_metadata && typeof user.user_metadata === "object" && !Array.isArray(user.user_metadata)
      ? (user.user_metadata as Record<string, unknown>)
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

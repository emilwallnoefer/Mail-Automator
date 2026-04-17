import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { normalizeUserRole } from "@/lib/user-role";

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

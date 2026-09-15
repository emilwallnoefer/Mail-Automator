import "server-only";

import { headers } from "next/headers";
import { getAdminEmails } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { isResendConfigured, sendEmailViaResend } from "@/lib/email/resend";
import { renderRoleAssignmentNotice } from "@/lib/role-assignment-notice-email";

/**
 * Tells the admins that a new account is sitting on the "waiting for access"
 * screen, exactly once per account.
 *
 * Roles are only ever written by the guardAdmin()-protected
 * PATCH /api/admin/users, so a fresh sign-in has no role and no way to give
 * itself one. This is the nudge that gets a human to assign it.
 *
 * ONCE-ONLY. `role_assignment_notices.user_id` is the table's primary key and
 * the row is INSERTed *before* Resend is called. A second page load (or a
 * second tab racing the first) loses that insert and returns without mailing.
 * Same claim-before-send shape as the fleet return reminder — see
 * `supabase/2026-09-15-role-assignment-notice.sql`.
 *
 * BEST EFFORT. This runs inside a page render, so it must never throw: a
 * missing service-role key, an unapplied migration or a Resend outage all end
 * as a `console.warn`. The user stays blocked either way — which is the safe
 * state — and the admin can still find them in Admin -> Users & roles.
 */
export type RoleAssignmentNoticeOutcome =
  | "sent"
  | "already_notified"
  | "no_admins"
  | "not_configured"
  | "failed";

/** Absolute origin of this deployment, for the link inside the mail. */
async function resolveBaseUrl(): Promise<string | null> {
  const fromEnv = process.env.APP_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return null;
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export async function notifyAdminsOfPendingRole(params: {
  userId: string;
  email: string;
  name?: string | null;
}): Promise<RoleAssignmentNoticeOutcome> {
  const { userId, email } = params;
  if (!userId || !email) return "failed";

  try {
    const recipients = getAdminEmails();
    if (recipients.length === 0) {
      console.warn("Role assignment notice: ADMIN_EMAILS is empty, nobody to tell about", email);
      return "no_admins";
    }

    const admin = createAdminClient();

    // CLAIM FIRST. Losing this insert means the notice already went out.
    //
    // Only a unique violation means that, though. Every other failure —
    // above all `42P01 undefined_table`, i.e. the migration in
    // `supabase/2026-09-15-role-assignment-notice.sql` was never applied —
    // must be loud. Treating those as "already notified" would silently mean
    // no admin is ever told about any new account, and nothing would say so.
    const { error: claimError } = await admin.from("role_assignment_notices").insert({
      user_id: userId,
      email,
      status: "sending",
      recipients,
    });
    if (claimError) {
      if (claimError.code === "23505") return "already_notified";
      console.warn(
        "Role assignment notice: could not claim the send for",
        email,
        `— [${claimError.code ?? "unknown"}] ${claimError.message}.`,
        claimError.code === "42P01"
          ? "The role_assignment_notices table does not exist: apply supabase/2026-09-15-role-assignment-notice.sql."
          : "Nobody has been mailed; assign the role from Admin -> Users & roles.",
      );
      return "failed";
    }

    if (!isResendConfigured()) {
      console.warn(
        "Role assignment notice: Resend is not configured, no mail sent for",
        email,
        "— assign the role from Admin -> Users & roles.",
      );
      await markNotice(admin, userId, "failed", null, "Resend is not configured.");
      return "not_configured";
    }

    const baseUrl = await resolveBaseUrl();
    if (!baseUrl) {
      console.warn("Role assignment notice: could not resolve an app base URL for", email);
      await markNotice(admin, userId, "failed", null, "Could not resolve APP_BASE_URL.");
      return "failed";
    }

    const mail = renderRoleAssignmentNotice({ email, name: params.name ?? null, baseUrl });

    const results = await Promise.all(
      recipients.map((to) => sendEmailViaResend({ to, ...mail })),
    );
    const delivered = results.filter((r) => r.ok);
    const failures = results.filter((r): r is { ok: false; error: string } => !r.ok);

    if (delivered.length === 0) {
      console.warn(
        "Role assignment notice: every send failed for",
        email,
        failures.map((f) => f.error).join("; "),
      );
      await markNotice(admin, userId, "failed", null, failures.map((f) => f.error).join("; ") || "Unknown error");
      return "failed";
    }

    if (failures.length > 0) {
      console.warn(
        "Role assignment notice: partial delivery for",
        email,
        failures.map((f) => f.error).join("; "),
      );
    }

    await markNotice(
      admin,
      userId,
      "sent",
      delivered[0].ok ? delivered[0].id : null,
      failures.length > 0 ? failures.map((f) => f.error).join("; ") : null,
    );
    return "sent";
  } catch (error) {
    // Never let a notification failure break the page the blocked user is
    // looking at. The blocked state itself is what protects the workspace.
    console.warn("Role assignment notice threw for", email, (error as Error).message);
    return "failed";
  }
}

async function markNotice(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  status: "sent" | "failed",
  messageId: string | null,
  error: string | null,
): Promise<void> {
  try {
    await admin
      .from("role_assignment_notices")
      .update({ status, message_id: messageId, error, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
  } catch (err) {
    console.warn("Role assignment notice: could not record outcome", (err as Error).message);
  }
}

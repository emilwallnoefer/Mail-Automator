import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Application-level admin action types. Keep these stable — the UI maps them to
 * human labels. Distinct from the DB-trigger `time_tracker_audit_log`.
 */
export type AdminAuditAction =
  | "role_change"
  | "reminder_pause"
  | "reminder_resume"
  | "mail_brief_model_change";

export type AdminAuditEntry = {
  id: number;
  actor_email: string | null;
  action: string;
  target: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
};

/**
 * Best-effort insert into `admin_audit_log`. Deliberately never throws: an
 * audit write must not be able to fail the mutation it accompanies (a role
 * change should still succeed even if the audit table is missing or the insert
 * errors). Failures are logged server-side only.
 */
export async function recordAdminAudit(
  admin: SupabaseClient,
  entry: {
    actor_email: string | null;
    action: AdminAuditAction;
    target?: string | null;
    detail?: Record<string, unknown> | null;
  },
): Promise<void> {
  try {
    const { error } = await admin.from("admin_audit_log").insert({
      actor_email: entry.actor_email,
      action: entry.action,
      target: entry.target ?? null,
      detail: entry.detail ?? null,
    });
    if (error) {
      console.error("admin_audit_log insert failed", error);
    }
  } catch (error) {
    console.error("admin_audit_log insert threw", error);
  }
}

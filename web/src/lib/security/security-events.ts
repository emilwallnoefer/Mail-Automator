import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Security-event kinds. Keep these stable — the admin UI maps them to human
 * labels. This is the detection layer from web/SECURITY.md (Tier 2): it records
 * probing/abuse so an admin can see it, distinct from the deliberate-action
 * `admin_audit_log`.
 */
export type SecurityEventKind =
  | "failed_admin_access" // a logged-in non-admin hit a guarded route
  | "rate_limit_tripped" // a rate limiter rejected a request
  | "oauth_failure" // an OAuth connect/callback failed
  | "suspicious_login"; // reserved extension point

export type SecuritySeverity = "info" | "warning" | "critical";

/** Default severity per kind, so callers don't have to repeat it. */
const DEFAULT_SEVERITY: Record<SecurityEventKind, SecuritySeverity> = {
  failed_admin_access: "warning",
  rate_limit_tripped: "info",
  oauth_failure: "warning",
  suspicious_login: "critical",
};

export type SecurityEventInput = {
  kind: SecurityEventKind;
  severity?: SecuritySeverity;
  actor_email?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  detail?: Record<string, unknown> | null;
};

export type SecurityEventEntry = {
  id: number;
  kind: string;
  severity: string;
  actor_email: string | null;
  ip: string | null;
  user_agent: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
};

export function severityForKind(kind: SecurityEventKind): SecuritySeverity {
  return DEFAULT_SEVERITY[kind];
}

/**
 * Best-effort insert into `security_events`. Deliberately never throws: logging
 * a security event must not be able to fail the request it accompanies (a 403
 * should still return even if the events table is missing or the insert errors).
 * Failures are logged server-side only. Returns the inserted row's severity so
 * callers can drive alerting without re-deriving it.
 */
export async function recordSecurityEvent(
  admin: SupabaseClient,
  event: SecurityEventInput,
): Promise<{ recorded: boolean; severity: SecuritySeverity }> {
  const severity = event.severity ?? severityForKind(event.kind);
  try {
    const { error } = await admin.from("security_events").insert({
      kind: event.kind,
      severity,
      actor_email: event.actor_email ?? null,
      ip: event.ip ?? null,
      user_agent: event.user_agent ? event.user_agent.slice(0, 1000) : null,
      detail: event.detail ?? null,
    });
    if (error) {
      console.error("security_events insert failed", error);
      return { recorded: false, severity };
    }
  } catch (error) {
    console.error("security_events insert threw", error);
    return { recorded: false, severity };
  }
  return { recorded: true, severity };
}

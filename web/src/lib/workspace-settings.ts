import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Typed shape of the single-row `workspace_settings` table. Add fields here
 * (and a matching column in `supabase/2026-04-17-workspace-settings.sql`)
 * when the admin settings surface grows. Keep `id = 1` implicit — callers
 * should never need to think about it.
 */
export type WorkspaceSettings = {
  reminder_paused: boolean;
  reminder_paused_at: string | null;
  reminder_paused_by: string | null;
  /** Claude model for mail Brief mode; null = fall back to env / built-in default. */
  mail_brief_model: string | null;
  /** Master on/off for breach-alert emails to admins. */
  security_alerts_enabled: boolean;
  /** # of failed_admin_access from one actor within the window that triggers an alert. */
  security_alert_threshold: number;
  /** Debounce: last time a breach alert was emailed (null = never). */
  security_alert_last_sent_at: string | null;
  updated_at: string;
};

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  reminder_paused: false,
  reminder_paused_at: null,
  reminder_paused_by: null,
  mail_brief_model: null,
  security_alerts_enabled: true,
  security_alert_threshold: 5,
  security_alert_last_sent_at: null,
  updated_at: new Date(0).toISOString(),
};

/** Fields an admin can patch; write merges these over the current row. */
export type WorkspaceSettingsPatch = {
  reminder_paused?: boolean;
  mail_brief_model?: string | null;
  security_alerts_enabled?: boolean;
  security_alert_threshold?: number;
};

/**
 * Read the singleton settings row. Returns a permissive default if the
 * table is missing (migration not applied yet) or the row is absent so
 * the app never hard-fails on a cold install.
 */
export async function readWorkspaceSettings(
  admin: SupabaseClient,
): Promise<WorkspaceSettings> {
  const { data, error } = await admin
    .from("workspace_settings")
    .select(
      "reminder_paused, reminder_paused_at, reminder_paused_by, mail_brief_model, security_alerts_enabled, security_alert_threshold, security_alert_last_sent_at, updated_at",
    )
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    console.error("workspace_settings read failed", error);
    return DEFAULT_WORKSPACE_SETTINGS;
  }
  if (!data) return DEFAULT_WORKSPACE_SETTINGS;
  return {
    reminder_paused: Boolean(data.reminder_paused),
    reminder_paused_at: data.reminder_paused_at ?? null,
    reminder_paused_by: data.reminder_paused_by ?? null,
    mail_brief_model: (data.mail_brief_model as string | null) ?? null,
    security_alerts_enabled:
      data.security_alerts_enabled ?? DEFAULT_WORKSPACE_SETTINGS.security_alerts_enabled,
    security_alert_threshold:
      (data.security_alert_threshold as number | null) ??
      DEFAULT_WORKSPACE_SETTINGS.security_alert_threshold,
    security_alert_last_sent_at: data.security_alert_last_sent_at ?? null,
    updated_at: data.updated_at ?? DEFAULT_WORKSPACE_SETTINGS.updated_at,
  };
}

/**
 * Merge a partial patch over the current settings row and upsert it. Only the
 * fields present in `patch` change; everything else is preserved (read-modify-
 * write, since the singleton row holds multiple independent settings).
 *
 * `actor_email` is recorded as the pauser only when the reminder is being
 * paused (so we can audit who hit the kill-switch); resuming clears both pause
 * metadata fields. Pause metadata is left untouched when the patch does not
 * change `reminder_paused` (e.g. a model-only update).
 */
export async function writeWorkspaceSettings(
  admin: SupabaseClient,
  patch: WorkspaceSettingsPatch,
  actor_email: string,
): Promise<WorkspaceSettings> {
  const current = await readWorkspaceSettings(admin);
  const now = new Date().toISOString();

  const reminderPaused = patch.reminder_paused ?? current.reminder_paused;
  let reminderPausedAt = current.reminder_paused_at;
  let reminderPausedBy = current.reminder_paused_by;
  if (patch.reminder_paused !== undefined) {
    reminderPausedAt = patch.reminder_paused ? now : null;
    reminderPausedBy = patch.reminder_paused ? actor_email : null;
  }

  const mailBriefModel =
    patch.mail_brief_model !== undefined ? patch.mail_brief_model : current.mail_brief_model;

  const securityAlertsEnabled =
    patch.security_alerts_enabled !== undefined
      ? patch.security_alerts_enabled
      : current.security_alerts_enabled;
  const securityAlertThreshold =
    patch.security_alert_threshold !== undefined
      ? patch.security_alert_threshold
      : current.security_alert_threshold;

  const row = {
    id: 1,
    reminder_paused: reminderPaused,
    reminder_paused_at: reminderPausedAt,
    reminder_paused_by: reminderPausedBy,
    mail_brief_model: mailBriefModel,
    security_alerts_enabled: securityAlertsEnabled,
    security_alert_threshold: securityAlertThreshold,
    // Debounce state is managed by the alerting path, never by an admin patch;
    // preserve whatever is currently stored.
    security_alert_last_sent_at: current.security_alert_last_sent_at,
    updated_at: now,
  };
  const { data, error } = await admin
    .from("workspace_settings")
    .upsert(row, { onConflict: "id" })
    .select(
      "reminder_paused, reminder_paused_at, reminder_paused_by, mail_brief_model, security_alerts_enabled, security_alert_threshold, security_alert_last_sent_at, updated_at",
    )
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) return { ...current, ...row, updated_at: now };
  return {
    reminder_paused: Boolean(data.reminder_paused),
    reminder_paused_at: data.reminder_paused_at ?? null,
    reminder_paused_by: data.reminder_paused_by ?? null,
    mail_brief_model: (data.mail_brief_model as string | null) ?? null,
    security_alerts_enabled:
      data.security_alerts_enabled ?? securityAlertsEnabled,
    security_alert_threshold:
      (data.security_alert_threshold as number | null) ?? securityAlertThreshold,
    security_alert_last_sent_at: data.security_alert_last_sent_at ?? null,
    updated_at: data.updated_at ?? now,
  };
}

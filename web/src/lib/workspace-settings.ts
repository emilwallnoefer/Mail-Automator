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
  updated_at: string;
};

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  reminder_paused: false,
  reminder_paused_at: null,
  reminder_paused_by: null,
  updated_at: new Date(0).toISOString(),
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
    .select("reminder_paused, reminder_paused_at, reminder_paused_by, updated_at")
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
    updated_at: data.updated_at ?? DEFAULT_WORKSPACE_SETTINGS.updated_at,
  };
}

/**
 * Upsert the singleton settings row. `actor_email` is recorded only when
 * the reminder is being paused (so we can audit who hit the kill-switch);
 * resuming clears both pause metadata fields.
 */
export async function writeWorkspaceSettings(
  admin: SupabaseClient,
  patch: { reminder_paused: boolean },
  actor_email: string,
): Promise<WorkspaceSettings> {
  const now = new Date().toISOString();
  const row = {
    id: 1,
    reminder_paused: patch.reminder_paused,
    reminder_paused_at: patch.reminder_paused ? now : null,
    reminder_paused_by: patch.reminder_paused ? actor_email : null,
    updated_at: now,
  };
  const { data, error } = await admin
    .from("workspace_settings")
    .upsert(row, { onConflict: "id" })
    .select("reminder_paused, reminder_paused_at, reminder_paused_by, updated_at")
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) return { ...DEFAULT_WORKSPACE_SETTINGS, ...patch, updated_at: now };
  return {
    reminder_paused: Boolean(data.reminder_paused),
    reminder_paused_at: data.reminder_paused_at ?? null,
    reminder_paused_by: data.reminder_paused_by ?? null,
    updated_at: data.updated_at ?? now,
  };
}

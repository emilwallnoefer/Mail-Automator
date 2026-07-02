import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server-only access to Gmail OAuth refresh tokens.
 *
 * Refresh tokens live in the service-role-only `public.gmail_tokens` table
 * (never in user_metadata / the JWT). All access goes through the service-role
 * admin client, so callers must already have verified the acting user.
 */

const TABLE = "gmail_tokens";

/**
 * Returns the stored Gmail refresh token for a user, or null if none exists
 * (or on any read failure — callers treat "no token" as "not connected").
 */
export async function readGmailRefreshToken(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(TABLE)
    .select("refresh_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const token = (data as { refresh_token?: string }).refresh_token;
  return token && token.length > 0 ? token : null;
}

/**
 * Upserts the Gmail refresh token (and optional gmail_email) for a user.
 */
export async function saveGmailToken(
  userId: string,
  { refresh_token, gmail_email }: { refresh_token: string; gmail_email?: string | null },
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from(TABLE)
    .upsert(
      {
        user_id: userId,
        refresh_token,
        gmail_email: gmail_email ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  if (error) throw new Error(`Failed to save Gmail token: ${error.message}`);
}

/**
 * Deletes the stored Gmail refresh token for a user (on disconnect).
 */
export async function deleteGmailToken(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from(TABLE).delete().eq("user_id", userId);
  if (error) throw new Error(`Failed to delete Gmail token: ${error.message}`);
}

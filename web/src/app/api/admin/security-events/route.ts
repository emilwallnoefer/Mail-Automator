import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { readWorkspaceSettings } from "@/lib/workspace-settings";
import type { SecurityEventEntry } from "@/lib/security/security-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 100;

export async function GET() {
  const guard = await guardAdmin();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("security_events")
    .select("id, kind, severity, actor_email, ip, user_agent, detail, created_at")
    .order("created_at", { ascending: false })
    .limit(DEFAULT_LIMIT);

  // Surface the current alert config alongside the feed so the UI can render the
  // toggle without a second request. Read is best-effort: a missing table (not
  // migrated yet) yields an empty feed + default settings rather than an error.
  const settings = await readWorkspaceSettings(admin);
  const alerts = {
    enabled: settings.security_alerts_enabled,
    threshold: settings.security_alert_threshold,
    last_sent_at: settings.security_alert_last_sent_at,
  };

  if (error) {
    console.error("security_events read failed", error);
    return NextResponse.json({ entries: [] as SecurityEventEntry[], alerts });
  }

  return NextResponse.json({
    entries: (data as SecurityEventEntry[] | null) ?? [],
    alerts,
  });
}

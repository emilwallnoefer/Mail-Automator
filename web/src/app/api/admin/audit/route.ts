import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminAuditEntry } from "@/lib/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 100;

export async function GET() {
  const guard = await guardAdmin();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_audit_log")
    .select("id, actor_email, action, target, detail, created_at")
    .order("created_at", { ascending: false })
    .limit(DEFAULT_LIMIT);

  if (error) {
    // Table may not be migrated yet — return an empty feed so the UI renders a
    // "no activity" state instead of erroring (mirrors the insights route).
    console.error("admin_audit_log read failed", error);
    return NextResponse.json({ entries: [] as AdminAuditEntry[] });
  }

  return NextResponse.json({ entries: (data as AdminAuditEntry[] | null) ?? [] });
}

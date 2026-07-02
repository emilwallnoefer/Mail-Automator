import { NextResponse } from "next/server";
import { guardTimeViewer } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeUserRole, type UserRole } from "@/lib/user-role";
import {
  buildOnboardingSections,
  computeOnboardingSummary,
  type OnboardingProgressMap,
  type OnboardingSectionSummary,
} from "@/lib/onboarding";

type OnboardingUserSummary = {
  user_id: string;
  email: string;
  role: UserRole | null;
  percent: number;
  completed_items: number;
  total_items: number;
  completed_minutes: number;
  total_minutes: number;
  started_at: string | null;
  updated_at: string | null;
  sections: OnboardingSectionSummary[];
};

type ProgressRow = {
  user_id: string;
  progress: OnboardingProgressMap | null;
  started_at: string | null;
  updated_at: string | null;
};

function extractRole(metadata: unknown): UserRole | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const record = metadata as Record<string, unknown>;
  return normalizeUserRole(record.role);
}

export async function GET() {
  const guard = await guardTimeViewer();
  if (!guard.ok) return guard.response;

  const sections = buildOnboardingSections();
  const admin = createAdminClient();

  const users: Array<{ id: string; email: string; role: UserRole | null }> = [];
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const pageUsers = data?.users ?? [];
    for (const user of pageUsers) {
      users.push({
        id: user.id,
        email: user.email ?? "",
        role: extractRole(user.app_metadata),
      });
    }
    if (pageUsers.length < perPage) break;
    page += 1;
    if (page > 50) break;
  }

  const { data: progressRows, error: progressError } = await admin
    .from("onboarding_progress")
    .select("user_id, progress, started_at, updated_at");
  if (progressError) {
    return NextResponse.json({ error: progressError.message }, { status: 500 });
  }
  const progressByUserId = new Map<string, ProgressRow>(
    (progressRows as ProgressRow[] | null ?? []).map((row) => [row.user_id, row]),
  );

  const summaries: OnboardingUserSummary[] = users.map((user) => {
    const row = progressByUserId.get(user.id);
    const summary = computeOnboardingSummary(sections, row?.progress);
    return {
      user_id: user.id,
      email: user.email,
      role: user.role,
      percent: summary.percent,
      completed_items: summary.completedItems,
      total_items: summary.totalItems,
      completed_minutes: Math.round(summary.completedMinutes),
      total_minutes: summary.totalMinutes,
      started_at: row?.started_at ?? null,
      updated_at: row?.updated_at ?? null,
      sections: summary.sections,
    };
  });

  // Most progress first, then alphabetical — surfaces who's furthest behind/ahead.
  summaries.sort((a, b) => b.percent - a.percent || a.email.localeCompare(b.email));

  return NextResponse.json({
    total_items: summaries[0]?.total_items ?? sections.reduce((acc, s) => acc + s.items.length, 0),
    users: summaries,
  });
}

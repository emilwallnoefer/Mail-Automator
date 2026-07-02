import { NextResponse } from "next/server";
import { guardTimeViewer } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWeekStartDate, parseInteger, toDateString } from "@/lib/time-tracker-queries";
import { normalizeUserRole, type UserRole } from "@/lib/user-role";
import { TIME_TRACKER_TARGET_MINS } from "@/lib/time-tracker-rules";

type UserSummary = {
  user_id: string;
  email: string;
  role: UserRole | null;
  weekly_total_mins: number;
  overtime_bank_mins: number;
  missing_days: number;
  target_mins: number;
  error?: string;
};

type OverviewRow = {
  user_id: string;
  weekly_total_mins: number | string | null;
  missing_days: number | string | null;
  overtime_bank_mins: number | string | null;
  target_mins: number | string | null;
};

function extractRole(metadata: unknown): UserRole | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const record = metadata as Record<string, unknown>;
  return normalizeUserRole(record.role);
}

export async function GET(request: Request) {
  const guard = await guardTimeViewer();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const weekStartDate = getWeekStartDate(url.searchParams.get("week") ?? undefined);
  if (!weekStartDate) {
    return NextResponse.json({ error: "Invalid week date" }, { status: 400 });
  }
  const weekStartKey = toDateString(weekStartDate);

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

  const overviewRes = await admin.rpc("tt_admin_overview", { p_week_start: weekStartKey });
  let overviewByUserId = new Map<string, OverviewRow>();
  let aggregateError: string | null = null;
  if (overviewRes.error) {
    aggregateError = overviewRes.error.message || "Failed to load overview aggregates.";
  } else {
    overviewByUserId = new Map(
      (overviewRes.data as OverviewRow[] | null ?? []).map((row) => [row.user_id, row]),
    );
  }

  const summaries: UserSummary[] = users.map((user) => {
    const row = overviewByUserId.get(user.id);
    if (!row) {
      return {
        user_id: user.id,
        email: user.email,
        role: user.role,
        weekly_total_mins: 0,
        overtime_bank_mins: 0,
        missing_days: 0,
        target_mins: TIME_TRACKER_TARGET_MINS,
        ...(aggregateError ? { error: aggregateError } : {}),
      };
    }
    return {
      user_id: user.id,
      email: user.email,
      role: user.role,
      weekly_total_mins: parseInteger(row.weekly_total_mins),
      overtime_bank_mins: parseInteger(row.overtime_bank_mins),
      missing_days: parseInteger(row.missing_days),
      target_mins: parseInteger(row.target_mins, TIME_TRACKER_TARGET_MINS),
    };
  });

  summaries.sort((a, b) => a.email.localeCompare(b.email));

  return NextResponse.json({
    week_start: toDateString(weekStartDate),
    users: summaries,
  });
}

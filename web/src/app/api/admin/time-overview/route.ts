import { NextResponse } from "next/server";
import { guardTimeViewer } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  countMissingWeekdays,
  fetchWeekForUser,
  getWeekStartDate,
  toDateString,
} from "@/lib/time-tracker-queries";
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
        role: extractRole(user.user_metadata),
      });
    }
    if (pageUsers.length < perPage) break;
    page += 1;
    if (page > 50) break;
  }

  const summaries: UserSummary[] = await Promise.all(
    users.map(async (user): Promise<UserSummary> => {
      try {
        const week = await fetchWeekForUser(admin, user.id, weekStartDate, { includeBank: true });
        return {
          user_id: user.id,
          email: user.email,
          role: user.role,
          weekly_total_mins: week.week_hours_mins,
          overtime_bank_mins: week.overtime_bank_mins,
          missing_days: countMissingWeekdays(week.days),
          target_mins: week.target_mins,
        };
      } catch (error) {
        return {
          user_id: user.id,
          email: user.email,
          role: user.role,
          weekly_total_mins: 0,
          overtime_bank_mins: 0,
          missing_days: 0,
          target_mins: TIME_TRACKER_TARGET_MINS,
          error: (error as Error).message || "Failed to load week.",
        };
      }
    }),
  );

  summaries.sort((a, b) => a.email.localeCompare(b.email));

  return NextResponse.json({
    week_start: toDateString(weekStartDate),
    users: summaries,
  });
}

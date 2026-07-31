import { NextResponse } from "next/server";
import { z } from "zod";
import { guardTimeViewer } from "@/lib/admin-guard";
import { recordAdminAudit } from "@/lib/admin-audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchWeekForUser, getWeekStartDate } from "@/lib/time-tracker-queries";

const querySchema = z.object({
  user_id: z.string().uuid(),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(request: Request) {
  const guard = await guardTimeViewer();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    user_id: url.searchParams.get("user_id") ?? "",
    weekStart: url.searchParams.get("weekStart") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters." }, { status: 400 });
  }

  const weekStartDate = getWeekStartDate(parsed.data.weekStart);
  if (!weekStartDate) {
    return NextResponse.json({ error: "Invalid weekStart date" }, { status: 400 });
  }

  const admin = createAdminClient();

  const lookup = await admin.auth.admin.getUserById(parsed.data.user_id);
  if (lookup.error || !lookup.data?.user) {
    return NextResponse.json({ error: lookup.error?.message ?? "User not found" }, { status: 404 });
  }

  let week;
  try {
    week = await fetchWeekForUser(admin, parsed.data.user_id, weekStartDate, { includeBank: true });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to load tracker week" },
      { status: 500 },
    );
  }

  // This endpoint returns one employee's day-level record — start/stop times,
  // break names, sick leave and free-text comp notes. HR seeing that is the
  // intended design (see guardTimeViewer), but "intended" and "unrecorded" are
  // different things: log who looked at whose record. Best-effort by design —
  // recordAdminAudit never throws, so a failed audit write cannot break the read.
  await recordAdminAudit(admin, {
    actor_email: guard.user.email,
    action: "employee_record_view",
    target: lookup.data.user.email ?? parsed.data.user_id,
    detail: {
      week_start: week.week_start,
      viewer_role: guard.isAdmin ? "admin" : "hr",
    },
  });

  return NextResponse.json({
    week_start: week.week_start,
    week_end: week.week_end,
    target_mins: week.target_mins,
    week_hours_mins: week.week_hours_mins,
    overtime_bank_mins: week.overtime_bank_mins,
    days: week.days,
    travel_by_date: {},
    travel_debug: {
      status: "not_attempted" as const,
      message: "Travel info is not available in admin view.",
      fetched_dates: 0,
      week_matches: 0,
    },
    includes_travel: false,
    includes_bank: week.includes_bank,
    user: {
      id: lookup.data.user.id,
      email: lookup.data.user.email ?? "",
    },
  });
}

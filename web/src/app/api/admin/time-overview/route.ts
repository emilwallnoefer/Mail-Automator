import { NextResponse } from "next/server";
import { guardTimeViewer } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAdminTimeOverview } from "@/lib/admin-queries";
import { getWeekStartDate } from "@/lib/time-tracker-queries";
import { userRoleLabel } from "@/lib/user-role";
import { csvResponse, toCsv } from "@/lib/csv";

function fmtHM(mins: number) {
  const safe = Math.max(0, Math.round(mins));
  return `${Math.floor(safe / 60)}h ${String(safe % 60).padStart(2, "0")}m`;
}

function fmtSignedHM(mins: number) {
  return `${mins < 0 ? "-" : ""}${fmtHM(Math.abs(mins))}`;
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
  try {
    const overview = await fetchAdminTimeOverview(admin, weekStartDate);

    if (url.searchParams.get("format") === "csv") {
      const csv = toCsv(
        [
          "Email",
          "Role",
          "Weekly total",
          "Weekly total (min)",
          "Overtime bank",
          "Overtime bank (min)",
          "Missing days",
          "Target (min)",
        ],
        overview.users.map((user) => [
          user.email,
          userRoleLabel(user.role),
          fmtHM(user.weekly_total_mins),
          user.weekly_total_mins,
          fmtSignedHM(user.overtime_bank_mins),
          user.overtime_bank_mins,
          user.missing_days,
          user.target_mins,
        ]),
      );
      return csvResponse(csv, `time-overview-${overview.week_start}.csv`);
    }

    return NextResponse.json(overview);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

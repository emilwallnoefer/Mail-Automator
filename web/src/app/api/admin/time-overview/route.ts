import { NextResponse } from "next/server";
import { guardTimeViewer } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAdminTimeOverview } from "@/lib/admin-queries";
import { getWeekStartDate } from "@/lib/time-tracker-queries";

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
    return NextResponse.json(overview);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

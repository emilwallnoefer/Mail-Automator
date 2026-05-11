import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";

type TimelinePeriod = "day" | "week" | "month" | "year";
type TimelinePayload = {
  period: TimelinePeriod;
  anchor: string;
  range_start: string;
  range_end: string;
  buckets: Array<{
    bucket_start: string;
    mails_sent: number;
    real_clicks: number;
    bot_clicks: number;
  }>;
  totals: {
    mails_sent: number;
    real_clicks: number;
    bot_clicks: number;
  };
};

function isTimelinePeriod(value: string): value is TimelinePeriod {
  return value === "day" || value === "week" || value === "month" || value === "year";
}

export async function GET(request: Request) {
  const guard = await guardAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const periodRaw = url.searchParams.get("period") ?? "week";
  if (!isTimelinePeriod(periodRaw)) {
    return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  }

  const anchorRaw = url.searchParams.get("anchor") ?? new Date().toISOString().slice(0, 10);
  const anchorDate = new Date(anchorRaw);
  if (Number.isNaN(anchorDate.getTime())) {
    return NextResponse.json({ error: "Invalid anchor date" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("mail_click_timeline", {
    p_period: periodRaw,
    p_anchor: anchorDate.toISOString(),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const payload = (data ?? {
    period: periodRaw,
    anchor: anchorRaw,
    range_start: anchorDate.toISOString(),
    range_end: anchorDate.toISOString(),
    buckets: [],
    totals: { mails_sent: 0, real_clicks: 0, bot_clicks: 0 },
  }) as TimelinePayload;

  return NextResponse.json(payload);
}

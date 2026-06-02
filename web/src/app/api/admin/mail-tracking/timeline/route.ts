import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";

type TimelinePeriod = "day" | "week" | "month" | "year";
type BucketMail = {
  send_id: string;
  recipient_name: string;
  company_name: string | null;
  subject: string;
  real_clicks: number;
  bot_clicks: number;
};
type TimelineBucket = {
  bucket_start: string;
  mails_sent: number;
  real_clicks: number;
  bot_clicks: number;
  mails?: BucketMail[];
};
type TimelinePayload = {
  period: TimelinePeriod;
  anchor: string;
  range_start: string;
  range_end: string;
  buckets: TimelineBucket[];
  totals: {
    mails_sent: number;
    real_clicks: number;
    bot_clicks: number;
  };
};

// How many contributing mails to surface per bucket in the hover breakdown.
const BUCKET_MAILS_LIMIT = 6;

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

  await attachBucketMails(admin, payload);

  return NextResponse.json(payload);
}

// Enriches each timeline bucket with the mails whose links were clicked inside
// it, so the chart hover can show *which* emails drove the activity. The RPC
// only returns aggregate counts; here we re-read the clicks in the same range,
// resolve them to their parent send, and assign each to a bucket by finding the
// last bucket whose start is <= the click time (handles the variable-width
// monthly buckets used for the "year" period).
async function attachBucketMails(
  admin: ReturnType<typeof createAdminClient>,
  payload: TimelinePayload,
) {
  const buckets = payload.buckets;
  if (!buckets || buckets.length === 0) return;

  const bucketStarts = buckets.map((b) => new Date(b.bucket_start).getTime());
  const rangeStart = new Date(payload.range_start).getTime();
  const rangeEnd = new Date(payload.range_end).getTime();
  if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd)) return;

  type ClickRow = { link_id: string; clicked_at: string; is_likely_bot: boolean };
  const { data: clicksData, error: clicksError } = await admin
    .from("mail_link_clicks")
    .select("link_id, clicked_at, is_likely_bot")
    .gte("clicked_at", new Date(rangeStart).toISOString())
    .lt("clicked_at", new Date(rangeEnd).toISOString());
  if (clicksError) return; // breakdown is best-effort; counts still render
  const clicks = (clicksData ?? []) as ClickRow[];
  if (clicks.length === 0) return;

  const linkIds = Array.from(new Set(clicks.map((c) => c.link_id)));
  type LinkRow = { id: string; send_id: string };
  const linkToSend = new Map<string, string>();
  for (let i = 0; i < linkIds.length; i += 500) {
    const chunk = linkIds.slice(i, i + 500);
    const { data: linksData, error: linksError } = await admin
      .from("mail_send_links")
      .select("id, send_id")
      .in("id", chunk);
    if (linksError) return;
    for (const link of (linksData ?? []) as LinkRow[]) linkToSend.set(link.id, link.send_id);
  }

  const sendIds = Array.from(new Set(Array.from(linkToSend.values()).filter(Boolean)));
  if (sendIds.length === 0) return;
  type SendRow = {
    id: string;
    recipient_name: string;
    company_name: string | null;
    subject: string;
  };
  const sendById = new Map<string, SendRow>();
  for (let i = 0; i < sendIds.length; i += 500) {
    const chunk = sendIds.slice(i, i + 500);
    const { data: sendsData, error: sendsError } = await admin
      .from("mail_sends")
      .select("id, recipient_name, company_name, subject")
      .in("id", chunk);
    if (sendsError) return;
    for (const send of (sendsData ?? []) as SendRow[]) sendById.set(send.id, send);
  }

  // bucketStarts is ascending; for a click time t find the last start <= t.
  const findBucketIndex = (t: number): number => {
    let lo = 0;
    let hi = bucketStarts.length - 1;
    let result = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (bucketStarts[mid] <= t) {
        result = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return result;
  };

  // Per bucket: send_id -> { real, bot }
  const perBucket: Array<Map<string, { real: number; bot: number }>> = buckets.map(
    () => new Map(),
  );
  for (const click of clicks) {
    const sendId = linkToSend.get(click.link_id);
    if (!sendId) continue;
    const t = new Date(click.clicked_at).getTime();
    if (!Number.isFinite(t)) continue;
    const idx = findBucketIndex(t);
    if (idx < 0) continue;
    const agg = perBucket[idx];
    const entry = agg.get(sendId) ?? { real: 0, bot: 0 };
    if (click.is_likely_bot) entry.bot += 1;
    else entry.real += 1;
    agg.set(sendId, entry);
  }

  buckets.forEach((bucket, idx) => {
    const agg = perBucket[idx];
    if (agg.size === 0) return;
    const mails: BucketMail[] = Array.from(agg.entries())
      .map(([sendId, counts]) => {
        const send = sendById.get(sendId);
        return {
          send_id: sendId,
          recipient_name: send?.recipient_name ?? "Unknown recipient",
          company_name: send?.company_name ?? null,
          subject: send?.subject ?? "(no subject)",
          real_clicks: counts.real,
          bot_clicks: counts.bot,
        };
      })
      .sort(
        (a, b) =>
          b.real_clicks - a.real_clicks ||
          b.bot_clicks - a.bot_clicks ||
          a.recipient_name.localeCompare(b.recipient_name),
      )
      .slice(0, BUCKET_MAILS_LIMIT);
    bucket.mails = mails;
  });
}

import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";

type ClickRow = {
  link_id: string;
  clicked_at: string;
  is_likely_bot: boolean;
};

type LinkRow = {
  id: string;
  send_id: string;
  original_url: string;
  link_label: string | null;
  link_key: string | null;
};

type SendRow = {
  id: string;
  recipient_name: string;
  recipient_email: string | null;
  company_name: string | null;
  mail_type: string;
  language: string | null;
  created_at: string;
};

type RecipientAgg = {
  key: string;
  name: string;
  company: string | null;
  real_clicks: number;
  bot_clicks: number;
  sends_count: number;
};

type LinkAgg = {
  key: string;
  label: string;
  link_key: string | null;
  original_url: string;
  real_clicks: number;
  bot_clicks: number;
  sends_count: number;
};

type MailTypeAgg = {
  mail_type: string;
  sends_count: number;
  real_clicks: number;
  bot_clicks: number;
};

const DEFAULT_DAYS = 90;
const MAX_DAYS = 365;
const TOP_LIMIT = 8;
const SENDS_FETCH_LIMIT = 5000;

export async function GET(request: Request) {
  const guard = await guardAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const daysRaw = Number.parseInt(url.searchParams.get("days") ?? "", 10);
  const days = Number.isFinite(daysRaw) && daysRaw > 0
    ? Math.min(daysRaw, MAX_DAYS)
    : DEFAULT_DAYS;

  const rangeEnd = new Date();
  const rangeStart = new Date(rangeEnd.getTime() - days * 24 * 60 * 60 * 1000);

  const admin = createAdminClient();

  const { data: sendsData, error: sendsError } = await admin
    .from("mail_sends")
    .select("id, recipient_name, recipient_email, company_name, mail_type, language, created_at")
    .gte("created_at", rangeStart.toISOString())
    .order("created_at", { ascending: false })
    .limit(SENDS_FETCH_LIMIT);
  if (sendsError) {
    return NextResponse.json({ error: sendsError.message }, { status: 500 });
  }
  const sends = (sendsData ?? []) as SendRow[];
  const sendIds = sends.map((row) => row.id);

  let links: LinkRow[] = [];
  if (sendIds.length > 0) {
    const { data: linksData, error: linksError } = await admin
      .from("mail_send_links")
      .select("id, send_id, original_url, link_label, link_key")
      .in("send_id", sendIds);
    if (linksError) {
      return NextResponse.json({ error: linksError.message }, { status: 500 });
    }
    links = (linksData ?? []) as LinkRow[];
  }
  const linkIds = links.map((row) => row.id);

  let clicks: ClickRow[] = [];
  if (linkIds.length > 0) {
    const chunkSize = 500;
    for (let i = 0; i < linkIds.length; i += chunkSize) {
      const chunk = linkIds.slice(i, i + chunkSize);
      const { data: clickData, error: clickError } = await admin
        .from("mail_link_clicks")
        .select("link_id, clicked_at, is_likely_bot")
        .in("link_id", chunk)
        .gte("clicked_at", rangeStart.toISOString());
      if (clickError) {
        return NextResponse.json({ error: clickError.message }, { status: 500 });
      }
      clicks = clicks.concat((clickData ?? []) as ClickRow[]);
    }
  }

  const linkById = new Map<string, LinkRow>();
  for (const link of links) linkById.set(link.id, link);
  const sendById = new Map<string, SendRow>();
  for (const send of sends) sendById.set(send.id, send);

  const recipientAggs = new Map<string, RecipientAgg>();
  const linkAggs = new Map<string, LinkAgg>();
  const mailTypeAggs = new Map<string, MailTypeAgg>();

  for (const send of sends) {
    const recKey = `${(send.recipient_name ?? "").trim().toLowerCase()}::${(send.company_name ?? "").trim().toLowerCase()}`;
    const recAgg = recipientAggs.get(recKey) ?? {
      key: recKey,
      name: send.recipient_name,
      company: send.company_name,
      real_clicks: 0,
      bot_clicks: 0,
      sends_count: 0,
    };
    recAgg.sends_count += 1;
    recipientAggs.set(recKey, recAgg);

    const mtKey = send.mail_type || "unknown";
    const mtAgg = mailTypeAggs.get(mtKey) ?? {
      mail_type: mtKey,
      sends_count: 0,
      real_clicks: 0,
      bot_clicks: 0,
    };
    mtAgg.sends_count += 1;
    mailTypeAggs.set(mtKey, mtAgg);
  }

  for (const link of links) {
    const key = link.link_key && link.link_key.length > 0 ? `key:${link.link_key}` : `url:${link.original_url}`;
    const linkAgg = linkAggs.get(key) ?? {
      key,
      label: link.link_label || link.link_key || link.original_url,
      link_key: link.link_key,
      original_url: link.original_url,
      real_clicks: 0,
      bot_clicks: 0,
      sends_count: 0,
    };
    linkAgg.sends_count += 1;
    linkAggs.set(key, linkAgg);
  }

  const heatmap = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  const heatmapBots = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));

  for (const click of clicks) {
    const link = linkById.get(click.link_id);
    if (!link) continue;
    const send = sendById.get(link.send_id);
    if (!send) continue;
    const date = new Date(click.clicked_at);
    if (Number.isNaN(date.getTime())) continue;
    const dow = (date.getDay() + 6) % 7;
    const hour = date.getHours();
    if (click.is_likely_bot) heatmapBots[dow][hour] += 1;
    else heatmap[dow][hour] += 1;

    const recKey = `${(send.recipient_name ?? "").trim().toLowerCase()}::${(send.company_name ?? "").trim().toLowerCase()}`;
    const recAgg = recipientAggs.get(recKey);
    if (recAgg) {
      if (click.is_likely_bot) recAgg.bot_clicks += 1;
      else recAgg.real_clicks += 1;
    }

    const linkKey = link.link_key && link.link_key.length > 0 ? `key:${link.link_key}` : `url:${link.original_url}`;
    const linkAgg = linkAggs.get(linkKey);
    if (linkAgg) {
      if (click.is_likely_bot) linkAgg.bot_clicks += 1;
      else linkAgg.real_clicks += 1;
    }

    const mtAgg = mailTypeAggs.get(send.mail_type || "unknown");
    if (mtAgg) {
      if (click.is_likely_bot) mtAgg.bot_clicks += 1;
      else mtAgg.real_clicks += 1;
    }
  }

  const topRecipients = Array.from(recipientAggs.values())
    .sort((a, b) => b.real_clicks - a.real_clicks || b.sends_count - a.sends_count)
    .slice(0, TOP_LIMIT);

  const topLinks = Array.from(linkAggs.values())
    .sort((a, b) => b.real_clicks - a.real_clicks || b.sends_count - a.sends_count)
    .slice(0, TOP_LIMIT);

  const mailTypeBreakdown = Array.from(mailTypeAggs.values())
    .sort((a, b) => b.sends_count - a.sends_count);

  return NextResponse.json({
    range_start: rangeStart.toISOString(),
    range_end: rangeEnd.toISOString(),
    days,
    top_recipients: topRecipients,
    top_links: topLinks,
    mail_type_breakdown: mailTypeBreakdown,
    heatmap,
    heatmap_bots: heatmapBots,
    totals: {
      sends_count: sends.length,
      real_clicks: clicks.filter((c) => !c.is_likely_bot).length,
      bot_clicks: clicks.filter((c) => c.is_likely_bot).length,
      sends_truncated: sends.length === SENDS_FETCH_LIMIT,
    },
  });
}

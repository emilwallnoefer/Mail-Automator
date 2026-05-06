import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, getWeekStartDate, toDateString } from "@/lib/time-tracker-queries";

type SendRow = {
  id: string;
  user_id: string;
  recipient_name: string;
  recipient_email: string | null;
  company_name: string | null;
  subject: string;
  mail_type: string;
  language: string | null;
  template_variant: string | null;
  training_type: string | null;
  created_at: string;
};

type LinkRow = {
  id: string;
  send_id: string;
};

type ClickRow = {
  link_id: string;
  clicked_at: string;
  is_likely_bot: boolean;
};

type RecipientGroup = {
  key: string;
  recipient_name: string;
  company_name: string | null;
  sends_count: number;
  unique_senders: number;
  real_clicks: number;
  bot_clicks: number;
  last_click_at: string | null;
  last_send_at: string;
  send_ids: string[];
};

function recipientKey(send: SendRow): string {
  return `${send.recipient_name.toLowerCase()}|${(send.company_name ?? "").toLowerCase()}`;
}

export async function GET(request: Request) {
  const guard = await guardAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const weekStartDate = getWeekStartDate(url.searchParams.get("week") ?? undefined);
  if (!weekStartDate) {
    return NextResponse.json({ error: "Invalid week date" }, { status: 400 });
  }
  const weekEndDate = addDays(weekStartDate, 7);

  const admin = createAdminClient();

  const { data: sends, error: sendsError } = await admin
    .from("mail_sends")
    .select(
      "id, user_id, recipient_name, recipient_email, company_name, subject, mail_type, language, template_variant, training_type, created_at",
    )
    .gte("created_at", weekStartDate.toISOString())
    .lt("created_at", weekEndDate.toISOString())
    .order("created_at", { ascending: false });

  if (sendsError) {
    return NextResponse.json({ error: sendsError.message }, { status: 500 });
  }

  const sendRows = (sends ?? []) as SendRow[];
  if (sendRows.length === 0) {
    return NextResponse.json({
      week_start: toDateString(weekStartDate),
      recipients: [],
      totals: { mails_sent: 0, recipients: 0, real_clicks: 0, bot_clicks: 0 },
    });
  }

  const sendIds = sendRows.map((row) => row.id);

  const { data: links, error: linksError } = await admin
    .from("mail_send_links")
    .select("id, send_id")
    .in("send_id", sendIds);
  if (linksError) {
    return NextResponse.json({ error: linksError.message }, { status: 500 });
  }
  const linkRows = (links ?? []) as LinkRow[];
  const sendIdByLinkId = new Map<string, string>();
  for (const row of linkRows) sendIdByLinkId.set(row.id, row.send_id);

  let clickRows: ClickRow[] = [];
  if (linkRows.length > 0) {
    const linkIds = linkRows.map((row) => row.id);
    const { data: clicks, error: clicksError } = await admin
      .from("mail_link_clicks")
      .select("link_id, clicked_at, is_likely_bot")
      .in("link_id", linkIds);
    if (clicksError) {
      return NextResponse.json({ error: clicksError.message }, { status: 500 });
    }
    clickRows = (clicks ?? []) as ClickRow[];
  }

  type SendStats = { real: number; bot: number; lastClickAt: string | null };
  const statsBySend = new Map<string, SendStats>();
  for (const row of sendRows) statsBySend.set(row.id, { real: 0, bot: 0, lastClickAt: null });
  for (const click of clickRows) {
    const sendId = sendIdByLinkId.get(click.link_id);
    if (!sendId) continue;
    const entry = statsBySend.get(sendId);
    if (!entry) continue;
    if (click.is_likely_bot) entry.bot += 1;
    else entry.real += 1;
    if (!entry.lastClickAt || click.clicked_at > entry.lastClickAt) {
      entry.lastClickAt = click.clicked_at;
    }
  }

  const groups = new Map<string, RecipientGroup>();
  const sendersByGroup = new Map<string, Set<string>>();
  for (const send of sendRows) {
    const key = recipientKey(send);
    const stats = statsBySend.get(send.id) ?? { real: 0, bot: 0, lastClickAt: null };
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        recipient_name: send.recipient_name,
        company_name: send.company_name,
        sends_count: 0,
        unique_senders: 0,
        real_clicks: 0,
        bot_clicks: 0,
        last_click_at: null,
        last_send_at: send.created_at,
        send_ids: [],
      };
      groups.set(key, group);
      sendersByGroup.set(key, new Set());
    }
    group.sends_count += 1;
    group.real_clicks += stats.real;
    group.bot_clicks += stats.bot;
    group.send_ids.push(send.id);
    if (stats.lastClickAt && (!group.last_click_at || stats.lastClickAt > group.last_click_at)) {
      group.last_click_at = stats.lastClickAt;
    }
    if (send.created_at > group.last_send_at) {
      group.last_send_at = send.created_at;
    }
    sendersByGroup.get(key)!.add(send.user_id);
  }
  for (const [key, group] of groups) {
    group.unique_senders = sendersByGroup.get(key)?.size ?? 1;
  }

  const recipients = [...groups.values()].sort((a, b) => {
    if (a.last_click_at && b.last_click_at) return b.last_click_at.localeCompare(a.last_click_at);
    if (a.last_click_at) return -1;
    if (b.last_click_at) return 1;
    return b.last_send_at.localeCompare(a.last_send_at);
  });

  let realClicksTotal = 0;
  let botClicksTotal = 0;
  for (const click of clickRows) {
    if (click.is_likely_bot) botClicksTotal += 1;
    else realClicksTotal += 1;
  }

  return NextResponse.json({
    week_start: toDateString(weekStartDate),
    recipients,
    totals: {
      mails_sent: sendRows.length,
      recipients: groups.size,
      real_clicks: realClicksTotal,
      bot_clicks: botClicksTotal,
    },
  });
}

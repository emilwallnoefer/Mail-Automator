import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, getWeekStartDate, toDateString } from "@/lib/time-tracker-queries";

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

type RecipientPayload = {
  recipients: RecipientGroup[];
  totals: {
    mails_sent: number;
    recipients: number;
    real_clicks: number;
    bot_clicks: number;
    truncated?: boolean;
  };
};

const SEARCH_RESULT_LIMIT = 200;
const RECENT_PAGE_DEFAULT = 10;
const RECENT_PAGE_MAX = 100;
// Safety cap on the send scan used to build the recency-ordered recipient list.
const RECENT_SENDS_SCAN_CAP = 10000;

export async function GET(request: Request) {
  const guard = await guardAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const mode = url.searchParams.get("mode");

  const admin = createAdminClient();

  if (query.length === 0 && mode === "recent") {
    return recentRecipients(admin, url);
  }

  if (query.length > 0) {
    const { data, error } = await admin.rpc("mail_recipient_search", {
      p_query: query,
      p_limit: SEARCH_RESULT_LIMIT,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const payload = (data ?? {
      recipients: [],
      totals: { mails_sent: 0, recipients: 0, real_clicks: 0, bot_clicks: 0 },
    }) as RecipientPayload;
    return NextResponse.json({
      scope: "all" as const,
      query,
      week_start: null,
      recipients: payload.recipients ?? [],
      totals: {
        mails_sent: payload.totals?.mails_sent ?? 0,
        recipients: payload.totals?.recipients ?? 0,
        real_clicks: payload.totals?.real_clicks ?? 0,
        bot_clicks: payload.totals?.bot_clicks ?? 0,
        truncated: Boolean(payload.totals?.truncated),
      },
    });
  }

  const weekStartDate = getWeekStartDate(url.searchParams.get("week") ?? undefined);
  if (!weekStartDate) {
    return NextResponse.json({ error: "Invalid week date" }, { status: 400 });
  }
  const weekEndDate = addDays(weekStartDate, 7);

  const { data, error } = await admin.rpc("mail_recipient_week", {
    p_week_start: weekStartDate.toISOString(),
    p_week_end: weekEndDate.toISOString(),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const payload = (data ?? {
    recipients: [],
    totals: { mails_sent: 0, recipients: 0, real_clicks: 0, bot_clicks: 0 },
  }) as RecipientPayload;

  return NextResponse.json({
    scope: "week" as const,
    query: "",
    week_start: toDateString(weekStartDate),
    recipients: payload.recipients ?? [],
    totals: {
      mails_sent: payload.totals?.mails_sent ?? 0,
      recipients: payload.totals?.recipients ?? 0,
      real_clicks: payload.totals?.real_clicks ?? 0,
      bot_clicks: payload.totals?.bot_clicks ?? 0,
      truncated: false,
    },
  });
}

type RecentSendRow = {
  id: string;
  user_id: string;
  recipient_name: string;
  company_name: string | null;
  created_at: string;
};

// All-time recipient list ordered by recency (most recent send first), paged
// with limit/offset so the UI can show the latest N and load older ones on
// demand. Recipients are grouped with the same key the week RPC uses
// (lower(name)|lower(company)). Click stats are fetched only for the recipients
// on the requested page, keeping the join bounded.
async function recentRecipients(admin: ReturnType<typeof createAdminClient>, url: URL) {
  const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0
    ? Math.min(limitRaw, RECENT_PAGE_MAX)
    : RECENT_PAGE_DEFAULT;
  const offsetRaw = Number.parseInt(url.searchParams.get("offset") ?? "", 10);
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;

  const { data: sendsData, error: sendsError } = await admin
    .from("mail_sends")
    .select("id, user_id, recipient_name, company_name, created_at")
    .order("created_at", { ascending: false })
    .limit(RECENT_SENDS_SCAN_CAP);
  if (sendsError) return NextResponse.json({ error: sendsError.message }, { status: 500 });
  const sends = (sendsData ?? []) as RecentSendRow[];

  type Group = {
    key: string;
    recipient_name: string;
    company_name: string | null;
    sends_count: number;
    senders: Set<string>;
    last_send_at: string;
    send_ids: string[];
  };
  // sends are created_at desc, so first encounter of a key = its newest send,
  // which makes the insertion order match "recipients by recency".
  const groupMap = new Map<string, Group>();
  for (const send of sends) {
    const key = `${(send.recipient_name ?? "").toLowerCase()}|${(send.company_name ?? "").toLowerCase()}`;
    let group = groupMap.get(key);
    if (!group) {
      group = {
        key,
        recipient_name: send.recipient_name,
        company_name: send.company_name,
        sends_count: 0,
        senders: new Set(),
        last_send_at: send.created_at,
        send_ids: [],
      };
      groupMap.set(key, group);
    }
    group.sends_count += 1;
    if (send.user_id) group.senders.add(send.user_id);
    group.send_ids.push(send.id); // already in created_at desc order
  }

  const allGroups = Array.from(groupMap.values());
  const total = allGroups.length;
  const pageGroups = allGroups.slice(offset, offset + limit);

  // Resolve click stats for just this page's sends.
  const pageSendIds = pageGroups.flatMap((g) => g.send_ids);
  const clicksBySend = new Map<string, { real: number; bot: number; last: string | null }>();
  if (pageSendIds.length > 0) {
    const linkToSend = new Map<string, string>();
    for (let i = 0; i < pageSendIds.length; i += 500) {
      const chunk = pageSendIds.slice(i, i + 500);
      const { data: linksData, error: linksError } = await admin
        .from("mail_send_links")
        .select("id, send_id")
        .in("send_id", chunk);
      if (linksError) return NextResponse.json({ error: linksError.message }, { status: 500 });
      for (const row of (linksData ?? []) as Array<{ id: string; send_id: string }>) {
        linkToSend.set(row.id, row.send_id);
      }
    }
    const linkIds = Array.from(linkToSend.keys());
    for (let i = 0; i < linkIds.length; i += 500) {
      const chunk = linkIds.slice(i, i + 500);
      const { data: clickData, error: clickError } = await admin
        .from("mail_link_clicks")
        .select("link_id, is_likely_bot, clicked_at")
        .in("link_id", chunk);
      if (clickError) return NextResponse.json({ error: clickError.message }, { status: 500 });
      for (const click of (clickData ?? []) as Array<{ link_id: string; is_likely_bot: boolean; clicked_at: string }>) {
        const sendId = linkToSend.get(click.link_id);
        if (!sendId) continue;
        const entry = clicksBySend.get(sendId) ?? { real: 0, bot: 0, last: null };
        if (click.is_likely_bot) entry.bot += 1;
        else entry.real += 1;
        if (!entry.last || click.clicked_at > entry.last) entry.last = click.clicked_at;
        clicksBySend.set(sendId, entry);
      }
    }
  }

  const recipients = pageGroups.map((group) => {
    let real = 0;
    let bot = 0;
    let lastClick: string | null = null;
    for (const sendId of group.send_ids) {
      const stats = clicksBySend.get(sendId);
      if (!stats) continue;
      real += stats.real;
      bot += stats.bot;
      if (stats.last && (!lastClick || stats.last > lastClick)) lastClick = stats.last;
    }
    return {
      key: group.key,
      recipient_name: group.recipient_name,
      company_name: group.company_name,
      sends_count: group.sends_count,
      unique_senders: group.senders.size,
      real_clicks: real,
      bot_clicks: bot,
      last_click_at: lastClick,
      last_send_at: group.last_send_at,
      send_ids: group.send_ids,
    };
  });

  // All-time totals for the stat tiles (independent of pagination).
  const [{ count: realAll }, { count: botAll }] = await Promise.all([
    admin.from("mail_link_clicks").select("id", { count: "exact", head: true }).eq("is_likely_bot", false),
    admin.from("mail_link_clicks").select("id", { count: "exact", head: true }).eq("is_likely_bot", true),
  ]);
  const mailsSent = sends.length;

  return NextResponse.json({
    scope: "recent" as const,
    query: "",
    week_start: null,
    recipients,
    total,
    totals: {
      mails_sent: mailsSent,
      recipients: total,
      real_clicks: realAll ?? 0,
      bot_clicks: botAll ?? 0,
      truncated: sends.length === RECENT_SENDS_SCAN_CAP,
    },
  });
}

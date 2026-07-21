import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { csvResponse, toCsv } from "@/lib/csv";

const CSV_HEADERS = [
  "Clicked at",
  "Type",
  "Recipient",
  "Company",
  "Email",
  "Subject",
  "Mail type",
  "Link label",
  "Link URL",
  "User agent",
];

type ClickRow = {
  id: string;
  link_id: string;
  clicked_at: string;
  is_likely_bot: boolean;
  user_agent: string | null;
  referer: string | null;
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
  subject: string;
  mail_type: string;
};

const PAGE_SIZE_DEFAULT = 10;
const PAGE_SIZE_MAX = 100;
const RANGE_DAYS_DEFAULT = 7;
const RANGE_DAYS_MAX = 365;

export async function GET(request: Request) {
  const guard = await guardAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0
    ? Math.min(limitRaw, PAGE_SIZE_MAX)
    : PAGE_SIZE_DEFAULT;
  const offsetRaw = Number.parseInt(url.searchParams.get("offset") ?? "", 10);
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;
  const daysRaw = Number.parseInt(url.searchParams.get("days") ?? "", 10);
  const days = Number.isFinite(daysRaw) && daysRaw > 0
    ? Math.min(daysRaw, RANGE_DAYS_MAX)
    : RANGE_DAYS_DEFAULT;
  const includeBots = url.searchParams.get("include_bots") === "1";
  const asCsv = url.searchParams.get("format") === "csv";

  const rangeStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const admin = createAdminClient();

  // A CSV export should cover the whole range, not just one UI page.
  const CSV_EXPORT_MAX = 1000;
  const queryLimit = asCsv ? CSV_EXPORT_MAX : limit;
  const queryOffset = asCsv ? 0 : offset;

  let clicksQuery = admin
    .from("mail_link_clicks")
    .select("id, link_id, clicked_at, is_likely_bot, user_agent, referer", { count: "exact" })
    .gte("clicked_at", rangeStart.toISOString())
    .order("clicked_at", { ascending: false })
    .range(queryOffset, queryOffset + queryLimit - 1);
  if (!includeBots) clicksQuery = clicksQuery.eq("is_likely_bot", false);

  const { data: clicks, error: clicksError, count } = await clicksQuery;
  if (clicksError) {
    return NextResponse.json({ error: clicksError.message }, { status: 500 });
  }
  const clickRows = (clicks ?? []) as ClickRow[];

  if (clickRows.length === 0) {
    if (asCsv) {
      return csvResponse(toCsv(CSV_HEADERS, []), `mail-clicks-${days}d.csv`);
    }
    return NextResponse.json({
      clicks: [],
      total: count ?? 0,
      offset,
      limit,
      days,
      range_start: rangeStart.toISOString(),
    });
  }

  const linkIds = Array.from(new Set(clickRows.map((row) => row.link_id)));
  const { data: links, error: linksError } = await admin
    .from("mail_send_links")
    .select("id, send_id, original_url, link_label, link_key")
    .in("id", linkIds);
  if (linksError) {
    return NextResponse.json({ error: linksError.message }, { status: 500 });
  }
  const linkById = new Map<string, LinkRow>();
  for (const row of (links ?? []) as LinkRow[]) linkById.set(row.id, row);

  const sendIds = Array.from(
    new Set(
      Array.from(linkById.values())
        .map((row) => row.send_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const sendById = new Map<string, SendRow>();
  if (sendIds.length > 0) {
    const { data: sends, error: sendsError } = await admin
      .from("mail_sends")
      .select("id, recipient_name, recipient_email, company_name, subject, mail_type")
      .in("id", sendIds);
    if (sendsError) {
      return NextResponse.json({ error: sendsError.message }, { status: 500 });
    }
    for (const row of (sends ?? []) as SendRow[]) sendById.set(row.id, row);
  }

  const payload = clickRows.map((click) => {
    const link = linkById.get(click.link_id) ?? null;
    const send = link ? sendById.get(link.send_id) ?? null : null;
    return {
      id: click.id,
      clicked_at: click.clicked_at,
      is_likely_bot: click.is_likely_bot,
      user_agent: click.user_agent,
      referer: click.referer,
      link: link
        ? {
            id: link.id,
            original_url: link.original_url,
            link_label: link.link_label,
            link_key: link.link_key,
          }
        : null,
      send: send
        ? {
            id: send.id,
            recipient_name: send.recipient_name,
            recipient_email: send.recipient_email,
            company_name: send.company_name,
            subject: send.subject,
            mail_type: send.mail_type,
          }
        : null,
    };
  });

  if (asCsv) {
    const csv = toCsv(
      CSV_HEADERS,
      payload.map((c) => [
        c.clicked_at,
        c.is_likely_bot ? "scanner" : "real",
        c.send?.recipient_name ?? "",
        c.send?.company_name ?? "",
        c.send?.recipient_email ?? "",
        c.send?.subject ?? "",
        c.send?.mail_type ?? "",
        c.link?.link_label ?? c.link?.link_key ?? "",
        c.link?.original_url ?? "",
        c.user_agent ?? "",
      ]),
    );
    return csvResponse(csv, `mail-clicks-${days}d.csv`);
  }

  return NextResponse.json({
    clicks: payload,
    total: count ?? 0,
    offset,
    limit,
    days,
    range_start: rangeStart.toISOString(),
  });
}

import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, getWeekStartDate, toDateString } from "@/lib/time-tracker-queries";
import { csvResponse, toCsv } from "@/lib/csv";

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

// Return the recipient payload as JSON, or as a CSV download when `?format=csv`
// is present. The CSV covers whatever recipients the current scope resolved.
function respond(
  url: URL,
  payload: { recipients: RecipientGroup[] } & Record<string, unknown>,
  filenameBase: string,
) {
  if (url.searchParams.get("format") === "csv") {
    const csv = toCsv(
      ["Recipient", "Company", "Mails", "Real clicks", "Scanner clicks", "Unique senders", "Last click", "Last send"],
      payload.recipients.map((r) => [
        r.recipient_name,
        r.company_name ?? "",
        r.sends_count,
        r.real_clicks,
        r.bot_clicks,
        r.unique_senders,
        r.last_click_at ?? "",
        r.last_send_at,
      ]),
    );
    return csvResponse(csv, `${filenameBase}.csv`);
  }
  return NextResponse.json(payload);
}

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
    return respond(
      url,
      {
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
      },
      "mail-recipients-search",
    );
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

  return respond(
    url,
    {
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
    },
    `mail-recipients-week-${toDateString(weekStartDate)}`,
  );
}

type RecentPayload = RecipientPayload & { total?: number };

// All-time recipient list ordered by recency (most recent send first), paged
// with limit/offset so the UI can show the latest N and load older ones on
// demand. The grouping, per-page click stats and all-time totals are all done
// set-based in the mail_recipient_recent RPC, so we never pull the full
// mail_sends table into the Node process.
async function recentRecipients(admin: ReturnType<typeof createAdminClient>, url: URL) {
  const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0
    ? Math.min(limitRaw, RECENT_PAGE_MAX)
    : RECENT_PAGE_DEFAULT;
  const offsetRaw = Number.parseInt(url.searchParams.get("offset") ?? "", 10);
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;

  const { data, error } = await admin.rpc("mail_recipient_recent", {
    p_limit: limit,
    p_offset: offset,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const payload = (data ?? {
    recipients: [],
    total: 0,
    totals: { mails_sent: 0, recipients: 0, real_clicks: 0, bot_clicks: 0 },
  }) as RecentPayload;

  return respond(
    url,
    {
      scope: "recent" as const,
      query: "",
      week_start: null,
      recipients: payload.recipients ?? [],
      total: payload.total ?? payload.totals?.recipients ?? 0,
      totals: {
        mails_sent: payload.totals?.mails_sent ?? 0,
        recipients: payload.totals?.recipients ?? 0,
        real_clicks: payload.totals?.real_clicks ?? 0,
        bot_clicks: payload.totals?.bot_clicks ?? 0,
        truncated: false,
      },
    },
    "mail-recipients-recent",
  );
}

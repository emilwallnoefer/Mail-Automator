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

export async function GET(request: Request) {
  const guard = await guardAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();

  const admin = createAdminClient();

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

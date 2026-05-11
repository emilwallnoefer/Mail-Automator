import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";

type LinkAggregate = {
  key: string;
  original_url: string;
  label: string | null;
  link_key: string | null;
  sends_count: number;
  real_clicks: number;
  bot_clicks: number;
  last_click_at: string | null;
  first_sent_at: string;
};

type LinkLeaderboardPayload = {
  links: LinkAggregate[];
  totals: {
    unique_links: number;
    total_link_rows: number;
    real_clicks: number;
    bot_clicks: number;
  };
};

const LEADERBOARD_ROW_LIMIT = 500;

export async function GET(_request: Request) {
  const guard = await guardAdmin();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();

  const { data, error } = await admin.rpc("mail_link_leaderboard", {
    p_limit: LEADERBOARD_ROW_LIMIT,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const payload = (data ?? {
    links: [],
    totals: { unique_links: 0, total_link_rows: 0, real_clicks: 0, bot_clicks: 0 },
  }) as LinkLeaderboardPayload;

  return NextResponse.json({
    links: payload.links ?? [],
    totals: payload.totals ?? {
      unique_links: 0,
      total_link_rows: 0,
      real_clicks: 0,
      bot_clicks: 0,
    },
  });
}

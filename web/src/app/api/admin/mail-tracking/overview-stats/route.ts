import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";

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

// Flat heatmap cell from the RPC; the 7x24 grid is reconstructed here.
type HeatmapCell = { dow: number; hour: number; real: number; bot: number };

type OverviewStats = {
  top_recipients: RecipientAgg[];
  top_links: LinkAgg[];
  mail_type_breakdown: MailTypeAgg[];
  heatmap_cells: HeatmapCell[];
  totals: { sends_count: number; real_clicks: number; bot_clicks: number };
};

const DEFAULT_DAYS = 90;
const MAX_DAYS = 365;
const TOP_LIMIT = 8;

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

  // All grouping/aggregation happens in the mail_overview_stats RPC so we never
  // pull the sends/links/clicks of the whole window into the Node process.
  const { data, error } = await admin.rpc("mail_overview_stats", {
    p_range_start: rangeStart.toISOString(),
    p_top_limit: TOP_LIMIT,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const stats = (data ?? {
    top_recipients: [],
    top_links: [],
    mail_type_breakdown: [],
    heatmap_cells: [],
    totals: { sends_count: 0, real_clicks: 0, bot_clicks: 0 },
  }) as OverviewStats;

  // Rebuild the 7x24 grids the UI expects from the flat cell list.
  const heatmap = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  const heatmapBots = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const cell of stats.heatmap_cells ?? []) {
    if (cell.dow < 0 || cell.dow > 6 || cell.hour < 0 || cell.hour > 23) continue;
    heatmap[cell.dow][cell.hour] = cell.real;
    heatmapBots[cell.dow][cell.hour] = cell.bot;
  }

  return NextResponse.json({
    range_start: rangeStart.toISOString(),
    range_end: rangeEnd.toISOString(),
    days,
    top_recipients: stats.top_recipients ?? [],
    top_links: stats.top_links ?? [],
    mail_type_breakdown: stats.mail_type_breakdown ?? [],
    heatmap,
    heatmap_bots: heatmapBots,
    totals: {
      sends_count: stats.totals?.sends_count ?? 0,
      real_clicks: stats.totals?.real_clicks ?? 0,
      bot_clicks: stats.totals?.bot_clicks ?? 0,
      sends_truncated: false,
    },
  });
}

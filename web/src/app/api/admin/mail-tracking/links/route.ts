import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { guardAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";

type LinkRow = {
  id: string;
  send_id: string;
  original_url: string;
  link_label: string | null;
  link_key: string | null;
  created_at: string;
};

type ClickRow = {
  link_id: string;
  clicked_at: string;
  is_likely_bot: boolean;
};

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

const PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  admin: SupabaseClient,
  table: string,
  columns: string,
  orderBy: string,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .order(orderBy, { ascending: true })
      .range(from, to);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
    if (from > 100_000) break;
  }
  return out;
}

function canonicalKey(row: LinkRow): string {
  return row.link_key ? `key:${row.link_key}` : `url:${row.original_url}`;
}

function bestLabel(existing: string | null, candidate: string | null): string | null {
  if (existing && existing.trim().length > 0) return existing;
  if (candidate && candidate.trim().length > 0) return candidate;
  return existing;
}

export async function GET(_request: Request) {
  const guard = await guardAdmin();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();

  let linkRows: LinkRow[];
  let clickRows: ClickRow[];
  try {
    [linkRows, clickRows] = await Promise.all([
      fetchAllRows<LinkRow>(
        admin,
        "mail_send_links",
        "id, send_id, original_url, link_label, link_key, created_at",
        "created_at",
      ),
      fetchAllRows<ClickRow>(
        admin,
        "mail_link_clicks",
        "link_id, clicked_at, is_likely_bot",
        "clicked_at",
      ),
    ]);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }

  const keyByLinkId = new Map<string, string>();
  const sendIdsByKey = new Map<string, Set<string>>();
  const groups = new Map<string, LinkAggregate>();

  for (const row of linkRows) {
    const key = canonicalKey(row);
    keyByLinkId.set(row.id, key);

    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        original_url: row.original_url,
        label: row.link_label,
        link_key: row.link_key,
        sends_count: 0,
        real_clicks: 0,
        bot_clicks: 0,
        last_click_at: null,
        first_sent_at: row.created_at,
      };
      groups.set(key, group);
      sendIdsByKey.set(key, new Set());
    } else {
      group.label = bestLabel(group.label, row.link_label);
      if (row.created_at < group.first_sent_at) group.first_sent_at = row.created_at;
    }
    sendIdsByKey.get(key)!.add(row.send_id);
  }

  let realTotal = 0;
  let botTotal = 0;
  for (const click of clickRows) {
    const key = keyByLinkId.get(click.link_id);
    if (!key) continue;
    const group = groups.get(key);
    if (!group) continue;
    if (click.is_likely_bot) {
      group.bot_clicks += 1;
      botTotal += 1;
    } else {
      group.real_clicks += 1;
      realTotal += 1;
    }
    if (!group.last_click_at || click.clicked_at > group.last_click_at) {
      group.last_click_at = click.clicked_at;
    }
  }

  for (const [key, group] of groups) {
    group.sends_count = sendIdsByKey.get(key)?.size ?? 0;
  }

  const links = [...groups.values()].sort((a, b) => {
    if (b.real_clicks !== a.real_clicks) return b.real_clicks - a.real_clicks;
    if (b.bot_clicks !== a.bot_clicks) return b.bot_clicks - a.bot_clicks;
    return b.sends_count - a.sends_count;
  });

  return NextResponse.json({
    links,
    totals: {
      unique_links: groups.size,
      total_link_rows: linkRows.length,
      real_clicks: realTotal,
      bot_clicks: botTotal,
    },
  });
}

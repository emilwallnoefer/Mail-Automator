import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";

const SEND_ID_REGEX = /^[0-9a-fA-F-]{32,40}$/;

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
  original_url: string;
  link_label: string | null;
  link_key: string | null;
  created_at: string;
};

type ClickRow = {
  link_id: string;
  clicked_at: string;
  is_likely_bot: boolean;
  user_agent: string | null;
};

type ClickDetail = {
  clicked_at: string;
  is_likely_bot: boolean;
  user_agent: string | null;
};

export async function GET(_request: Request, context: { params: Promise<{ sendId: string }> }) {
  const guard = await guardAdmin();
  if (!guard.ok) return guard.response;

  const { sendId } = await context.params;
  if (!sendId || !SEND_ID_REGEX.test(sendId)) {
    return NextResponse.json({ error: "Invalid send id" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: send, error: sendError } = await admin
    .from("mail_sends")
    .select(
      "id, user_id, recipient_name, recipient_email, company_name, subject, mail_type, language, template_variant, training_type, created_at",
    )
    .eq("id", sendId)
    .maybeSingle();

  if (sendError) return NextResponse.json({ error: sendError.message }, { status: 500 });
  if (!send) return NextResponse.json({ error: "Send not found" }, { status: 404 });
  const sendRow = send as SendRow;

  const { data: links, error: linksError } = await admin
    .from("mail_send_links")
    .select("id, send_id, original_url, link_label, link_key, created_at")
    .eq("send_id", sendId)
    .order("created_at", { ascending: true });
  if (linksError) return NextResponse.json({ error: linksError.message }, { status: 500 });
  const linkRows = (links ?? []) as LinkRow[];

  let clickRows: ClickRow[] = [];
  if (linkRows.length > 0) {
    const { data: clicks, error: clicksError } = await admin
      .from("mail_link_clicks")
      .select("link_id, clicked_at, is_likely_bot, user_agent")
      .in(
        "link_id",
        linkRows.map((row) => row.id),
      )
      .order("clicked_at", { ascending: false });
    if (clicksError) return NextResponse.json({ error: clicksError.message }, { status: 500 });
    clickRows = (clicks ?? []) as ClickRow[];
  }

  const statsByLink = new Map<string, { real: number; bot: number; last: string | null }>();
  const clicksByLink = new Map<string, ClickDetail[]>();
  for (const link of linkRows) {
    statsByLink.set(link.id, { real: 0, bot: 0, last: null });
    clicksByLink.set(link.id, []);
  }
  for (const click of clickRows) {
    const entry = statsByLink.get(click.link_id);
    if (!entry) continue;
    if (click.is_likely_bot) entry.bot += 1;
    else entry.real += 1;
    if (!entry.last || click.clicked_at > entry.last) entry.last = click.clicked_at;
    clicksByLink.get(click.link_id)?.push({
      clicked_at: click.clicked_at,
      is_likely_bot: click.is_likely_bot,
      user_agent: click.user_agent,
    });
  }

  const linksOut = linkRows.map((link) => {
    const stats = statsByLink.get(link.id) ?? { real: 0, bot: 0, last: null };
    return {
      id: link.id,
      original_url: link.original_url,
      link_label: link.link_label,
      link_key: link.link_key,
      real_clicks: stats.real,
      bot_clicks: stats.bot,
      last_click_at: stats.last,
      clicks: clicksByLink.get(link.id) ?? [],
    };
  });

  return NextResponse.json({
    send: sendRow,
    links: linksOut,
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ sendId: string }> }) {
  const guard = await guardAdmin();
  if (!guard.ok) return guard.response;

  const { sendId } = await context.params;
  if (!sendId || !SEND_ID_REGEX.test(sendId)) {
    return NextResponse.json({ error: "Invalid send id" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Links and clicks cascade-delete via FK (on delete cascade), so removing the
  // send row is enough to wipe the whole generation and its tracking history.
  const { data: deleted, error: deleteError } = await admin
    .from("mail_sends")
    .delete()
    .eq("id", sendId)
    .select("id")
    .maybeSingle();

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  if (!deleted) return NextResponse.json({ error: "Send not found" }, { status: 404 });

  return NextResponse.json({ deleted: true, id: sendId });
}

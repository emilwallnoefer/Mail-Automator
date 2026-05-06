import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LINK_ID_REGEX = /^[A-Za-z0-9_-]{8,32}$/;

const BOT_UA_REGEX =
  /\b(bot|crawl|spider|preview|GoogleImageProxy|Mimecast|Proofpoint|Microsoft|Mailchimp|Outlook|Defender|Barracuda|FortiMail|Symantec|TrendMicro|MessageLabs|HeadlessChrome|Slackbot|FacebookExternalHit|LinkedInBot|WhatsApp|TelegramBot|Twitterbot|PhantomJS|Puppeteer|Postman|curl|wget|HTTPie|python-requests)\b/i;

function hashIp(ip: string): string | null {
  if (!ip || ip === "unknown") return null;
  const salt = process.env.TRACKING_SALT ?? "";
  return createHash("sha256").update(`${salt}|${ip}`).digest("hex");
}

function isLikelyBot(userAgent: string | null): boolean {
  if (!userAgent) return true;
  return BOT_UA_REGEX.test(userAgent);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const fallback = NextResponse.redirect(new URL("/", request.url), 302);

  if (!id || !LINK_ID_REGEX.test(id)) return fallback;

  const clientIp = getClientIp(request);
  const limit = checkRateLimit(`mail-redirect:${clientIp}`, {
    windowMs: 60_000,
    max: 600,
  });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return fallback;
  }

  const { data: link, error } = await admin
    .from("mail_send_links")
    .select("id, original_url")
    .eq("id", id)
    .maybeSingle();

  if (error || !link?.original_url) return fallback;

  const target = link.original_url;
  if (!/^https?:\/\//i.test(target)) return fallback;

  const userAgent = request.headers.get("user-agent");
  const referer = request.headers.get("referer");
  const likelyBot = isLikelyBot(userAgent);

  // Fire-and-forget: never block the redirect on the click insert.
  void admin
    .from("mail_link_clicks")
    .insert({
      link_id: link.id,
      ip_hash: hashIp(clientIp),
      user_agent: userAgent?.slice(0, 1000) ?? null,
      referer: referer?.slice(0, 1000) ?? null,
      is_likely_bot: likelyBot,
    })
    .then(() => undefined);

  return NextResponse.redirect(target, 302);
}

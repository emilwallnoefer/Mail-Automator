import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { createIpHasher } from "@/lib/security/tracking-salt";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Tracking ids are `<slug>-<random>` and may be up to ~80 chars. Older
// rows (pre-slug) were 8–32 chars of base64url; both fit this regex.
const LINK_ID_REGEX = /^[A-Za-z0-9_-]{8,100}$/;

const BOT_UA_REGEX =
  /\b(bot|crawl|spider|preview|GoogleImageProxy|Mimecast|Proofpoint|Microsoft|Mailchimp|Outlook|Defender|Barracuda|FortiMail|Symantec|TrendMicro|MessageLabs|HeadlessChrome|Slackbot|FacebookExternalHit|LinkedInBot|WhatsApp|TelegramBot|Twitterbot|PhantomJS|Puppeteer|Postman|curl|wget|HTTPie|python-requests)\b/i;

// Resolved once, at module scope: a deploy without `TRACKING_SALT` says so on
// its first cold start instead of months later in the data. There is no
// fallback that hashes without a salt — an unsalted SHA-256 of an IP is
// reversible, so it is never written. In a deployed environment a missing salt
// drops the click row entirely (`ipHasher.misconfigured`); locally the click is
// still recorded, just without an IP hash. Recipients are redirected either
// way: our config mistake must not break their link.
const ipHasher = createIpHasher(process.env);

function isLikelyBot(userAgent: string | null): boolean {
  if (!userAgent) return true;
  return BOT_UA_REGEX.test(userAgent);
}

// Headers that ensure recipient browsers, ISPs, and corporate proxies
// always re-fetch the redirect (so every click is logged) and that the
// downstream URL never sees `/r/<id>` as Referer.
const REDIRECT_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

function redirectTo(url: string | URL, status = 302) {
  const response = NextResponse.redirect(url, status);
  for (const [name, value] of Object.entries(REDIRECT_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const fallback = redirectTo(new URL("/", request.url));

  if (!id || !LINK_ID_REGEX.test(id)) return fallback;

  const clientIp = getClientIp(request);
  const limit = await checkRateLimit(`mail-redirect:${clientIp}`, {
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
  if (!ipHasher.misconfigured) {
    void admin
      .from("mail_link_clicks")
      .insert({
        link_id: link.id,
        ip_hash: ipHasher.hashIp(clientIp),
        user_agent: userAgent?.slice(0, 1000) ?? null,
        referer: referer?.slice(0, 1000) ?? null,
        is_likely_bot: likelyBot,
      })
      .then(() => undefined);
  }

  return redirectTo(target);
}

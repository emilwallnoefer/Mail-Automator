import "server-only";

import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import trainingLinks from "@/mail-config/training-links.json";

/**
 * Rewrites every http(s) `<a href>` in the draft's HTML body to a
 * tracking redirect URL hosted by us, and persists each unique URL as a
 * `mail_send_links` row so the `/r/<id>` endpoint can resolve clicks
 * back to the send.
 *
 * Inline images (`<img src>`), `cid:` references and `mailto:` links
 * are intentionally untouched. The plain-text email body never contains
 * raw URLs (the engine strips them in `stripMarkdownLinks`), so there
 * is nothing to rewrite there.
 */

const TRACKABLE_ANCHOR_REGEX =
  /<a\s+([^>]*?)href="(https?:\/\/[^"#\s]+)"([^>]*)>([\s\S]*?)<\/a>/gi;

const LINK_ID_BYTE_LENGTH = 8;

type LinkRow = {
  id: string;
  send_id: string;
  original_url: string;
  link_label: string | null;
  link_key: string | null;
};

let cachedKeyByUrl: Map<string, string> | null = null;

function buildLinkKeyIndex(): Map<string, string> {
  if (cachedKeyByUrl) return cachedKeyByUrl;
  const map = new Map<string, string>();
  const entries = trainingLinks as Record<string, string>;
  for (const [key, url] of Object.entries(entries)) {
    if (typeof url === "string" && url.startsWith("http")) {
      map.set(url, key);
    }
  }
  cachedKeyByUrl = map;
  return map;
}

function generateLinkId(): string {
  return randomBytes(LINK_ID_BYTE_LENGTH)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBasicHtml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function extractAnchorLabel(inner: string): string {
  const stripped = inner
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return decodeBasicHtml(stripped).slice(0, 240);
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export type LinkTrackerResult = {
  html: string;
  linksInserted: number;
};

export async function rewriteHtmlForTracking(
  html: string,
  sendId: string,
  baseUrl: string,
  supabaseAdmin: SupabaseClient,
): Promise<LinkTrackerResult> {
  const keyByUrl = buildLinkKeyIndex();
  const idByUrl = new Map<string, string>();
  const rows: LinkRow[] = [];
  const sanitizedBase = trimTrailingSlash(baseUrl);

  const rewritten = html.replace(
    TRACKABLE_ANCHOR_REGEX,
    (_match, before: string, url: string, after: string, inner: string) => {
      const cleanUrl = url.trim();
      let id = idByUrl.get(cleanUrl);
      if (!id) {
        id = generateLinkId();
        idByUrl.set(cleanUrl, id);
        rows.push({
          id,
          send_id: sendId,
          original_url: cleanUrl,
          link_label: extractAnchorLabel(inner) || null,
          link_key: keyByUrl.get(cleanUrl) ?? null,
        });
      }
      const trackedHref = `${sanitizedBase}/r/${id}`;
      const extras = `${before} ${after}`.replace(/\s+/g, " ").trim();
      const attrSuffix = extras ? ` ${extras}` : "";
      return `<a href="${trackedHref}"${attrSuffix}>${inner}</a>`;
    },
  );

  if (rows.length === 0) {
    return { html: rewritten, linksInserted: 0 };
  }

  const { error } = await supabaseAdmin.from("mail_send_links").insert(rows);
  if (error) {
    throw new Error(`Failed to persist tracked links: ${error.message}`);
  }

  return { html: rewritten, linksInserted: rows.length };
}

/**
 * Returns the configured public base URL for redirect links.
 * Falls back to the request origin when neither env var is set so
 * local dev still works.
 */
export function resolveTrackingBaseUrl(request: Request): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (fromEnv) return fromEnv;
  try {
    return new URL(request.url).origin;
  } catch {
    return "";
  }
}

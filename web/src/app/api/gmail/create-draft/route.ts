import { createGmailDraft } from "@/lib/gmail";
import { sanitizeEmailList, sanitizeText } from "@/lib/security/input-sanitize";
import { checkRateLimit, createRateLimitHeaders, getClientIp } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

type RequestPayload = {
  to?: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  html_body?: string;
};

const draftPayloadSchema = z.object({
  to: z.string().optional(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(30000),
  html_body: z.string().max(60000).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientIp = getClientIp(request);
  const limitResult = checkRateLimit(`gmail-draft:${user.id}:${clientIp}`, {
    windowMs: 60 * 60 * 1000,
    max: 80,
  });
  if (!limitResult.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please retry later." },
      { status: 429, headers: createRateLimitHeaders(limitResult) },
    );
  }

  const parsedPayload = draftPayloadSchema.safeParse(await request.json());
  if (!parsedPayload.success) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }
  const payload: RequestPayload = {
    to: sanitizeEmailList(parsedPayload.data.to, 500),
    cc: sanitizeEmailList(parsedPayload.data.cc, 500),
    bcc: sanitizeEmailList(parsedPayload.data.bcc, 500),
    subject: sanitizeText(parsedPayload.data.subject, { maxLen: 300 }),
    body: sanitizeText(parsedPayload.data.body, { maxLen: 30000, allowNewlines: true }),
    html_body: parsedPayload.data.html_body,
  };
  if (!payload.subject || !payload.body) {
    return NextResponse.json({ error: "Missing required fields: subject, body" }, { status: 400 });
  }

  const refreshToken = user.user_metadata?.gmail_refresh_token as string | undefined;
  if (!refreshToken) return NextResponse.json({ error: "Gmail is not connected" }, { status: 400 });

  try {
    const result = await createGmailDraft(refreshToken, payload);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed to create Gmail draft." }, { status: 500 });
  }
}

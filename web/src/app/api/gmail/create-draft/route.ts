import { createGmailDraft } from "@/lib/gmail";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type RequestPayload = {
  to?: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  html_body?: string;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = (await request.json()) as RequestPayload;
  if (!payload.subject || !payload.body) {
    return NextResponse.json({ error: "Missing required fields: subject, body" }, { status: 400 });
  }

  const refreshToken = user.user_metadata?.gmail_refresh_token as string | undefined;
  if (!refreshToken) return NextResponse.json({ error: "Gmail is not connected" }, { status: 400 });

  try {
    const result = await createGmailDraft(refreshToken, payload);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

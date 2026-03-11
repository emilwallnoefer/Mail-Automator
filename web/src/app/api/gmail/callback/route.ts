import { exchangeCodeForTokens } from "@/lib/gmail";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (!code) return NextResponse.redirect(new URL("/dashboard?gmail=error", request.url));

  try {
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    const nextMetadata: Record<string, unknown> = { ...user.user_metadata };
    if (tokens.refresh_token) {
      nextMetadata.gmail_refresh_token = tokens.refresh_token;
    }
    nextMetadata.gmail_email = user.email ?? "Connected";

    const { error } = await supabase.auth.updateUser({
      data: nextMetadata,
    });
    if (error) throw error;
  } catch {
    return NextResponse.redirect(new URL("/dashboard?gmail=error", request.url));
  }

  return NextResponse.redirect(new URL("/dashboard?gmail=connected", request.url));
}

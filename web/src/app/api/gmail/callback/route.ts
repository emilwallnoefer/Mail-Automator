import { exchangeCodeForTokens, getConnectedGmailEmail } from "@/lib/gmail";
import { saveGmailToken } from "@/lib/gmail-tokens";
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
    const connectedGmail =
      (await getConnectedGmailEmail(tokens, redirectUri).catch(() => null)) ||
      String(user.user_metadata?.gmail_email ?? "");

    // The refresh token is a secret and must never touch user_metadata (which
    // is embedded in the client-readable JWT). Store it server-side only.
    if (tokens.refresh_token) {
      await saveGmailToken(user.id, {
        refresh_token: tokens.refresh_token,
        gmail_email: connectedGmail || null,
      });
    }

    // gmail_email is not secret; keep it in user_metadata for display.
    if (connectedGmail) {
      const { error } = await supabase.auth.updateUser({
        data: { ...user.user_metadata, gmail_email: connectedGmail },
      });
      if (error) throw error;
    }
  } catch {
    return NextResponse.redirect(new URL("/dashboard?gmail=error", request.url));
  }

  return NextResponse.redirect(new URL("/dashboard?gmail=connected", request.url));
}

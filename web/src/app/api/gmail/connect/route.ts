import { getAuthUrl } from "@/lib/gmail";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const authUrl = getAuthUrl(process.env.GOOGLE_OAUTH_REDIRECT_URI || "");
  return NextResponse.redirect(authUrl);
}

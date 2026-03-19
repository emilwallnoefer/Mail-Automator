import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL("/login?error=oauth_failed", requestUrl.origin));
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const email = user?.email?.toLowerCase() ?? "";
    if (!email.endsWith("@flyability.com")) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/login?error=domain_not_allowed", requestUrl.origin));
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}

import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/dashboard";
  let response = NextResponse.redirect(new URL(next, requestUrl.origin));

  if (code) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.redirect(new URL("/login?error=oauth_failed", requestUrl.origin));
    }
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL("/login?error=oauth_failed", requestUrl.origin));
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const email = user?.email?.toLowerCase() ?? "";
    if (!email.endsWith("@flyability.com")) {
      response = NextResponse.redirect(new URL("/login?error=domain_not_allowed", requestUrl.origin));
      await supabase.auth.signOut();
      return response;
    }
  }

  return response;
}

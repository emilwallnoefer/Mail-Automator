import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * @param requestHeaders headers to forward to the app (carries the CSP nonce set
 *   by `proxy.ts`). Must be threaded through every `NextResponse.next()` here, or
 *   the nonce is lost and Next cannot stamp its inline scripts.
 */
export async function updateSession(request: NextRequest, requestHeaders?: Headers) {
  const nextRequest = requestHeaders ? { headers: requestHeaders } : request;
  let response = NextResponse.next({ request: nextRequest });
  try {
    if (!isSupabaseConfigured()) {
      // Let public pages load with a clear UI; avoid hard middleware crashes.
      return response;
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            response = NextResponse.next({ request: nextRequest });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (
      !user &&
      (request.nextUrl.pathname.startsWith("/dashboard") || request.nextUrl.pathname.startsWith("/settings"))
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    if (user && request.nextUrl.pathname === "/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }

    return response;
  } catch {
    // Fail closed on protected routes (SECURITY.md T1.5): if the session can't
    // be verified, don't let a gated page render — send to login. Public pages
    // still load normally.
    const path = request.nextUrl.pathname;
    if (path.startsWith("/dashboard") || path.startsWith("/settings")) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request: nextRequest });
  }
}

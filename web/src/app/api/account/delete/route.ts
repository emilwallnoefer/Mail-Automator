import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, createRateLimitHeaders, getClientIp } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientIp = getClientIp(request);
  const limitResult = checkRateLimit(`account-delete:${user.id}:${clientIp}`, {
    windowMs: 60 * 60 * 1000,
    max: 10,
  });
  if (!limitResult.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please retry later." },
      { status: 429, headers: createRateLimitHeaders(limitResult) },
    );
  }

  // Service-role access goes through the single "server-only" admin helper so
  // the key is never read from a route file. See CLAUDE.md: SUPABASE_SERVICE_ROLE_KEY
  // is referenced only from lib/supabase/admin.ts.
  let adminClient;
  try {
    adminClient = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Server is missing account-delete configuration (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 },
    );
  }

  const { error } = await adminClient.auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json({ error: "Failed to delete account." }, { status: 500 });
  }

  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}

import { DashboardShell } from "@/components/dashboard-shell";
import type { WeekResponse } from "@/components/time-tracker-panel";
import { normalizeUserRole } from "@/lib/user-role";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isAdminEmail } from "@/lib/admin";
import { fetchCurrentUserWeek, getWeekStartDate } from "@/lib/time-tracker-queries";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  // Verify the session locally (no Auth-server round-trip). Middleware already
  // ran the authoritative `getUser()` for this request and redirected away any
  // unauthenticated visitor, so re-validating here only adds latency to the SSR
  // critical path. Reading the JWT claims is enough to resolve role/email and
  // seed the first week — same pattern as `/api/time-tracker`.
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims ?? null;

  if (!claims) redirect("/login");

  const userMetadata =
    claims.user_metadata && typeof claims.user_metadata === "object" && !Array.isArray(claims.user_metadata)
      ? (claims.user_metadata as Record<string, unknown>)
      : null;
  const userRoleRaw = userMetadata && "role" in userMetadata ? userMetadata.role : null;
  const email = typeof claims.email === "string" ? claims.email : null;
  const initialRole = normalizeUserRole(userRoleRaw);
  const isAdmin = isAdminEmail(email);

  let initialWeek: WeekResponse | null = null;
  if (initialRole === "sales" || initialRole === "hr") {
    try {
      const weekStartDate = getWeekStartDate();
      if (weekStartDate) {
        initialWeek = (await fetchCurrentUserWeek(supabase, weekStartDate)) as WeekResponse;
      }
    } catch {
      // Non-blocking: panel falls back to its client-side fetch path.
    }
  }

  return (
    <DashboardShell
      email={email ?? "Signed in"}
      initialRole={initialRole}
      isAdmin={isAdmin}
      initialWeek={initialWeek}
    />
  );
}

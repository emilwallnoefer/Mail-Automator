import { DashboardShell } from "@/components/dashboard-shell";
import type { WeekResponse } from "@/components/time-tracker-panel";
import { normalizeUserRole } from "@/lib/user-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isAdminEmail } from "@/lib/admin";
import { fetchCurrentUserWeek, getWeekStartDate } from "@/lib/time-tracker-queries";
import { fetchInitialSettings, type InitialSettingsData } from "@/lib/settings-queries";
import {
  fetchAdminTimeOverview,
  fetchAdminUsers,
  type AdminListedUser,
  type AdminTimeOverview,
} from "@/lib/admin-queries";
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
  const userId = typeof claims.sub === "string" ? claims.sub : null;
  const initialRole = normalizeUserRole(userRoleRaw);
  const isAdmin = isAdminEmail(email);
  const isPilot = initialRole !== "sales" && initialRole !== "hr";

  // Prefetch each landing/panel's initial data server-side so the panels paint
  // seeded instead of waterfalling client fetches on open. Every prefetch is
  // non-blocking: on failure we log and fall back to the panel's client fetch.
  const weekStartDate = getWeekStartDate();

  const initialWeekPromise: Promise<WeekResponse | null> =
    (initialRole === "sales" || initialRole === "hr") && weekStartDate
      ? fetchCurrentUserWeek(supabase, weekStartDate)
          .then((week) => week as WeekResponse)
          .catch((error) => {
            console.error("Dashboard SSR: fetchCurrentUserWeek failed", error);
            return null;
          })
      : Promise.resolve(null);

  // Settings data is cheap: travel mapping + signature come from the JWT metadata
  // we already have; only the Gmail connection needs a service-role read.
  const initialSettingsPromise: Promise<InitialSettingsData | null> =
    isPilot && userId
      ? fetchInitialSettings(userId, userMetadata).catch((error) => {
          console.error("Dashboard SSR: fetchInitialSettings failed", error);
          return null;
        })
      : Promise.resolve(null);

  // Admin tables (users + current-week overview). Gated on the email-based admin
  // check (equivalent to guardAdmin) before touching the service-role client.
  const adminUsersPromise: Promise<AdminListedUser[] | null> = isAdmin
    ? fetchAdminUsers(createAdminClient()).catch((error) => {
        console.error("Dashboard SSR: fetchAdminUsers failed", error);
        return null;
      })
    : Promise.resolve(null);
  const adminOverviewPromise: Promise<AdminTimeOverview | null> =
    isAdmin && weekStartDate
      ? fetchAdminTimeOverview(createAdminClient(), weekStartDate).catch((error) => {
          console.error("Dashboard SSR: fetchAdminTimeOverview failed", error);
          return null;
        })
      : Promise.resolve(null);

  const [initialWeek, initialSettings, initialAdminUsers, initialAdminOverview] = await Promise.all([
    initialWeekPromise,
    initialSettingsPromise,
    adminUsersPromise,
    adminOverviewPromise,
  ]);

  return (
    <DashboardShell
      email={email ?? "Signed in"}
      initialRole={initialRole}
      isAdmin={isAdmin}
      initialWeek={initialWeek}
      initialSettings={initialSettings}
      initialAdminUsers={initialAdminUsers}
      initialAdminOverview={initialAdminOverview}
    />
  );
}

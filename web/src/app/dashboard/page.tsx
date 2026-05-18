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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const userRoleRaw =
    user.user_metadata &&
    typeof user.user_metadata === "object" &&
    !Array.isArray(user.user_metadata) &&
    "role" in user.user_metadata
      ? (user.user_metadata as Record<string, unknown>).role
      : null;
  const initialRole = normalizeUserRole(userRoleRaw);
  const isAdmin = isAdminEmail(user.email);

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
      email={user.email ?? "Signed in"}
      initialRole={initialRole}
      isAdmin={isAdmin}
      initialWeek={initialWeek}
    />
  );
}

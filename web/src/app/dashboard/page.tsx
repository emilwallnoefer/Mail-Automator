import { DashboardShell } from "@/components/dashboard-shell";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
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
  const initialRole = userRoleRaw === "pilot" || userRoleRaw === "sales" ? userRoleRaw : null;

  return <DashboardShell email={user.email ?? "Signed in"} initialRole={initialRole} />;
}

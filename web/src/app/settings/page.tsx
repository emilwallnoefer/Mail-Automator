import { SettingsShell } from "@/components/settings-shell";
import { normalizeUserRole } from "@/lib/user-role";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
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
  const userRole = normalizeUserRole(userRoleRaw);

  return <SettingsShell email={user.email ?? "Signed in"} userRole={userRole} />;
}

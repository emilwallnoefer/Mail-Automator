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

  // Role lives in app_metadata (service-role writable only), not user_metadata.
  // See SECURITY.md T0.1.
  const userRoleRaw =
    user.app_metadata &&
    typeof user.app_metadata === "object" &&
    !Array.isArray(user.app_metadata) &&
    "role" in user.app_metadata
      ? (user.app_metadata as Record<string, unknown>).role
      : null;
  const userRole = normalizeUserRole(userRoleRaw);

  return <SettingsShell email={user.email ?? "Signed in"} userRole={userRole} />;
}

import { SettingsShell } from "@/components/settings-shell";
import { SETTINGS_SECTION_IDS, type SettingsSectionId } from "@/components/settings/types";
import { normalizeUserRole } from "@/lib/user-role";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { redirect } from "next/navigation";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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

  // The panel keeps `?section=` in sync, so a reload reopens the same section.
  // It is resolved here rather than on mount because this page is server
  // rendered: reading the URL during the client's first render would not match.
  const requestedSectionRaw = (await searchParams).section;
  const initialSection =
    typeof requestedSectionRaw === "string" &&
    SETTINGS_SECTION_IDS.includes(requestedSectionRaw as SettingsSectionId)
      ? (requestedSectionRaw as SettingsSectionId)
      : null;

  return (
    <SettingsShell email={user.email ?? "Signed in"} userRole={userRole} initialSection={initialSection} />
  );
}

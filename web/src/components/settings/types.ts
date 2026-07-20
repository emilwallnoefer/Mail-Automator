import type { UserRole } from "@/lib/user-role";

export type SettingsSectionId =
  | "gmail"
  | "travel_mapping"
  | "mail_signature"
  | "time_data"
  | "appearance"
  | "interface_sounds"
  | "security"
  | "readme";

export const SETTINGS_NAV: { id: SettingsSectionId; label: string; pilotOnly?: boolean }[] = [
  { id: "gmail", label: "Gmail", pilotOnly: true },
  { id: "travel_mapping", label: "Travel mapping", pilotOnly: true },
  { id: "mail_signature", label: "Mail signature", pilotOnly: true },
  { id: "time_data", label: "Time data" },
  { id: "appearance", label: "Appearance" },
  { id: "interface_sounds", label: "Interface sounds" },
  { id: "security", label: "Account & security" },
  { id: "readme", label: "Help & README" },
];

export function filterSettingsNav(isSalesOnly: boolean, navFilter: string) {
  const visible = SETTINGS_NAV.filter((item) => !item.pilotOnly || !isSalesOnly);
  const q = navFilter.trim().toLowerCase();
  return q === "" ? visible : visible.filter((item) => item.label.toLowerCase().includes(q));
}

export type SettingsPanelProps = {
  email: string;
  showStandaloneActions?: boolean;
  autoOpenProgramReadmeToken?: number;
  userRole?: UserRole;
};

export type GmailStatus = { connected: boolean; gmail_email?: string | null };

export type TravelMapping = {
  clientColumn: string;
  locationColumn: string;
  responsibleColumn: string;
};

export type ReadmeKey = "program" | "gmail" | "mapping" | "import";

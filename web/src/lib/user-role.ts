export type UserRole = "sales" | "eu_pilot" | "us_pilot" | "hr";

/** Maps Supabase `user_metadata.role` to a known role. Legacy `pilot` is treated as EU Pilot. */
export function normalizeUserRole(raw: unknown): UserRole | null {
  if (raw === "sales") return "sales";
  if (raw === "eu_pilot" || raw === "pilot") return "eu_pilot";
  if (raw === "us_pilot") return "us_pilot";
  if (raw === "hr") return "hr";
  return null;
}

export function userRoleLabel(role: UserRole | null): string {
  if (role === "sales") return "Sales";
  if (role === "eu_pilot") return "EU Pilot";
  if (role === "us_pilot") return "US Pilot";
  if (role === "hr") return "HR";
  return "Not selected";
}

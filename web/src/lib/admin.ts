import "server-only";

/**
 * Returns the list of admin emails from the `ADMIN_EMAILS` env var.
 * Emails are comma-separated and compared case-insensitively.
 */
export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
}

/** True if the given email is listed in `ADMIN_EMAILS`. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const target = email.trim().toLowerCase();
  if (!target) return false;
  return getAdminEmails().includes(target);
}

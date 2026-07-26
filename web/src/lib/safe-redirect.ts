/**
 * Same-origin redirect target validation.
 *
 * `new URL(next, origin)` does NOT keep an attacker on our origin: for an
 * absolute or protocol-relative `next` the base is ignored entirely, so
 * `new URL("https://evil.example", origin)` resolves to `https://evil.example/`.
 * Any user-supplied redirect target must therefore be checked before it is
 * handed to NextResponse.redirect (security audit run-3, F3).
 *
 * Only a relative path rooted at a single "/" is accepted. Everything else —
 * absolute URLs, protocol-relative "//host", backslash variants that some
 * browsers normalise to "//", and anything carrying control characters — falls
 * back to the caller's default.
 */

export const DEFAULT_REDIRECT_PATH = "/dashboard";

/**
 * True if the value contains a C0 or C1 control character. CR/LF/TAB can split
 * headers, and browsers strip some of these before navigating — which would
 * resolve to a different target than the one we validated. Checked by code point
 * rather than a regex literal so no raw control bytes live in this source file.
 */
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

export function safeRedirectPath(
  raw: string | null | undefined,
  fallback: string = DEFAULT_REDIRECT_PATH,
): string {
  if (typeof raw !== "string") return fallback;

  const value = raw.trim();
  if (!value) return fallback;

  if (hasControlChars(value)) return fallback;

  // Browsers normalise a leading backslash to a forward slash, so
  // "/\evil.example" and "\\evil.example" navigate like "//evil.example".
  // Reject backslashes outright rather than trying to model that.
  if (value.includes("\\")) return fallback;

  // Must be rooted at exactly one "/" — "//host" is protocol-relative and
  // "dashboard" is not same-origin-guaranteed once resolved against a base.
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;

  return value;
}

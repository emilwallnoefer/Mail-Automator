/** Joins class fragments, skipping falsy values. Callers must not pass
 * utilities that conflict with a primitive's base classes (no tailwind-merge
 * here) — use the primitive's props (variant/size/padding) for those. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

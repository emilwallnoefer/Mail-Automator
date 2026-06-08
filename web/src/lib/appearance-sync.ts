"use client";

// Best-effort persistence of appearance prefs to the signed-in user's account
// (Supabase user_metadata via /api/settings/appearance). localStorage remains the
// instant client cache; this call makes the choice survive new sessions/devices.
// Fire-and-forget: failures (logged-out, offline) are swallowed — the device-local
// localStorage copy still applies, and SSR reconciles once the user is signed in.
export function syncAppearanceToServer(patch: { theme?: string; accent?: string }): void {
  if (typeof window === "undefined") return;
  try {
    void fetch("/api/settings/appearance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Ignore — device-local persistence already happened.
  }
}

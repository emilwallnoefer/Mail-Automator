"use client";

// Light-theme accent scheme. Only affects the Solarized Light skin; the dark
// theme ignores it. Mirrors the persistence/bootstrap pattern in theme.ts.

export type Accent = "amber" | "blue";

export const ACCENTS: { value: Accent; label: string; swatch: string }[] = [
  { value: "amber", label: "Warm amber", swatch: "#b58900" },
  { value: "blue", label: "Dusty blue", swatch: "#3e6d8e" },
];

const ACCENT_STORAGE_KEY = "ma_accent_light";
const DEFAULT_ACCENT: Accent = "amber";

function isAccent(v: unknown): v is Accent {
  return v === "amber" || v === "blue";
}

function readStoredAccent(): Accent {
  if (typeof window === "undefined") return DEFAULT_ACCENT;
  try {
    const v = window.localStorage.getItem(ACCENT_STORAGE_KEY);
    return isAccent(v) ? v : DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}

let accentCache: Accent | null = null;

function applyAccentAttribute(accent: Accent): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.accent = accent;
}

export function getAccent(): Accent {
  if (accentCache === null && typeof window !== "undefined") {
    accentCache = readStoredAccent();
  }
  return accentCache ?? DEFAULT_ACCENT;
}

export function setAccent(accent: Accent): void {
  accentCache = accent;
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ACCENT_STORAGE_KEY, accent);
    }
  } catch {
    // Ignore quota / private mode.
  }
  applyAccentAttribute(accent);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ma-accent-changed", { detail: { accent } }));
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key !== ACCENT_STORAGE_KEY) return;
    accentCache = readStoredAccent();
    applyAccentAttribute(accentCache);
    window.dispatchEvent(
      new CustomEvent("ma-accent-changed", { detail: { accent: accentCache } }),
    );
  });
}

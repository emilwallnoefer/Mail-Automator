"use client";

import { syncAppearanceToServer } from "@/lib/appearance-sync";

// Appearance mode. `dark` and `light` (softened Solarized) are the base skins;
// `blue` is a clean pastel cool-blue variant of the light skin — it reuses the
// entire light CSS via data-theme="light" and adds a data-mode="blue" tint.
export type Theme = "dark" | "light" | "blue";

export const THEMES: { value: Theme; label: string; swatch: string }[] = [
  { value: "dark", label: "Dark", swatch: "#0f172a" },
  { value: "light", label: "Solarized light", swatch: "#fcfaf5" },
  { value: "blue", label: "Glacier blue", swatch: "#a9cdf0" },
];

const THEME_STORAGE_KEY = "ma_theme";
const DEFAULT_THEME: Theme = "dark";

function isTheme(v: unknown): v is Theme {
  return v === "dark" || v === "light" || v === "blue";
}

// Map any stored value to a current theme. Legacy "glacier"/"sky" (the old split
// cool-blue skins) now collapse into the single "blue" mode.
function normalizeStoredTheme(v: unknown): Theme {
  if (v === "glacier" || v === "sky") return "blue";
  return isTheme(v) ? v : DEFAULT_THEME;
}

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    return normalizeStoredTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

let themeCache: Theme | null = null;

function applyThemeAttribute(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "blue") {
    // Light skin + cool-blue tint. Mirrors the pre-hydration bootstrap script.
    root.dataset.theme = "light";
    root.dataset.mode = "blue";
  } else if (theme === "light") {
    root.dataset.theme = "light";
    delete root.dataset.mode;
  } else {
    delete root.dataset.theme;
    delete root.dataset.mode;
  }
}

export function getTheme(): Theme {
  if (themeCache === null && typeof window !== "undefined") {
    themeCache = readStoredTheme();
  }
  return themeCache ?? DEFAULT_THEME;
}

export function setTheme(theme: Theme): void {
  themeCache = theme;
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  } catch {
    // Ignore quota / private mode.
  }
  applyThemeAttribute(theme);
  syncAppearanceToServer({ theme });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ma-theme-changed", { detail: { theme } }));
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key !== THEME_STORAGE_KEY) return;
    themeCache = readStoredTheme();
    applyThemeAttribute(themeCache);
    window.dispatchEvent(
      new CustomEvent("ma-theme-changed", { detail: { theme: themeCache } }),
    );
  });
}

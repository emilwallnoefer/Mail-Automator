"use client";

// Appearance mode. `dark` and `light` (Solarized) are the base skins; `glacier`
// and `sky` are MacBook Air-inspired cool-blue variants of the light skin — they
// reuse the entire light CSS via data-theme="light" and add a data-mode tint.
export type Theme = "dark" | "light" | "glacier" | "sky";

export const THEMES: { value: Theme; label: string; swatch: string }[] = [
  { value: "dark", label: "Dark", swatch: "#0f172a" },
  { value: "light", label: "Solarized light", swatch: "#fdf6e3" },
  { value: "glacier", label: "Glacier blue", swatch: "#8ebfd6" },
  { value: "sky", label: "Sky blue", swatch: "#9cc0ea" },
];

const THEME_STORAGE_KEY = "ma_theme";
const DEFAULT_THEME: Theme = "dark";

function isTheme(v: unknown): v is Theme {
  return v === "dark" || v === "light" || v === "glacier" || v === "sky";
}

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

let themeCache: Theme | null = null;

function applyThemeAttribute(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "glacier" || theme === "sky") {
    // Light skin + cool-blue tint. Mirrors the pre-hydration bootstrap script.
    root.dataset.theme = "light";
    root.dataset.mode = theme;
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

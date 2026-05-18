"use client";

export type Theme = "dark" | "light";

const THEME_STORAGE_KEY = "ma_theme";
const DEFAULT_THEME: Theme = "dark";

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" ? "light" : "dark";
  } catch {
    return DEFAULT_THEME;
  }
}

let themeCache: Theme | null = null;

function applyThemeAttribute(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
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

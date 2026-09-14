"use client";

import { useEffect, useState } from "react";

/**
 * View state that has to survive a reload lives in the URL's query string: the
 * dashboard's open module (`?module=`) and the section inside it (`?section=`).
 * Writes go through `history.replaceState` rather than the Next router, so
 * switching a tab neither re-renders the route nor piles up history entries the
 * Back button has to walk through — the URL is a bookmark of the current view,
 * not a navigation step.
 */

/** Read a param from the current URL, ignoring values outside `valid`. */
export function readViewParam<T extends string>(name: string, valid: readonly T[]): T | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get(name);
  return raw && (valid as readonly string[]).includes(raw) ? (raw as T) : null;
}

/** Set (or, on `null`, remove) params without adding a history entry. */
export function writeViewParams(params: Record<string, string | null>) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  let changed = false;
  for (const [key, value] of Object.entries(params)) {
    const current = url.searchParams.get(key);
    if (value === null) {
      if (current === null) continue;
      url.searchParams.delete(key);
    } else {
      if (current === value) continue;
      url.searchParams.set(key, value);
    }
    changed = true;
  }
  if (!changed) return;
  // Keep the existing state object: the App Router stores its own routing data
  // there, and replacing it with `{}` breaks browser back/forward.
  window.history.replaceState(window.history.state, "", url.toString());
}

/**
 * A piece of view state mirrored into `?<name>=`, seeded from the URL on mount
 * so a reload lands where the user was.
 *
 * `seed` is for server-rendered callers, which cannot read `window` during the
 * first render without a hydration mismatch — they pass the value the server
 * already parsed out of `searchParams`. Client-only callers (the panels behind
 * a `dynamic(..., { ssr: false })` import) omit it and the URL is read here.
 */
export function useViewParam<T extends string>(
  name: string,
  valid: readonly T[],
  fallback: T,
  seed?: T | null,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => seed ?? readViewParam(name, valid) ?? fallback);

  useEffect(() => {
    writeViewParams({ [name]: value });
  }, [name, value]);

  return [value, setValue];
}

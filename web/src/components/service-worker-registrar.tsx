"use client";

import { useEffect } from "react";

/**
 * Registers `public/sw.js`, the worker that shows the game when a page cannot
 * load offline.
 *
 * Production only: in development the worker would hold on to chunks that
 * hot reload keeps replacing. The build id rides on the script URL, so each
 * deploy installs a fresh worker that re-caches the offline page against its
 * own chunks (see `next.config.ts`).
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const build = encodeURIComponent(process.env.NEXT_PUBLIC_APP_BUILD ?? "0");
    // After load, so installing (which fetches the offline page and its
    // files) never competes with the page the user actually asked for.
    const register = () => {
      navigator.serviceWorker.register(`/sw.js?v=${build}`, { scope: "/" }).catch(() => {
        // No worker just means no offline page — the browser's own error shows instead.
      });
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);
  return null;
}

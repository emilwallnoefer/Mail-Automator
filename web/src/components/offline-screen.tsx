"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui";
import { EliosGame } from "@/components/elios-game";
import { readOnline, subscribeOnline } from "@/lib/online-status";

/**
 * The offline page: the game, and a way back once the connection returns.
 *
 * It does not reload on its own when the browser comes back online — that
 * would throw away a run in progress. It offers instead.
 *
 * `leaderboard` is on even though there is no network: the board simply fails
 * to load, a finished run is queued in localStorage, and both catch up the
 * moment the browser reports it is online again.
 *
 * The server snapshot is "offline", unlike everywhere else: the service worker
 * caches this page's HTML while the browser is online, but only ever shows it
 * when it is not, so the server-rendered first frame should say so.
 */
const readOfflineOnServer = () => false;

export function OfflineScreen() {
  const online = useSyncExternalStore(subscribeOnline, readOnline, readOfflineOnServer);

  return (
    <main
      id="main-content"
      className="relative grid min-h-dvh place-items-center overflow-x-hidden bg-surface p-4 text-ink"
    >
      <div className="absolute inset-0 aurora-bg" />
      <div className="relative w-full max-w-md rounded-2xl border border-glass/20 bg-surface/95 p-6 shadow-xl">
        <p className="text-[11px] uppercase tracking-[0.15em] text-accent-soft/75">
          {online ? "Connection is back" : "No connection"}
        </p>
        <h1 className="mt-2 text-lg font-semibold">
          {online ? "You’re back online" : "You’re offline"}
        </h1>
        <p className="mt-3 text-sm text-ink-3/85">
          {online
            ? "Finish your run if you like — your score goes on the leaderboard either way."
            : "The workspace needs a connection. Scores flown now are saved and go on the leaderboard once you’re back."}
        </p>
        <EliosGame leaderboard />
        <Button
          type="button"
          variant="glass"
          size="md"
          className="mt-5 w-full"
          onClick={() => {
            // The worker serves this page in place of the one that failed, so
            // reloading retries that page. Opened directly, there is nothing
            // to retry — go to the workspace instead. A full load either way:
            // this page may be a cached copy from an older build, so its
            // client router cannot be trusted to know the current one.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            if (window.location.pathname === "/offline") window.location.assign("/dashboard");
            else window.location.reload();
          }}
        >
          {online ? "Back to the workspace" : "Try again"}
        </Button>
      </div>
    </main>
  );
}

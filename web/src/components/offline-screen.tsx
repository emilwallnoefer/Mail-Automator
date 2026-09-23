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
      className="relative flex min-h-dvh flex-col items-center justify-center overflow-x-hidden bg-surface px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-ink"
    >
      <div className="absolute inset-0 aurora-bg" />
      <div className="relative w-full max-w-md">
        <header className="text-center">
          <h1 className="text-2xl font-semibold">{online ? "You’re back online" : "You’re offline"}</h1>
          <p className="mt-1.5 text-sm text-ink-3/85">
            {online ? "Finish your run, then head back." : "Fly while you wait."}
          </p>
        </header>
        <EliosGame className="mt-6" leaderboard />
        <Button
          type="button"
          variant="glass"
          size="md"
          className="mt-6 w-full"
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

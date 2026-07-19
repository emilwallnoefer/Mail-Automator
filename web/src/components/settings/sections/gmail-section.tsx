"use client";

import { Button } from "@/components/ui";
import type { GmailStatus } from "../types";

export function GmailSection({ status, onDisconnect }: { status: GmailStatus; onDisconnect: () => void }) {
  return (
    <div className="mt-5">
      <p className="text-sm text-ink-4">Connect Google so generated training mails can be saved as Gmail drafts.</p>
      <div className="mt-4 rounded-xl border border-glass/15 bg-glass/5 p-4">
        <p className="text-sm text-ink-2/90">
          Status: <span className="font-medium">{status.connected ? "Connected" : "Disconnected"}</span>
          {status.gmail_email ? ` (${status.gmail_email})` : ""}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {status.connected ? (
            <Button variant="glass-quiet" size="sm" onClick={onDisconnect}>
              Disconnect Gmail
            </Button>
          ) : (
            <a
              href="/api/gmail/connect"
              className="rounded-lg bg-accent/90 px-3 py-2 text-center text-xs font-medium text-slate-900 transition hover:-translate-y-px hover:bg-accent"
            >
              Connect Gmail
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

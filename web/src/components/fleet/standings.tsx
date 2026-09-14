"use client";

import { ReliabilityBadge } from "./reliability-badge";
import { EmptyState } from "./ui";
import type { FleetBoardResponse } from "./types";

/**
 * The reliability leaderboard. Admin-only, and rendered inside Manage.
 *
 * Ranked, because the score's whole job is to settle a contested day — showing
 * it as an unordered list would hide the only thing it decides.
 */
export function Standings({ board }: { board: FleetBoardResponse | null }) {
  if (!board) return <p className="text-xs text-ink-4">Loading…</p>;
  if (board.standings.length === 0) {
    return (
      <EmptyState
        title="No booking history yet"
        hint="Scores appear once material has been taken out and brought back."
      />
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs leading-relaxed text-ink-4">
        Reliability is earned by bringing material back on time. It decides how far ahead you can book, and who wins
        a day two people want — the lower the score, the further down the queue.
      </p>
      <ol className="space-y-1.5">
        {board.standings.map((entry, index) => {
          const isMe = entry.user_id === board.me.user_id;
          return (
            <li
              key={entry.user_id}
              className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                isMe ? "border-accent/40 bg-accent-deep/15" : "border-glass/10 bg-glass/[0.04]"
              }`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="w-5 shrink-0 text-center text-[11px] tabular-nums text-ink-5">{index + 1}</span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-ink">
                    {entry.name}
                    {isMe ? " (you)" : ""}
                  </p>
                  <p className="truncate text-[11px] text-ink-5">{entry.score.summary}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs font-semibold tabular-nums text-ink-2">{entry.score.score}</span>
                <ReliabilityBadge score={entry.score} showScore={false} />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

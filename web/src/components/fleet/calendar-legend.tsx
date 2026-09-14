"use client";

import { holderRgb } from "@/lib/fleet-rules";

/**
 * Who is who on the board.
 *
 * Names only. The cell states (yours, overdue, unclaimed, past, beyond your
 * horizon) each carry their own outline or texture and are learned once, so
 * spelling them out under every board was a permanent block of text answering
 * a question nobody asks twice.
 */
export function CalendarLegend({ holders }: { holders: string[] }) {
  if (holders.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-glass/10 bg-glass/[0.03] px-3 py-2 text-[11px] text-ink-3">
      <span className="text-ink-5">Booked by</span>
      {holders.map((holder) => (
        <span key={holder} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-[3px]"
            style={{ backgroundColor: `rgb(${holderRgb(holder)} / 0.6)` }}
            aria-hidden
          />
          {holder}
        </span>
      ))}
    </div>
  );
}

"use client";

import { holderRgb } from "@/lib/fleet-rules";

/**
 * Who is who, and what the cell states mean.
 *
 * Two different things, so they are two different weights. The names are the
 * key you actually need to read the grid, so they stay on screen. The six
 * state swatches are a thing you learn once and then never look at again — they
 * used to occupy a permanent block under every board — so they sit behind a
 * disclosure, closed by default.
 */
export function CalendarLegend({ holders }: { holders: string[] }) {
  return (
    <div className="space-y-2">
      {holders.length > 0 ? (
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
      ) : null}

      <details className="group rounded-lg border border-glass/10 bg-glass/[0.03]">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-1.5 text-[11px] text-ink-5 transition hover:text-ink-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/80">
          <span className="transition ease-fluid group-open:rotate-90" aria-hidden>
            ›
          </span>
          What the shading means
        </summary>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-glass/[0.07] px-3 py-2.5 text-[11px] text-ink-5">
          <Swatch className="bg-glass/[0.07]" label="Free — click to book" />
          <Swatch
            className="bg-glass/25 outline outline-1 -outline-offset-1 outline-glass/60"
            label="Yours"
          />
          <Swatch
            className="bg-glass/25 outline outline-2 -outline-offset-2 outline-rose-400/90"
            label="Overdue"
          />
          <Swatch
            className="bg-glass/20 bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,0.22)_3px,rgba(255,255,255,0.22)_5px)]"
            label="Unclaimed name"
          />
          <Swatch className="bg-glass/[0.09]" label="Finished (same colour, faded)" />
          <Swatch
            className="bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,0.05)_3px,rgba(255,255,255,0.05)_6px)]"
            label="Beyond your booking horizon"
          />
        </div>
      </details>
    </div>
  );
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-5 shrink-0 rounded ${className}`} aria-hidden />
      {label}
    </span>
  );
}

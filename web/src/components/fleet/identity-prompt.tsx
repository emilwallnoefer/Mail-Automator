"use client";

import { useState } from "react";
import { Button, Notice } from "@/components/ui";

/**
 * The one-time "which of these names is you?" step.
 *
 * The old spreadsheet recorded who had what as free text, spelled
 * inconsistently ("Emil", "Emil Wallnofer"). Those bookings belong to nobody
 * until the person says which name is theirs — and until they do, the material
 * against that name has no owner to remind and no score to move.
 *
 * Asked once per PERSON, not once per browser: it keys off whether the user has
 * an alias on the server, so it does not reappear on a second device and does
 * not vanish when localStorage is cleared.
 *
 * Three ways out, all of which end the prompt for good:
 *   - "Yes, that's me"     — claims the suggested name.
 *   - "No, show the list"  — pick any unclaimed name.
 *   - "I'm not on the list" — registers them under their own name.
 */
export function IdentityPrompt({
  displayName,
  suggestions,
  allUnclaimed,
  busy,
  onClaim,
  onRegister,
}: {
  displayName: string;
  /** Names that look like this person, best guess first. */
  suggestions: Array<{ label: string; count: number; live: number }>;
  /** Every name with material against it and no account behind it. */
  allUnclaimed: Array<{ label: string; count: number; live: number }>;
  busy: boolean;
  onClaim: (label: string) => void;
  onRegister: () => void;
}) {
  // Skip straight to the list when we have nothing to suggest — asking "is this
  // you?" about a name we invented would be noise.
  const [showList, setShowList] = useState(suggestions.length === 0);
  const suggestion = suggestions[0];

  return (
    <div className="rounded-xl border border-accent/35 bg-accent-deep/12 p-4">
      <p className="text-[11px] uppercase tracking-[0.15em] text-accent-soft/70">One-time setup</p>

      {!showList && suggestion ? (
        <>
          <h3 className="mt-1.5 text-sm font-semibold text-ink">
            Is <span className="text-accent-soft">{suggestion.label}</span> you?
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-4">
            The old fleet sheet has {suggestion.count} booking{suggestion.count === 1 ? "" : "s"} under that name
            {suggestion.live > 0
              ? `, ${suggestion.live} of which ${suggestion.live === 1 ? "is" : "are"} still out`
              : ""}
            . Confirming makes them yours, so you can check the material back in.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="accent" disabled={busy} onClick={() => onClaim(suggestion.label)}>
              Yes, that&apos;s me
            </Button>
            <Button size="sm" variant="glass" disabled={busy} onClick={() => setShowList(true)}>
              No — show me the list
            </Button>
          </div>
        </>
      ) : (
        <>
          <h3 className="mt-1.5 text-sm font-semibold text-ink">Which name is yours?</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-4">
            These names have material recorded against them in the old sheet, but no account behind them yet. Pick
            yours to take over its bookings.
          </p>

          {allUnclaimed.length > 0 ? (
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {allUnclaimed.map((h) => (
                <li key={h.label}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onClaim(h.label)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-glass/12 bg-glass/[0.05] px-3 py-2 text-left text-xs text-ink transition hover:border-accent/50 hover:bg-accent-deep/20 disabled:opacity-60"
                  >
                    <span className="truncate">{h.label}</span>
                    <span className="shrink-0 text-[11px] text-ink-5">
                      {h.live > 0 ? `${h.live} out · ` : ""}
                      {h.count} booking{h.count === 1 ? "" : "s"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Notice tone="neutral" className="mt-3">
              Every name from the sheet has already been claimed.
            </Notice>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="glass" disabled={busy} onClick={onRegister}>
              I&apos;m not on the list — add me as {displayName}
            </Button>
            {suggestion ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setShowList(false)}>
                Back
              </Button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

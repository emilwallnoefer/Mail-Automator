"use client";

import { Badge, type BadgeTone } from "@/components/ui";
import { TIER_LABEL, type ReliabilityScore, type ReliabilityTier } from "@/lib/fleet-rules";

const TIER_TONE: Record<ReliabilityTier, BadgeTone> = {
  trusted: "positive",
  standard: "accent",
  watch: "warn",
  restricted: "danger",
};

export function ReliabilityBadge({ score, showScore = true }: { score: ReliabilityScore; showScore?: boolean }) {
  return (
    <Badge tone={TIER_TONE[score.tier]} title={score.summary}>
      {TIER_LABEL[score.tier]}
      {showScore ? ` · ${score.score}` : null}
    </Badge>
  );
}

/**
 * The user's own standing, spelled out. This is the part that has to feel fair
 * rather than punitive: it always says what the score *is*, what it came from,
 * and exactly what it buys you.
 */
export function ReliabilityCard({ score }: { score: ReliabilityScore }) {
  const barTone =
    score.tier === "trusted"
      ? "bg-emerald-400"
      : score.tier === "standard"
        ? "bg-accent"
        : score.tier === "watch"
          ? "bg-amber-400"
          : "bg-rose-400";

  return (
    <div className="rounded-xl border border-glass/10 bg-glass/[0.04] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.15em] text-ink-3/75">Your reliability</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{score.score}</p>
        </div>
        <ReliabilityBadge score={score} showScore={false} />
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-glass/10">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${barTone}`}
          style={{ width: `${score.score}%` }}
        />
      </div>

      <p className="mt-3 text-xs leading-relaxed text-ink-4">{score.summary}</p>
      <p className="mt-2 text-xs leading-relaxed text-ink-4">
        You can book up to <span className="font-semibold text-ink-2">{score.horizonWeeks} weeks</span> ahead, and
        you sit above anyone with a lower score when a week is contested.
      </p>
      {score.overdue > 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-warn">
          Returning what is out will lift this back immediately.
        </p>
      ) : null}
    </div>
  );
}

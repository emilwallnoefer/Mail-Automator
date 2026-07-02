import type { ReactNode } from "react";
import { InfoTooltip } from "@/components/info-tooltip";

export function StatTile({
  label,
  value,
  hint,
  info,
}: {
  label: string;
  value: string | number;
  hint?: string;
  info?: string;
}) {
  return (
    <div className="rounded-xl border border-glass/10 bg-glass/5 px-4 py-3">
      <div className="flex items-center gap-1.5">
        <p className="text-[10px] uppercase tracking-[0.15em] text-ink-3/70">{label}</p>
        {info ? <InfoTooltip label={`About ${label}`}>{info}</InfoTooltip> : null}
      </div>
      <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-ink-4">{hint}</p> : null}
    </div>
  );
}

export type HoverPos = { x: number; y: number; width: number; content: ReactNode } | null;

export function HoverTooltip({ hover }: { hover: HoverPos }) {
  if (!hover) return null;
  const left = Math.min(Math.max(hover.x, 80), Math.max(80, hover.width - 80));
  const top = Math.max(hover.y - 12, 8);
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-glass/15 bg-surface/95 px-3 py-2 text-[11px] leading-tight text-ink shadow-lg backdrop-blur"
      style={{ left, top }}
    >
      {hover.content}
    </div>
  );
}

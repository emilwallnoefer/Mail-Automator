/**
 * Small formatting helpers shared by the admin panel sections (overview stats,
 * reminder controls, audit log). Kept UI-agnostic so any client component can
 * import them without pulling in React.
 */

export function fmtRelative(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "never";
  const diffMs = Date.now() - then;
  const abs = Math.abs(diffMs);
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (abs < min) return "just now";
  if (abs < hour) return `${Math.floor(abs / min)}m ${diffMs > 0 ? "ago" : "from now"}`;
  if (abs < day) return `${Math.floor(abs / hour)}h ${diffMs > 0 ? "ago" : "from now"}`;
  if (abs < 30 * day) return `${Math.floor(abs / day)}d ${diffMs > 0 ? "ago" : "from now"}`;
  return new Date(iso).toLocaleDateString();
}

export function fmtAbsolute(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function fmtPct(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  const pct = value * 100;
  return pct >= 10 ? `${pct.toFixed(0)}%` : `${pct.toFixed(1)}%`;
}

"use client";

import type { CSSProperties } from "react";

export type FreshnessPillProps = {
  updatedAt: number | null;
  loading?: boolean;
  className?: string;
};

const PARTICLE_COUNT = 8;
const PARTICLE_CYCLE_MS = 1600;

export function FreshnessPill({ updatedAt, loading = false, className }: FreshnessPillProps) {
  const extra = className ? ` ${className}` : "";

  if (loading) {
    return (
      <span
        className={`freshness-pill freshness-pill--loading${extra}`}
        role="status"
        aria-label="Refreshing"
        aria-busy
      >
        {Array.from({ length: PARTICLE_COUNT }, (_, i) => {
          const angle = (360 / PARTICLE_COUNT) * i;
          const delay = (PARTICLE_CYCLE_MS / PARTICLE_COUNT) * i;
          const style = {
            "--particle-angle": `${angle}deg`,
            "--particle-delay": `${delay}ms`,
          } as CSSProperties;
          return <span key={i} className="freshness-pill-particle" aria-hidden style={style} />;
        })}
      </span>
    );
  }

  if (updatedAt == null) {
    return <span className={`freshness-pill${extra}`} role="status" aria-label="No data yet" />;
  }

  return (
    <span
      key={updatedAt}
      className={`freshness-pill freshness-flash${extra}`}
      role="status"
      aria-label="Just refreshed"
      title={new Date(updatedAt).toLocaleString()}
    />
  );
}

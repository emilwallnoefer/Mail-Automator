"use client";

export type FreshnessPillProps = {
  updatedAt: number | null;
  loading?: boolean;
  className?: string;
};

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
        <span className="freshness-pill-ripple" aria-hidden />
        <span className="freshness-pill-ripple freshness-pill-ripple--delayed" aria-hidden />
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

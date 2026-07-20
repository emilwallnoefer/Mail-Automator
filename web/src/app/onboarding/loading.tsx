/**
 * Route-level skeleton for the onboarding segment: sticky header + a stack of
 * resource-section placeholders. Semantic tokens; pulse gated behind
 * `motion-safe:` for the reduced-motion guard.
 */
export default function OnboardingLoading() {
  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-surface text-ink" aria-busy="true">
      <div className="absolute inset-0 aurora-bg" />
      <section className="page-shell relative z-[1]">
        <div className="glass-card sticky top-3 z-[90] p-2.5 md:p-3">
          <div className="flex items-center justify-between gap-3 motion-safe:animate-pulse">
            <div>
              <div className="h-3 w-24 rounded bg-glass/10" />
              <div className="mt-2 h-4 w-28 rounded bg-panel" />
            </div>
            <div className="h-8 w-36 rounded-lg border border-glass/10 bg-panel" />
          </div>
        </div>

        <div className="mt-4 space-y-4 motion-safe:animate-pulse">
          {[0, 1, 2].map((i) => (
            <div key={i} className="glass-card space-y-3 rounded-2xl p-5">
              <div className="h-5 w-48 max-w-full rounded bg-panel" />
              <div className="h-4 w-full rounded bg-glass/10" />
              <div className="h-4 w-2/3 rounded bg-glass/10" />
            </div>
          ))}
        </div>
        <span className="sr-only">Loading onboarding…</span>
      </section>
    </main>
  );
}

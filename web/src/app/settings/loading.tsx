/**
 * Route-level skeleton for the settings segment: a sidebar nav + section body
 * placeholder matching the settings panel. Semantic tokens; pulse gated behind
 * `motion-safe:` for the reduced-motion guard.
 */
export default function SettingsLoading() {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-surface text-ink" aria-busy="true">
      <div className="absolute inset-0 aurora-bg" />
      <section className="page-shell max-w-5xl">
        <div className="glass-card overflow-hidden rounded-2xl motion-safe:animate-pulse">
          <div className="flex flex-col md:flex-row">
            {/* Nav rail */}
            <div className="shrink-0 border-b border-glass/10 bg-overlay/40 p-4 md:w-60 md:border-b-0 md:border-r">
              <div className="h-5 w-24 rounded bg-glass/10" />
              <div className="mt-5 space-y-2">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-8 w-full rounded-lg bg-panel" />
                ))}
              </div>
            </div>

            {/* Section body */}
            <div className="min-w-0 flex-1 space-y-4 p-6">
              <div className="h-7 w-40 rounded-lg bg-panel" />
              <div className="h-4 w-72 max-w-full rounded bg-glass/10" />
              <div className="mt-4 space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 w-full rounded-xl border border-glass/10 bg-panel" />
                ))}
              </div>
            </div>
          </div>
        </div>
        <span className="sr-only">Loading settings…</span>
      </section>
    </main>
  );
}

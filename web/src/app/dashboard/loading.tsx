/**
 * Route-level skeleton for the dashboard segment. Mirrors the workspace-home
 * layout (greeting + module-card grid) so the swap to real content is calm.
 * Semantic tokens only; the pulse is gated behind `motion-safe:` so it stays
 * still under `prefers-reduced-motion: reduce`.
 */
export default function DashboardLoading() {
  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-surface text-ink" aria-busy="true">
      <div className="absolute inset-0 aurora-bg" />
      <section className="page-shell">
        <div className="motion-safe:animate-pulse">
          {/* Navbar placeholder */}
          <div className="mb-8 flex items-center justify-between">
            <div className="h-9 w-40 rounded-xl border border-glass/10 bg-panel" />
            <div className="h-9 w-28 rounded-xl border border-glass/10 bg-panel" />
          </div>

          {/* Greeting block */}
          <div className="mx-auto w-full max-w-5xl">
            <div className="mb-10 md:mb-14">
              <div className="h-3 w-24 rounded bg-glass/10" />
              <div className="mt-4 h-10 w-80 max-w-full rounded-lg bg-panel" />
              <div className="mt-4 h-4 w-96 max-w-full rounded bg-glass/10" />
              <div className="mt-5 h-6 w-28 rounded-full border border-glass/10 bg-glass/10" />
            </div>

            {/* Module card grid */}
            <div className="grid gap-4 md:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="flex min-h-[13rem] flex-col gap-4 rounded-[1.4rem] border border-glass/10 bg-panel p-6"
                >
                  <div className="h-11 w-11 rounded-xl border border-glass/10 bg-glass/10" />
                  <div className="h-5 w-32 rounded bg-glass/10" />
                  <div className="h-4 w-full rounded bg-glass/10" />
                  <div className="mt-auto h-4 w-20 rounded bg-glass/10" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <span className="sr-only">Loading your workspace…</span>
      </section>
    </main>
  );
}

import Link from "next/link";

/** Branded 404: same aurora/glass language as the rest of the app, with a
 * clear route back to the dashboard (login redirects there if signed out). */
export default function NotFound() {
  return (
    <main id="main-content" className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-surface px-4 py-8 text-ink">
      <div className="absolute inset-0 aurora-bg" />
      <div className="glass-card relative z-10 w-full max-w-md p-8 text-center">
        <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-accent-soft/70">Error 404</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">Page not found</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-4">
          This page doesn&apos;t exist or has moved. The dashboard is the best place to start.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-lg bg-accent/90 px-4 py-2.5 text-sm font-medium text-slate-900 transition ease-fluid hover:-translate-y-px hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/80"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}

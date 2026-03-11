"use client";

import { motion } from "framer-motion";

type DashboardShellProps = {
  email: string;
};

export function DashboardShell({ email }: DashboardShellProps) {
  const cards = [
    {
      title: "Create Drafts",
      description: "Use the internal /mail flow and confirm to push drafts into your Gmail account.",
    },
    {
      title: "Industry-Aware Links",
      description: "Only common + relevant industry links are included to keep emails focused.",
    },
    {
      title: "Draft-Only Safety",
      description: "No auto-send actions. Everything lands in Drafts for manual review.",
    },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 aurora-bg" />
      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8">
        <header className="glass-card mb-6 flex items-center justify-between p-5">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/80">Flyability Internal</p>
            <h1 className="text-xl font-semibold md:text-2xl">Mail Automator Dashboard</h1>
            <p className="mt-1 text-sm text-slate-200/80">{email}</p>
          </div>
          <form action="/logout" method="post">
            <button
              className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm transition hover:bg-white/15"
              type="submit"
            >
              Sign out
            </button>
          </form>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          {cards.map((card, index) => (
            <motion.article
              key={card.title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08, duration: 0.35 }}
              className="glass-card p-5"
            >
              <h2 className="text-lg font-medium">{card.title}</h2>
              <p className="mt-2 text-sm text-slate-200/80">{card.description}</p>
            </motion.article>
          ))}
        </div>

        <section className="glass-card mt-6 p-6">
          <h2 className="text-lg font-medium">Next Step</h2>
          <p className="mt-2 text-sm text-slate-200/80">
            Connect this dashboard to your shared mail generation endpoint, or continue using Cursor command mode while
            this UI handles auth and account-level access.
          </p>
        </section>
      </section>
    </main>
  );
}

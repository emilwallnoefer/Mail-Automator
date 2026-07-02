"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

/** Reveals a form field with a slide/fade once its prerequisites are filled. */
export function ProgressiveField({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          initial={{ opacity: 0, y: 8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -6, height: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function composerSegmentClass(active: boolean) {
  return [
    "rounded-lg border px-3 py-2.5 text-sm font-medium transition",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/90",
    active
      ? "border-accent/80 bg-accent/90 text-slate-900 shadow-[0_0_0_1px_rgba(34,211,238,0.35)]"
      : "border-glass/15 bg-glass/10 text-ink-2 hover:border-glass/25 hover:bg-glass/14",
  ].join(" ");
}

export function ComposerChoiceRow({
  label,
  children,
  columns = 2,
}: {
  label: string;
  children: ReactNode;
  columns?: 2 | 3;
}) {
  return (
    <div role="group" aria-label={label}>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.15em] text-ink-4/90">{label}</p>
      <div className={columns === 3 ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"}>{children}</div>
    </div>
  );
}

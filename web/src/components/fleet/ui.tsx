"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The handful of shapes the Fleet screens repeat.
 *
 * Before this file each list row, section heading and empty state was written
 * out by hand wherever it was needed, and they had drifted: three different row
 * paddings, two different heading sizes, and empty states that were sometimes a
 * bare sentence and sometimes nothing at all. None of that is worth a shared
 * primitive in `components/ui` — it is Fleet's own vocabulary, not the app's —
 * but it is very much worth having in one place.
 *
 * Anything here that turns out to be app-wide belongs in `components/ui`
 * instead; keep this file to shapes only Fleet uses.
 */

/** A list row: the standard glass well every asset and booking sits in. */
export function Row({
  tone = "default",
  className,
  children,
}: {
  /** `alert` is for a row the reader has to act on — an overdue booking. */
  tone?: "default" | "alert" | "muted";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 transition ease-fluid",
        tone === "alert"
          ? "border-rose-400/35 bg-rose-500/10"
          : tone === "muted"
            ? "border-glass/10 bg-glass/[0.02] opacity-70"
            : "border-glass/10 bg-glass/[0.04] hover:border-glass/20 hover:bg-glass/[0.06]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A section eyebrow, with the count carried as a separate muted chip.
 *
 * The count used to be part of the heading text ("Drone fleet (4)"), which put
 * it inside the uppercase letterspaced run and made it read as part of the
 * name. Splitting it keeps the heading a name and the number a number.
 */
export function SectionHeading({
  icon,
  children,
  count,
  action,
}: {
  icon?: ReactNode;
  children: ReactNode;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <h3 className="flex min-w-0 items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] text-ink-3/75">
        {icon}
        <span className="truncate">{children}</span>
      </h3>
      {count != null ? (
        <span className="shrink-0 rounded bg-glass/10 px-1.5 py-px text-[11px] tabular-nums text-ink-5">
          {count}
        </span>
      ) : null}
      <span className="h-px min-w-4 flex-1 bg-glass/10" aria-hidden />
      {action}
    </div>
  );
}

/**
 * What a screen says when it has nothing to show.
 *
 * Always says why it is empty and what to do about it — "Nothing booked" on its
 * own tells someone opening Fleet for the first time nothing at all.
 */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-glass/15 px-4 py-8 text-center">
      <p className="text-xs font-medium text-ink-2">{title}</p>
      {hint ? <p className="max-w-xs text-[11px] leading-relaxed text-ink-5">{hint}</p> : null}
      {action}
    </div>
  );
}

/**
 * A grey block standing in for content still on its way.
 *
 * `motion-safe:` rather than a bare `animate-pulse`: this is a perpetual
 * decorative animation, and the variant opts it out under reduced motion at the
 * call site instead of adding another selector to the guard block in
 * `decorations.css`.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("rounded bg-glass/10 motion-safe:animate-pulse", className)} aria-hidden />;
}

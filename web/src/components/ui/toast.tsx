import type { ReactNode } from "react";
import { m } from "framer-motion";
import { cn } from "@/lib/cn";

export type ToastTone = "positive" | "danger" | "neutral";

/** Trailing button (e.g. chat's "Undo"). */
export type ToastAction = {
  label: string;
  onClick: () => void;
};

const TONE_CLASSES: Record<ToastTone, string> = {
  positive: "border-emerald-400/30 bg-emerald-500/10 text-positive",
  danger: "border-rose-400/30 bg-rose-500/10 text-danger",
  neutral: "border-glass/15 bg-panel/95 text-ink-2",
};

export type ToastProps = {
  tone?: ToastTone;
  /** Optional action button rendered on the trailing edge. */
  action?: ToastAction;
  /** When provided, renders a dismiss (×) button. */
  onDismiss?: () => void;
  className?: string;
  children: ReactNode;
};

/**
 * Token-styled transient notification. Presentational only — the caller owns
 * the show/hide state and any auto-dismiss timer, and wraps this in
 * `<AnimatePresence>` so the exit animation plays (mount it under a stable
 * `key`). Danger toasts announce assertively via `role="alert"`; everything
 * else is a polite `status`. Animates with `m.*` under the app-wide
 * LazyMotion boundary.
 */
export function Toast({ tone = "neutral", action, onDismiss, className, children }: ToastProps) {
  return (
    <m.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      role={tone === "danger" ? "alert" : "status"}
      aria-live={tone === "danger" ? "assertive" : "polite"}
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs shadow-[0_8px_24px_-12px_rgba(0,0,0,0.7)]",
        TONE_CLASSES[tone],
        className,
      )}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="shrink-0 rounded-md border border-accent/40 bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent-soft transition hover:bg-accent/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/80"
        >
          {action.label}
        </button>
      ) : null}
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="group grid h-5 w-5 shrink-0 place-items-center rounded-md text-ink-3 transition hover:bg-glass/15 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/80"
        >
          <span className="inline-block text-sm leading-none transition-transform duration-200 group-hover:rotate-90" aria-hidden>
            ×
          </span>
        </button>
      ) : null}
    </m.div>
  );
}

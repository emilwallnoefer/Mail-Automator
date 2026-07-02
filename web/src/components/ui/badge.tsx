import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "warn" | "accent" | "positive" | "danger";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-neutral/35 text-ink-3",
  warn: "bg-amber-500/15 text-warn",
  accent: "bg-accent-deep/20 text-accent-soft",
  positive: "bg-emerald-500/15 text-positive",
  danger: "bg-rose-500/15 text-danger",
};

export type BadgeProps = ComponentPropsWithRef<"span"> & {
  tone?: BadgeTone;
};

/** Tiny uppercase chip (role/status markers). */
export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn("rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider", TONE_CLASSES[tone], className)}
      {...props}
    />
  );
}

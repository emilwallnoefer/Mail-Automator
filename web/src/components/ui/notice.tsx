import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/cn";

export type NoticeTone = "danger" | "warn" | "positive" | "neutral";

const TONE_CLASSES: Record<NoticeTone, string> = {
  danger: "border-rose-400/30 bg-rose-500/10 text-danger",
  warn: "border-amber-400/30 bg-amber-500/10 text-warn",
  positive: "border-emerald-400/30 bg-emerald-500/10 text-positive",
  neutral: "border-glass/15 bg-glass/5 text-ink-2",
};

export type NoticeProps = ComponentPropsWithRef<"p"> & {
  tone?: NoticeTone;
};

/** Inline status/error message (the repeated rose/amber alert row). */
export function Notice({ tone = "danger", className, ...props }: NoticeProps) {
  return (
    <p
      role={tone === "danger" ? "alert" : undefined}
      className={cn("rounded-lg border px-3 py-2 text-sm", TONE_CLASSES[tone], className)}
      {...props}
    />
  );
}

import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/cn";

export type CardPadding = "none" | "sm" | "md" | "lg";

const PADDING_CLASSES: Record<CardPadding, string> = {
  none: "",
  sm: "p-2.5",
  md: "p-3",
  lg: "p-4",
};

export type CardProps = ComponentPropsWithRef<"div"> & {
  padding?: CardPadding;
};

/** Glass content well: the `rounded-xl border-glass/10 bg-glass/5` pattern. */
export function Card({ padding = "md", className, ...props }: CardProps) {
  return (
    <div
      className={cn("rounded-xl border border-glass/10 bg-glass/5", PADDING_CLASSES[padding], className)}
      {...props}
    />
  );
}

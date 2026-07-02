"use client";

import type { ReactNode } from "react";

export function InfoTooltip({
  children,
  label = "More info",
  align = "start",
}: {
  children: ReactNode;
  label?: string;
  align?: "start" | "center" | "end";
}) {
  const alignClass =
    align === "center"
      ? "left-1/2 -translate-x-1/2"
      : align === "end"
        ? "right-0"
        : "left-0";
  return (
    <span className="group relative inline-flex items-center">
      <span
        role="img"
        aria-label={label}
        tabIndex={0}
        className="inline-flex h-3.5 w-3.5 cursor-help select-none items-center justify-center rounded-full border border-glass/20 bg-glass/5 text-[10px] font-medium text-ink-3 transition hover:bg-glass/15 focus:outline-none focus:ring-1 focus:ring-amber-300/40"
      >
        i
      </span>
      <span
        role="tooltip"
        className={`pointer-events-none invisible absolute top-full z-20 mt-1.5 w-64 rounded-lg border border-glass/10 bg-panel/95 px-3 py-2 text-[11px] font-normal leading-relaxed text-ink-2 opacity-0 shadow-xl transition-opacity duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 ${alignClass}`}
      >
        {children}
      </span>
    </span>
  );
}

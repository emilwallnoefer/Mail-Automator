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
        className="inline-flex h-3.5 w-3.5 cursor-help select-none items-center justify-center rounded-full border border-white/20 bg-white/5 text-[9px] font-medium text-slate-300 transition hover:bg-white/15 focus:outline-none focus:ring-1 focus:ring-amber-300/40"
      >
        i
      </span>
      <span
        role="tooltip"
        className={`pointer-events-none invisible absolute top-full z-20 mt-1.5 w-64 rounded-lg border border-white/10 bg-slate-900/95 px-3 py-2 text-[11px] font-normal leading-relaxed text-slate-200 opacity-0 shadow-xl transition-opacity duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 ${alignClass}`}
      >
        {children}
      </span>
    </span>
  );
}

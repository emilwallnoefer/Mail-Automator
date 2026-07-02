"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { easeInOutCubic } from "./types";

export function useAnimatedNumber(target: number, durationMs = 280) {
  const [value, setValue] = useState(0);
  const valueRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (Math.abs(target - valueRef.current) < 0.001) {
      return;
    }
    const from = valueRef.current;
    const delta = target - from;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      const next = from + delta * easeInOutCubic(t);
      valueRef.current = next;
      setValue(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  return value;
}

export function AnimatedNumber({
  value,
  durationMs,
  children,
}: {
  value: number;
  durationMs?: number;
  children: (value: number) => ReactNode;
}) {
  const animated = useAnimatedNumber(value, durationMs);
  return <>{children(animated)}</>;
}

"use client";

import { LazyMotion } from "framer-motion";
import type { ReactNode } from "react";

const loadFeatures = () => import("@/components/motion-features").then((mod) => mod.default);

/**
 * App-wide LazyMotion boundary. Components animate with `m.*` (never `motion.*`
 * — `strict` throws on it in dev) so the full motion runtime is code-split and
 * fetched after first paint.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      {children}
    </LazyMotion>
  );
}

"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { assignHolderColors, holderRgb, normalizeHolderLabel } from "@/lib/fleet-rules";

/**
 * One allocation of holder colours, shared by every screen in the module.
 *
 * A colour that guarantees nobody shares has to be worked out against the whole
 * roster (see `assignHolderColors`), which means it cannot be recomputed by each
 * component from the name in its hand. It is computed once per board and read
 * from here — so the calendar cell, the legend, the Material tile, the Manage
 * row and the booking dialog all agree about which colour a person is, which is
 * the entire point of colouring by person.
 */

const HolderColorContext = createContext<((label: string | null | undefined) => string) | null>(null);

export function HolderColorProvider({
  roster,
  children,
}: {
  /** Every name that could be drawn. Duplicates and blanks are fine. */
  roster: readonly string[];
  children: ReactNode;
}) {
  const resolve = useMemo(() => {
    const assigned = assignHolderColors(roster);
    return (label: string | null | undefined): string => {
      if (!label) return NEUTRAL_RGB;
      // A name that was not in the roster still gets a colour rather than
      // nothing — it just has no uniqueness guarantee, because it was not there
      // to be allocated against.
      return assigned.get(normalizeHolderLabel(label)) ?? holderRgb(label);
    };
  }, [roster]);

  return <HolderColorContext.Provider value={resolve}>{children}</HolderColorContext.Provider>;
}

/** The neutral used for material nobody is holding. */
export const NEUTRAL_RGB = "148 163 184";

/**
 * Resolve a holder name to its RGB channels.
 *
 * Falls back to the un-allocated hash outside a provider, so a component
 * rendered on its own still draws something sensible instead of throwing.
 */
export function useHolderRgb(): (label: string | null | undefined) => string {
  const resolve = useContext(HolderColorContext);
  return resolve ?? ((label) => (label ? holderRgb(label) : NEUTRAL_RGB));
}

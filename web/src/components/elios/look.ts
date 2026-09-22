import type { Zone } from "@/lib/elios-flight";

export type RGB = readonly [number, number, number];

/**
 * How each confined space looks and feels: the light that is already there,
 * the colour the drone's LEDs come back in, and what hangs in the air.
 *
 * Every one of these spaces is dark. That is the point of the art direction:
 * the Elios carries its own lighting, so the drone is the key light for the
 * whole scene — what it passes near is lit, what it has left behind falls
 * back into the ambient below.
 */
export type ZoneLook = {
  /** Light in the space without the drone — what the far corners show. */
  ambient: RGB;
  /** The drone's LEDs as the surfaces in this space return them. */
  light: RGB;
  /** How much of the beam the air shows: dust, steam, mist. */
  haze: number;
  /** Colour and amount of what drifts through the beam. */
  mote: RGB;
  moteDensity: number;
  /** Scroll speed of the far wall relative to the obstacles. */
  photoParallax: number;
  /**
   * How much to take the photo down before lighting. The slag-white boiler
   * tubes would otherwise wash out to grey in the drone's light and flatten
   * the whole scene; a dark stope needs nothing taken away.
   */
  photoDim: number;
  /** Stencilled on the bulkhead that opens into this space. */
  stencil: string;
};

export const LOOK: Record<Zone, ZoneLook> = {
  BOILER: {
    ambient: [80, 71, 64],
    light: [255, 236, 212],
    haze: 0.16,
    mote: [226, 220, 210],
    moteDensity: 1,
    photoParallax: 0.12,
    photoDim: 0.42,
    stencil: "FURNACE",
  },
  BALLAST: {
    ambient: [80, 78, 72],
    light: [255, 246, 232],
    haze: 0.11,
    mote: [236, 230, 218],
    moteDensity: 0.6,
    photoParallax: 0.14,
    photoDim: 0.18,
    stencil: "No.3 WBT (P)",
  },
  MINE: {
    ambient: [78, 68, 58],
    light: [255, 240, 220],
    haze: 0.2,
    mote: [232, 216, 190],
    moteDensity: 1.4,
    photoParallax: 0.1,
    photoDim: 0,
    stencil: "STOPE 12-4",
  },
  SEWER: {
    ambient: [64, 73, 68],
    light: [236, 248, 255],
    haze: 0.15,
    mote: [212, 228, 222],
    moteDensity: 0.8,
    photoParallax: 0.13,
    photoDim: 0.2,
    stencil: "SEWER N-4",
  },
  TANK: {
    ambient: [82, 63, 54],
    light: [255, 236, 218],
    haze: 0.15,
    mote: [232, 204, 184],
    moteDensity: 1,
    photoParallax: 0.12,
    photoDim: 0.05,
    stencil: "TK-201",
  },
};

export function rgba([r, g, b]: RGB, a = 1): string {
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
}

/** Scale a colour's brightness, clamped to the displayable range. */
export function shade([r, g, b]: RGB, k: number): RGB {
  const c = (v: number) => Math.min(255, Math.max(0, v * k));
  return [c(r), c(g), c(b)];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * Mobile day sheet slide timing. Separate curves for open vs close.
 * Edit in `web/dev/mobile-sheet-easing-editor.html` (two graphs) and paste back here.
 */
export const MOBILE_SHEET_MS = 500;

/** Slide up (sheet entering). */
export const MOBILE_SHEET_EASE_IN_BEZIER = [0.012, 0.6005, 0.567, 0.533] as const;
export const MOBILE_SHEET_EASE_IN = `cubic-bezier(${MOBILE_SHEET_EASE_IN_BEZIER.join(", ")})`;

/** Slide down (sheet leaving). */
export const MOBILE_SHEET_EASE_OUT_BEZIER = [0.602, 0.0055, 0.6295, 0.6105] as const;
export const MOBILE_SHEET_EASE_OUT = `cubic-bezier(${MOBILE_SHEET_EASE_OUT_BEZIER.join(", ")})`;

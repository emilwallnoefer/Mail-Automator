import { ZONES, type Zone } from "@/lib/elios-flight";

/**
 * The photographs behind the game — real spaces from flyability.com, built
 * into public/elios/ by scripts/build-elios-assets.mjs.
 */
export const TEXTURE_NAMES = ["rust", "coating", "rock", "concrete", "slag", "brick"] as const;
export type TextureName = (typeof TEXTURE_NAMES)[number];

export type Assets = {
  photo: Partial<Record<Zone, HTMLImageElement>>;
  texture: Partial<Record<TextureName, HTMLImageElement>>;
  /** Bumped as each image arrives, so anything cached from it knows to rebuild. */
  version: number;
};

/**
 * Start loading every image. The game draws from the first frame without
 * them — plain colour until a photo lands — so a slow connection costs looks,
 * never playability.
 */
export function loadAssets(onLoad: () => void): { assets: Assets; cancel: () => void } {
  const assets: Assets = { photo: {}, texture: {}, version: 0 };
  let cancelled = false;

  const load = (src: string, put: (img: HTMLImageElement) => void) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (cancelled) return;
      put(img);
      assets.version += 1;
      onLoad();
    };
    // A missing image is only a missing texture: the flat fallback stays.
    img.src = src;
  };

  for (const zone of ZONES) {
    load(`/elios/bg-${zone.toLowerCase()}.webp`, (img) => {
      assets.photo[zone] = img;
    });
  }
  for (const name of TEXTURE_NAMES) {
    load(`/elios/tx-${name}.webp`, (img) => {
      assets.texture[name] = img;
    });
  }

  return {
    assets,
    cancel: () => {
      cancelled = true;
    },
  };
}

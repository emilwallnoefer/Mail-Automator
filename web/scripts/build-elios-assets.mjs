/**
 * Builds the photographic assets for "Fly where people can't" into
 * public/elios/. Run it by hand when a source or a crop changes:
 *
 *   node scripts/build-elios-assets.mjs
 *
 * Every image comes from flyability.com — case studies and industry pages —
 * so the backgrounds are real confined spaces the Elios has actually flown in,
 * not stock art. The originals are Flyability's; this only crops, grades and
 * compresses them. Keep the URLs here: they are the provenance.
 *
 * Two outputs:
 *
 * - BACKGROUNDS (`bg-<zone>.webp`): one crop per zone, laid next to its own
 *   mirror image. A mirrored pair is seamless at both joins by construction, so
 *   the strip scrolls forever with no visible seam — a cross-fade would ghost
 *   every vertical tube and stiffener. The game darkens and lights them at
 *   runtime, so they are only lifted and softened here, not graded to taste.
 *
 * - TEXTURES (`tx-<material>.webp`): a square crop whose edges are faded into
 *   each other both ways, so it tiles seamlessly as a canvas pattern.
 *   Obstacles are filled with these, so a rock is a real rock surface and a
 *   rusty plate is real rust.
 *
 * Crops are fractions of the original, so a re-exported source at a different
 * resolution still lands on the same region. Each one was chosen to leave the
 * drone out of frame — a second Elios in the background would read as a bug.
 *
 * Needs `sharp`, which ships with Next.js; nothing here runs in the app.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HUBFS = "https://www.flyability.com/hubfs/";
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "elios");
const CACHE_DIR = path.join(tmpdir(), "elios-asset-sources");

/** Background strip height in pixels; the width follows the crop. */
const BG_HEIGHT = 440;
/** Texture tile size in pixels. */
const TX_SIZE = 384;

const SOURCES = {
  // Boiler case study: slag-crusted water-wall tubes (left panel).
  boilerTubes: "image-png-Apr-25-2025-12-56-15-2172-PM.png",
  // Ballast tank case study: transverse plating with oval lightening holes.
  ballast: "ballast-tank-inspection-flyability-1.jpg",
  // Stope mining article: a slate-mine gallery under work lights.
  stope: "stope-mining-flyability-1.jpg",
  // Old-workings mine survey: rock walls under mesh and cable runs.
  mineDrift: "IMG_2791.jpg",
  // Suez sewer case study: wet concrete, a branch opening, hanging rag.
  sewer: "Suez-Sewer-Drone-flyability-3-1.jpg",
  // Methanol fuel tank on a container ship: the rust-streaked shell.
  tankShell: "The%20Elios%203%20UT%20drone%20with%20the%20Tether%20cable%20for%20unlimited%20flight%20time..jpg",
  // Lausanne sewers: the board-formed concrete of the tunnel wall.
  lausanne: "applications/sewer%20industry%20page/20230619%20-%20Lausanne%20Sewers%20-%207%20%281%29.jpg",
  // Stack inspection: the brick lining, seen from inside.
  stackLining: "101-Flight%20%232-526676.jpg",
};

/**
 * [left, top, right, bottom] as fractions of the source.
 *
 * `loop: "mirror"` suits regular structure — tube walls, plating — where a
 * mirror image is indistinguishable from the next bay. `loop: "fade"`
 * cross-fades the two ends instead, for a scene whose mirror image would be an
 * obvious kaleidoscope; it needs a crop wide enough to spare the overlap.
 */
const BACKGROUNDS = [
  { zone: "boiler", source: "boilerTubes", crop: [0.0, 0.12, 0.4, 1.0], lift: 0.9, blur: 0.8, loop: "mirror" },
  { zone: "ballast", source: "ballast", crop: [0.0, 0.0, 0.47, 0.93], lift: 1.0, blur: 0.9, loop: "mirror" },
  { zone: "mine", source: "stope", crop: [0.0, 0.0, 1.0, 1.0], lift: 1.25, blur: 0.9, loop: "fade" },
  { zone: "sewer", source: "sewer", crop: [0.0, 0.0, 1.0, 1.0], lift: 1.15, blur: 0.8, loop: "mirror" },
  { zone: "tank", source: "tankShell", crop: [0.5, 0.48, 1.0, 1.0], lift: 1.25, blur: 1.0, loop: "mirror" },
];

/**
 * Textures cross-fade their own edges in both directions rather than mirror:
 * a mirrored rock face is an unmistakable kaleidoscope once it repeats across
 * a boulder, while a faded overlap just reads as more rock.
 */
const TEXTURES = [
  { material: "rust", source: "tankShell", crop: [0.62, 0.62, 0.78, 0.86] },
  { material: "coating", source: "ballast", crop: [0.285, 0.3, 0.375, 0.46] },
  { material: "rock", source: "mineDrift", crop: [0.05, 0.14, 0.15, 0.28] },
  { material: "concrete", source: "sewer", crop: [0.0, 0.0, 0.28, 0.4] },
  { material: "slag", source: "boilerTubes", crop: [0.02, 0.1, 0.34, 0.62] },
  { material: "brick", source: "stackLining", crop: [0.32, 0.3, 0.5, 0.52] },
];

async function source(key) {
  const rel = SOURCES[key];
  const file = path.join(CACHE_DIR, `${key}${path.extname(decodeURIComponent(rel)) || ".img"}`);
  if (existsSync(file)) return readFile(file);
  const res = await fetch(HUBFS + rel, { headers: { "User-Agent": "Mozilla/5.0 (elios-asset-build)" } });
  if (!res.ok) throw new Error(`${key}: HTTP ${res.status} for ${HUBFS + rel}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(file, buf);
  return buf;
}

async function extract(buf, [x0, y0, x1, y1]) {
  const { width, height } = await sharp(buf).metadata();
  const left = Math.round(x0 * width);
  const top = Math.round(y0 * height);
  return sharp(buf).extract({
    left,
    top,
    width: Math.round(x1 * width) - left,
    height: Math.round(y1 * height) - top,
  });
}

/** Share of the width the "fade" loop spends blending one end into the other. */
const FADE_OVERLAP = 0.22;

/**
 * Make `raw` (RGB, `width` x `height`) loop horizontally by blending its last
 * columns into its first: column 0 continues exactly where the last column of
 * the result leaves off, so the strip wraps with no seam.
 */
function fadeLoop(raw, width, height) {
  const overlap = Math.round(width * FADE_OVERLAP);
  const outWidth = width - overlap;
  const out = Buffer.alloc(outWidth * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < outWidth; x += 1) {
      const o = (y * outWidth + x) * 3;
      const a = (y * width + x) * 3;
      if (x >= overlap) {
        raw.copy(out, o, a, a + 3);
        continue;
      }
      const t = x / overlap;
      // Smoothstep, so the blend has no visible start or end line.
      const w = t * t * (3 - 2 * t);
      const b = (y * width + (outWidth + x)) * 3;
      for (let c = 0; c < 3; c += 1) out[o + c] = Math.round(raw[b + c] * (1 - w) + raw[a + c] * w);
    }
  }
  return { data: out, width: outWidth };
}

async function buildBackground({ zone, source: key, crop, lift, blur, loop }) {
  const cropped = await (await extract(await source(key), crop)).toBuffer();
  const graded = sharp(cropped)
    .resize({ height: BG_HEIGHT })
    // Lift the shadows of the darker sources so the runtime lighting has
    // something to work with; the game takes it back down.
    .linear(lift, 0)
    .modulate({ saturation: 0.9 })
    // A little softness is the depth of field: the far wall should never
    // compete with the obstacles in focus.
    .blur(blur);
  const out = path.join(OUT_DIR, `bg-${zone}.webp`);

  if (loop === "fade") {
    const { data, info } = await graded.removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const looped = fadeLoop(data, info.width, info.height);
    await sharp(looped.data, { raw: { width: looped.width, height: info.height, channels: 3 } })
      .webp({ quality: 64, effort: 6 })
      .toFile(out);
    return `${path.basename(out)} ${looped.width}x${info.height} (fade)`;
  }

  const half = await graded.toBuffer();
  const { width } = await sharp(half).metadata();
  const mirrored = await sharp(half).flop().toBuffer();
  await sharp({ create: { width: width * 2, height: BG_HEIGHT, channels: 3, background: "#000" } })
    .composite([
      { input: half, left: 0, top: 0 },
      { input: mirrored, left: width, top: 0 },
    ])
    .webp({ quality: 64, effort: 6 })
    .toFile(out);
  return `${path.basename(out)} ${width * 2}x${BG_HEIGHT} (mirror)`;
}

/** Transpose an RGB buffer, so the horizontal fade can run down the columns. */
function transpose(raw, width, height) {
  const out = Buffer.alloc(raw.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) raw.copy(out, (x * height + y) * 3, (y * width + x) * 3, (y * width + x) * 3 + 3);
  }
  return out;
}

async function buildTexture({ material, source: key, crop }) {
  const cropped = await (await extract(await source(key), crop)).toBuffer();
  // Oversize by the overlap, so the tile comes out at exactly TX_SIZE.
  const size = Math.round(TX_SIZE / (1 - FADE_OVERLAP));
  const { data } = await sharp(cropped)
    .resize(size, size, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // Horizontal, then the same again on the transposed result: every row and
  // every column of the tile now wraps onto itself.
  const across = fadeLoop(data, size, size);
  const down = fadeLoop(transpose(across.data, across.width, size), size, across.width);
  const tile = transpose(down.data, down.width, across.width);
  const out = path.join(OUT_DIR, `tx-${material}.webp`);
  await sharp(tile, { raw: { width: across.width, height: down.width, channels: 3 } })
    .webp({ quality: 70, effort: 6 })
    .toFile(out);
  return `${path.basename(out)} ${across.width}x${down.width}`;
}

await mkdir(OUT_DIR, { recursive: true });
for (const bg of BACKGROUNDS) console.log(await buildBackground(bg));
for (const tx of TEXTURES) console.log(await buildTexture(tx));

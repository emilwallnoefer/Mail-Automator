import {
  VENT_DUCT_RADIUS,
  WORLD_HEIGHT,
  ZONES,
  pointInPolygon,
  seededRandom,
  ventDuct,
  type Obstacle,
  type ObstacleKind,
  type Solid,
  type Vec,
} from "@/lib/elios-flight";
import type { Assets, TextureName } from "./assets";
import { LOOK, mix, rgba, shade, type RGB } from "./look";
import {
  bevel,
  bolt,
  boundsOf,
  clipTo,
  fillMaterial,
  grime,
  occlusion,
  outline,
  pipe,
  rustStreaks,
  shadeCylinderH,
  shadeCylinderV,
  speckle,
  texturePattern,
  tintOver,
  tracePoly,
  type Box,
  type Ctx,
  type Rand,
} from "./paint";

/**
 * The art for every obstacle, painted once per obstacle into a sprite.
 *
 * Each painter works inside a clip of the obstacle's own solids — the same
 * shapes the collision test uses — so nothing drawn can stick out past what
 * the drone actually hits. Detail is free to go anywhere inside.
 *
 * The painters aim for how these things look on the Elios camera feed: a
 * boiler tube is dark oxidised steel with white slag on it, a ballast tank is
 * beige epoxy failing to rust at every edge, rock is faceted and wet. They
 * paint albedo only — the drone's light is applied over the top every frame.
 */

const H = WORLD_HEIGHT;

const TUBE: RGB = [98, 86, 78];
const ASH: RGB = [202, 198, 190];
const COATING: RGB = [212, 196, 158];
const PRIMER: RGB = [96, 104, 98];
const SAFETY: RGB = [230, 184, 42];
const ROCK: RGB = [150, 142, 130];
const CONCRETE: RGB = [152, 146, 134];
const CLAY: RGB = [168, 98, 60];
const DUCT: RGB = [226, 180, 52];
const STAINLESS: RGB = [158, 162, 166];
const TANK_STEEL: RGB = [126, 84, 60];
const GATE_PAINT: RGB = [76, 94, 106];
const MUD: RGB = [96, 84, 66];

type Kit = {
  ctx: Ctx;
  rand: Rand;
  o: Obstacle;
  box: Box;
  /** A texture fill with its own random offset, so no two obstacles wear the same patch. */
  tex: (name: TextureName, unitsPerPixel: number, rotate?: number) => CanvasPattern | null;
};

export type Sprite = {
  canvas: HTMLCanvasElement;
  /** Local-space rectangle the canvas covers. */
  x0: number;
  y0: number;
  w: number;
  h: number;
};

/** Paint one obstacle into a sprite at `scale` device pixels per world unit. */
export function paintObstacle(o: Obstacle, scale: number, assets: Assets): Sprite {
  const b = boundsOf(o.solids);
  const x0 = Math.floor(b.x0) - 1;
  const y0 = Math.max(0, Math.floor(b.y0) - 1);
  const x1 = Math.ceil(b.x1) + 1;
  const y1 = Math.min(H, Math.ceil(b.y1) + 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil((x1 - x0) * scale));
  canvas.height = Math.max(1, Math.ceil((y1 - y0) * scale));
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale);
    // Detail draws from its own stream: the lib's stream cut the shape, and
    // reusing it would tie every scratch to the geometry.
    const rand = seededRandom((o.seed ^ 0x5bd1e995) >>> 0);
    const kit: Kit = {
      ctx,
      rand,
      o,
      box: b,
      tex: (name, unitsPerPixel, rotate = 0) =>
        texturePattern(ctx, assets.texture[name], unitsPerPixel, rand() * 400, rand() * 400, rotate),
    };
    ctx.save();
    clipTo(ctx, o.solids);
    PAINTERS[o.kind](kit);
    // A thin contact line inside every edge separates the solid from the
    // wall behind it the way a real edge catches a shadow.
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = "rgba(0,0,0,0.38)";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (const s of o.solids) tracePoly(ctx, outline(s));
    ctx.stroke();
    ctx.restore();
  }
  return { canvas, x0, y0, w: x1 - x0, h: y1 - y0 };
}

// ---------------------------------------------------------------------------
// Shared parts
// ---------------------------------------------------------------------------

function topOf(s: Solid): number {
  return boundsOf([s]).y0;
}
function bottomOf(s: Solid): number {
  return boundsOf([s]).y1;
}

/**
 * White slag and ash crusted onto a tube: long, ragged runs down the side that
 * faces the fire, not tidy spots — that is how it builds up and how it falls.
 */
function crust(k: Kit, x: number, y0: number, w: number, h: number, amount: number): void {
  const { ctx, rand } = k;
  const pat = k.tex("slag", 0.1);
  ctx.save();
  ctx.fillStyle = pat ?? rgba(ASH);
  const n = Math.max(1, Math.round((h / 16) * amount));
  for (let i = 0; i < n; i += 1) {
    ctx.globalAlpha = 0.35 + rand() * 0.5;
    const top = y0 + rand() * h;
    const len = 4 + rand() * 16;
    const left = x + w * rand() * 0.35;
    const right = x + w * (0.55 + rand() * 0.45);
    // A ragged strip: jagged down both sides.
    ctx.beginPath();
    ctx.moveTo(left, top);
    const steps = 5;
    for (let s = 1; s <= steps; s += 1) ctx.lineTo(left + (rand() - 0.3) * w * 0.25, top + (len * s) / steps);
    for (let s = steps; s >= 0; s -= 1) ctx.lineTo(right - (rand() - 0.3) * w * 0.25, top + (len * s) / steps);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** A vertical tube: textured, crusted, then shaded round. */
function vTube(k: Kit, x: number, y0: number, y1: number, w: number, base: RGB, crustAmount: number, tex: TextureName = "rust"): void {
  const { ctx } = k;
  if (y1 <= y0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y0, w, y1 - y0);
  ctx.clip();
  fillMaterial(ctx, { x0: x, y0, x1: x + w, y1 }, base, k.tex(tex, 0.14), 0.55, "overlay");
  if (crustAmount > 0) crust(k, x, y0, w, y1 - y0, crustAmount);
  shadeCylinderV(ctx, x, y0, w, y1 - y0, 0.26);
  ctx.restore();
}

/** A horizontal tube or header across [x0, x1]. */
function hTube(k: Kit, x0: number, x1: number, y: number, h: number, base: RGB, gloss = 0.28, tex: TextureName | null = "rust"): void {
  const { ctx } = k;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y, x1 - x0, h);
  ctx.clip();
  fillMaterial(ctx, { x0, y0: y, x1, y1: y + h }, base, tex ? k.tex(tex, 0.14) : null, 0.55, "overlay");
  shadeCylinderH(ctx, x0, y, x1 - x0, h, gloss);
  ctx.restore();
}

/** Half a ring of tube — a U-bend — around (cx, cy), shaded across its section. */
function uBend(k: Kit, cx: number, cy: number, r: number, half: number, base: RGB, from = 0, to = Math.PI): void {
  const { ctx } = k;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r + half, from, to, false);
  ctx.arc(cx, cy, Math.max(0, r - half), to, from, true);
  ctx.closePath();
  ctx.clip();
  fillMaterial(ctx, { x0: cx - r - half, y0: cy - r - half, x1: cx + r + half, y1: cy + r + half }, base, k.tex("rust", 0.14), 0.55, "overlay");
  const g = ctx.createRadialGradient(cx, cy, Math.max(0, r - half), cx, cy, r + half);
  g.addColorStop(0, "rgb(40,40,40)");
  g.addColorStop(0.3, "rgb(200,200,200)");
  g.addColorStop(0.45, "rgb(255,255,255)");
  g.addColorStop(0.7, "rgb(150,150,150)");
  g.addColorStop(1, "rgb(30,30,30)");
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = g;
  ctx.fillRect(cx - r - half, cy - r - half, (r + half) * 2, (r + half) * 2);
  ctx.restore();
}

/** A weld seam: a bead with its heat-tint either side. */
function weldSeam(ctx: Ctx, x0: number, x1: number, y: number): void {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(x0, y - 0.7, x1 - x0, 1.4);
  ctx.fillStyle = "rgba(255,244,226,0.18)";
  ctx.fillRect(x0, y - 0.7, x1 - x0, 0.45);
  ctx.restore();
}

/** Stencilled lettering, reading upward, as tank markings are sprayed on. */
function stencil(ctx: Ctx, text: string, x: number, y: number, size: number, color = "rgba(236,232,220,0.72)"): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  ctx.font = `700 ${size}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** Coating blisters: rust pushing up under the paint. */
function blisters(k: Kit, box: Box, count: number): void {
  const { ctx, rand } = k;
  ctx.save();
  for (let i = 0; i < count; i += 1) {
    const x = box.x0 + rand() * (box.x1 - box.x0);
    const y = box.y0 + rand() * (box.y1 - box.y0);
    const r = 0.4 + rand() * 1.1;
    ctx.fillStyle = "rgba(110,48,20,0.55)";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,240,215,0.25)";
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Coated plate: epoxy over steel, holding everywhere except the edges. */
function coatedPlate(k: Kit, box: Box): void {
  const { ctx, rand } = k;
  fillMaterial(ctx, box, COATING, k.tex("coating", 0.2), 0.75, "multiply");
  grime(ctx, rand, box, Math.round((box.x1 - box.x0) * (box.y1 - box.y0) / 160), [150, 120, 90], 0.25, 9);
  blisters(k, box, Math.round((box.x1 - box.x0) * (box.y1 - box.y0) / 220));
}

/** Rock: a real rock surface, broken into facets that each take the light their own way. */
function rockBody(k: Kit, solid: Solid, attach: "top" | "bottom" | "none", tone: RGB = ROCK, texScale = 0.2): void {
  const { ctx, rand } = k;
  const pts = outline(solid);
  const box = boundsOf([solid]);
  ctx.save();
  ctx.beginPath();
  tracePoly(ctx, pts);
  ctx.clip();
  fillMaterial(ctx, box, tone, k.tex("rock", texScale, rand() * Math.PI * 2), 1);
  tintOver(ctx, box, mix(tone, [255, 255, 255], 0.5));

  // Facets: fan out from an interior point, split each blade once more so
  // the planes do not all meet in one star, and light each by its angle.
  let cx = 0;
  let cy = 0;
  for (const [x, y] of pts) {
    cx += x;
    cy += y;
  }
  cx /= pts.length;
  cy /= pts.length;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const [ax, ay] = pts[j];
    const [bx, by] = pts[i];
    const mx = cx + ((ax + bx) / 2 - cx) * (0.35 + rand() * 0.3) + (rand() - 0.5) * 3;
    const my = cy + ((ay + by) / 2 - cy) * (0.35 + rand() * 0.3) + (rand() - 0.5) * 3;
    const faces: Array<[Vec, Vec, Vec]> = [
      [[cx, cy], [ax, ay], [mx, my]],
      [[ax, ay], [bx, by], [mx, my]],
      [[bx, by], [cx, cy], [mx, my]],
    ];
    for (const [p, q, r] of faces) {
      // Normal of the facet in 2D terms: which way its outer edge faces.
      const ex = q[0] - p[0];
      const ey = q[1] - p[1];
      const len = Math.hypot(ex, ey) || 1;
      const facing = (-(-ex / len) * 0.85 - (ey / len) * 0.35) + (rand() - 0.5) * 0.7;
      ctx.fillStyle = facing > 0 ? `rgba(255,246,228,${Math.min(0.22, 0.14 * facing)})` : `rgba(0,0,0,${Math.min(0.32, 0.2 * -facing)})`;
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(q[0], q[1]);
      ctx.lineTo(r[0], r[1]);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Joints and cracks: dark, jagged, a lighter lip on one side.
  const cracks = 3 + Math.floor(rand() * 4);
  for (let i = 0; i < cracks; i += 1) {
    const start = pts[Math.floor(rand() * pts.length)];
    const line: Vec[] = [start];
    const ang = Math.atan2(cy - start[1], cx - start[0]) + (rand() - 0.5) * 1.2;
    const steps = 3 + Math.floor(rand() * 4);
    for (let s = 0; s < steps; s += 1) {
      const a = ang + (rand() - 0.5) * 1.1;
      const [px, py] = line[line.length - 1];
      line.push([px + Math.cos(a) * (2 + rand() * 4), py + Math.sin(a) * (2 + rand() * 4)]);
    }
    const strokeLine = (dx: number, dy: number, style: string, width: number) => {
      ctx.beginPath();
      ctx.moveTo(line[0][0] + dx, line[0][1] + dy);
      for (let s = 1; s < line.length; s += 1) ctx.lineTo(line[s][0] + dx, line[s][1] + dy);
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.stroke();
    };
    strokeLine(0, 0, "rgba(10,8,6,0.6)", 0.35 + rand() * 0.4);
    strokeLine(-0.35, -0.35, "rgba(255,245,225,0.14)", 0.25);
  }

  grime(ctx, rand, box, 4, [170, 96, 44], 0.22, 7);
  speckle(ctx, rand, box, Math.round((box.x1 - box.x0) * (box.y1 - box.y0) / 6), 0.35, 0.45);
  if (attach !== "none") occlusion(ctx, box, attach, 14, 0.55);
  bevel(ctx, pts, 0.9, 0.32, 0.38);
  ctx.restore();
}

/** Weld mesh and rock bolts pinned to the back of a mine drift. */
function groundSupport(k: Kit, box: Box, depth: number): void {
  const { ctx, rand } = k;
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x0, 0, box.x1 - box.x0, depth);
  ctx.clip();
  ctx.strokeStyle = "rgba(196,194,184,0.34)";
  ctx.lineWidth = 0.16;
  ctx.beginPath();
  for (let d = box.x0 - depth; d < box.x1 + depth; d += 3.3) {
    ctx.moveTo(d, 0);
    ctx.lineTo(d + depth, depth);
    ctx.moveTo(d, 0);
    ctx.lineTo(d - depth, depth);
  }
  ctx.stroke();
  ctx.restore();
  const bolts = 1 + Math.floor(rand() * 2);
  for (let i = 0; i < bolts; i += 1) {
    const x = box.x0 + 6 + rand() * Math.max(1, box.x1 - box.x0 - 12);
    const y = 4 + rand() * Math.max(1, depth - 8);
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(x - 1.6, y - 1.3, 3.6, 3.6);
    ctx.fillStyle = "rgb(120,112,100)";
    ctx.fillRect(x - 1.8, y - 1.8, 3.6, 3.6);
    ctx.fillStyle = "rgba(255,245,225,0.25)";
    ctx.fillRect(x - 1.8, y - 1.8, 3.6, 0.5);
    bolt(ctx, x, y, 0.8);
    ctx.restore();
    rustStreaks(ctx, rand, x - 1.5, x + 1.5, y + 1.8, 2, 6);
  }
}

/** Loose, packed pieces of rock or concrete filling a heap. */
function rubble(k: Kit, solid: Solid, count: number, tones: RGB[], tex: TextureName): void {
  const { ctx, rand } = k;
  const pts = outline(solid);
  const box = boundsOf([solid]);
  const pieces: Array<{ x: number; y: number; r: number }> = [];
  for (let i = 0; i < count * 3 && pieces.length < count; i += 1) {
    const x = box.x0 + rand() * (box.x1 - box.x0);
    const y = box.y0 + rand() * (box.y1 - box.y0);
    if (pointInPolygon(x, y, pts)) pieces.push({ x, y, r: 1.8 + rand() * 4.6 });
  }
  // Back to front: lower pieces sit in front of the ones above them.
  pieces.sort((a, b) => a.y - b.y);
  for (const p of pieces) {
    const n = 5 + Math.floor(rand() * 3);
    const poly: Vec[] = [];
    const phase = rand() * Math.PI;
    for (let i = 0; i < n; i += 1) {
      const a = phase + (i / n) * Math.PI * 2;
      const rr = p.r * (0.7 + rand() * 0.35);
      poly.push([p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr * 0.8]);
    }
    const tone = tones[Math.floor(rand() * tones.length)];
    // Its shadow on the pieces behind it, then the piece itself.
    ctx.save();
    ctx.translate(0.5, 0.6);
    ctx.beginPath();
    tracePoly(ctx, poly);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    tracePoly(ctx, poly);
    ctx.clip();
    const pb = { x0: p.x - p.r, y0: p.y - p.r, x1: p.x + p.r, y1: p.y + p.r };
    fillMaterial(ctx, pb, tone, k.tex(tex, 0.14, rand() * 6), 0.8, "overlay");
    const g = ctx.createLinearGradient(p.x - p.r, p.y - p.r, p.x + p.r, p.y + p.r);
    g.addColorStop(0, "rgba(255,246,228,0.2)");
    g.addColorStop(0.45, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = g;
    ctx.fillRect(pb.x0, pb.y0, p.r * 2, p.r * 2);
    speckle(ctx, rand, pb, Math.round(p.r * p.r * 1.5), 0.3, 0.4);
    // Broken edges: a lit lip on top, a dark one underneath.
    bevel(ctx, poly, 0.45, 0.4, 0.45);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Between spaces
// ---------------------------------------------------------------------------

function paintBulkhead(k: Kit): void {
  const { ctx, o, rand } = k;
  const w = o.width;
  const r = w / 2;
  const top = bottomOf(o.solids[0]);
  const bottom = topOf(o.solids[1]);
  const box: Box = { x0: 0, y0: 0, x1: w, y1: H };

  fillMaterial(ctx, box, PRIMER, k.tex("rust", 0.22), 0.4, "multiply");
  // Strakes: the bulkhead is plates welded edge to edge.
  for (let y = 16 + rand() * 20; y < H; y += 42 + rand() * 14) weldSeam(ctx, 0, w, y);
  // A flat-bar stiffener on the face.
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(3.4, 0, 1.2, H);
  ctx.fillStyle = rgba(shade(PRIMER, 1.25));
  ctx.fillRect(2.2, 0, 1.4, H);
  ctx.restore();

  // Manhole coaming: a raised ring, painted safety yellow because it is the
  // one thing in the space that says "this is the way through".
  ctx.save();
  ctx.lineCap = "butt";
  const ring = (anticlockwise: boolean, cy: number, from: number, to: number) => {
    ctx.beginPath();
    ctx.arc(r, cy, r, from, to, anticlockwise);
    ctx.stroke();
  };
  ctx.lineWidth = 6.2;
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ring(true, top, 0, -Math.PI);
  ring(true, bottom, Math.PI, 0);
  ctx.lineWidth = 4.6;
  ctx.strokeStyle = rgba(SAFETY);
  ring(true, top, 0, -Math.PI);
  ring(true, bottom, Math.PI, 0);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "rgba(255,250,230,0.45)";
  ring(true, bottom, Math.PI, 0);
  ctx.restore();
  // Chipped paint on the coaming, where boots and hoses have scraped it.
  ctx.save();
  for (let i = 0; i < 10; i += 1) {
    const upper = rand() < 0.5;
    const a = upper ? -Math.PI * (0.1 + rand() * 0.8) : Math.PI * (0.1 + rand() * 0.8);
    const cy = upper ? top : bottom;
    ctx.fillStyle = "rgba(60,40,26,0.7)";
    ctx.beginPath();
    ctx.arc(r + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1), 0.4 + rand() * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  rustStreaks(ctx, rand, 1, w - 1, bottom + 2.5, 7, 36);
  rustStreaks(ctx, rand, 1, w - 1, 6, 5, 28);
  grime(ctx, rand, box, 16, [70, 58, 48], 0.35, 10);

  // Which space this opens into, sprayed on the larger of the two plates.
  const label = LOOK[ZONES[o.zone]].stencil;
  if (H - bottom > top) stencil(ctx, label, w / 2 + 3.5, H - 8, 5.2);
  else stencil(ctx, label, w / 2 + 3.5, top - 14, 5.2);

  occlusion(ctx, { x0: 0, y0: 0, x1: w, y1: top }, "top", 8, 0.5);
  occlusion(ctx, { x0: 0, y0: bottom, x1: w, y1: H }, "bottom", 8, 0.5);
}

// ---------------------------------------------------------------------------
// Boiler
// ---------------------------------------------------------------------------

function paintPendant(k: Kit): void {
  const { ctx, o, rand } = k;
  const w = o.width;
  const length = bottomOf(o.solids[0]);
  const tw = w / 5;
  const cy = length - w / 2;
  const half = (tw - 0.7) / 2;

  ctx.fillStyle = "rgb(24,21,19)";
  ctx.fillRect(0, 0, w, length);

  // Nested U-bends: the outer pair of legs returns round the inner pair.
  for (let j = 0; j < 2; j += 1) {
    vTube(k, j * tw + 0.35, 0, cy, tw - 0.7, TUBE, 0.9);
    vTube(k, w - (j + 1) * tw + 0.35, 0, cy, tw - 0.7, TUBE, 0.9);
    uBend(k, w / 2, cy, w / 2 - j * tw - tw / 2, half, TUBE);
  }
  // The centre tube stops short, capped, inside the inner bend.
  vTube(k, 2 * tw + 0.35, 0, cy, tw - 0.7, TUBE, 0.9);
  ctx.save();
  const cap = ctx.createRadialGradient(w / 2 - half * 0.3, cy, 0, w / 2, cy, half);
  cap.addColorStop(0, rgba(shade(TUBE, 1.3)));
  cap.addColorStop(1, rgba(shade(TUBE, 0.35)));
  ctx.fillStyle = cap;
  ctx.beginPath();
  ctx.arc(w / 2, cy, half, 0, Math.PI);
  ctx.fill();
  ctx.restore();

  // Alignment ties across the platen, with ash lying on each.
  for (let y = 18 + rand() * 8; y < cy - 6; y += 22 + rand() * 6) {
    hTube(k, 0.4, w - 0.4, y, 2.4, [120, 116, 110], 0.2, null);
    ctx.fillStyle = "rgba(226,222,214,0.7)";
    ctx.fillRect(0.4, y - 0.5, w - 0.8, 0.6);
  }

  // Slag builds heaviest low down, where the gas is hottest.
  const slag = k.tex("slag", 0.1);
  ctx.save();
  ctx.fillStyle = slag ?? rgba(ASH);
  for (let i = 0; i < 7; i += 1) {
    const x = rand() * w;
    const y = cy - 10 + rand() * 16;
    ctx.globalAlpha = 0.55 + rand() * 0.35;
    ctx.beginPath();
    ctx.moveTo(x - 2.5 - rand() * 2, y);
    ctx.quadraticCurveTo(x, y - 6 - rand() * 6, x + 2.5 + rand() * 2, y);
    ctx.lineTo(x + 0.4, y + 3 + rand() * 7);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // The penthouse roof the pendant hangs through.
  ctx.fillStyle = "rgb(30,27,25)";
  ctx.fillRect(0, 0, w, 4);
  ctx.fillStyle = "rgba(255,240,220,0.14)";
  ctx.fillRect(0, 3.6, w, 0.5);
  occlusion(ctx, { x0: 0, y0: 0, x1: w, y1: length }, "top", 12, 0.5);
}

function paintClinker(k: Kit): void {
  const { ctx, o, rand } = k;
  const solid = o.solids[0];
  const pts = outline(solid);
  const box = boundsOf([solid]);
  fillMaterial(ctx, box, [112, 106, 98], k.tex("slag", 0.12, rand() * 6), 0.9);
  tintOver(ctx, box, [178, 168, 156]);
  // Fused nodules, each a lump with its own highlight and shadow.
  for (let i = 0; i < 30; i += 1) {
    const x = box.x0 + rand() * (box.x1 - box.x0);
    const y = box.y0 + rand() * (box.y1 - box.y0);
    const r = 1.4 + rand() * 3.4;
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, "rgba(255,250,240,0.32)");
    g.addColorStop(0.55, "rgba(255,250,240,0.04)");
    g.addColorStop(0.8, "rgba(0,0,0,0.14)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Glassy black slag: vitrified patches with a sharp specular edge.
  for (let i = 0; i < 6; i += 1) {
    const x = box.x0 + rand() * (box.x1 - box.x0);
    const y = box.y0 + (0.25 + rand() * 0.75) * (box.y1 - box.y0);
    const poly: Vec[] = [];
    const n = 5 + Math.floor(rand() * 3);
    for (let j = 0; j < n; j += 1) {
      const a = (j / n) * Math.PI * 2;
      const rr = 1.2 + rand() * 2.6;
      poly.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7]);
    }
    ctx.fillStyle = "rgba(18,16,16,0.85)";
    ctx.beginPath();
    tracePoly(ctx, poly);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 0.18;
    ctx.beginPath();
    ctx.moveTo(poly[0][0], poly[0][1]);
    ctx.lineTo(poly[1][0], poly[1][1]);
    ctx.stroke();
  }
  grime(ctx, rand, box, 8, [168, 90, 42], 0.35, 6);
  occlusion(ctx, box, "bottom", 12, 0.65);
  bevel(ctx, pts, 1.1, 0.34, 0.3);
}

function paintHopper(k: Kit): void {
  const { ctx, o, rand } = k;
  const box = boundsOf(o.solids);
  const w = o.width;
  const rise = H - box.y0;
  const len = Math.hypot(w, rise);
  const dx = w / len;
  const dy = -rise / len;
  const nx = rise / len;
  const ny = w / len;

  ctx.fillStyle = "rgb(26,23,21)";
  ctx.fillRect(0, box.y0, w, rise);
  // Membrane-wall tubes running down the slope.
  for (let i = 0; i < 18; i += 1) {
    const off = 3.1 + i * 6.3;
    const px = nx * off;
    const py = H + ny * off;
    pipe(ctx, px - dx * 140, py - dy * 140, px + dx * 140, py + dy * 140, 2.95, TUBE, k.tex("rust", 0.14), 0.22);
  }
  // Ash that slid down the slope and banked in the throat.
  const ash = k.tex("slag", 0.1);
  ctx.save();
  ctx.fillStyle = ash ?? rgba(ASH);
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(0, H);
  const reach = 22 + rand() * 12;
  for (let x = 0; x <= reach; x += 3) {
    const onSlope = H - (x / w) * rise;
    ctx.lineTo(x, onSlope + 0.6 + Math.sin(x * 0.9) * 0.5 + (x / reach) * 4);
  }
  ctx.lineTo(reach + 6, H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // A film of ash along the whole face.
  ctx.save();
  ctx.strokeStyle = "rgba(214,210,200,0.5)";
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(w, box.y0);
  ctx.stroke();
  ctx.restore();
  // The throat wall on the right is vertical tubes.
  vTube(k, w - 7.8, box.y0, H, 3.9, TUBE, 0.5);
  vTube(k, w - 3.9, box.y0, H, 3.9, TUBE, 0.5);
  occlusion(ctx, box, "bottom", 10, 0.55);
}

function paintPlaten(k: Kit): void {
  const { ctx, o } = k;
  const w = o.width;
  const top = bottomOf(o.solids[0]);
  const bottom = topOf(o.solids[1]);
  const tw = w / 4;
  const header = 6.5;

  ctx.fillStyle = "rgb(24,21,19)";
  ctx.fillRect(0, 0, w, H);
  for (let i = 0; i < 4; i += 1) {
    vTube(k, i * tw + 0.3, 0, top - header, tw - 0.6, TUBE, 1);
    vTube(k, i * tw + 0.3, bottom + header, H, tw - 0.6, TUBE, 1);
  }
  // Headers close off the tubes either side of the lane.
  hTube(k, 0, w, top - header, header, [104, 94, 86]);
  hTube(k, 0, w, bottom, header, [104, 94, 86]);
  // Stub welds where each tube enters its header.
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  for (let i = 0; i < 4; i += 1) {
    ctx.fillRect(i * tw + 1, top - header - 1.2, tw - 2, 1.2);
    ctx.fillRect(i * tw + 1, bottom + header, tw - 2, 1.2);
  }
  // Ash lies on top of the lower header.
  const ash = k.tex("slag", 0.1);
  ctx.save();
  ctx.fillStyle = ash ?? rgba(ASH);
  ctx.beginPath();
  ctx.moveTo(0, bottom + 2.2);
  for (let x = 0; x <= w; x += 2) ctx.lineTo(x, bottom + 0.2 + Math.abs(Math.sin(x * 0.7)) * 0.9);
  ctx.lineTo(w, bottom + 2.2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function paintTubeBank(k: Kit): void {
  const { ctx, o, rand, box } = k;
  const w = o.width;
  ctx.fillStyle = "rgb(18,16,15)";
  ctx.fillRect(0, box.y0, w, box.y1 - box.y0);
  // Deep inside the bank the gaps are black; ash bridges some of them.
  ctx.save();
  ctx.fillStyle = "rgba(170,166,158,0.45)";
  for (let i = 0; i < 7; i += 1) {
    ctx.beginPath();
    ctx.ellipse(box.x0 + 4 + rand() * (w - 8), box.y0 + 4 + rand() * (box.y1 - box.y0 - 8), 2 + rand() * 3, 1.2 + rand() * 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // Tubes end-on in a staggered pitch.
  const r = 2.85;
  for (let c = 0; c < 6; c += 1) {
    const x = 5.6 + c * 6.2;
    for (let y = box.y0 + 4 + (c % 2) * 3.2; y < box.y1 - 3.4; y += 6.4) {
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.15, x, y, r);
      g.addColorStop(0, rgba(shade(TUBE, 1.55)));
      g.addColorStop(0.6, rgba(TUBE));
      g.addColorStop(1, rgba(shade(TUBE, 0.35)));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      // The bore, then the ash cap every tube in a gas pass wears on top.
      ctx.fillStyle = "rgba(12,10,9,0.92)";
      ctx.beginPath();
      ctx.arc(x + 0.15, y + 0.2, r * 0.52, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(214,210,200,${0.55 + rand() * 0.35})`;
      ctx.lineWidth = 0.9 + rand() * 0.6;
      ctx.beginPath();
      ctx.arc(x, y + 0.2, r + 0.1, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
    }
  }
  // Support plates either side, bolted.
  for (const x of [0, w - 1.8]) {
    ctx.fillStyle = "rgb(84,78,72)";
    ctx.fillRect(x, box.y0, 1.8, box.y1 - box.y0);
    ctx.fillStyle = "rgba(255,240,220,0.18)";
    ctx.fillRect(x, box.y0, 0.4, box.y1 - box.y0);
    for (let y = box.y0 + 5; y < box.y1 - 3; y += 11) bolt(ctx, x + 0.9, y, 0.55);
  }
}

// ---------------------------------------------------------------------------
// Ballast tank
// ---------------------------------------------------------------------------

/** A coated plate with a stadium hole cut through it, [x0, x0 + w]. */
function holedPlate(k: Kit, x0: number, w: number, top: number, bottom: number): void {
  const { ctx, rand } = k;
  const r = w / 2;
  const box: Box = { x0, y0: 0, x1: x0 + w, y1: H };
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, 0, w, H);
  ctx.clip();
  coatedPlate(k, box);
  // The plate is lit face-on; its edges fall off a little.
  const g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
  g.addColorStop(0, "rgba(0,0,0,0.18)");
  g.addColorStop(0.3, "rgba(0,0,0,0)");
  g.addColorStop(0.75, "rgba(0,0,0,0.05)");
  g.addColorStop(1, "rgba(0,0,0,0.25)");
  ctx.fillStyle = g;
  ctx.fillRect(x0, 0, w, H);

  // The cut edge of the hole: shadowed above, catching light below, and
  // rusting where the coating has worn thin on the sharp edge.
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = "rgba(40,24,14,0.55)";
  ctx.beginPath();
  ctx.arc(x0 + r, top, r, 0, -Math.PI, true);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,248,232,0.4)";
  ctx.beginPath();
  ctx.arc(x0 + r, bottom, r, Math.PI, 0, true);
  ctx.stroke();
  ctx.fillStyle = "rgba(128,56,22,0.55)";
  for (let i = 0; i < 12; i += 1) {
    const upper = rand() < 0.5;
    const a = upper ? -Math.PI * rand() : Math.PI * rand();
    ctx.beginPath();
    ctx.arc(x0 + r + Math.cos(a) * r, (upper ? top : bottom) + Math.sin(a) * r, 0.5 + rand() * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  rustStreaks(ctx, rand, x0 + 1, x0 + w - 1, bottom + r * 0.4, 6, 30);

  // Scallops where the plate meets the shell, top and bottom, for drainage.
  ctx.fillStyle = "rgba(14,12,10,0.85)";
  for (const [cy, from, to] of [
    [0, 0, Math.PI],
    [H, Math.PI, Math.PI * 2],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x0 + r, cy, Math.min(3.2, r * 0.45), from, to);
    ctx.fill();
  }
  // Sediment tide-line at the bottom, where ballast water leaves its mud.
  ctx.fillStyle = "rgba(96,78,56,0.55)";
  ctx.fillRect(x0, H - 5 - rand() * 3, w, 8);
  occlusion(ctx, box, "bottom", 6, 0.45);
  ctx.restore();
}

function paintWebFrame(k: Kit): void {
  const { o } = k;
  holedPlate(k, 0, o.width, bottomOf(o.solids[0]), topOf(o.solids[1]));
  // A flat-bar stiffener runs up the face, stopping short of the hole.
  stiffenerBar(k, o.width * 0.62, 0, bottomOf(o.solids[0]) - o.width / 2 - 2);
  stiffenerBar(k, o.width * 0.62, topOf(o.solids[1]) + o.width / 2 + 2, H);
}

function stiffenerBar(k: Kit, x: number, y0: number, y1: number): void {
  const { ctx } = k;
  if (y1 - y0 < 4) return;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.fillRect(x + 1.2, y0, 1.1, y1 - y0);
  ctx.fillStyle = rgba(shade(COATING, 1.08));
  ctx.fillRect(x, y0, 1.4, y1 - y0);
  ctx.fillStyle = "rgba(255,250,236,0.35)";
  ctx.fillRect(x, y0, 0.35, y1 - y0);
  ctx.restore();
}

function paintDoubleFrame(k: Kit): void {
  const { o } = k;
  const bar = 16;
  holedPlate(k, 0, bar, bottomOf(o.solids[0]), topOf(o.solids[1]));
  holedPlate(k, o.width - bar, bar, bottomOf(o.solids[2]), topOf(o.solids[3]));
}

function paintBrackets(k: Kit): void {
  const { ctx, o, rand } = k;
  const box = boundsOf(o.solids);
  const floor = box.y1 >= H - 0.01;
  coatedPlate(k, box);

  // The stiffener, seen edge-on as a flat bar with a lit edge.
  const stem = boundsOf([o.solids[0]]);
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(stem.x1 - 1.4, stem.y0, 1.4, stem.y1 - stem.y0);
  ctx.fillStyle = "rgba(255,250,236,0.3)";
  ctx.fillRect(stem.x0, stem.y0, 0.6, stem.y1 - stem.y0);
  ctx.restore();

  // Each bracket: a flanged free edge, a lightening hole, a drain scallop.
  for (const tri of [o.solids[1], o.solids[2]]) {
    if (tri.shape !== "poly") continue;
    const [a, b, c] = tri.points;
    // The free edge is the one that is neither horizontal nor vertical.
    const edges: Array<[Vec, Vec]> = [
      [a, b],
      [b, c],
      [c, a],
    ];
    const free = edges.find(([p, q]) => Math.abs(p[0] - q[0]) > 0.5 && Math.abs(p[1] - q[1]) > 0.5);
    if (free) {
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 4.2;
      ctx.beginPath();
      ctx.moveTo(free[0][0], free[0][1]);
      ctx.lineTo(free[1][0], free[1][1]);
      ctx.stroke();
      ctx.strokeStyle = rgba(shade(COATING, 1.12));
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,250,236,0.4)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.restore();
    }
    const ix = (a[0] + b[0] + c[0]) / 3;
    const iy = (a[1] + b[1] + c[1]) / 3;
    ctx.save();
    ctx.fillStyle = "rgba(14,12,10,0.88)";
    ctx.beginPath();
    ctx.arc(ix, iy, 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,248,232,0.3)";
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    ctx.arc(ix, iy, 2.3, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.restore();
  }

  // Corrosion lives where water sits.
  if (floor) {
    grime(ctx, rand, { x0: box.x0, y0: H - 14, x1: box.x1, y1: H }, 10, [140, 60, 24], 0.5, 6);
    ctx.fillStyle = "rgba(92,74,52,0.6)";
    ctx.fillRect(box.x0, H - 3.5, box.x1 - box.x0, 4);
    occlusion(ctx, box, "bottom", 8, 0.5);
  } else {
    rustStreaks(ctx, rand, box.x0, box.x1, 2, 8, 34);
    occlusion(ctx, box, "top", 8, 0.5);
  }
  for (const s of o.solids) bevel(ctx, outline(s), 0.8, 0.3, 0.3);
}

function paintCrossTie(k: Kit): void {
  const { ctx, o, rand } = k;
  const solid = o.solids[0];
  const box = boundsOf([solid]);
  const w = o.width;
  coatedPlate(k, box);
  const w0 = (w - 12) / 2;
  const w1 = w0 + 12;
  // The web sits back from the flange faces: in their shadow near each flange.
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  ctx.fillRect(w0, box.y0 + 8, w1 - w0, box.y1 - box.y0 - 16);
  const under = ctx.createLinearGradient(0, box.y0 + 8, 0, box.y0 + 15);
  under.addColorStop(0, "rgba(0,0,0,0.45)");
  under.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = under;
  ctx.fillRect(w0, box.y0 + 8, w1 - w0, 7);
  // Fillet welds along both web-to-flange joints.
  ctx.fillStyle = "rgba(255,248,232,0.22)";
  ctx.fillRect(w0, box.y1 - 8.6, w1 - w0, 0.6);
  ctx.restore();
  // Rust bleeds from the lower flange tips, where water drips off.
  grime(ctx, rand, { x0: 0, y0: box.y1 - 8, x1: w, y1: box.y1 }, 8, [140, 62, 26], 0.5, 5);
  rustStreaks(ctx, rand, 0, w, box.y0 + 8, 4, 10);
  bevel(ctx, outline(solid), 1, 0.36, 0.34);
}

function paintStringer(k: Kit): void {
  const { ctx, o, rand } = k;
  const solid = o.solids[0];
  const box = boundsOf([solid]);
  const w = o.width;
  coatedPlate(k, box);
  const y0 = box.y0;
  // The deck plate edge: lit along its top, dark underneath.
  ctx.save();
  ctx.fillStyle = "rgba(255,250,236,0.35)";
  ctx.fillRect(0, y0, w, 0.7);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(0, y0 + 6.2, w, 0.8);
  // Drain holes along the deck.
  ctx.fillStyle = "rgba(14,12,10,0.8)";
  for (let x = 6 + rand() * 4; x < w - 4; x += 9 + rand() * 3) {
    ctx.beginPath();
    ctx.ellipse(x, y0 + 3.4, 1.3, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Mud left on the deck by the last ballast water.
  ctx.fillStyle = "rgba(100,80,56,0.5)";
  ctx.fillRect(0, y0, w, 1.1);
  ctx.restore();
  rustStreaks(ctx, rand, 0, w, y0 + 7, 10, 10);
  bevel(ctx, outline(solid), 0.8, 0.3, 0.3);
}

// ---------------------------------------------------------------------------
// Mine
// ---------------------------------------------------------------------------

function paintRockJaw(k: Kit): void {
  const { o } = k;
  rockBody(k, o.solids[0], "top");
  groundSupport(k, boundsOf([o.solids[0]]), Math.min(16, bottomOf(o.solids[0])));
  rockBody(k, o.solids[1], "bottom", [138, 128, 116]);
}

function paintHangingRock(k: Kit): void {
  const { ctx, o, rand } = k;
  const solid = o.solids[0];
  const box = boundsOf([solid]);
  rockBody(k, solid, "top");
  groundSupport(k, box, 14);
  // The parting it is hanging off: a dark open joint near the back.
  ctx.save();
  ctx.strokeStyle = "rgba(6,5,4,0.75)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  let x = box.x0;
  let y = 8 + rand() * 6;
  ctx.moveTo(x, y);
  while (x < box.x1) {
    x += 3 + rand() * 4;
    y += (rand() - 0.5) * 3;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

function paintMuckPile(k: Kit): void {
  const { ctx, o, rand } = k;
  const solid = o.solids[0];
  const box = boundsOf([solid]);
  fillMaterial(ctx, box, [96, 88, 78], k.tex("rock", 0.1, rand() * 6), 0.85);
  tintOver(ctx, box, [170, 160, 146]);
  speckle(ctx, rand, box, 260, 0.35, 0.5);
  rubble(k, solid, 38, [ROCK, [128, 120, 110], [160, 150, 136]], "rock");
  occlusion(ctx, box, "bottom", 10, 0.6);
  bevel(ctx, outline(solid), 0.8, 0.3, 0.35);
}

function paintHangup(k: Kit): void {
  const { ctx, o, rand } = k;
  const solid = o.solids[0];
  const box = boundsOf([solid]);
  rockBody(k, solid, "none", [156, 146, 132], 0.16);
  // Shading as a round mass: lit on top, dark underneath.
  ctx.save();
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const r = (box.x1 - box.x0) / 2;
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.45, r * 0.1, cx, cy, r * 1.05);
  g.addColorStop(0, "rgba(255,248,232,0.16)");
  g.addColorStop(0.55, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
  // Dust settled on its upper surfaces.
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = "rgba(210,200,184,0.2)";
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.1, box.y0 + r * 0.2, r * 0.7, r * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  speckle(ctx, rand, box, 60, 0.3, 0.3);
}

/**
 * A tube along any path, lit from above and in front: stroked in layers from
 * a dark full-width body to a narrow highlight nudged up and left, so the
 * shading follows every bend without per-bend gradients.
 */
function tubeAlong(ctx: Ctx, path: readonly Vec[], radius: number, base: RGB): void {
  const trace = (dx: number, dy: number) => {
    ctx.beginPath();
    ctx.moveTo(path[0][0] + dx, path[0][1] + dy);
    for (let i = 1; i < path.length; i += 1) ctx.lineTo(path[i][0] + dx, path[i][1] + dy);
  };
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "butt";
  const layers: Array<[number, number, number, string]> = [
    [2 * radius, 0, 0, rgba(shade(base, 0.42))],
    [2 * radius * 0.8, -0.4, -1.1, rgba(shade(base, 0.78))],
    [2 * radius * 0.5, -0.8, -2.4, rgba(shade(base, 1.02))],
    [2 * radius * 0.18, -1.1, -4.2, "rgba(255,244,210,0.55)"],
  ];
  for (const [width, dx, dy, style] of layers) {
    trace(dx, dy);
    ctx.lineWidth = width;
    ctx.strokeStyle = style;
    ctx.stroke();
  }
  ctx.restore();
}

function paintVentDuct(k: Kit): void {
  const { ctx, o, rand } = k;
  const solid = o.solids[0];
  const box = boundsOf([solid]);
  const R = VENT_DUCT_RADIUS;
  // The same path the collision outline was built from.
  const sag = box.y1 - 32;
  const { centre } = ventDuct(o.width, sag);

  // The back behind and above the duct: dark rock under mesh.
  fillMaterial(ctx, box, [44, 40, 36], k.tex("rock", 0.16), 0.5, "overlay");
  groundSupport(k, box, box.y1);

  // Hangers: short chains from the back to the duct.
  const runStart = centre.findIndex(([, y]) => y > 20);
  for (let i = Math.max(1, runStart) + 3; i < centre.length - 6; i += 7) {
    const [x, y] = centre[i];
    ctx.save();
    ctx.strokeStyle = "rgba(150,144,134,0.8)";
    ctx.lineWidth = 0.35;
    for (let cy = 0; cy < y - R; cy += 1.3) {
      ctx.beginPath();
      ctx.ellipse(x, cy + 0.65, (cy / 1.3) % 2 < 1 ? 0.45 : 0.2, 0.65, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  tubeAlong(ctx, centre, R, DUCT);

  // The spiral wire: a rib across the duct every few units of its length.
  ctx.save();
  let carried = 0;
  for (let i = 1; i < centre.length; i += 1) {
    const [ax, ay] = centre[i - 1];
    const [bx, by] = centre[i];
    const len = Math.hypot(bx - ax, by - ay);
    if (len === 0) continue;
    const nx = -(by - ay) / len;
    const ny = (bx - ax) / len;
    for (let d = 3.4 - carried; d < len; d += 3.4) {
      const px = ax + ((bx - ax) * d) / len;
      const py = ay + ((by - ay) * d) / len;
      ctx.strokeStyle = "rgba(60,40,6,0.5)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(px - nx * R, py - ny * R);
      ctx.lineTo(px + nx * R, py + ny * R);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,238,190,0.22)";
      ctx.lineWidth = 0.35;
      ctx.beginPath();
      ctx.moveTo(px - nx * R - 0.6, py - ny * R);
      ctx.lineTo(px + nx * R - 0.6, py + ny * R);
      ctx.stroke();
    }
    carried = (carried + len) % 3.4;
  }
  ctx.restore();
  // Dust on its back, grime on its belly.
  grime(ctx, rand, { x0: 0, y0: box.y1 - 12, x1: o.width, y1: box.y1 }, 14, [120, 90, 50], 0.35, 7);
}

// ---------------------------------------------------------------------------
// Sewer
// ---------------------------------------------------------------------------

function paintRoots(k: Kit): void {
  const { ctx, o, rand } = k;
  const solid = o.solids[0];
  const pts = outline(solid);
  const box = boundsOf([solid]);
  const w = o.width;

  // The dense, wet core of the mass.
  ctx.fillStyle = "rgb(52,38,27)";
  ctx.fillRect(box.x0, box.y0, w, box.y1 - box.y0);
  // The open joint in the crown they came through.
  ctx.fillStyle = "rgba(6,5,4,0.9)";
  ctx.fillRect(w * 0.3, 0, w * 0.4, 2.2);

  // Targets on the outline, so the strands reach — and define — the edge.
  const targets: Vec[] = [];
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    for (let s = 0; s < 4; s += 1) {
      const t = rand();
      targets.push([pts[j][0] + (pts[i][0] - pts[j][0]) * t, pts[j][1] + (pts[i][1] - pts[j][1]) * t]);
    }
  }
  const tones: RGB[] = [
    [96, 68, 44],
    [132, 98, 64],
    [168, 132, 92],
    [196, 164, 122],
  ];
  for (let n = 0; n < 90; n += 1) {
    const sx = w * (0.32 + rand() * 0.36);
    const target = n < targets.length ? targets[n % targets.length] : ([box.x0 + rand() * w, box.y0 + rand() * box.y1] as Vec);
    const [tx, ty] = target;
    const bend = (rand() - 0.5) * 18;
    const segments = 7;
    const tone = tones[Math.floor(rand() * tones.length)];
    let px = sx;
    let py = 0;
    for (let s = 1; s <= segments; s += 1) {
      const t = s / segments;
      const x = sx + (tx - sx) * t + Math.sin(t * Math.PI) * bend + (rand() - 0.5) * 1.2;
      const y = ty * t;
      ctx.strokeStyle = rgba(shade(tone, 1 - t * 0.25));
      ctx.lineWidth = Math.max(0.18, 2.4 * (1 - t) + 0.2);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(x, y);
      ctx.stroke();
      px = x;
      py = y;
    }
  }
  // Hair roots and the wet sheen on everything.
  ctx.save();
  ctx.strokeStyle = "rgba(210,184,146,0.35)";
  ctx.lineWidth = 0.12;
  for (let n = 0; n < 140; n += 1) {
    const x = box.x0 + rand() * w;
    const y = box.y0 + rand() * (box.y1 - box.y0);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + (rand() - 0.5) * 4, y + 2, x + (rand() - 0.5) * 3, y + 3 + rand() * 4);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "screen";
  const sheen = ctx.createLinearGradient(box.x0, 0, box.x1, 0);
  sheen.addColorStop(0.2, "rgba(255,255,255,0)");
  sheen.addColorStop(0.4, "rgba(220,235,240,0.12)");
  sheen.addColorStop(0.6, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(box.x0, box.y0, w, box.y1 - box.y0);
  ctx.restore();
  occlusion(ctx, box, "top", 10, 0.6);
}

function paintDebris(k: Kit): void {
  const { ctx, o, rand } = k;
  const solid = o.solids[0];
  const pts = outline(solid);
  const box = boundsOf([solid]);
  fillMaterial(ctx, box, MUD, k.tex("concrete", 0.12, rand() * 6), 0.7, "overlay");
  tintOver(ctx, box, [150, 138, 118]);
  speckle(ctx, rand, box, 260, 0.3, 0.55);
  rubble(k, solid, 16, [[122, 78, 58], [104, 72, 56], [128, 122, 112], [96, 92, 86]], "brick");

  // A traffic cone, now and then — things end up in sewers — stood only
  // where the heap is tall enough to hold all of it.
  let coneX: number | null = null;
  if (rand() < 0.4) {
    for (let i = 0; i < 8 && coneX === null; i += 1) {
      const x = box.x0 + 8 + rand() * Math.max(1, box.x1 - box.x0 - 16);
      if (pointInPolygon(x, H - 13, pts)) coneX = x;
    }
  }
  if (coneX !== null) {
    const x = coneX;
    const base = H - 2;
    ctx.save();
    ctx.translate(x, base);
    ctx.rotate((rand() - 0.5) * 0.9);
    ctx.fillStyle = "rgb(214,84,32)";
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(4, 0);
    ctx.lineTo(1, -11);
    ctx.lineTo(-1, -11);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(240,238,230,0.85)";
    ctx.beginPath();
    ctx.moveTo(-2.9, -3.8);
    ctx.lineTo(2.9, -3.8);
    ctx.lineTo(2.3, -6);
    ctx.lineTo(-2.3, -6);
    ctx.closePath();
    ctx.fill();
    const shadeCone = ctx.createLinearGradient(-4, 0, 4, 0);
    shadeCone.addColorStop(0, "rgba(0,0,0,0.35)");
    shadeCone.addColorStop(0.4, "rgba(255,255,255,0.1)");
    shadeCone.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = shadeCone;
    ctx.fillRect(-4, -11, 8, 11);
    ctx.restore();
  }
  // Rag and wet wipes, snagged and grey.
  ctx.save();
  for (let i = 0; i < 3; i += 1) {
    const x = box.x0 + rand() * (box.x1 - box.x0);
    const y = box.y0 + (0.3 + rand() * 0.6) * (box.y1 - box.y0);
    if (!pointInPolygon(x, y, pts)) continue;
    ctx.fillStyle = "rgba(196,190,176,0.8)";
    ctx.beginPath();
    ctx.moveTo(x - 4, y);
    for (let a = 0; a < 7; a += 1) ctx.lineTo(x - 4 + a * 1.4, y - 1.5 - rand() * 2.2);
    ctx.lineTo(x + 5, y + 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(160,150,132,0.6)";
    ctx.lineWidth = 0.15;
    for (let f = 0; f < 5; f += 1) {
      ctx.beginPath();
      ctx.moveTo(x - 3 + f * 1.6, y);
      ctx.lineTo(x - 3 + f * 1.6 + (rand() - 0.5) * 2, y + 2 + rand() * 3);
      ctx.stroke();
    }
  }
  ctx.restore();
  // Wet at the water line.
  ctx.save();
  const wet = ctx.createLinearGradient(0, H - 8, 0, H);
  wet.addColorStop(0, "rgba(20,26,24,0)");
  wet.addColorStop(1, "rgba(20,26,24,0.55)");
  ctx.fillStyle = wet;
  ctx.fillRect(box.x0, H - 8, box.x1 - box.x0, 8);
  ctx.restore();
  bevel(ctx, pts, 0.8, 0.28, 0.3);
}

function paintDropPipe(k: Kit): void {
  const { ctx, o, rand } = k;
  const solid = o.solids[0];
  if (solid.shape !== "poly") return;
  const length = bottomOf(solid);
  const j0 = solid.points[1][1];
  const clay = (x0: number, y0: number, x1: number, y1: number, tone: RGB, gloss: number) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
    ctx.clip();
    fillMaterial(ctx, { x0, y0, x1, y1 }, tone, k.tex("brick", 0.12), 0.35, "overlay");
    shadeCylinderV(ctx, x0, y0, x1 - x0, y1 - y0, gloss);
    ctx.restore();
  };
  clay(5, 0, 21, length, CLAY, 0.4);
  // Socket joints: slightly larger, with the seal line at their mouth.
  for (const [y0, y1] of [
    [j0, j0 + 8],
    [length - 12, length],
  ]) {
    clay(3, y0, 23, y1, shade(CLAY, 0.9), 0.35);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(3, y0, 20, 0.8);
  }
  // Biofilm and the stain of everything that has run down it.
  grime(ctx, rand, { x0: 3, y0: length * 0.5, x1: 23, y1: length }, 10, [40, 52, 34], 0.45, 5);
  ctx.save();
  const stain = ctx.createLinearGradient(0, length * 0.4, 0, length);
  stain.addColorStop(0, "rgba(30,36,26,0)");
  stain.addColorStop(1, "rgba(30,36,26,0.45)");
  ctx.fillStyle = stain;
  ctx.fillRect(3, length * 0.4, 20, length * 0.6);
  // The mouth, dark, just visible from below.
  ctx.fillStyle = "rgba(8,8,8,0.9)";
  ctx.beginPath();
  ctx.ellipse(13, length - 0.6, 8.6, 1.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  occlusion(ctx, { x0: 3, y0: 0, x1: 23, y1: length }, "top", 8, 0.5);
}

function paintCollapse(k: Kit): void {
  const { ctx, o, rand } = k;
  const [upper, lower] = o.solids;
  // The broken crown: cast concrete, fracture face, rebar in the break.
  const ub = boundsOf([upper]);
  const pts = outline(upper);
  ctx.save();
  ctx.beginPath();
  tracePoly(ctx, pts);
  ctx.clip();
  fillMaterial(ctx, ub, CONCRETE, k.tex("concrete", 0.16, rand() * 6), 0.9);
  tintOver(ctx, ub, [206, 200, 188]);
  speckle(ctx, rand, ub, 200, 0.35, 0.45);
  // Rebar exposed along the fracture.
  ctx.strokeStyle = "rgba(122,58,26,0.9)";
  ctx.lineWidth = 0.7;
  for (const [x, y] of pts) {
    if (y < 6 || rand() < 0.4) continue;
    ctx.beginPath();
    ctx.moveTo(x, y - 3);
    ctx.lineTo(x + (rand() - 0.5) * 3, y + 0.5);
    ctx.stroke();
  }
  occlusion(ctx, ub, "top", 10, 0.55);
  bevel(ctx, pts, 0.9, 0.3, 0.38);
  ctx.restore();
  // Rubble on the invert, in mud.
  const lb = boundsOf([lower]);
  ctx.save();
  ctx.beginPath();
  tracePoly(ctx, outline(lower));
  ctx.clip();
  fillMaterial(ctx, lb, MUD, k.tex("concrete", 0.12), 0.6, "overlay");
  tintOver(ctx, lb, [150, 140, 124]);
  speckle(ctx, rand, lb, 200, 0.25, 0.55);
  rubble(k, lower, 30, [[132, 128, 118], [116, 112, 104], [104, 100, 94], [118, 80, 62]], "concrete");
  occlusion(ctx, lb, "bottom", 8, 0.6);
  ctx.restore();
}

function paintPenstock(k: Kit): void {
  const { ctx, o, rand } = k;
  const w = o.width;
  const top = bottomOf(o.solids[0]);
  const bottom = topOf(o.solids[1]);
  const leaf = Math.min(15, top - 5);

  // Headwall above, concrete.
  fillMaterial(ctx, { x0: 0, y0: 0, x1: w, y1: top - leaf }, CONCRETE, k.tex("concrete", 0.16), 0.9);
  tintOver(ctx, { x0: 0, y0: 0, x1: w, y1: top - leaf }, [190, 186, 176]);
  // The gate leaf showing below it: painted steel, stiffened, sealed.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top - leaf, w, leaf);
  ctx.clip();
  fillMaterial(ctx, { x0: 0, y0: top - leaf, x1: w, y1: top }, GATE_PAINT, k.tex("rust", 0.2), 0.45, "overlay");
  for (let y = top - leaf + 4; y < top - 2; y += 5) {
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(0, y, w, 0.5);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, y + 0.5, w, 0.9);
  }
  rustStreaks(ctx, rand, 0, w, top - leaf + 1, 6, leaf);
  ctx.fillStyle = "rgb(18,18,18)";
  ctx.fillRect(0, top - 1.3, w, 1.3);
  ctx.restore();
  // Guide channels either side.
  for (const x of [0, w - 2.6]) {
    ctx.fillStyle = "rgb(58,62,64)";
    ctx.fillRect(x, 0, 2.6, H);
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fillRect(x, 0, 0.5, H);
  }
  // The weir below: concrete, steel sill on top, algae at the water line.
  fillMaterial(ctx, { x0: 2.6, y0: bottom, x1: w - 2.6, y1: H }, CONCRETE, k.tex("concrete", 0.16), 0.9);
  tintOver(ctx, { x0: 2.6, y0: bottom, x1: w - 2.6, y1: H }, [176, 176, 166]);
  ctx.fillStyle = "rgb(90,94,96)";
  ctx.fillRect(0, bottom, w, 2);
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(0, bottom, w, 0.4);
  ctx.fillStyle = "rgba(46,70,40,0.55)";
  ctx.fillRect(0, bottom + 2, w, 3 + rand() * 2);
  occlusion(ctx, { x0: 0, y0: 0, x1: w, y1: top }, "top", 8, 0.45);
}

// ---------------------------------------------------------------------------
// Storage tank
// ---------------------------------------------------------------------------

function paintAgitator(k: Kit): void {
  const { ctx, o } = k;
  const shaft = boundsOf([o.solids[0]]);
  const imp = boundsOf([o.solids[1]]);
  // Drive flange where the shaft leaves the roof.
  ctx.save();
  ctx.beginPath();
  ctx.rect(shaft.x0, 0, shaft.x1 - shaft.x0, imp.y0);
  ctx.clip();
  fillMaterial(ctx, { x0: shaft.x0, y0: 0, x1: shaft.x1, y1: imp.y0 }, STAINLESS, null, 0);
  shadeCylinderV(ctx, shaft.x0, 0, shaft.x1 - shaft.x0, imp.y0, 0.55);
  // Rigid coupling, bolted.
  const cy = 14;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(shaft.x0, cy, 6, 6);
  ctx.fillStyle = rgba(shade(STAINLESS, 0.8));
  ctx.fillRect(shaft.x0, cy + 0.4, 6, 5.2);
  shadeCylinderV(ctx, shaft.x0, cy + 0.4, 6, 5.2, 0.3);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(shaft.x0, cy + 2.8, 6, 0.4);
  // Product residue creeping up the shaft from the liquid line.
  const stain = ctx.createLinearGradient(0, imp.y0 - 30, 0, imp.y0);
  stain.addColorStop(0, "rgba(90,60,30,0)");
  stain.addColorStop(1, "rgba(90,60,30,0.45)");
  ctx.fillStyle = stain;
  ctx.fillRect(shaft.x0, imp.y0 - 30, 6, 30);
  ctx.restore();
  // The swept volume of the blades, a faint blur the eye reads as motion.
  ctx.save();
  ctx.beginPath();
  ctx.rect(imp.x0, imp.y0, imp.x1 - imp.x0, imp.y1 - imp.y0);
  ctx.clip();
  const g = ctx.createLinearGradient(imp.x0, 0, imp.x1, 0);
  g.addColorStop(0, "rgba(160,164,168,0.25)");
  g.addColorStop(0.5, "rgba(160,164,168,0.08)");
  g.addColorStop(1, "rgba(160,164,168,0.25)");
  ctx.fillStyle = g;
  ctx.fillRect(imp.x0, imp.y0, imp.x1 - imp.x0, imp.y1 - imp.y0);
  ctx.restore();
}

/**
 * The impeller, drawn live every frame: a Rushton turbine whose radial
 * blades sweep across the swept volume. Its outline never changes size, so
 * the static collision box is exactly what it fills.
 */
function agitatorMotion(ctx: Ctx, o: Obstacle, t: number): void {
  const imp = boundsOf([o.solids[1]]);
  const hub = boundsOf([o.solids[2]]);
  const cx = o.x + (imp.x0 + imp.x1) / 2;
  const R = (imp.x1 - imp.x0) / 2;
  const theta = t * 7 + (o.seed % 628) / 100;
  const blades = Array.from({ length: 6 }, (_, i) => theta + (i * Math.PI) / 3);
  const drawBlade = (phi: number) => {
    const a = cx + R * 0.66 * Math.cos(phi);
    const b = cx + R * Math.cos(phi);
    const x0 = Math.min(a, b);
    const width = Math.max(0.7, Math.abs(b - a));
    const front = Math.sin(phi) > 0;
    const lit = 0.55 + 0.45 * Math.abs(Math.cos(phi));
    ctx.fillStyle = rgba(shade(STAINLESS, front ? lit : lit * 0.55));
    ctx.fillRect(x0, imp.y0, width, imp.y1 - imp.y0);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(x0, imp.y0, width, 0.6);
  };
  for (const phi of blades) if (Math.sin(phi) <= 0) drawBlade(phi);
  // The disc the blades are welded to, edge-on.
  ctx.fillStyle = rgba(shade(STAINLESS, 0.75));
  ctx.fillRect(o.x + imp.x0 + R * 0.2, (imp.y0 + imp.y1) / 2 - 0.7, (imp.x1 - imp.x0) * 0.8, 1.4);
  // The hub, in front of the back blades and behind the front ones.
  const g = ctx.createLinearGradient(o.x + hub.x0, 0, o.x + hub.x1, 0);
  g.addColorStop(0, rgba(shade(STAINLESS, 0.3)));
  g.addColorStop(0.35, rgba(shade(STAINLESS, 1.05)));
  g.addColorStop(0.5, rgba(shade(STAINLESS, 0.85)));
  g.addColorStop(1, rgba(shade(STAINLESS, 0.25)));
  ctx.fillStyle = g;
  ctx.fillRect(o.x + hub.x0, hub.y0, hub.x1 - hub.x0, hub.y1 - hub.y0);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(o.x + hub.x0, hub.y0, hub.x1 - hub.x0, 0.6);
  for (const phi of blades) if (Math.sin(phi) > 0) drawBlade(phi);
}

function paintRoofLegs(k: Kit): void {
  const { ctx, o, rand } = k;
  for (let i = 0; i < o.solids.length; i += 2) {
    const leg = boundsOf([o.solids[i]]);
    const pad = boundsOf([o.solids[i + 1]]);
    // The pad the leg stands on, in a ring of sludge.
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.x0, pad.y0, pad.x1 - pad.x0, pad.y1 - pad.y0);
    ctx.clip();
    fillMaterial(ctx, pad, [70, 52, 40], k.tex("rust", 0.2), 0.5, "overlay");
    ctx.fillStyle = "rgba(40,30,22,0.6)";
    ctx.fillRect(pad.x0, pad.y1 - 1.2, pad.x1 - pad.x0, 1.2);
    ctx.restore();
    // The leg: pipe, gone to rust, pin holes near the top.
    ctx.save();
    ctx.beginPath();
    ctx.rect(leg.x0, leg.y0, leg.x1 - leg.x0, leg.y1 - leg.y0);
    ctx.clip();
    fillMaterial(ctx, leg, TANK_STEEL, k.tex("rust", 0.16), 0.9);
    grime(ctx, rand, leg, 5, [60, 30, 16], 0.35, 4);
    shadeCylinderV(ctx, leg.x0, leg.y0, leg.x1 - leg.x0, leg.y1 - leg.y0, 0.22);
    const cx = (leg.x0 + leg.x1) / 2;
    for (const dy of [5, 10]) {
      ctx.fillStyle = "rgba(8,6,5,0.9)";
      ctx.beginPath();
      ctx.arc(cx, leg.y0 + dy, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    // The pin through the upper hole.
    ctx.fillStyle = "rgb(150,146,140)";
    ctx.fillRect(leg.x0, leg.y0 + 4.4, leg.x1 - leg.x0, 1.2);
    // The cut top of the pipe.
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(leg.x0, leg.y0, leg.x1 - leg.x0, 1);
    // Sludge line around its foot.
    ctx.fillStyle = "rgba(46,34,24,0.7)";
    ctx.fillRect(leg.x0, leg.y1 - 4 - rand() * 3, leg.x1 - leg.x0, 8);
    ctx.restore();
  }
}

function paintHeatingCoils(k: Kit): void {
  const { ctx, o, rand, box } = k;
  const w = o.width;
  const h = box.y1 - box.y0;
  ctx.fillStyle = "rgb(22,18,16)";
  ctx.fillRect(0, box.y0, w, h);
  const rows = 3;
  const gap = 1.2;
  const foot = 4;
  const ph = (h - foot - gap * (rows - 1)) / rows;
  for (let r = 0; r < rows; r += 1) {
    const y = box.y0 + r * (ph + gap);
    hTube(k, ph / 2, w - ph / 2, y, ph, [112, 80, 60]);
    // Scale on the top of each run.
    ctx.fillStyle = "rgba(200,190,172,0.35)";
    ctx.fillRect(ph / 2, y + 0.3, w - ph, 0.9);
  }
  // Return bends, alternating ends.
  for (let r = 0; r < rows - 1; r += 1) {
    const y = box.y0 + r * (ph + gap) + ph / 2 + (ph + gap) / 2;
    const left = r % 2 === 1;
    uBend(k, left ? ph / 2 : w - ph / 2, y, (ph + gap) / 2, ph / 2, [112, 80, 60], left ? Math.PI / 2 : -Math.PI / 2, left ? Math.PI * 1.5 : Math.PI / 2);
  }
  // Stands and U-bolt clamps.
  for (const x of [14, w / 2, w - 14]) {
    ctx.fillStyle = "rgb(48,44,42)";
    ctx.fillRect(x - 1.2, box.y0 + 2, 2.4, h - 2);
    ctx.fillStyle = "rgba(255,240,220,0.18)";
    ctx.fillRect(x - 1.2, box.y0 + 2, 0.4, h - 2);
    ctx.strokeStyle = "rgba(170,166,156,0.7)";
    ctx.lineWidth = 0.45;
    for (let r = 0; r < rows; r += 1) {
      const y = box.y0 + r * (ph + gap);
      ctx.beginPath();
      ctx.arc(x, y + ph / 2, ph / 2 + 0.3, Math.PI * 0.95, Math.PI * 2.05);
      ctx.stroke();
    }
  }
  grime(ctx, rand, box, 10, [60, 34, 18], 0.4, 6);
  occlusion(ctx, box, "bottom", 6, 0.55);
}

function paintInlet(k: Kit): void {
  const { ctx, o, rand } = k;
  const d = o.solids[0];
  if (d.shape !== "disc") return;
  const { cx, cy, r } = d;
  const box: Box = { x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r };
  fillMaterial(ctx, box, [120, 100, 86], k.tex("rust", 0.14), 0.75, "overlay");
  // The flange face: flat, lit from the front, a little darker to the rim.
  const face = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.2, cx, cy, r);
  face.addColorStop(0, "rgba(255,244,228,0.14)");
  face.addColorStop(0.7, "rgba(0,0,0,0.05)");
  face.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = face;
  ctx.fillRect(box.x0, box.y0, 2 * r, 2 * r);
  // Bolt circle.
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    bolt(ctx, cx + Math.cos(a) * r * 0.84, cy + Math.sin(a) * r * 0.84, 1.3, [128, 104, 86]);
  }
  // Raised face, machined in fine rings.
  ctx.save();
  for (let rr = r * 0.56; rr < r * 0.68; rr += 0.35) {
    ctx.strokeStyle = rr % 0.7 < 0.35 ? "rgba(255,240,220,0.12)" : "rgba(0,0,0,0.12)";
    ctx.lineWidth = 0.2;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
  }
  // The bore: the inside of the pipe, going away into the dark.
  const bore = ctx.createRadialGradient(cx + 1.4, cy + 1.6, 0, cx, cy, r * 0.55);
  bore.addColorStop(0, "rgb(4,3,3)");
  bore.addColorStop(0.7, "rgb(22,16,12)");
  bore.addColorStop(1, "rgb(70,50,38)");
  ctx.fillStyle = bore;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,240,220,0.3)";
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.55, Math.PI * 1.05, Math.PI * 1.7);
  ctx.stroke();
  ctx.restore();
  // Product has run out of it and down the face.
  const run = ctx.createLinearGradient(0, cy + r * 0.5, 0, cy + r);
  run.addColorStop(0, "rgba(40,24,12,0.65)");
  run.addColorStop(1, "rgba(40,24,12,0)");
  ctx.fillStyle = run;
  ctx.fillRect(cx - 1.4 - rand(), cy + r * 0.5, 2.6, r * 0.5);
}

function paintSwingLine(k: Kit): void {
  const { ctx, o, rand } = k;
  const [hinge, line, float] = o.solids;
  if (line.shape !== "poly") return;
  const [p0, p1, p2, p3] = line.points;
  const ax = (p0[0] + p3[0]) / 2;
  const ay = (p0[1] + p3[1]) / 2;
  const bx = (p1[0] + p2[0]) / 2;
  const by = (p1[1] + p2[1]) / 2;
  const r = Math.hypot(p0[0] - p3[0], p0[1] - p3[1]) / 2;
  pipe(ctx, ax, ay, bx, by, r, TANK_STEEL, k.tex("rust", 0.14), 0.25);
  // Flanged joints along the line.
  for (const t of [0.36, 0.7]) {
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    const ang = Math.atan2(by - ay, bx - ax);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(-0.9, -r, 1.8, 2 * r);
    ctx.fillStyle = "rgba(255,236,210,0.25)";
    ctx.fillRect(-0.9, -r, 0.4, 2 * r);
    ctx.restore();
  }
  // The hinge bracket and its pin.
  const hb = boundsOf([hinge]);
  ctx.save();
  ctx.beginPath();
  ctx.rect(hb.x0, hb.y0, hb.x1 - hb.x0, hb.y1 - hb.y0);
  ctx.clip();
  fillMaterial(ctx, hb, [84, 66, 54], k.tex("rust", 0.16), 0.6, "overlay");
  ctx.restore();
  bolt(ctx, ax, ay, 1.6, [140, 120, 100]);
  // The float: a pontoon drum.
  const fb = boundsOf([float]);
  ctx.save();
  ctx.beginPath();
  tracePoly(ctx, outline(float));
  ctx.clip();
  fillMaterial(ctx, fb, [150, 106, 74], k.tex("rust", 0.16), 0.7, "overlay");
  shadeCylinderH(ctx, fb.x0, fb.y0, fb.x1 - fb.x0, fb.y1 - fb.y0, 0.3);
  for (const x of [fb.x0 + 2.2, fb.x1 - 2.6]) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(x, fb.y0, 0.6, fb.y1 - fb.y0);
  }
  rustStreaks(ctx, rand, fb.x0, fb.x1, fb.y0 + 6, 5, 8);
  ctx.restore();
}

// ---------------------------------------------------------------------------

const PAINTERS: Record<ObstacleKind, (k: Kit) => void> = {
  BULKHEAD: paintBulkhead,
  PENDANT: paintPendant,
  CLINKER: paintClinker,
  HOPPER: paintHopper,
  PLATEN: paintPlaten,
  TUBE_BANK: paintTubeBank,
  WEB_FRAME: paintWebFrame,
  BRACKETS: paintBrackets,
  CROSS_TIE: paintCrossTie,
  STRINGER: paintStringer,
  DOUBLE_FRAME: paintDoubleFrame,
  ROCK_JAW: paintRockJaw,
  HANGING_ROCK: paintHangingRock,
  MUCK_PILE: paintMuckPile,
  HANGUP: paintHangup,
  VENT_DUCT: paintVentDuct,
  ROOTS: paintRoots,
  DEBRIS: paintDebris,
  DROP_PIPE: paintDropPipe,
  COLLAPSE: paintCollapse,
  PENSTOCK: paintPenstock,
  AGITATOR: paintAgitator,
  ROOF_LEGS: paintRoofLegs,
  HEATING_COILS: paintHeatingCoils,
  INLET: paintInlet,
  SWING_LINE: paintSwingLine,
};

/**
 * The parts that move, drawn every frame over the sprite, in world space.
 * Only the impeller is solid; the rest — water, grit — is what the space is
 * doing around an obstacle and never collides with anything.
 */
export function drawObstacleMotion(ctx: Ctx, o: Obstacle, t: number): void {
  switch (o.kind) {
    case "AGITATOR":
      agitatorMotion(ctx, o, t);
      return;
    case "DROP_PIPE": {
      // A thin stream from the mouth to the invert, with a little splash.
      const length = bottomOf(o.solids[0]);
      const x = o.x + 13;
      ctx.save();
      const g = ctx.createLinearGradient(0, length, 0, H);
      g.addColorStop(0, "rgba(186,200,196,0.55)");
      g.addColorStop(1, "rgba(186,200,196,0.18)");
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.1;
      ctx.setLineDash([3, 2.2]);
      ctx.lineDashOffset = -t * 60;
      ctx.beginPath();
      ctx.moveTo(x, length);
      ctx.bezierCurveTo(x + 0.4, length + 20, x + 0.6, H - 20, x + 0.8, H - 1);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(200,214,210,0.35)";
      ctx.beginPath();
      ctx.ellipse(x + 0.8, H - 1.2, 3 + Math.sin(t * 20) * 0.6, 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    case "HANGUP":
    case "HANGING_ROCK": {
      // Grit trickling off the loose rock.
      const b = boundsOf(o.solids);
      ctx.save();
      ctx.fillStyle = "rgba(196,184,164,0.55)";
      for (let i = 0; i < 6; i += 1) {
        const phase = (t * 0.9 + i * 0.37 + (o.seed % 97) / 97) % 1;
        const x = o.x + b.x0 + ((i * 7.3 + (o.seed % 13)) % Math.max(1, b.x1 - b.x0));
        const y = b.y1 + phase * phase * (H - b.y1);
        ctx.fillRect(x, y, 0.5, 0.9);
      }
      ctx.restore();
      return;
    }
    case "ROOTS": {
      // Water dripping from the root tips.
      const b = boundsOf(o.solids);
      ctx.save();
      for (let i = 0; i < 3; i += 1) {
        const phase = (t * 0.6 + i * 0.41 + (o.seed % 89) / 89) % 1;
        const x = o.x + b.x0 + (b.x1 - b.x0) * (0.3 + i * 0.2);
        const y = b.y1 - 2 + phase * phase * (H - b.y1);
        ctx.fillStyle = "rgba(210,226,230,0.6)";
        ctx.beginPath();
        ctx.ellipse(x, y, 0.45, 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    default:
      return;
  }
}

import type { Solid, Vec } from "@/lib/elios-flight";
import { rgba, shade, type RGB } from "./look";

/**
 * Small painting vocabulary shared by everything the game draws.
 *
 * Realism here comes from three things layered together: a real photographed
 * surface (the textures), form shading that says what shape a thing is
 * (cylinders darken at their limbs, plates catch a bevel), and wear — rust
 * bleeding from edges, soot, grime where water sits. Everything is in world
 * units; the caller's transform takes care of pixels.
 */

export type Rand = () => number;
export type Ctx = CanvasRenderingContext2D;

/** Shoelace area; positive means clockwise on screen (y grows downward). */
export function signedArea(points: readonly Vec[]): number {
  let a = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    a += points[j][0] * points[i][1] - points[i][0] * points[j][1];
  }
  return a / 2;
}

/** A disc as the polygon the shadow caster and rim light work from. */
export function discPoints(cx: number, cy: number, r: number, n = 20): Vec[] {
  const pts: Vec[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

/** A solid's outline, clockwise, shifted by `ox`. */
export function outline(solid: Solid, ox = 0): readonly Vec[] {
  const pts = solid.shape === "disc" ? discPoints(solid.cx, solid.cy, solid.r) : solid.points;
  const cw = signedArea(pts) >= 0 ? pts : [...pts].reverse();
  return ox === 0 ? cw : cw.map(([x, y]) => [x + ox, y] as Vec);
}

/**
 * Add a solid to the current path. Every solid is wound clockwise, so a path
 * of several fills and clips as their union under the nonzero rule — mixed
 * windings would cancel wherever two solids overlap.
 */
export function traceSolid(ctx: Ctx, solid: Solid, ox = 0): void {
  if (solid.shape === "disc") {
    ctx.moveTo(solid.cx + ox + solid.r, solid.cy);
    ctx.arc(solid.cx + ox, solid.cy, solid.r, 0, Math.PI * 2, false);
    return;
  }
  const pts = outline(solid, ox);
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

export function tracePoly(ctx: Ctx, pts: readonly Vec[]): void {
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

export function clipTo(ctx: Ctx, solids: readonly Solid[], ox = 0): void {
  ctx.beginPath();
  for (const s of solids) traceSolid(ctx, s, ox);
  ctx.clip();
}

export type Box = { x0: number; y0: number; x1: number; y1: number };

export function boundsOf(solids: readonly Solid[]): Box {
  const b: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const s of solids) {
    if (s.shape === "disc") {
      b.x0 = Math.min(b.x0, s.cx - s.r);
      b.x1 = Math.max(b.x1, s.cx + s.r);
      b.y0 = Math.min(b.y0, s.cy - s.r);
      b.y1 = Math.max(b.y1, s.cy + s.r);
    } else {
      for (const [x, y] of s.points) {
        b.x0 = Math.min(b.x0, x);
        b.x1 = Math.max(b.x1, x);
        b.y0 = Math.min(b.y0, y);
        b.y1 = Math.max(b.y1, y);
      }
    }
  }
  return b;
}

/**
 * A photographed surface as a repeating fill. `unitsPerPixel` sets how large
 * the photo reads in the world; the offset keeps two obstacles made of the
 * same material from wearing the identical patch of it.
 */
export function texturePattern(
  ctx: Ctx,
  img: HTMLImageElement | undefined,
  unitsPerPixel: number,
  ox: number,
  oy: number,
  rotate = 0,
): CanvasPattern | null {
  if (!img) return null;
  const p = ctx.createPattern(img, "repeat");
  if (!p) return null;
  const c = Math.cos(rotate) * unitsPerPixel;
  const s = Math.sin(rotate) * unitsPerPixel;
  p.setTransform(new DOMMatrix([c, s, -s, c, ox, oy]));
  return p;
}

/** Fill the current clip with a material: base colour, then the photo over it. */
export function fillMaterial(
  ctx: Ctx,
  box: Box,
  base: RGB,
  pattern: CanvasPattern | null,
  patternAlpha: number,
  blend: GlobalCompositeOperation = "source-over",
): void {
  ctx.fillStyle = rgba(base);
  ctx.fillRect(box.x0 - 1, box.y0 - 1, box.x1 - box.x0 + 2, box.y1 - box.y0 + 2);
  if (pattern) {
    ctx.save();
    ctx.globalAlpha = patternAlpha;
    ctx.globalCompositeOperation = blend;
    ctx.fillStyle = pattern;
    ctx.fillRect(box.x0 - 1, box.y0 - 1, box.x1 - box.x0 + 2, box.y1 - box.y0 + 2);
    ctx.restore();
  }
}

/** Tint what is already painted, keeping its detail: multiply by a colour. */
export function tintOver(ctx: Ctx, box: Box, color: RGB, alpha = 1): void {
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = alpha;
  ctx.fillStyle = rgba(color);
  ctx.fillRect(box.x0 - 1, box.y0 - 1, box.x1 - box.x0 + 2, box.y1 - box.y0 + 2);
  ctx.restore();
}

/**
 * Shade a vertical cylinder in [x, x + w] over whatever is painted there:
 * dark limbs, a broad key, a thin specular streak. Multiply keeps the
 * texture; screen adds the highlight on top of it.
 */
export function shadeCylinderV(ctx: Ctx, x: number, y0: number, w: number, h: number, gloss = 0.3): void {
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, "rgb(40,40,40)");
  g.addColorStop(0.18, "rgb(150,150,150)");
  g.addColorStop(0.4, "rgb(255,255,255)");
  g.addColorStop(0.62, "rgb(205,205,205)");
  g.addColorStop(0.86, "rgb(95,95,95)");
  g.addColorStop(1, "rgb(30,30,30)");
  ctx.fillStyle = g;
  ctx.fillRect(x, y0, w, h);
  if (gloss > 0) {
    ctx.globalCompositeOperation = "screen";
    const s = ctx.createLinearGradient(x, 0, x + w, 0);
    s.addColorStop(0.24, "rgba(255,255,255,0)");
    s.addColorStop(0.34, `rgba(255,255,255,${gloss})`);
    s.addColorStop(0.44, "rgba(255,255,255,0)");
    ctx.fillStyle = s;
    ctx.fillRect(x, y0, w, h);
  }
  ctx.restore();
}

/** The same for a horizontal cylinder in [y, y + h]; the key comes from above. */
export function shadeCylinderH(ctx: Ctx, x0: number, y: number, w: number, h: number, gloss = 0.3): void {
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, "rgb(55,55,55)");
  g.addColorStop(0.2, "rgb(170,170,170)");
  g.addColorStop(0.38, "rgb(255,255,255)");
  g.addColorStop(0.62, "rgb(190,190,190)");
  g.addColorStop(0.88, "rgb(80,80,80)");
  g.addColorStop(1, "rgb(28,28,28)");
  ctx.fillStyle = g;
  ctx.fillRect(x0, y, w, h);
  if (gloss > 0) {
    ctx.globalCompositeOperation = "screen";
    const s = ctx.createLinearGradient(0, y, 0, y + h);
    s.addColorStop(0.2, "rgba(255,255,255,0)");
    s.addColorStop(0.3, `rgba(255,255,255,${gloss})`);
    s.addColorStop(0.4, "rgba(255,255,255,0)");
    ctx.fillStyle = s;
    ctx.fillRect(x0, y, w, h);
  }
  ctx.restore();
}

/** A pipe along any line, shaded across its width. Drawn as a filled band. */
export function pipe(
  ctx: Ctx,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number,
  base: RGB,
  pattern: CanvasPattern | null = null,
  gloss = 0.25,
): void {
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const nx = (-(by - ay) / len) * r;
  const ny = ((bx - ax) / len) * r;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(ax + nx, ay + ny);
  ctx.lineTo(bx + nx, by + ny);
  ctx.lineTo(bx - nx, by - ny);
  ctx.lineTo(ax - nx, ay - ny);
  ctx.closePath();
  ctx.fillStyle = rgba(base);
  ctx.fill();
  if (pattern) {
    ctx.globalAlpha = 0.55;
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = pattern;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // Across the pipe: from the +n side to the -n side.
  const g = ctx.createLinearGradient(ax + nx, ay + ny, ax - nx, ay - ny);
  g.addColorStop(0, "rgba(0,0,0,0.62)");
  g.addColorStop(0.25, "rgba(0,0,0,0.12)");
  g.addColorStop(0.42, "rgba(0,0,0,0)");
  g.addColorStop(0.7, "rgba(0,0,0,0.3)");
  g.addColorStop(1, "rgba(0,0,0,0.7)");
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = g;
  ctx.fill();
  if (gloss > 0) {
    const s = ctx.createLinearGradient(ax + nx, ay + ny, ax - nx, ay - ny);
    s.addColorStop(0.2, "rgba(255,255,255,0)");
    s.addColorStop(0.32, `rgba(255,255,255,${gloss})`);
    s.addColorStop(0.44, "rgba(255,255,255,0)");
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = s;
    ctx.fill();
  }
  ctx.restore();
}

/** Soft blotches of dirt, soot or rust, multiplied into the surface. */
export function grime(ctx: Ctx, rand: Rand, box: Box, count: number, color: RGB, strength = 0.5, size = 8): void {
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  for (let i = 0; i < count; i += 1) {
    const x = box.x0 + rand() * (box.x1 - box.x0);
    const y = box.y0 + rand() * (box.y1 - box.y0);
    const r = size * (0.4 + rand());
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, strength * (0.5 + rand() * 0.5)));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
}

/** Rust run-off: streaks bleeding downward from a line, as it does below every weld and bolt. */
export function rustStreaks(ctx: Ctx, rand: Rand, x0: number, x1: number, y: number, count: number, reach: number): void {
  ctx.save();
  for (let i = 0; i < count; i += 1) {
    const x = x0 + rand() * (x1 - x0);
    const w = 0.4 + rand() * 1.6;
    const len = reach * (0.3 + rand() * 0.7);
    const g = ctx.createLinearGradient(0, y, 0, y + len);
    const a = 0.25 + rand() * 0.4;
    g.addColorStop(0, `rgba(120,52,20,${a})`);
    g.addColorStop(0.5, `rgba(96,40,16,${a * 0.5})`);
    g.addColorStop(1, "rgba(96,40,16,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, len);
  }
  ctx.restore();
}

/** Fine grit: the scatter of tiny light and dark points that makes a surface read as rough. */
export function speckle(ctx: Ctx, rand: Rand, box: Box, count: number, light: number, dark: number): void {
  ctx.save();
  for (let i = 0; i < count; i += 1) {
    const x = box.x0 + rand() * (box.x1 - box.x0);
    const y = box.y0 + rand() * (box.y1 - box.y0);
    const r = 0.12 + rand() * 0.35;
    ctx.fillStyle = rand() < 0.5 ? `rgba(255,255,255,${light * rand()})` : `rgba(0,0,0,${dark * rand()})`;
    ctx.fillRect(x, y, r, r);
  }
  ctx.restore();
}

/** A hex bolt head with its washer, lit from above. */
export function bolt(ctx: Ctx, x: number, y: number, r: number, base: RGB = [118, 112, 104]): void {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.arc(x + r * 0.25, y + r * 0.3, r * 1.15, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1);
  g.addColorStop(0, rgba(shade(base, 1.6)));
  g.addColorStop(0.6, rgba(base));
  g.addColorStop(1, rgba(shade(base, 0.45)));
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Ambient occlusion toward a surface the object grows from: light cannot get
 * into the corner where a heap meets the floor.
 */
export function occlusion(ctx: Ctx, box: Box, from: "top" | "bottom", depth: number, strength = 0.6): void {
  ctx.save();
  const y = from === "top" ? box.y0 : box.y1;
  const g = ctx.createLinearGradient(0, y, 0, from === "top" ? y + depth : y - depth);
  g.addColorStop(0, `rgba(0,0,0,${strength})`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(box.x0 - 1, from === "top" ? y : y - depth, box.x1 - box.x0 + 2, depth);
  ctx.restore();
}

/**
 * A bevel along a polygon's edges: faces turned up and toward the viewer's
 * key catch light, faces turned down go dark. Drawn inside the current clip,
 * so it only ever lands on the solid.
 */
export function bevel(ctx: Ctx, pts: readonly Vec[], width: number, light = 0.28, dark = 0.4): void {
  ctx.save();
  ctx.lineWidth = width * 2;
  ctx.lineJoin = "round";
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const [ax, ay] = pts[j];
    const [bx, by] = pts[i];
    const ex = bx - ax;
    const ey = by - ay;
    const len = Math.hypot(ex, ey);
    if (len < 0.01) continue;
    // Clockwise outline: the outward normal is (ey, -ex).
    const nx = ey / len;
    const ny = -ex / len;
    const facing = -ny * 0.85 - nx * 0.35;
    ctx.strokeStyle = facing > 0 ? `rgba(255,248,236,${light * facing})` : `rgba(0,0,0,${dark * -facing})`;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  ctx.restore();
}

/** Deterministic hash of an integer to [0, 1), for scenery that must repeat identically. */
export function hash01(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

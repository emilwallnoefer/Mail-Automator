import { WORLD_HEIGHT, WORLD_WIDTH, type Obstacle } from "@/lib/elios-flight";
import { rgba, type RGB } from "./look";
import { clipTo, outline, type Ctx } from "./paint";

/**
 * The drone is the light.
 *
 * Every confined space here is dark, and the Elios carries its own lighting,
 * so the scene is lit the way it would be on the real camera feed: a pool of
 * light around the aircraft, a stronger cone thrown forward by the LED panels,
 * the ambient of the space everywhere else — and hard-edged shadows thrown
 * off every obstacle, away from the drone, across the wall behind.
 *
 * It is built each frame in a small offscreen light map (one pixel per world
 * unit) and multiplied over the scene. Upscaling that map is what softens the
 * shadow edges, so the low resolution is the look, not a compromise.
 */

const W = WORLD_WIDTH;
const H = WORLD_HEIGHT;

/** Reach of the all-round pool of light, in world units. */
const POOL = 185;
/** Reach of the forward cone. */
const THROW = 360;
/** Half-angle of the forward cone, radians; it fades to nothing at this edge. */
const SPREAD = 1.05;
/**
 * How much of the drone's light a shadow takes away at its darkest. Never
 * all of it: the far wall is metres behind the obstacle, and light scattered
 * off everything else in the space fills the shadow in.
 */
const SHADOW = 0.62;
/**
 * The LED panels are an area, not a point. Casting from three spots across
 * them gives each shadow a soft penumbra instead of a cut-paper edge.
 */
const PENUMBRA = [-3.2, 0, 3.2];

export type Light = {
  x: number;
  y: number;
  /** Direction the camera and LED panels face, radians. */
  heading: number;
  color: RGB;
};

export type Section = { x0: number; x1: number; ambient: RGB };

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/**
 * The lens: corners fall off. Baked into the light map rather than drawn as
 * a pass of its own, since the map is multiplied over the whole frame anyway
 * and every full-screen pass costs real time on a software-rendered canvas.
 */
function vignette(): HTMLCanvasElement {
  const c = canvas(W, H);
  const v = c.getContext("2d");
  if (v) {
    const g = v.createRadialGradient(W / 2, H * 0.48, H * 0.36, W / 2, H / 2, Math.hypot(W, H) * 0.56);
    g.addColorStop(0, "rgb(255,255,255)");
    g.addColorStop(1, "rgb(104,104,104)");
    v.fillStyle = g;
    v.fillRect(0, 0, W, H);
  }
  return c;
}

export class LightMap {
  private readonly map = canvas(W, H);
  private readonly beam = canvas(W, H);
  private readonly lens = vignette();

  /** Rebuild the map for this frame. */
  render(light: Light, sections: readonly Section[], obstacles: readonly Obstacle[]): void {
    const b = this.beam.getContext("2d");
    const m = this.map.getContext("2d");
    if (!b || !m) return;
    const { x: lx, y: ly, heading, color } = light;

    b.globalCompositeOperation = "source-over";
    b.clearRect(0, 0, W, H);
    b.globalCompositeOperation = "lighter";

    const pool = b.createRadialGradient(lx, ly, 0, lx, ly, POOL);
    pool.addColorStop(0, rgba(color, 1));
    pool.addColorStop(0.07, rgba(color, 0.9));
    pool.addColorStop(0.22, rgba(color, 0.58));
    pool.addColorStop(0.45, rgba(color, 0.26));
    pool.addColorStop(0.7, rgba(color, 0.08));
    pool.addColorStop(1, rgba(color, 0));
    b.fillStyle = pool;
    b.fillRect(0, 0, W, H);

    // The forward throw. Many thin, faint wedges stacked from narrow to wide
    // add up to a cone that is brightest on its axis and fades smoothly to
    // its edge — a few wide ones show their edges as bands.
    const WEDGES = 12;
    for (let i = 1; i <= WEDGES; i += 1) {
      const spread = (SPREAD * i) / WEDGES;
      const alpha = 0.6 / WEDGES;
      const cone = b.createRadialGradient(lx, ly, 0, lx, ly, THROW);
      cone.addColorStop(0, rgba(color, alpha));
      cone.addColorStop(0.3, rgba(color, alpha * 0.75));
      cone.addColorStop(1, rgba(color, 0));
      b.fillStyle = cone;
      b.beginPath();
      b.moveTo(lx, ly);
      b.arc(lx, ly, THROW, heading - spread, heading + spread);
      b.closePath();
      b.fill();
    }

    // Shadows: every edge that faces away from the light is swept to
    // infinity; whatever the sweep covers loses the drone's light. One path
    // per obstacle, every quad wound the same way, so neighbouring sweeps
    // union cleanly instead of leaving hairline seams between them.
    b.globalCompositeOperation = "destination-out";
    const perSample = 1 - (1 - SHADOW) ** (1 / PENUMBRA.length);
    b.fillStyle = `rgba(0,0,0,${perSample})`;
    const far = 600;
    for (const offset of PENUMBRA) {
      const sx = lx - Math.sin(heading) * offset;
      const sy = ly + Math.cos(heading) * offset;
      for (const o of obstacles) {
        if (o.x > sx + THROW || o.x + o.width < -8) continue;
        b.beginPath();
        for (const s of o.solids) {
          const pts = outline(s, o.x);
          for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
            const [ax, ay] = pts[j];
            const [bx, by] = pts[i];
            // Clockwise outline: the outward normal is (ey, -ex).
            const nx = by - ay;
            const ny = -(bx - ax);
            if (nx * ((ax + bx) / 2 - sx) + ny * ((ay + by) / 2 - sy) <= 0) continue;
            const da = Math.hypot(ax - sx, ay - sy) || 1;
            const db = Math.hypot(bx - sx, by - sy) || 1;
            const quad: Array<[number, number]> = [
              [ax, ay],
              [bx, by],
              [bx + ((bx - sx) / db) * far, by + ((by - sy) / db) * far],
              [ax + ((ax - sx) / da) * far, ay + ((ay - sy) / da) * far],
            ];
            let area = 0;
            for (let q = 0, p = 3; q < 4; p = q, q += 1) area += quad[p][0] * quad[q][1] - quad[q][0] * quad[p][1];
            if (area < 0) quad.reverse();
            b.moveTo(quad[0][0], quad[0][1]);
            for (let q = 1; q < 4; q += 1) b.lineTo(quad[q][0], quad[q][1]);
            b.closePath();
          }
        }
        b.fill("nonzero");
      }
    }

    m.globalCompositeOperation = "source-over";
    for (const s of sections) {
      m.fillStyle = rgba(s.ambient);
      m.fillRect(s.x0, 0, s.x1 - s.x0, H);
    }
    m.globalCompositeOperation = "lighter";
    m.drawImage(this.beam, 0, 0);
    m.globalCompositeOperation = "multiply";
    m.drawImage(this.lens, 0, 0);
  }

  /** Light the scene: multiply everything drawn so far by the map. */
  apply(ctx: Ctx): void {
    ctx.save();
    // Plain bilinear: the map is smooth by construction, and the high
    // quality filter costs a full-screen bicubic every frame.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "low";
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(this.map, 0, 0, W, H);
    ctx.restore();
  }

  /** The air: the beam made visible by whatever is floating in it. */
  haze(ctx: Ctx, amount: number): void {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "low";
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = amount;
    ctx.drawImage(this.beam, 0, 0, W, H);
    ctx.restore();
  }
}

/** How strongly the drone lights a point, ignoring shadow: 0 to about 1.3. */
export function intensityAt(light: Light, x: number, y: number): number {
  const dx = x - light.x;
  const dy = y - light.y;
  const d = Math.hypot(dx, dy);
  const pool = Math.max(0, 1 - d / POOL) ** 2.2;
  let off = Math.abs(Math.atan2(dy, dx) - light.heading);
  if (off > Math.PI) off = Math.PI * 2 - off;
  const cone = off < SPREAD ? (1 - off / SPREAD) * Math.max(0, 1 - d / THROW) ** 1.3 * 0.6 : 0;
  return pool + cone;
}

/**
 * Rim light: the edges of every obstacle that face the drone catch its light,
 * which is what tells the eye a surface is turned toward the lamp. Drawn
 * inside the obstacle's own clip so the highlight sits on the steel, not in
 * the air beside it.
 */
/** Rim strengths are quantised into this many levels, one path each. */
const RIM_LEVELS = 5;

export function drawRims(ctx: Ctx, obstacles: readonly Obstacle[], light: Light): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  const levels: Array<Array<[number, number, number, number]>> = Array.from({ length: RIM_LEVELS }, () => []);
  for (const o of obstacles) {
    if (o.x > W + 4 || o.x + o.width < -4) continue;
    if (o.x > light.x + THROW) continue;
    for (const level of levels) level.length = 0;
    let any = false;
    for (const s of o.solids) {
      const pts = outline(s, o.x);
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
        const [ax, ay] = pts[j];
        const [bx, by] = pts[i];
        const len = Math.hypot(bx - ax, by - ay);
        if (len < 0.05) continue;
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        const tx = light.x - mx;
        const ty = light.y - my;
        const dist = Math.hypot(tx, ty) || 1;
        const facing = ((by - ay) / len) * (tx / dist) + (-(bx - ax) / len) * (ty / dist);
        if (facing <= 0.08) continue;
        const strength = Math.min(1, intensityAt(light, mx, my) * facing);
        if (strength < 0.05) continue;
        levels[Math.min(RIM_LEVELS - 1, Math.floor(strength * RIM_LEVELS))].push([ax, ay, bx, by]);
        any = true;
      }
    }
    if (!any) continue;
    // Edges are batched by brightness — a smooth outline has dozens of
    // them, and one stroke per edge is what made a root mass expensive.
    ctx.save();
    clipTo(ctx, o.solids, o.x);
    levels.forEach((segments, level) => {
      if (segments.length === 0) return;
      const strength = (level + 0.5) / RIM_LEVELS;
      ctx.beginPath();
      for (const [ax, ay, bx, by] of segments) {
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
      }
      // A broad, faint wash and a narrow brighter lip: light catching an
      // edge has a falloff, a single hard line reads as an outline.
      ctx.strokeStyle = rgba(light.color, Math.min(0.2, strength * 0.2));
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = rgba(light.color, Math.min(0.32, strength * 0.34));
      ctx.lineWidth = 1.4;
      ctx.stroke();
    });
    ctx.restore();
  }
  ctx.restore();
}

type Mote = { x: number; y: number; depth: number; size: number; vx: number; vy: number; phase: number };

/**
 * What hangs in the air of every confined space — dust, ash, mist — only
 * visible where the light goes through it. Deeper motes drift slower, which is
 * most of the sense of depth in the beam.
 */
export class Motes {
  private readonly motes: Mote[] = [];

  constructor(count = 90) {
    for (let i = 0; i < count; i += 1) {
      const near = i < 6;
      this.motes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        depth: near ? 1.5 + Math.random() * 0.4 : 0.55 + Math.random() * 0.75,
        size: near ? 1.6 + Math.random() * 1.6 : 0.18 + Math.random() * 0.4,
        vx: (Math.random() - 0.5) * 3,
        vy: -1 + Math.random() * 2.4,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  update(dt: number, scrolled: number, t: number): void {
    for (const m of this.motes) {
      m.x -= scrolled * m.depth + m.vx * dt;
      m.y += m.vy * dt + Math.sin(t * 0.7 + m.phase) * 0.04;
      if (m.x < -6) m.x += W + 12;
      if (m.x > W + 6) m.x -= W + 12;
      if (m.y < -4) m.y += H + 8;
      if (m.y > H + 4) m.y -= H + 8;
    }
  }

  draw(ctx: Ctx, light: Light, color: RGB, density: number): void {
    const count = Math.round(this.motes.length * Math.min(1, density / 1.4));
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < count; i += 1) {
      const m = this.motes[i];
      const glow = intensityAt(light, m.x, m.y);
      if (glow < 0.03) continue;
      const size = m.size * m.depth;
      if (m.size > 1) {
        // Out-of-focus motes close to the lens: soft discs.
        const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, size);
        g.addColorStop(0, rgba(color, Math.min(0.22, glow * 0.18)));
        g.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(m.x - size, m.y - size, size * 2, size * 2);
      } else {
        ctx.fillStyle = rgba(color, Math.min(0.85, glow * 0.7 * m.depth));
        ctx.fillRect(m.x, m.y, size, size);
      }
    }
    ctx.restore();
  }
}

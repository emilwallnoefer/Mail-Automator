import { DRONE_RADIUS } from "@/lib/elios-flight";
import type { Ctx } from "./paint";

/**
 * The Elios 3, side on, flying right.
 *
 * The cage is a geodesic sphere of carbon rods — an icosahedron subdivided
 * once, 42 nodes and 120 rods, which is the pattern the real cage follows —
 * projected with a fixed three-quarter turn so it never reads as a flat
 * rosette. It is RIGIDLY MOUNTED, as on the real Elios 3 (the free-spinning
 * gimballed cage belongs to the Elios 1 and 2), so the whole aircraft banks as
 * one body.
 *
 * Inside: the black airframe with its rotor guards, the LiDAR puck on top,
 * and the red camera module up front between the two LED panels that light
 * everything the pilot sees. The static parts are painted once into two
 * sprites — cage behind the body, cage in front — and only the rotors and the
 * light bloom are drawn per frame.
 */

type V3 = [number, number, number];

const R = DRONE_RADIUS;
/** Half-size of the sprite, in world units: the cage plus room for its rods. */
const HALF = R + 2;
/** Sprites are painted at twice the display density, so rotation stays crisp. */
const SUPERSAMPLE = 2;

function normalize([x, y, z]: V3): V3 {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}

function geodesic(): { nodes: V3[]; rods: Array<[number, number]> } {
  const t = (1 + Math.sqrt(5)) / 2;
  const nodes: V3[] = (
    [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ] as V3[]
  ).map(normalize);
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  const mids = new Map<string, number>();
  const mid = (a: number, b: number) => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    const known = mids.get(key);
    if (known !== undefined) return known;
    const [ax, ay, az] = nodes[a];
    const [bx, by, bz] = nodes[b];
    nodes.push(normalize([(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2]));
    mids.set(key, nodes.length - 1);
    return nodes.length - 1;
  };
  const rods = new Set<string>();
  const rod = (a: number, b: number) => rods.add(a < b ? `${a}-${b}` : `${b}-${a}`);
  for (const [a, b, c] of faces) {
    const ab = mid(a, b);
    const bc = mid(b, c);
    const ca = mid(c, a);
    for (const [p, q, r] of [
      [a, ab, ca],
      [b, bc, ab],
      [c, ca, bc],
      [ab, bc, ca],
    ]) {
      rod(p, q);
      rod(q, r);
      rod(r, p);
    }
  }
  return { nodes, rods: [...rods].map((k) => k.split("-").map(Number) as [number, number]) };
}

/** The cage turned a little, so no rod lines up with the view. */
function projectedCage() {
  const { nodes, rods } = geodesic();
  const yaw = 0.42;
  const pitch = 0.3;
  const projected = nodes.map(([x, y, z]) => {
    const x1 = x * Math.cos(yaw) + z * Math.sin(yaw);
    const z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
    const y2 = y * Math.cos(pitch) - z1 * Math.sin(pitch);
    const z2 = y * Math.sin(pitch) + z1 * Math.cos(pitch);
    // Slightly wider than tall, like the real cage around its flat airframe.
    return { x: x1 * R * 1.03, y: -y2 * R * 0.97, z: z2 };
  });
  return { projected, rods };
}

const CAGE = projectedCage();

/** A rounded-rectangle path (by hand: `ctx.roundRect` is missing before Safari 16). */
function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function paintCage(ctx: Ctx, front: boolean): void {
  const { projected, rods } = CAGE;
  ctx.lineCap = "round";
  for (const [a, b] of rods) {
    const pa = projected[a];
    const pb = projected[b];
    const isFront = (pa.z + pb.z) / 2 > 0;
    if (isFront !== front) continue;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    if (front) {
      ctx.strokeStyle = "rgb(22,24,28)";
      ctx.lineWidth = 0.52;
      ctx.stroke();
      // Carbon catches light along its upper side.
      ctx.beginPath();
      ctx.moveTo(pa.x - 0.12, pa.y - 0.14);
      ctx.lineTo(pb.x - 0.12, pb.y - 0.14);
      ctx.strokeStyle = "rgba(200,208,216,0.42)";
      ctx.lineWidth = 0.16;
      ctx.stroke();
    } else {
      ctx.strokeStyle = "rgba(30,33,38,0.8)";
      ctx.lineWidth = 0.34;
      ctx.stroke();
    }
  }
  if (!front) return;
  // Node connectors where the rods meet.
  for (const p of projected) {
    if (p.z <= 0) continue;
    ctx.fillStyle = "rgb(18,20,23)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(220,226,232,0.35)";
    ctx.beginPath();
    ctx.arc(p.x - 0.12, p.y - 0.14, 0.16, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintBody(ctx: Ctx): void {
  // Rotor guards, rear and front, edge-on above the airframe.
  for (const gx of [-5, 5]) {
    ctx.fillStyle = "rgb(24,26,30)";
    ctx.beginPath();
    ctx.ellipse(gx, -2.7, 3.9, 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(90,96,104,0.7)";
    ctx.lineWidth = 0.22;
    ctx.stroke();
  }
  // Airframe shell.
  const shell = ctx.createLinearGradient(0, -2.2, 0, 2.4);
  shell.addColorStop(0, "rgb(70,76,84)");
  shell.addColorStop(0.25, "rgb(38,42,47)");
  shell.addColorStop(1, "rgb(12,13,15)");
  ctx.fillStyle = shell;
  roundRect(ctx, -7.8, -2.2, 14.8, 4.6, 1.9);
  ctx.fill();
  ctx.strokeStyle = "rgba(160,168,178,0.35)";
  ctx.lineWidth = 0.18;
  ctx.beginPath();
  ctx.moveTo(-6.6, -2.0);
  ctx.lineTo(5.4, -2.0);
  ctx.stroke();
  // Battery underneath, toward the rear.
  ctx.fillStyle = "rgb(30,32,36)";
  roundRect(ctx, -6.4, 1.7, 7.8, 2.3, 0.8);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(-5.8, 1.85, 6.6, 0.25);
  // LiDAR puck on top.
  const lidar = ctx.createLinearGradient(-2.6, 0, 1.6, 0);
  lidar.addColorStop(0, "rgb(64,68,74)");
  lidar.addColorStop(0.35, "rgb(176,182,190)");
  lidar.addColorStop(0.6, "rgb(112,118,126)");
  lidar.addColorStop(1, "rgb(36,38,42)");
  ctx.fillStyle = lidar;
  ctx.fillRect(-2.6, -5.7, 4.2, 3.6);
  ctx.fillStyle = "rgb(16,17,19)";
  roundRect(ctx, -2.8, -6.6, 4.6, 1.2, 0.5);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(-2.6, -3.7, 4.2, 0.35);
  // Camera module: the red block up front, lens forward.
  const red = ctx.createLinearGradient(0, -1.7, 0, 2.1);
  red.addColorStop(0, "rgb(236,86,70)");
  red.addColorStop(0.45, "rgb(196,44,36)");
  red.addColorStop(1, "rgb(120,22,18)");
  ctx.fillStyle = red;
  roundRect(ctx, 5.9, -1.7, 3.5, 3.8, 0.7);
  ctx.fill();
  ctx.fillStyle = "rgb(6,7,9)";
  ctx.beginPath();
  ctx.arc(9.05, 0.2, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(130,170,255,0.7)";
  ctx.lineWidth = 0.2;
  ctx.beginPath();
  ctx.arc(9.05, 0.2, 0.62, Math.PI * 1.1, Math.PI * 1.6);
  ctx.stroke();
  // The LED panels either side of the camera.
  ctx.fillStyle = "rgb(255,249,236)";
  roundRect(ctx, 6.6, -3.3, 2.7, 1.1, 0.45);
  ctx.fill();
  roundRect(ctx, 6.6, 2.5, 2.7, 1.1, 0.45);
  ctx.fill();
}

export class DroneArt {
  private scale = 0;
  private under: HTMLCanvasElement | null = null;
  private over: HTMLCanvasElement | null = null;

  private build(scale: number): void {
    const size = Math.max(8, Math.ceil(HALF * 2 * scale * SUPERSAMPLE));
    const make = (paint: (ctx: Ctx) => void) => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const k = size / (HALF * 2);
        ctx.setTransform(k, 0, 0, k, size / 2, size / 2);
        paint(ctx);
      }
      return canvas;
    };
    this.under = make((ctx) => {
      paintCage(ctx, false);
      paintBody(ctx);
    });
    this.over = make((ctx) => paintCage(ctx, true));
    this.scale = scale;
  }

  /** Where the main LEDs sit in world space, for the light to come from. */
  static lampAt(x: number, y: number, tilt: number): { x: number; y: number } {
    return { x: x + Math.cos(tilt) * 9, y: y + Math.sin(tilt) * 9 };
  }

  draw(ctx: Ctx, x: number, y: number, tilt: number, t: number, scale: number): void {
    if (scale !== this.scale || !this.under || !this.over) this.build(scale);
    if (!this.under || !this.over) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.drawImage(this.under, -HALF, -HALF, HALF * 2, HALF * 2);

    // Rotors: a blur disc in each guard, and a flicker of blade.
    for (const gx of [-5, 5]) {
      ctx.fillStyle = `rgba(210,220,230,${0.1 + 0.05 * Math.sin(t * 57 + gx)})`;
      ctx.beginPath();
      ctx.ellipse(gx, -3.15, 3.7, 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      const a = t * 70 + gx;
      ctx.strokeStyle = "rgba(220,228,236,0.28)";
      ctx.lineWidth = 0.22;
      ctx.beginPath();
      ctx.moveTo(gx - Math.cos(a) * 3.5, -3.15 - Math.sin(a) * 0.4);
      ctx.lineTo(gx + Math.cos(a) * 3.5, -3.15 + Math.sin(a) * 0.4);
      ctx.stroke();
    }

    ctx.drawImage(this.over, -HALF, -HALF, HALF * 2, HALF * 2);

    // Bloom: the LED panels are the brightest thing in the space.
    ctx.globalCompositeOperation = "lighter";
    for (const ly of [-2.75, 3.05]) {
      const g = ctx.createRadialGradient(7.95, ly, 0, 7.95, ly, 4.2);
      g.addColorStop(0, "rgba(255,248,232,0.95)");
      g.addColorStop(0.25, "rgba(255,240,215,0.45)");
      g.addColorStop(1, "rgba(255,236,210,0)");
      ctx.fillStyle = g;
      ctx.fillRect(7.95 - 4.2, ly - 4.2, 8.4, 8.4);
    }
    const halo = ctx.createRadialGradient(9, 0, 0, 9, 0, 18);
    halo.addColorStop(0, "rgba(255,240,218,0.2)");
    halo.addColorStop(1, "rgba(255,240,218,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(-9, -18, 36, 36);
    // Status light, breathing green at the rear.
    const pulse = 0.55 + 0.45 * Math.sin(t * 3.2);
    const s = ctx.createRadialGradient(-7.5, -0.6, 0, -7.5, -0.6, 2.2);
    s.addColorStop(0, `rgba(80,255,140,${0.9 * pulse})`);
    s.addColorStop(1, "rgba(80,255,140,0)");
    ctx.fillStyle = s;
    ctx.fillRect(-9.7, -2.8, 4.4, 4.4);
    ctx.restore();
  }
}

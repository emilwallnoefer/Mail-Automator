import { WORLD_HEIGHT, WORLD_WIDTH, ZONES, type Zone } from "@/lib/elios-flight";
import type { Assets } from "./assets";
import { LOOK, rgba, shade } from "./look";
import { hash01, type Ctx } from "./paint";

/**
 * Everything behind the obstacles: the photographed far wall of each space,
 * the structure between it and the drone, and the floor and roof the drone
 * can crash into.
 *
 * Depth comes from parallax. The photo slides slowest, the mid-distance
 * structure a little faster, the floor and roof at the speed of the obstacles
 * — so the eye reads three planes without anything being labelled.
 */

const W = WORLD_WIDTH;
const H = WORLD_HEIGHT;

/** A stretch of screen belonging to one space; bulkheads split the screen. */
export type ZoneSpan = { zone: number; x0: number; x1: number };

function withSpan(ctx: Ctx, span: ZoneSpan, draw: (zone: Zone) => void): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(span.x0, 0, span.x1 - span.x0, H);
  ctx.clip();
  draw(ZONES[span.zone]);
  ctx.restore();
}

/** The far wall: a real photo of the space, sliding slowly behind everything. */
export function drawBackdrop(ctx: Ctx, assets: Assets, spans: readonly ZoneSpan[], scroll: number): void {
  for (const span of spans) {
    withSpan(ctx, span, (zone) => {
      const look = LOOK[zone];
      const img = assets.photo[zone];
      if (img && img.width > 0) {
        // Slightly taller than the world, so the frame never shows an edge.
        const h = H * 1.06;
        const w = (h * img.width) / img.height;
        const off = (((scroll * look.photoParallax) % w) + w) % w;
        for (let x = -off; x < W; x += w) ctx.drawImage(img, x, (H - h) / 2, w + 0.4, h);
      } else {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, rgba(shade(look.ambient, 1.4)));
        g.addColorStop(1, rgba(shade(look.ambient, 0.8)));
        ctx.fillStyle = g;
        ctx.fillRect(span.x0, 0, span.x1 - span.x0, H);
      }
      // The far wall sits back in the air of the space: a veil of its own
      // colour pushes it behind the things in focus.
      if (look.photoDim > 0) {
        ctx.fillStyle = `rgba(0,0,0,${look.photoDim})`;
        ctx.fillRect(span.x0, 0, span.x1 - span.x0, H);
      }
      ctx.fillStyle = rgba(look.ambient, 0.22);
      ctx.fillRect(span.x0, 0, span.x1 - span.x0, H);
    });
  }
}

/**
 * Mid-distance structure, faint on purpose: it must read as far away, never
 * as something to dodge.
 */
export function drawMidground(ctx: Ctx, spans: readonly ZoneSpan[], scroll: number): void {
  const PARALLAX = 0.42;
  const PERIOD = 150;
  const offset = scroll * PARALLAX;
  for (const span of spans) {
    withSpan(ctx, span, (zone) => {
      const first = Math.floor(offset / PERIOD) - 1;
      for (let i = first; i * PERIOD - offset < W + PERIOD; i += 1) {
        const x = i * PERIOD - offset + hash01(i * 7 + 1) * 60;
        const r = hash01(i * 13 + 5);
        ctx.save();
        switch (zone) {
          case "BOILER": {
            // Pendants further back in the furnace.
            const n = 4 + Math.floor(r * 3);
            const len = 60 + r * 70;
            for (let k = 0; k < n; k += 1) {
              const tx = x + k * 4.4;
              const g = ctx.createLinearGradient(tx, 0, tx + 4, 0);
              g.addColorStop(0, "rgba(12,10,9,0.5)");
              g.addColorStop(0.4, "rgba(120,100,84,0.16)");
              g.addColorStop(1, "rgba(12,10,9,0.5)");
              ctx.fillStyle = g;
              ctx.fillRect(tx, 0, 4, len - Math.abs(k - n / 2) * 3);
            }
            break;
          }
          case "BALLAST": {
            // Longitudinal stiffeners on the far side shell.
            for (let k = 0; k < 3; k += 1) {
              const y = 40 + k * 52 + r * 10;
              ctx.fillStyle = "rgba(20,18,14,0.28)";
              ctx.fillRect(x - 60, y, 150, 3.2);
              ctx.fillStyle = "rgba(255,244,220,0.08)";
              ctx.fillRect(x - 60, y - 0.6, 150, 0.6);
            }
            break;
          }
          case "MINE": {
            // Cables and a vent line slung along the far wall.
            ctx.strokeStyle = "rgba(10,9,8,0.55)";
            ctx.lineWidth = 0.9;
            for (let k = 0; k < 2; k += 1) {
              const y = 16 + k * 6 + r * 6;
              ctx.beginPath();
              ctx.moveTo(x - 80, y);
              ctx.quadraticCurveTo(x, y + 8 + r * 6, x + 80, y);
              ctx.stroke();
            }
            // A timber post in the distance.
            ctx.fillStyle = "rgba(24,18,12,0.35)";
            ctx.fillRect(x + 40, 0, 5, H);
            break;
          }
          case "SEWER": {
            // Ring joints of the pipe, and a branch connection.
            ctx.fillStyle = "rgba(10,12,10,0.3)";
            ctx.fillRect(x, 0, 1.4, H);
            ctx.fillRect(x + 72, 0, 1.4, H);
            if (r > 0.45) {
              ctx.fillStyle = "rgba(4,5,4,0.5)";
              ctx.beginPath();
              ctx.ellipse(x + 36, 70 + r * 40, 9, 11, 0, 0, Math.PI * 2);
              ctx.fill();
            }
            break;
          }
          case "TANK": {
            // Roof rafters radiating down to the shell.
            ctx.strokeStyle = "rgba(14,10,8,0.45)";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + 70, 24 + r * 8);
            ctx.stroke();
            ctx.fillStyle = "rgba(14,10,8,0.3)";
            ctx.fillRect(x + 68, 0, 3.4, H);
            break;
          }
        }
        ctx.restore();
      }
    });
  }
}

/**
 * The floor and roof — the two surfaces every run can end on — drawn thin, so
 * the drone's cage touches them exactly when it crashes into them.
 */
export function drawSurfaces(ctx: Ctx, spans: readonly ZoneSpan[], scroll: number, t: number): void {
  const BAND = 2.6;
  for (const span of spans) {
    withSpan(ctx, span, (zone) => {
      const x0 = span.x0;
      const w = span.x1 - span.x0;
      switch (zone) {
        case "BOILER": {
          ctx.fillStyle = "rgb(30,26,24)";
          ctx.fillRect(x0, 0, w, BAND);
          ctx.fillStyle = "rgb(150,146,138)";
          ctx.fillRect(x0, H - BAND, w, BAND);
          // Roof tubes and an ash surface with its own texture.
          for (let x = -((scroll % 4.4) + 4.4); x < W; x += 4.4) {
            ctx.fillStyle = "rgba(255,230,200,0.12)";
            ctx.fillRect(x, 0, 1.2, BAND);
          }
          break;
        }
        case "BALLAST": {
          ctx.fillStyle = rgba(shade([212, 196, 158], 0.55));
          ctx.fillRect(x0, 0, w, BAND);
          ctx.fillStyle = "rgb(92,76,56)";
          ctx.fillRect(x0, H - BAND, w, BAND);
          // Longitudinals landing on the bottom plating, every frame space.
          for (let x = -((scroll % 20) + 20); x < W; x += 20) {
            ctx.fillStyle = "rgba(0,0,0,0.4)";
            ctx.fillRect(x, H - BAND - 0.6, 3, 0.6);
            ctx.fillRect(x, 0, 3, BAND + 0.6);
          }
          break;
        }
        case "MINE": {
          ctx.fillStyle = "rgb(40,36,32)";
          ctx.fillRect(x0, 0, w, BAND);
          ctx.fillStyle = "rgb(84,76,66)";
          ctx.fillRect(x0, H - BAND, w, BAND);
          for (let x = -((scroll % 6) + 6); x < W; x += 6) {
            ctx.fillStyle = "rgba(0,0,0,0.35)";
            ctx.fillRect(x + hash01(Math.floor((x + scroll) / 6)) * 3, H - BAND, 1.6, 1);
          }
          break;
        }
        case "SEWER": {
          ctx.fillStyle = "rgb(46,44,38)";
          ctx.fillRect(x0, 0, w, BAND);
          // Flowing water on the invert: a moving glint over a dark surface.
          ctx.fillStyle = "rgb(30,40,38)";
          ctx.fillRect(x0, H - BAND, w, BAND);
          for (let x = -(((scroll + t * 36) % 9) + 9); x < W; x += 9) {
            ctx.fillStyle = "rgba(200,220,220,0.3)";
            ctx.fillRect(x, H - BAND + 0.5, 3.6, 0.4);
          }
          break;
        }
        case "TANK": {
          ctx.fillStyle = "rgb(46,32,26)";
          ctx.fillRect(x0, 0, w, BAND);
          // Sludge on the floor plates.
          ctx.fillStyle = "rgb(44,32,24)";
          ctx.fillRect(x0, H - BAND, w, BAND);
          for (let x = -((scroll % 30) + 30); x < W; x += 30) {
            ctx.fillStyle = "rgba(0,0,0,0.4)";
            ctx.fillRect(x, 0, 0.8, BAND);
          }
          break;
        }
      }
      // The edge each surface presents to the drone catches a little light.
      ctx.fillStyle = "rgba(255,244,226,0.16)";
      ctx.fillRect(x0, BAND - 0.4, w, 0.4);
      ctx.fillRect(x0, H - BAND, w, 0.4);
    });
  }
}

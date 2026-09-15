"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  BEST_SCORE_KEY,
  DRONE_RADIUS,
  DRONE_X,
  GAP_HEIGHT,
  OBSTACLE_WIDTH,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  createGame,
  crashLine,
  flap,
  isNewBest,
  parseStoredBest,
  stepGame,
  type GameState,
} from "@/lib/elios-flight";

/**
 * "Fly where people can't" — the Elios 3 threads the gaps in a boiler, a sewer,
 * a ballast tank, while somebody waits for an admin to assign their role.
 *
 * The only client component behind the gate, and deliberately inert: no fetch,
 * no Supabase, no session props, so it adds a game without adding anything
 * reachable. All physics lives in `lib/elios-flight.ts` and is unit-tested —
 * this file is canvas, input and the animation loop, nothing else.
 *
 * Drawn rather than sprited so it stays crisp at any density and ships no
 * image: the Elios 3 is a sphere in a protective cage, which is a circle and a
 * few arcs.
 */
/**
 * The best score lives in localStorage, which is an external store, so it is
 * read through `useSyncExternalStore` rather than a state-set inside an effect.
 * That is not ceremony: setting state synchronously in a mount effect is what
 * the React Compiler rule `set-state-in-effect` rejects, and it also renders a
 * wrong value for one frame on every visit.
 *
 * `undefined` means "not read yet" — distinct from `null`, which is a real
 * answer meaning "no score stored".
 */
let bestCache: number | null | undefined;
const bestListeners = new Set<() => void>();

function readBest(): number | null {
  if (bestCache === undefined) {
    try {
      bestCache = parseStoredBest(window.localStorage.getItem(BEST_SCORE_KEY));
    } catch {
      // Private windows and blocked site data both throw here.
      bestCache = null;
    }
  }
  return bestCache;
}

function writeBest(score: number) {
  bestCache = score;
  try {
    window.localStorage.setItem(BEST_SCORE_KEY, String(score));
  } catch {
    // Keeping the score is a nicety, not the point.
  }
  for (const listener of bestListeners) listener();
}

function subscribeBest(onChange: () => void) {
  bestListeners.add(onChange);
  return () => {
    bestListeners.delete(onChange);
  };
}

export function RoleGateGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<GameState>(createGame());
  // Server render has no localStorage, so the server snapshot is always null.
  const best = useSyncExternalStore(subscribeBest, readBest, () => null);
  const [hud, setHud] = useState<{ status: GameState["status"]; score: number }>({
    status: "idle",
    score: 0,
  });

  const press = useCallback(() => {
    const s = stateRef.current;
    if (s.status === "crashed") {
      stateRef.current = flap(createGame());
    } else {
      stateRef.current = flap(s);
    }
    setHud({ status: "flying", score: stateRef.current.score });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw in world units and let the transform handle DPR, so nothing below
    // has to know about device pixels.
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = WORLD_WIDTH * dpr;
    canvas.height = WORLD_HEIGHT * dpr;

    const css = getComputedStyle(canvas);
    const ink = css.getPropertyValue("--ink").trim() || "#e2e8f0";
    const accent = css.getPropertyValue("--accent").trim() || "#22d3ee";
    const positive = css.getPropertyValue("--positive").trim() || "#a7f3d0";

    let raf = 0;
    let last = performance.now();
    let stopped = false;

    /**
     * The Elios 3.
     *
     * The cage is RIGIDLY MOUNTED — that is the Elios 3 change; the gimballed,
     * free-rotating cage belongs to the Elios 1 and 2. So the whole aircraft
     * banks as one body: cage and frame rotate together, and the cage never
     * spins independently of the drone inside it.
     */
    const drawDrone = (y: number, t: number) => {
      const r = DRONE_RADIUS;
      const tilt = Math.max(-0.42, Math.min(0.55, stateRef.current.velocity / 460));
      ctx.save();
      ctx.translate(DRONE_X, y);
      ctx.rotate(tilt);

      // --- Cage: part of the airframe, so it banks with everything else.
      ctx.strokeStyle = accent;
      ctx.lineWidth = 0.9;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.34;
      for (let i = 0; i < 4; i += 1) {
        ctx.beginPath();
        ctx.ellipse(0, 0, r, r * 0.42, (i * Math.PI) / 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Two latitude rings, to read as a sphere rather than a flat rosette.
      for (const k of [-0.5, 0.5]) {
        ctx.beginPath();
        ctx.ellipse(0, r * k, r * Math.sqrt(1 - k * k), r * 0.16, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;

      // Rotor discs, blurred while spinning.
      ctx.strokeStyle = ink;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 0.7;
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(sx * r * 0.42, sy * r * 0.3, r * 0.26, r * 0.09, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      // Blade flicker — the only thing on the aircraft that should look busy.
      ctx.globalAlpha = 0.28;
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          const a = t * 26 + (sx + 2) * (sy + 2);
          ctx.beginPath();
          ctx.moveTo(sx * r * 0.42 - Math.cos(a) * r * 0.24, sy * r * 0.3 - Math.sin(a) * r * 0.07);
          ctx.lineTo(sx * r * 0.42 + Math.cos(a) * r * 0.24, sy * r * 0.3 + Math.sin(a) * r * 0.07);
          ctx.stroke();
        }
      }

      // Fuselage.
      ctx.globalAlpha = 1;
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.46, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Sensor head: the lighting ring and camera face forward.
      ctx.fillStyle = positive;
      ctx.beginPath();
      ctx.arc(r * 0.4, 0, r * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(r * 0.4, 0, r * 0.27, -0.9, 0.9);
      ctx.strokeStyle = positive;
      ctx.lineWidth = 0.8;
      ctx.stroke();

      ctx.restore();
    };

    const STEEL = "rgba(148,163,184,";

    /**
     * Each confined space is drawn as the structure it actually is, not a
     * labelled bar: boiler tube banks, brick sewer courses, riveted vessel
     * plate, stiffener ribs with lightening holes, corrugated duct, timbered
     * shaft. At 42 units wide there is room for exactly one characteristic
     * detail each, which is what makes them tell apart at a glance.
     */
    const drawStructure = (kind: string, x: number, top: number, height: number) => {
      if (height <= 0) return;
      const w = OBSTACLE_WIDTH;
      const right = x + w;
      const bottom = top + height;

      ctx.save();
      ctx.beginPath();
      ctx.rect(x, top, w, height);
      ctx.clip();

      ctx.fillStyle = `${STEEL}0.15)`;
      ctx.fillRect(x, top, w, height);
      ctx.lineWidth = 0.7;

      switch (kind) {
        case "BOILER": {
          // Banks of vertical boiler tubes.
          ctx.strokeStyle = `${STEEL}0.42)`;
          for (let i = 0; i < 5; i += 1) {
            const cx = x + 5 + i * ((w - 10) / 4);
            ctx.beginPath();
            ctx.moveTo(cx, top);
            ctx.lineTo(cx, bottom);
            ctx.stroke();
          }
          ctx.strokeStyle = `${STEEL}0.3)`;
          for (let yy = top + 6; yy < bottom; yy += 14) {
            ctx.beginPath();
            ctx.moveTo(x, yy);
            ctx.lineTo(right, yy);
            ctx.stroke();
          }
          break;
        }
        case "SEWER": {
          // Staggered brick courses.
          ctx.strokeStyle = `${STEEL}0.34)`;
          let row = 0;
          for (let yy = top; yy < bottom; yy += 7) {
            ctx.beginPath();
            ctx.moveTo(x, yy);
            ctx.lineTo(right, yy);
            ctx.stroke();
            const offset = row % 2 ? 0 : 7;
            for (let xx = x + offset; xx < right; xx += 14) {
              ctx.beginPath();
              ctx.moveTo(xx, yy);
              ctx.lineTo(xx, yy + 7);
              ctx.stroke();
            }
            row += 1;
          }
          break;
        }
        case "PRESSURE VESSEL": {
          // Riveted plate seams.
          ctx.strokeStyle = `${STEEL}0.4)`;
          for (let yy = top + 10; yy < bottom; yy += 20) {
            ctx.beginPath();
            ctx.moveTo(x, yy);
            ctx.lineTo(right, yy);
            ctx.stroke();
          }
          ctx.fillStyle = `${STEEL}0.5)`;
          for (let yy = top + 10; yy < bottom; yy += 20) {
            for (let xx = x + 5; xx < right - 2; xx += 8) {
              ctx.beginPath();
              ctx.arc(xx, yy, 0.9, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          break;
        }
        case "BALLAST TANK": {
          // Stiffener ribs pierced with lightening holes.
          ctx.strokeStyle = `${STEEL}0.4)`;
          for (let yy = top + 8; yy < bottom; yy += 16) {
            ctx.beginPath();
            ctx.moveTo(x, yy);
            ctx.lineTo(right, yy);
            ctx.stroke();
            for (let xx = x + 10; xx < right - 6; xx += 14) {
              ctx.beginPath();
              ctx.arc(xx, yy + 8, 2.6, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
          break;
        }
        case "COOLING DUCT": {
          // Corrugation.
          ctx.strokeStyle = `${STEEL}0.38)`;
          for (let yy = top; yy < bottom; yy += 5) {
            ctx.beginPath();
            ctx.moveTo(x, yy);
            ctx.lineTo(right, yy + 2.5);
            ctx.stroke();
          }
          break;
        }
        case "MINE STOPE": {
          // Timber sets against rough rock.
          ctx.fillStyle = `${STEEL}0.1)`;
          ctx.fillRect(x, top, w, height);
          ctx.strokeStyle = `${STEEL}0.45)`;
          ctx.lineWidth = 1.4;
          for (let yy = top + 12; yy < bottom; yy += 22) {
            ctx.beginPath();
            ctx.moveTo(x + 2, yy);
            ctx.lineTo(right - 2, yy);
            ctx.stroke();
          }
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(x + 4, top);
          ctx.lineTo(x + 4, bottom);
          ctx.moveTo(right - 4, top);
          ctx.lineTo(right - 4, bottom);
          ctx.stroke();
          break;
        }
        case "CAVE": {
          // Rough rock: irregular fracture lines, no man-made straight edges.
          ctx.strokeStyle = `${STEEL}0.34)`;
          let seed = Math.floor(x * 7.3) % 97;
          const rnd = () => ((seed = (seed * 31 + 17) % 97) / 97);
          for (let yy = top + 5; yy < bottom; yy += 9) {
            ctx.beginPath();
            ctx.moveTo(x, yy + rnd() * 4 - 2);
            for (let xx = x + 8; xx <= right; xx += 8) ctx.lineTo(xx, yy + rnd() * 5 - 2.5);
            ctx.stroke();
          }
          break;
        }
        case "GRAIN SILO": {
          // Grain heaped against the wall, with the free surface sloping.
          ctx.fillStyle = `${STEEL}0.22)`;
          ctx.beginPath();
          ctx.moveTo(x, bottom);
          ctx.lineTo(x, top + height * 0.55);
          ctx.lineTo(right, top + height * 0.3);
          ctx.lineTo(right, bottom);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = `${STEEL}0.4)`;
          let gseed = Math.floor(x * 3.1) % 89;
          const grnd = () => ((gseed = (gseed * 29 + 11) % 89) / 89);
          for (let i = 0; i < 26; i += 1) {
            const gx = x + grnd() * w;
            const surface = top + height * (0.55 - ((gx - x) / w) * 0.25);
            const gy = surface + grnd() * (bottom - surface);
            if (gy < bottom) ctx.fillRect(gx, gy, 1, 1);
          }
          break;
        }
        case "PENSTOCK": {
          // Riveted penstock shell with flow streaks along it.
          ctx.strokeStyle = `${STEEL}0.4)`;
          ctx.lineWidth = 0.8;
          for (let xx = x + 6; xx < right; xx += 10) {
            ctx.beginPath();
            ctx.moveTo(xx, top);
            ctx.lineTo(xx, bottom);
            ctx.stroke();
          }
          ctx.strokeStyle = `${STEEL}0.5)`;
          for (let yy = top + 14; yy < bottom; yy += 26) {
            ctx.beginPath();
            ctx.moveTo(x, yy);
            ctx.lineTo(right, yy);
            ctx.stroke();
            ctx.fillStyle = `${STEEL}0.5)`;
            for (let xx = x + 4; xx < right - 2; xx += 7) {
              ctx.beginPath();
              ctx.arc(xx, yy, 0.8, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          break;
        }
        case "BLAST FURNACE": {
          // Refractory brick, hot seams glowing through.
          ctx.strokeStyle = `${STEEL}0.3)`;
          let brow = 0;
          for (let yy = top; yy < bottom; yy += 9) {
            ctx.beginPath();
            ctx.moveTo(x, yy);
            ctx.lineTo(right, yy);
            ctx.stroke();
            for (let xx = x + (brow % 2 ? 0 : 9); xx < right; xx += 18) {
              ctx.beginPath();
              ctx.moveTo(xx, yy);
              ctx.lineTo(xx, yy + 9);
              ctx.stroke();
            }
            brow += 1;
          }
          ctx.strokeStyle = "rgba(251,191,36,0.3)";
          ctx.lineWidth = 1.2;
          for (let yy = top + 13; yy < bottom; yy += 31) {
            ctx.beginPath();
            ctx.moveTo(x + 3, yy);
            ctx.lineTo(right - 3, yy);
            ctx.stroke();
          }
          break;
        }
        case "CARGO HOLD": {
          // Corrugated bulkhead: deep vertical folds.
          ctx.strokeStyle = `${STEEL}0.45)`;
          ctx.lineWidth = 1.1;
          for (let xx = x + 4; xx < right; xx += 7) {
            ctx.beginPath();
            ctx.moveTo(xx, top);
            ctx.lineTo(xx, bottom);
            ctx.stroke();
          }
          ctx.strokeStyle = `${STEEL}0.25)`;
          ctx.lineWidth = 0.7;
          for (let xx = x + 7.5; xx < right; xx += 7) {
            ctx.beginPath();
            ctx.moveTo(xx, top);
            ctx.lineTo(xx, bottom);
            ctx.stroke();
          }
          break;
        }
        case "METRO TUNNEL": {
          // Segmental lining rings with bolt pockets.
          ctx.strokeStyle = `${STEEL}0.38)`;
          for (let yy = top + 7; yy < bottom; yy += 15) {
            ctx.beginPath();
            ctx.moveTo(x, yy);
            ctx.lineTo(right, yy);
            ctx.stroke();
          }
          ctx.strokeStyle = `${STEEL}0.28)`;
          for (let yy = top + 7; yy < bottom; yy += 15) {
            for (let xx = x + 11; xx < right - 4; xx += 13) {
              ctx.strokeRect(xx, yy + 4, 5, 6);
            }
          }
          break;
        }
        case "COLLAPSE": {
          // Broken slabs at angles with rebar poking out of them.
          ctx.strokeStyle = `${STEEL}0.45)`;
          ctx.lineWidth = 1;
          let cseed = Math.floor(x * 5.7) % 83;
          const crnd = () => ((cseed = (cseed * 37 + 13) % 83) / 83);
          for (let yy = top; yy < bottom; yy += 16) {
            const skew = crnd() * 10 - 5;
            ctx.beginPath();
            ctx.moveTo(x, yy + skew);
            ctx.lineTo(right, yy + 12 - skew);
            ctx.stroke();
          }
          ctx.strokeStyle = `${STEEL}0.6)`;
          ctx.lineWidth = 0.6;
          for (let i = 0; i < 5; i += 1) {
            const rx = x + crnd() * w;
            const ry = top + crnd() * height;
            ctx.beginPath();
            ctx.moveTo(rx, ry);
            ctx.lineTo(rx + crnd() * 9 - 4, ry + crnd() * 9 - 4);
            ctx.stroke();
          }
          break;
        }
        case "CHIMNEY": {
          // Tapering flue brick, courses narrowing with height.
          ctx.strokeStyle = `${STEEL}0.32)`;
          for (let yy = top; yy < bottom; yy += 8) {
            const inset = 1 + ((yy - top) / Math.max(height, 1)) * 3;
            ctx.beginPath();
            ctx.moveTo(x + inset, yy);
            ctx.lineTo(right - inset, yy);
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.moveTo(x + 1, top);
          ctx.lineTo(x + 4, bottom);
          ctx.moveTo(right - 1, top);
          ctx.lineTo(right - 4, bottom);
          ctx.stroke();
          break;
        }
        default: {
          // STORAGE TANK — shell rings and an access ladder.
          ctx.strokeStyle = `${STEEL}0.38)`;
          for (let yy = top + 9; yy < bottom; yy += 13) {
            ctx.beginPath();
            ctx.moveTo(x, yy);
            ctx.lineTo(right, yy);
            ctx.stroke();
          }
          const lx = x + w * 0.68;
          ctx.strokeStyle = `${STEEL}0.5)`;
          ctx.beginPath();
          ctx.moveTo(lx, top);
          ctx.lineTo(lx, bottom);
          ctx.moveTo(lx + 5, top);
          ctx.lineTo(lx + 5, bottom);
          ctx.stroke();
          for (let yy = top + 4; yy < bottom; yy += 6) {
            ctx.beginPath();
            ctx.moveTo(lx, yy);
            ctx.lineTo(lx + 5, yy);
            ctx.stroke();
          }
          break;
        }
      }

      ctx.restore();

      // Outline last, so no interior detail paints over the silhouette.
      ctx.strokeStyle = `${STEEL}0.6)`;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, top + 0.5, w - 1, height - 1);
    };

    const drawObstacle = (o: GameState["obstacles"][number]) => {
      const gapBottom = o.gapY + GAP_HEIGHT;
      drawStructure(o.label, o.x, 0, o.gapY);
      drawStructure(o.label, o.x, gapBottom, WORLD_HEIGHT - gapBottom);

      // Lip plates on the gap edges — reads as an opening cut into structure.
      ctx.fillStyle = `${STEEL}0.55)`;
      if (o.gapY > 0) ctx.fillRect(o.x - 1.5, o.gapY - 3, OBSTACLE_WIDTH + 3, 3);
      if (gapBottom < WORLD_HEIGHT) ctx.fillRect(o.x - 1.5, gapBottom, OBSTACLE_WIDTH + 3, 3);

      // The name stays, but small — the structure is what identifies it now.
      ctx.save();
      ctx.translate(o.x + OBSTACLE_WIDTH / 2, o.gapY - 7);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = `${STEEL}0.65)`;
      ctx.font = "5.5px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(o.label, 0, 2);
      ctx.restore();
    };

    const frame = (now: number) => {
      if (stopped) return;
      const dt = (now - last) / 1000;
      last = now;

      const before = stateRef.current;
      const after = stepGame(before, { dt, gapDraw: Math.random(), spaceDraw: Math.random() });
      stateRef.current = after;

      if (before.status === "flying" && after.status === "crashed") {
        if (isNewBest(after.score, readBest())) writeBest(after.score);
        setHud({ status: "crashed", score: after.score });
      } else if (after.score !== before.score) {
        setHud({ status: after.status, score: after.score });
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

      // Floor and ceiling, so the crash surfaces are visible.
      ctx.fillStyle = "rgba(148,163,184,0.28)";
      ctx.fillRect(0, WORLD_HEIGHT - 1.5, WORLD_WIDTH, 1.5);
      ctx.fillRect(0, 0, WORLD_WIDTH, 1.5);

      for (const o of after.obstacles) drawObstacle(o);
      drawDrone(after.y, after.elapsed);

      ctx.fillStyle = ink;
      ctx.globalAlpha = 0.75;
      ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(String(after.score), 8, 16);
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  // Space and Enter must fly too — the canvas is focusable and this is the
  // whole control scheme.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter" || e.key === "ArrowUp") {
        e.preventDefault();
        press();
      }
    },
    [press],
  );

  return (
    <div className="mt-4">
      <div
        role="button"
        tabIndex={0}
        aria-label="Fly where people can't: fly the Elios 3 through the gaps. Press space to fly."
        onPointerDown={(e) => {
          // preventDefault stops the tap selecting text or starting a drag —
          // but it also suppresses the focus that would normally follow, which
          // left Space doing nothing after a click even though the label says
          // to press it. Focus explicitly instead.
          e.preventDefault();
          e.currentTarget.focus();
          press();
        }}
        onKeyDown={onKeyDown}
        className="relative block w-full cursor-pointer overflow-hidden rounded-xl border border-glass/20 bg-glass/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <canvas
          ref={canvasRef}
          className="block h-auto w-full touch-none select-none"
          style={{ aspectRatio: `${WORLD_WIDTH} / ${WORLD_HEIGHT}` }}
        />
        {hud.status !== "flying" ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-surface/70 px-4 text-center backdrop-blur-[1px]">
            <div>
              <p className="text-[11px] uppercase tracking-[0.15em] text-accent-soft/75">
                Fly where people can&rsquo;t
              </p>
              {hud.status === "crashed" ? (
                <p className="mt-1 text-sm font-medium text-ink">
                  {hud.score} cleared — {crashLine(hud.score)}
                </p>
              ) : null}
              <p className="mt-1 text-[11px] text-ink-4/80">
                Tap or press space to {hud.status === "crashed" ? "go again" : "fly"}
              </p>
            </div>
          </div>
        ) : null}
      </div>
      {best !== null ? <p className="mt-2 text-[11px] text-ink-5">Best {best}</p> : null}
    </div>
  );
}

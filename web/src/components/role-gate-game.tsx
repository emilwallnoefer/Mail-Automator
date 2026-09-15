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
 * "Confined Space Run" — the Elios 3 threads the gaps in a boiler, a sewer, a
 * ballast tank, while somebody waits for an admin to assign their role.
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

    const drawDrone = (y: number, t: number) => {
      // Tilt with vertical speed — a diving drone should look like it is diving.
      const tilt = Math.max(-0.5, Math.min(0.7, stateRef.current.velocity / 420));
      ctx.save();
      ctx.translate(DRONE_X, y);
      ctx.rotate(tilt);

      // Protective cage: the thing that makes an Elios an Elios.
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, DRONE_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.45;
      for (let i = 0; i < 3; i += 1) {
        const a = (i * Math.PI) / 3 + t * 0.6;
        ctx.beginPath();
        ctx.ellipse(0, 0, DRONE_RADIUS, DRONE_RADIUS * 0.34, a, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Payload sphere.
      ctx.globalAlpha = 1;
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(0, 0, DRONE_RADIUS * 0.42, 0, Math.PI * 2);
      ctx.fill();

      // Lighting head, pointing the way it flies.
      ctx.fillStyle = positive;
      ctx.beginPath();
      ctx.arc(DRONE_RADIUS * 0.34, 0, DRONE_RADIUS * 0.17, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const drawObstacle = (o: GameState["obstacles"][number]) => {
      const draw = (top: number, height: number) => {
        if (height <= 0) return;
        ctx.fillStyle = "rgba(148,163,184,0.16)";
        ctx.fillRect(o.x, top, OBSTACLE_WIDTH, height);
        ctx.strokeStyle = "rgba(148,163,184,0.5)";
        ctx.lineWidth = 1;
        ctx.strokeRect(o.x + 0.5, top + 0.5, OBSTACLE_WIDTH - 1, height - 1);
        // Plating seams — reads as industrial structure rather than a bar.
        ctx.strokeStyle = "rgba(148,163,184,0.22)";
        for (let y = top + 8; y < top + height - 4; y += 9) {
          ctx.beginPath();
          ctx.moveTo(o.x + 3, y);
          ctx.lineTo(o.x + OBSTACLE_WIDTH - 3, y);
          ctx.stroke();
        }
      };
      draw(0, o.gapY);
      draw(o.gapY + GAP_HEIGHT, WORLD_HEIGHT - (o.gapY + GAP_HEIGHT));

      // Name the space, sideways up the column.
      ctx.save();
      ctx.translate(o.x + OBSTACLE_WIDTH / 2, o.gapY - 6);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = "rgba(148,163,184,0.75)";
      ctx.font = "6px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(o.label, 0, 2.2);
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
        aria-label="Confined Space Run: fly the Elios 3 through the gaps. Press space to fly."
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
                Confined Space Run
              </p>
              <p className="mt-1 text-sm font-medium text-ink">
                {hud.status === "crashed" ? `${hud.score} cleared — ${crashLine(hud.score)}` : "Fly the Elios 3"}
              </p>
              <p className="mt-1 text-[11px] text-ink-4/80">
                {hud.status === "crashed" ? "Tap or press space to go again" : "Tap or press space to fly"}
              </p>
            </div>
          </div>
        ) : null}
      </div>
      <p className="mt-2 text-[11px] text-ink-4/75">
        Mind the gaps.
        {best !== null ? <span className="text-ink-5"> · Best {best}</span> : null}
      </p>
    </div>
  );
}

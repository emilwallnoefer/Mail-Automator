"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { LeaderboardRow } from "@/lib/elios-leaderboard";
import {
  BEST_SCORE_KEY,
  DRONE_RADIUS,
  DRONE_X,
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
 * "Fly where people can't" — the Elios 3 threads gates, spikes, saw blades and
 * ramps while somebody waits for an admin to assign their role.
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

export type EliosGameProps = {
  /** Extra classes for the wrapper — the composer needs different spacing. */
  className?: string;
  /**
   * Show the workspace leaderboard under the game and post scores to it.
   * Off by default so a caller has to opt in to the network.
   */
  leaderboard?: boolean;
};

export function EliosGame({ className = "mt-4", leaderboard = false }: EliosGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<GameState>(createGame());
  // Server render has no localStorage, so the server snapshot is always null.
  const best = useSyncExternalStore(subscribeBest, readBest, () => null);
  const [hud, setHud] = useState<{ status: GameState["status"]; score: number }>({
    status: "idle",
    score: 0,
  });
  const [board, setBoard] = useState<LeaderboardRow[] | null>(null);

  /**
   * Refresh the board. Silent on failure: an unapplied migration or a dropped
   * connection must never break the game wrapped around it, and the board is
   * the least important thing on screen.
   */
  const loadBoard = useCallback(async () => {
    try {
      const res = await fetch("/api/elios-score", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { board?: LeaderboardRow[] };
      setBoard(json.board ?? []);
    } catch {
      // Leave whatever was showing.
    }
  }, []);

  useEffect(() => {
    if (!leaderboard) return;
    // Fetched inline with a cancel flag rather than by calling loadBoard():
    // the React Compiler treats an effect that calls a setState-bearing
    // callback as a synchronous set, and this shape also stops a late response
    // writing into an unmounted component.
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/elios-score", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { board?: LeaderboardRow[] };
        if (!cancelled) setBoard(json.board ?? []);
      } catch {
        // The board is the least important thing on screen.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leaderboard]);

  /** Post a finished run. The server decides whether it is an improvement. */
  const submitScore = useCallback(
    async (score: number) => {
      try {
        const res = await fetch("/api/elios-score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ score }),
        });
        if (!res.ok) return;
        const json = (await res.json()) as { recorded?: boolean };
        if (json.recorded) await loadBoard();
      } catch {
        // A lost score is not worth telling anybody about.
      }
    },
    [loadBoard],
  );

  const press = useCallback(() => {
    const s = stateRef.current;
    if (s.status === "crashed") {
      stateRef.current = flap(createGame());
    } else {
      stateRef.current = flap(s);
    }
    setHud({ status: "flying", score: stateRef.current.score });
  }, []);

  // The frame loop is set up once and must not restart when a callback
  // identity changes — restarting it mid-flight would reset the canvas.
  const submitScoreRef = useRef(submitScore);
  useEffect(() => {
    submitScoreRef.current = submitScore;
  }, [submitScore]);

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
     * Draw an obstacle from the same solids the collision test uses.
     *
     * Nothing here invents an outline: the path is the geometry, so a spike
     * looks exactly as sharp as it hits and the saw is round in play as well as
     * on screen. Styling is per kind, but the shape is never decorative.
     */
    const drawObstacle = (o: GameState["obstacles"][number], t: number) => {
      const hot = o.kind === "SAW" || o.kind === "SPIKES_FLOOR" || o.kind === "SPIKES_CEILING";
      const fill = hot ? "rgba(248,113,113,0.14)" : `${STEEL}0.16)`;
      const edge = hot ? "rgba(248,113,113,0.65)" : `${STEEL}0.6)`;

      for (const solid of o.solids) {
        ctx.beginPath();
        if (solid.shape === "disc") {
          ctx.arc(solid.cx + o.x, solid.cy, solid.r, 0, Math.PI * 2);
        } else {
          solid.points.forEach(([px, py], i) => {
            if (i === 0) ctx.moveTo(px + o.x, py);
            else ctx.lineTo(px + o.x, py);
          });
          ctx.closePath();
        }
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = edge;
        ctx.lineWidth = 1;
        ctx.stroke();

        if (solid.shape === "disc") {
          // Teeth and a hub, spun from elapsed time so the blade reads as
          // moving without the collision circle ever changing.
          const cx = solid.cx + o.x;
          const spin = t * 5;
          ctx.strokeStyle = edge;
          ctx.lineWidth = 1.4;
          for (let i = 0; i < 10; i += 1) {
            const a = spin + (i * Math.PI) / 5;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * (solid.r - 4), solid.cy + Math.sin(a) * (solid.r - 4));
            ctx.lineTo(cx + Math.cos(a) * (solid.r + 2.5), solid.cy + Math.sin(a) * (solid.r + 2.5));
            ctx.stroke();
          }
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(cx, solid.cy, solid.r * 0.3, 0, Math.PI * 2);
          ctx.stroke();
        } else if (!hot) {
          // Plating seams inside the solid, clipped to the shape so no line
          // ever strays outside what actually collides.
          ctx.save();
          ctx.clip();
          ctx.strokeStyle = `${STEEL}0.28)`;
          ctx.lineWidth = 0.7;
          const ys = solid.points.map(([, py]) => py);
          for (let y = Math.min(...ys); y < Math.max(...ys); y += 9) {
            ctx.beginPath();
            ctx.moveTo(o.x - 2, y);
            ctx.lineTo(o.x + o.width + 2, y);
            ctx.stroke();
          }
          ctx.restore();
        }
      }
    };

    const frame = (now: number) => {
      if (stopped) return;
      const dt = (now - last) / 1000;
      last = now;

      const before = stateRef.current;
      const after = stepGame(before, { dt, kindDraw: Math.random(), placeDraw: Math.random() });
      stateRef.current = after;

      if (before.status === "flying" && after.status === "crashed") {
        if (isNewBest(after.score, readBest())) writeBest(after.score);
        if (leaderboard && after.score > 0) void submitScoreRef.current(after.score);
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

      for (const o of after.obstacles) drawObstacle(o, after.elapsed);
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
  }, [leaderboard]);

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
    <div className={className}>
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
      <div className="mt-2 flex items-start justify-between gap-3">
        {best !== null ? <p className="text-[11px] text-ink-5">Best {best}</p> : <span />}
        {leaderboard && board && board.length > 0 ? (
          <ol className="min-w-0 text-right text-[11px] leading-5 text-ink-4/80">
            {board.slice(0, 5).map((row, i) => (
              <li key={`${row.name}-${i}`} className={row.you ? "text-accent-soft/90" : undefined}>
                <span className="text-ink-5">{i + 1}.</span> {row.name}{" "}
                <span className="font-medium text-ink-3">{row.score}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Physics, geometry and rules for "Fly where people can't".
 *
 * Obstacles are real shapes, not a pair of rectangles wearing a skin: a saw
 * blade is a circle, spikes are triangles, a ramp is a wedge. Collision is
 * tested against that same geometry, so what you see is exactly what you hit —
 * which is what separates this from a flappy clone with different wallpaper.
 *
 * Everything here is pure: no canvas, no `Date.now()`, no `Math.random()`. The
 * caller passes the timestep and the draws in, so a whole run replays exactly
 * in a test — the same discipline `fleet-rules.ts` follows.
 */

/**
 * Fixed world units. The canvas scales to fit, so the game plays identically at
 * any card width and the constants never need retuning for a new screen size.
 */
export const WORLD_WIDTH = 320;
export const WORLD_HEIGHT = 200;

/** Downward acceleration, world units per second squared. */
export const GRAVITY = 420;
/** Upward kick of a single flap, world units per second. */
export const FLAP_VELOCITY = -145;
/** Terminal velocity, so a long fall stays readable rather than teleporting. */
export const MAX_FALL_SPEED = 220;

export const DRONE_X = 68;
/** The Elios 3 is a sphere in a cage — one radius covers the whole aircraft. */
export const DRONE_RADIUS = 11;

export const SCROLL_SPEED = 78;
/** Clear air between one obstacle and the next. */
export const OBSTACLE_GAP = 112;
/** Never open a passage tighter than this, or it stops being playable. */
export const MIN_PASSAGE = 52;
/** Keep a passage off the very floor and ceiling, where it is unfair. */
export const EDGE_MARGIN = 20;

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export type Vec = readonly [number, number];

/** A solid the drone can hit. Local x is relative to the obstacle's left edge. */
export type Solid =
  | { readonly shape: "poly"; readonly points: readonly Vec[] }
  | { readonly shape: "disc"; readonly cx: number; readonly cy: number; readonly r: number };

/**
 * The obstacle vocabulary. Each is a genuinely different problem to fly — go
 * over, go under, thread a tip, pick a side, climb a slope — rather than a
 * restyled column.
 */
export const OBSTACLE_KINDS = [
  "GATE",
  "SPIKES_FLOOR",
  "SPIKES_CEILING",
  "SAW",
  "BLOCK",
  "RAMP",
  "PINCER",
  "PILLARS",
] as const;

export type ObstacleKind = (typeof OBSTACLE_KINDS)[number];

export type Obstacle = {
  /** Left edge in world units; moves right-to-left. */
  x: number;
  kind: ObstacleKind;
  width: number;
  solids: readonly Solid[];
  /** Scored once, when the drone is fully past the trailing edge. */
  passed: boolean;
};

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : 0.5);

function rect(x: number, y: number, w: number, h: number): Solid {
  return { shape: "poly", points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]] };
}

export function kindFromDraw(draw: number): ObstacleKind {
  const safe = Number.isFinite(draw) ? Math.min(Math.max(draw, 0), 0.999999) : 0;
  return OBSTACLE_KINDS[Math.floor(safe * OBSTACLE_KINDS.length)];
}

/**
 * Build one obstacle's geometry.
 *
 * `draw` places the opening. Every kind guarantees a passage at least
 * `MIN_PASSAGE` tall, so a random layout can never come out unflyable.
 */
export function buildObstacle(kind: ObstacleKind, draw: number): { width: number; solids: Solid[] } {
  const t = clamp01(draw);
  const H = WORLD_HEIGHT;

  switch (kind) {
    case "SPIKES_FLOOR": {
      // A row of teeth on the deck: fly over them.
      const width = 54;
      const spikeH = Math.min(58, H - MIN_PASSAGE - EDGE_MARGIN);
      const solids: Solid[] = [];
      for (let i = 0; i < 3; i += 1) {
        const bx = i * 18;
        solids.push({ shape: "poly", points: [[bx, H], [bx + 9, H - spikeH], [bx + 18, H]] });
      }
      return { width, solids };
    }
    case "SPIKES_CEILING": {
      const width = 54;
      const spikeH = Math.min(58, H - MIN_PASSAGE - EDGE_MARGIN);
      const solids: Solid[] = [];
      for (let i = 0; i < 3; i += 1) {
        const bx = i * 18;
        solids.push({ shape: "poly", points: [[bx, 0], [bx + 9, spikeH], [bx + 18, 0]] });
      }
      return { width, solids };
    }
    case "SAW": {
      // A blade in open air: above or below, your choice.
      const width = 44;
      const r = 18;
      const lowest = EDGE_MARGIN + MIN_PASSAGE + r;
      const highest = H - EDGE_MARGIN - MIN_PASSAGE - r;
      const cy = lowest + t * Math.max(0, highest - lowest);
      return { width, solids: [{ shape: "disc", cx: width / 2, cy, r }] };
    }
    case "BLOCK": {
      // A slab hanging in mid-air; both sides are passable.
      const width = 38;
      const h = 46;
      const lowest = EDGE_MARGIN + MIN_PASSAGE;
      const highest = H - EDGE_MARGIN - MIN_PASSAGE - h;
      const top = lowest + t * Math.max(0, highest - lowest);
      return { width, solids: [rect(0, top, width, h)] };
    }
    case "RAMP": {
      // A wedge climbing out of the floor: the climb starts well before the
      // high end, so it has to be read early.
      const width = 62;
      const rise = Math.min(70, H - MIN_PASSAGE - EDGE_MARGIN);
      return { width, solids: [{ shape: "poly", points: [[0, H], [width, H - rise], [width, H]] }] };
    }
    case "PINCER": {
      // Two tips pointing at each other, with the opening between them.
      const width = 46;
      const passage = MIN_PASSAGE + 10;
      const topTip = EDGE_MARGIN + t * (H - 2 * EDGE_MARGIN - passage);
      const bottomTip = topTip + passage;
      return {
        width,
        solids: [
          { shape: "poly", points: [[0, 0], [width, 0], [width / 2, topTip]] },
          { shape: "poly", points: [[0, H], [width, H], [width / 2, bottomTip]] },
        ],
      };
    }
    case "PILLARS": {
      // Two narrow gates back to back with offset openings, so clearing the
      // first leaves you badly placed for the second.
      const width = 68;
      const passage = MIN_PASSAGE + 12;
      const span = H - 2 * EDGE_MARGIN - passage;
      const firstTop = EDGE_MARGIN + t * span;
      // Push the second opening well away from the first, wrapping in range.
      const secondTop = EDGE_MARGIN + ((t + 0.55) % 1) * span;
      const bar = 16;
      return {
        width,
        solids: [
          rect(0, 0, bar, firstTop),
          rect(0, firstTop + passage, bar, H - firstTop - passage),
          rect(width - bar, 0, bar, secondTop),
          rect(width - bar, secondTop + passage, bar, H - secondTop - passage),
        ],
      };
    }
    default: {
      // GATE — the classic, kept as the baseline the others play against.
      const width = 40;
      const passage = MIN_PASSAGE + 22;
      const top = EDGE_MARGIN + t * (H - 2 * EDGE_MARGIN - passage);
      return {
        width,
        solids: [rect(0, 0, width, top), rect(0, top + passage, width, H - top - passage)],
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Collision
// ---------------------------------------------------------------------------

/** Distance from a point to a line segment. */
export function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  // Degenerate segment: fall back to the distance to the point itself.
  const t = lenSq === 0 ? 0 : Math.min(Math.max(((px - ax) * dx + (py - ay) * dy) / lenSq, 0), 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function pointInPolygon(px: number, py: number, points: readonly Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const straddles = yi > py !== yj > py;
    if (straddles && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Does a circle overlap a solid? `offsetX` shifts the solid into world space. */
export function circleHitsSolid(
  cx: number,
  cy: number,
  r: number,
  solid: Solid,
  offsetX: number,
): boolean {
  if (solid.shape === "disc") {
    return Math.hypot(cx - (solid.cx + offsetX), cy - solid.cy) < r + solid.r;
  }
  const pts: Vec[] = solid.points.map(([x, y]) => [x + offsetX, y] as Vec);
  if (pointInPolygon(cx, cy, pts)) return true;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    if (distanceToSegment(cx, cy, pts[j][0], pts[j][1], pts[i][0], pts[i][1]) < r) return true;
  }
  return false;
}

export function hitsObstacle(y: number, obstacle: Obstacle): boolean {
  // Cheap reject before the per-edge work.
  if (DRONE_X + DRONE_RADIUS < obstacle.x || DRONE_X - DRONE_RADIUS > obstacle.x + obstacle.width) {
    return false;
  }
  return obstacle.solids.some((s) => circleHitsSolid(DRONE_X, y, DRONE_RADIUS, s, obstacle.x));
}

export function hitsGround(y: number): boolean {
  return y + DRONE_RADIUS >= WORLD_HEIGHT;
}

export function hitsCeiling(y: number): boolean {
  return y - DRONE_RADIUS <= 0;
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

export type GameStatus = "idle" | "flying" | "crashed";

export type GameState = {
  status: GameStatus;
  /** Vertical position of the drone's centre. */
  y: number;
  velocity: number;
  obstacles: Obstacle[];
  score: number;
  /** Seconds elapsed this run; drives rotor and blade animation. */
  elapsed: number;
};

export function createGame(): GameState {
  return { status: "idle", y: WORLD_HEIGHT / 2, velocity: 0, obstacles: [], score: 0, elapsed: 0 };
}

/**
 * A flap only does something mid-flight. From `idle` it also launches the run,
 * so one tap starts and flies — there is no separate start button to hunt for.
 */
export function flap(state: GameState): GameState {
  if (state.status === "crashed") return state;
  return { ...state, status: "flying", velocity: FLAP_VELOCITY };
}

export type StepInput = {
  /** Seconds since the last step. */
  dt: number;
  /** Two draws in [0, 1): which kind of obstacle, and where its opening sits. */
  kindDraw: number;
  placeDraw: number;
};

export function stepGame(state: GameState, input: StepInput): GameState {
  if (state.status !== "flying") return state;

  // Clamp the timestep. A backgrounded tab resumes with a huge dt, and
  // un-clamped that teleports the drone past an obstacle without a collision
  // ever being tested.
  const dt = Math.min(Math.max(input.dt, 0), 0.05);

  const velocity = Math.min(state.velocity + GRAVITY * dt, MAX_FALL_SPEED);
  const y = state.y + velocity * dt;

  let obstacles = state.obstacles
    .map((o) => ({ ...o, x: o.x - SCROLL_SPEED * dt }))
    .filter((o) => o.x + o.width > -4);

  const last = obstacles[obstacles.length - 1];
  if (!last || last.x + last.width <= WORLD_WIDTH - OBSTACLE_GAP) {
    const kind = kindFromDraw(input.kindDraw);
    const built = buildObstacle(kind, input.placeDraw);
    obstacles = [...obstacles, { x: WORLD_WIDTH, kind, passed: false, ...built }];
  }

  let score = state.score;
  obstacles = obstacles.map((o) => {
    if (!o.passed && o.x + o.width < DRONE_X - DRONE_RADIUS) {
      score += 1;
      return { ...o, passed: true };
    }
    return o;
  });

  const crashed = hitsGround(y) || hitsCeiling(y) || obstacles.some((o) => hitsObstacle(y, o));

  return {
    status: crashed ? "crashed" : "flying",
    // Park the drone inside the world rather than part-way through a wall.
    y: crashed ? Math.min(Math.max(y, DRONE_RADIUS), WORLD_HEIGHT - DRONE_RADIUS) : y,
    velocity,
    obstacles,
    score,
    elapsed: state.elapsed + dt,
  };
}

export const BEST_SCORE_KEY = "rolegate:elios-best";

export function isNewBest(score: number, best: number | null): boolean {
  return score > 0 && (best === null || score > best);
}

/** Anything that is not a sane count is treated as no score. */
export function parseStoredBest(raw: string | null): number | null {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

/** A line for the crash screen, in the register of the screen around it. */
export function crashLine(score: number): string {
  if (score === 0) return "Straight into it. It happens.";
  if (score < 3) return "A short inspection.";
  if (score < 8) return "Solid flying.";
  if (score < 15) return "That is real pilot territory.";
  return "Show-off.";
}

/**
 * Physics and rules for the Elios flight game on the "waiting for a role"
 * screen — a flappy-style run where the Elios 3 threads the gaps in a series of
 * confined spaces.
 *
 * Everything here is pure: no canvas, no `Date.now()`, no `Math.random()`. The
 * caller passes the timestep and the random draw in, so a whole run can be
 * replayed exactly in a test — the same discipline `fleet-rules.ts` follows.
 * The component is then only drawing and input.
 */

/**
 * Fixed world units. The canvas scales to fit, so the game plays identically at
 * any card width — and the physics constants below never have to be retuned for
 * a new screen size.
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

/**
 * Wide enough to draw a structure into rather than a bar — tube banks, brick
 * courses and stiffener ribs all need room to read at this scale.
 */
export const OBSTACLE_WIDTH = 42;
export const GAP_HEIGHT = 74;
export const SCROLL_SPEED = 78;
/** Horizontal distance between obstacle centres. */
export const OBSTACLE_SPACING = 148;
/** Keep a gap from hugging the ceiling or floor, where it is unfair. */
export const MIN_GAP_MARGIN = 26;

/**
 * Places an Elios actually gets sent. Not just pipework — the point of a
 * caged drone is the range of things it flies inside, so this spans industry
 * (boiler, blast furnace), infrastructure (sewer, penstock, metro tunnel),
 * marine (ballast tank, cargo hold), extraction (mine stope), agriculture
 * (grain silo), natural (cave) and the one nobody plans for (collapse).
 */
export const CONFINED_SPACES = [
  "BOILER",
  "PRESSURE VESSEL",
  "SEWER",
  "CHIMNEY",
  "STORAGE TANK",
  "MINE STOPE",
  "BALLAST TANK",
  "COOLING DUCT",
  "CAVE",
  "GRAIN SILO",
  "PENSTOCK",
  "BLAST FURNACE",
  "CARGO HOLD",
  "METRO TUNNEL",
  "COLLAPSE",
] as const;

export type ConfinedSpace = (typeof CONFINED_SPACES)[number];

export type Obstacle = {
  /** Left edge, world units. Moves right-to-left. */
  x: number;
  /** Top of the passable gap. */
  gapY: number;
  /** Scored once, when the drone's centre passes the trailing edge. */
  passed: boolean;
  label: ConfinedSpace;
};

export type GameStatus = "idle" | "flying" | "crashed";

export type GameState = {
  status: GameStatus;
  /** Vertical position of the drone's centre. */
  y: number;
  velocity: number;
  obstacles: Obstacle[];
  score: number;
  /** Seconds elapsed in this run; drives the rotor animation. */
  elapsed: number;
};

export function createGame(): GameState {
  return {
    status: "idle",
    y: WORLD_HEIGHT / 2,
    velocity: 0,
    obstacles: [],
    score: 0,
    elapsed: 0,
  };
}

/** Where a gap may start, so it never opens off-screen. */
export function gapYFromDraw(draw: number): number {
  const safe = Number.isFinite(draw) ? Math.min(Math.max(draw, 0), 1) : 0.5;
  const lowest = MIN_GAP_MARGIN;
  const highest = WORLD_HEIGHT - GAP_HEIGHT - MIN_GAP_MARGIN;
  return Math.round(lowest + safe * (highest - lowest));
}

export function spaceFromDraw(draw: number): ConfinedSpace {
  const safe = Number.isFinite(draw) ? Math.min(Math.max(draw, 0), 0.999999) : 0;
  return CONFINED_SPACES[Math.floor(safe * CONFINED_SPACES.length)];
}

/**
 * A flap only does something mid-flight. From `idle` it also launches the run,
 * so one tap starts and flies — there is no separate start button to hunt for.
 */
export function flap(state: GameState): GameState {
  if (state.status === "crashed") return state;
  return { ...state, status: "flying", velocity: FLAP_VELOCITY };
}

/** Does the drone overlap this obstacle's solid part? */
export function hitsObstacle(y: number, obstacle: Obstacle): boolean {
  const withinColumn =
    DRONE_X + DRONE_RADIUS > obstacle.x && DRONE_X - DRONE_RADIUS < obstacle.x + OBSTACLE_WIDTH;
  if (!withinColumn) return false;
  const throughGap = y - DRONE_RADIUS >= obstacle.gapY && y + DRONE_RADIUS <= obstacle.gapY + GAP_HEIGHT;
  return !throughGap;
}

export function hitsGround(y: number): boolean {
  return y + DRONE_RADIUS >= WORLD_HEIGHT;
}

export function hitsCeiling(y: number): boolean {
  return y - DRONE_RADIUS <= 0;
}

export type StepInput = {
  /** Seconds since the last step. */
  dt: number;
  /** Two draws in [0, 1): gap position and which confined space it is. */
  gapDraw: number;
  spaceDraw: number;
};

/**
 * Advance the world by `dt`.
 *
 * Idle and crashed states are frozen — the drone hovers on the title screen
 * rather than dropping out of the sky before anyone has touched anything.
 */
export function stepGame(state: GameState, input: StepInput): GameState {
  if (state.status !== "flying") return state;

  // Clamp the timestep. A backgrounded tab resumes with a huge dt, and
  // un-clamped that teleports the drone through an obstacle without a
  // collision ever being tested.
  const dt = Math.min(Math.max(input.dt, 0), 0.05);

  const velocity = Math.min(state.velocity + GRAVITY * dt, MAX_FALL_SPEED);
  const y = state.y + velocity * dt;

  let obstacles = state.obstacles
    .map((o) => ({ ...o, x: o.x - SCROLL_SPEED * dt }))
    .filter((o) => o.x + OBSTACLE_WIDTH > -4);

  const last = obstacles[obstacles.length - 1];
  if (!last || last.x <= WORLD_WIDTH - OBSTACLE_SPACING) {
    obstacles = [
      ...obstacles,
      {
        x: WORLD_WIDTH,
        gapY: gapYFromDraw(input.gapDraw),
        passed: false,
        label: spaceFromDraw(input.spaceDraw),
      },
    ];
  }

  let score = state.score;
  obstacles = obstacles.map((o) => {
    if (!o.passed && o.x + OBSTACLE_WIDTH < DRONE_X - DRONE_RADIUS) {
      score += 1;
      return { ...o, passed: true };
    }
    return o;
  });

  const crashed = hitsGround(y) || hitsCeiling(y) || obstacles.some((o) => hitsObstacle(y, o));

  return {
    status: crashed ? "crashed" : "flying",
    // Park the drone exactly on the surface it hit rather than part-way through.
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
  if (score === 0) return "Straight into the wall. It happens.";
  if (score < 3) return "A short inspection.";
  if (score < 8) return "Solid flying.";
  if (score < 15) return "That is real pilot territory.";
  return "Show-off.";
}

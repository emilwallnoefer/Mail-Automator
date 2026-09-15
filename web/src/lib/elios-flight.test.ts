import { describe, expect, it } from "vitest";
import {
  CONFINED_SPACES,
  DRONE_RADIUS,
  FLAP_VELOCITY,
  GAP_HEIGHT,
  MAX_FALL_SPEED,
  MIN_GAP_MARGIN,
  OBSTACLE_WIDTH,
  WORLD_HEIGHT,
  createGame,
  crashLine,
  flap,
  gapYFromDraw,
  hitsCeiling,
  hitsGround,
  hitsObstacle,
  isNewBest,
  parseStoredBest,
  spaceFromDraw,
  stepGame,
  type GameState,
  type StepInput,
} from "@/lib/elios-flight";

const INPUT: StepInput = { dt: 1 / 60, gapDraw: 0.5, spaceDraw: 0 };

/** Run n frames, so a whole flight is replayable and deterministic. */
function fly(state: GameState, frames: number, input: Partial<StepInput> = {}): GameState {
  let s = state;
  for (let i = 0; i < frames; i += 1) s = stepGame(s, { ...INPUT, ...input });
  return s;
}

describe("idle and crashed states are frozen", () => {
  it("does not drop the drone before anyone has played", () => {
    const idle = fly(createGame(), 120);
    expect(idle.status).toBe("idle");
    expect(idle.y).toBe(WORLD_HEIGHT / 2);
    expect(idle.obstacles).toHaveLength(0);
  });

  it("does not keep simulating after a crash", () => {
    const crashed: GameState = { ...createGame(), status: "crashed", y: 50 };
    expect(fly(crashed, 60)).toEqual(crashed);
  });

  it("refuses to revive a crashed run with a flap", () => {
    const crashed: GameState = { ...createGame(), status: "crashed" };
    expect(flap(crashed)).toEqual(crashed);
  });
});

describe("flap", () => {
  it("launches the run from idle, so one tap starts and flies", () => {
    const s = flap(createGame());
    expect(s.status).toBe("flying");
    expect(s.velocity).toBe(FLAP_VELOCITY);
  });

  it("always resets velocity, so repeated taps keep lifting", () => {
    const falling: GameState = { ...createGame(), status: "flying", velocity: 200 };
    expect(flap(falling).velocity).toBe(FLAP_VELOCITY);
  });
});

describe("physics", () => {
  it("falls under gravity and rises after a flap", () => {
    const start = flap(createGame());
    const afterRise = fly(start, 6);
    expect(afterRise.y).toBeLessThan(start.y);
    const afterFall = fly(afterRise, 60);
    expect(afterFall.y).toBeGreaterThan(afterRise.y);
  });

  it("caps fall speed", () => {
    const s = fly({ ...createGame(), status: "flying" }, 600);
    expect(s.velocity).toBeLessThanOrEqual(MAX_FALL_SPEED);
  });

  it("clamps a huge timestep instead of teleporting through an obstacle", () => {
    // A backgrounded tab resumes with a multi-second dt. Un-clamped, the drone
    // would jump the full height of the world between collision checks.
    const s = stepGame({ ...createGame(), status: "flying" }, { ...INPUT, dt: 30 });
    expect(Number.isFinite(s.y)).toBe(true);
    expect(s.y).toBeLessThanOrEqual(WORLD_HEIGHT);
  });

  it("ignores a negative timestep rather than running backwards", () => {
    const s = stepGame({ ...createGame(), status: "flying" }, { ...INPUT, dt: -5 });
    expect(s.y).toBe(WORLD_HEIGHT / 2);
  });
});

describe("crash detection", () => {
  it("crashes into the floor", () => {
    expect(hitsGround(WORLD_HEIGHT - DRONE_RADIUS)).toBe(true);
    expect(hitsGround(WORLD_HEIGHT / 2)).toBe(false);
    expect(fly({ ...createGame(), status: "flying", y: WORLD_HEIGHT - 20 }, 60).status).toBe("crashed");
  });

  it("crashes into the ceiling", () => {
    expect(hitsCeiling(DRONE_RADIUS)).toBe(true);
    expect(hitsCeiling(WORLD_HEIGHT / 2)).toBe(false);
  });

  it("parks the drone on the surface it hit, not through it", () => {
    const s = fly({ ...createGame(), status: "flying", y: WORLD_HEIGHT - 20 }, 90);
    expect(s.status).toBe("crashed");
    expect(s.y).toBeLessThanOrEqual(WORLD_HEIGHT - DRONE_RADIUS);
    expect(s.y).toBeGreaterThanOrEqual(DRONE_RADIUS);
  });

  it("passes cleanly through a gap it fits", () => {
    const obstacle = { x: 60, gapY: 60, passed: false, label: CONFINED_SPACES[0] };
    expect(hitsObstacle(60 + GAP_HEIGHT / 2, obstacle)).toBe(false);
  });

  it("hits the solid part above and below the gap", () => {
    const obstacle = { x: 60, gapY: 80, passed: false, label: CONFINED_SPACES[0] };
    expect(hitsObstacle(20, obstacle)).toBe(true);
    expect(hitsObstacle(190, obstacle)).toBe(true);
  });

  it("clips on a gap edge rather than letting the cage overlap", () => {
    // The Elios is a sphere in a cage: its full radius has to clear the edge.
    const obstacle = { x: 60, gapY: 80, passed: false, label: CONFINED_SPACES[0] };
    expect(hitsObstacle(80 + DRONE_RADIUS - 1, obstacle)).toBe(true);
    expect(hitsObstacle(80 + DRONE_RADIUS + 1, obstacle)).toBe(false);
  });

  it("ignores obstacles the drone is not level with", () => {
    const far = { x: 300, gapY: 0, passed: false, label: CONFINED_SPACES[0] };
    expect(hitsObstacle(WORLD_HEIGHT / 2, far)).toBe(false);
  });
});

describe("gap placement", () => {
  it("never opens a gap off-screen, for any draw", () => {
    for (const draw of [0, 0.25, 0.5, 0.75, 1, -3, 9, Number.NaN]) {
      const gapY = gapYFromDraw(draw);
      expect(gapY).toBeGreaterThanOrEqual(MIN_GAP_MARGIN);
      expect(gapY + GAP_HEIGHT).toBeLessThanOrEqual(WORLD_HEIGHT - MIN_GAP_MARGIN);
    }
  });

  it("always names a real confined space", () => {
    for (const draw of [0, 0.5, 0.999, 1, 5, Number.NaN]) {
      expect(CONFINED_SPACES).toContain(spaceFromDraw(draw));
    }
  });

  it("leaves a gap the drone actually fits through", () => {
    expect(GAP_HEIGHT).toBeGreaterThan(DRONE_RADIUS * 2);
  });
});

describe("scoring", () => {
  it("scores an obstacle once, when it is fully behind the drone", () => {
    const state: GameState = {
      ...createGame(),
      status: "flying",
      y: 100,
      obstacles: [{ x: 40, gapY: 60, passed: false, label: CONFINED_SPACES[0] }],
    };
    const scored = fly(state, 40);
    expect(scored.score).toBeGreaterThan(0);
    // Once past, it must not tick up again on later frames.
    expect(fly(scored, 40).score).toBe(scored.score);
  });

  it("does not score an obstacle still ahead", () => {
    const state: GameState = {
      ...createGame(),
      status: "flying",
      y: 100,
      obstacles: [{ x: 200, gapY: 60, passed: false, label: CONFINED_SPACES[0] }],
    };
    expect(stepGame(state, INPUT).score).toBe(0);
  });

  it("spawns obstacles as the run goes on, and retires old ones", () => {
    let s = flap(createGame());
    for (let i = 0; i < 400; i += 1) {
      s = stepGame(s, { ...INPUT, gapDraw: 0.5, spaceDraw: (i % 8) / 8 });
      if (s.status === "crashed") s = { ...s, status: "flying", y: s.obstacles[0]?.gapY ?? 100 };
    }
    expect(s.obstacles.length).toBeGreaterThan(0);
    // Off-screen obstacles are dropped rather than accumulating forever.
    expect(s.obstacles.length).toBeLessThan(8);
    expect(s.obstacles.every((o) => o.x + OBSTACLE_WIDTH > -8)).toBe(true);
  });
});

describe("best score", () => {
  it("counts a first real score but never a zero", () => {
    expect(isNewBest(1, null)).toBe(true);
    expect(isNewBest(0, null)).toBe(false);
  });

  it("is strictly higher-is-better", () => {
    expect(isNewBest(5, 3)).toBe(true);
    expect(isNewBest(3, 5)).toBe(false);
    expect(isNewBest(3, 3)).toBe(false);
  });

  it("treats junk in storage as no score", () => {
    for (const raw of [null, "", "abc", "NaN", "-2", "0", "2.5", "{}"]) {
      expect(parseStoredBest(raw)).toBeNull();
    }
    expect(parseStoredBest("7")).toBe(7);
  });
});

describe("crashLine", () => {
  it("says something for every score", () => {
    for (const score of [0, 1, 2, 3, 7, 8, 14, 15, 99]) {
      expect(crashLine(score).length).toBeGreaterThan(0);
    }
  });

  it("does not scold the player who scored nothing", () => {
    expect(crashLine(0)).not.toMatch(/bad|terrible|useless|fail/i);
  });
});

import { describe, expect, it } from "vitest";
import {
  DRONE_RADIUS,
  DRONE_X,
  EDGE_MARGIN,
  FLAP_VELOCITY,
  MAX_FALL_SPEED,
  MIN_PASSAGE,
  OBSTACLE_KINDS,
  WORLD_HEIGHT,
  buildObstacle,
  circleHitsSolid,
  createGame,
  crashLine,
  distanceToSegment,
  flap,
  hitsCeiling,
  hitsGround,
  hitsObstacle,
  isNewBest,
  kindFromDraw,
  parseStoredBest,
  pointInPolygon,
  stepGame,
  type GameState,
  type Obstacle,
  type ObstacleKind,
  type StepInput,
} from "@/lib/elios-flight";

const INPUT: StepInput = { dt: 1 / 60, kindDraw: 0, placeDraw: 0.5 };

function fly(state: GameState, frames: number, input: Partial<StepInput> = {}): GameState {
  let s = state;
  for (let i = 0; i < frames; i += 1) s = stepGame(s, { ...INPUT, ...input });
  return s;
}

/** Place a built obstacle so the drone sits inside its column. */
function at(kind: ObstacleKind, draw: number, x = DRONE_X - 10): Obstacle {
  const built = buildObstacle(kind, draw);
  return { x, kind, passed: false, ...built };
}

describe("obstacle vocabulary", () => {
  it("maps every draw to a real kind", () => {
    for (const draw of [0, 0.3, 0.999, 1, 5, -2, Number.NaN]) {
      expect(OBSTACLE_KINDS).toContain(kindFromDraw(draw));
    }
  });

  it("gives each kind its own geometry rather than restyling one shape", () => {
    // The point of the rewrite: these must genuinely differ, not share a
    // rectangle pair with different paint.
    const shapes = OBSTACLE_KINDS.map((k) => {
      const b = buildObstacle(k, 0.5);
      return `${k}:${b.width}:${b.solids.length}:${b.solids.map((s) => s.shape).join(",")}`;
    });
    expect(new Set(shapes).size).toBeGreaterThan(5);
  });

  it("uses a disc for the saw, so it is round in play and not just in the drawing", () => {
    const saw = buildObstacle("SAW", 0.5);
    expect(saw.solids).toHaveLength(1);
    expect(saw.solids[0].shape).toBe("disc");
  });

  it("uses triangles for spikes", () => {
    for (const kind of ["SPIKES_FLOOR", "SPIKES_CEILING"] as const) {
      const built = buildObstacle(kind, 0.5);
      expect(built.solids).toHaveLength(3);
      for (const s of built.solids) {
        expect(s.shape).toBe("poly");
        if (s.shape === "poly") expect(s.points).toHaveLength(3);
      }
    }
  });
});

describe("every kind stays flyable", () => {
  // Sweep the column at the drone's radius and prove some height is free.
  const freeHeights = (o: Obstacle) => {
    const free: number[] = [];
    for (let y = DRONE_RADIUS; y <= WORLD_HEIGHT - DRONE_RADIUS; y += 1) {
      if (!hitsObstacle(y, o)) free.push(y);
    }
    return free;
  };

  it("leaves a passage at least MIN_PASSAGE tall, for every kind and placement", () => {
    for (const kind of OBSTACLE_KINDS) {
      for (const draw of [0, 0.25, 0.5, 0.75, 1]) {
        const o = at(kind, draw);
        const free = freeHeights(o);
        expect(free.length, `${kind} @ ${draw} has no gap at all`).toBeGreaterThan(0);

        // Longest unbroken run of free height.
        let best = 0;
        let run = 0;
        let prev = -99;
        for (const y of free) {
          run = y === prev + 1 ? run + 1 : 1;
          best = Math.max(best, run);
          prev = y;
        }
        expect(best, `${kind} @ ${draw} passage too tight`).toBeGreaterThanOrEqual(
          MIN_PASSAGE - 2 * DRONE_RADIUS,
        );
      }
    }
  });

  it("never buries the opening in the floor or ceiling", () => {
    for (const kind of OBSTACLE_KINDS) {
      for (const draw of [0, 1]) {
        const free = freeHeights(at(kind, draw));
        expect(free.some((y) => y > EDGE_MARGIN && y < WORLD_HEIGHT - EDGE_MARGIN)).toBe(true);
      }
    }
  });
});

describe("collision geometry", () => {
  it("measures distance to a segment, including past both ends", () => {
    expect(distanceToSegment(0, 0, -1, 5, 1, 5)).toBeCloseTo(5);
    expect(distanceToSegment(10, 5, -1, 5, 1, 5)).toBeCloseTo(9);
    // Degenerate segment must not divide by zero.
    expect(distanceToSegment(3, 4, 0, 0, 0, 0)).toBeCloseTo(5);
  });

  it("tests points against a polygon", () => {
    const square: Array<readonly [number, number]> = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(pointInPolygon(5, 5, square)).toBe(true);
    expect(pointInPolygon(15, 5, square)).toBe(false);
    expect(pointInPolygon(-1, 5, square)).toBe(false);
  });

  it("hits a disc by real distance, not a bounding box", () => {
    const disc = { shape: "disc", cx: 50, cy: 50, r: 10 } as const;
    // Dead centre of the corner of its bounding box, but outside the circle.
    expect(circleHitsSolid(50 + 9.9, 50 + 9.9, 1, disc, 0)).toBe(false);
    expect(circleHitsSolid(50 + 10.5, 50, 1, disc, 0)).toBe(true);
  });

  it("lets the drone slip past the sloped face of a spike", () => {
    // Beside the tip at the same height: a box test would call this a hit.
    const spikes = at("SPIKES_FLOOR", 0.5, DRONE_X - 6);
    const tipY = WORLD_HEIGHT - 58;
    expect(hitsObstacle(tipY - DRONE_RADIUS - 3, spikes)).toBe(false);
    // Low enough to be in the teeth themselves.
    expect(hitsObstacle(WORLD_HEIGHT - 12, spikes)).toBe(true);
  });

  it("respects the offset, so a shape only bites where it is drawn", () => {
    const far = { ...at("GATE", 0.5), x: 300 };
    expect(hitsObstacle(WORLD_HEIGHT / 2, far)).toBe(false);
  });
});

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
    const up = fly(start, 6);
    expect(up.y).toBeLessThan(start.y);
    expect(fly(up, 60).y).toBeGreaterThan(up.y);
  });

  it("caps fall speed", () => {
    expect(fly({ ...createGame(), status: "flying" }, 600).velocity).toBeLessThanOrEqual(MAX_FALL_SPEED);
  });

  it("clamps a huge timestep instead of teleporting through an obstacle", () => {
    const s = stepGame({ ...createGame(), status: "flying" }, { ...INPUT, dt: 30 });
    expect(Number.isFinite(s.y)).toBe(true);
    expect(s.y).toBeLessThanOrEqual(WORLD_HEIGHT);
  });

  it("ignores a negative timestep rather than running backwards", () => {
    expect(stepGame({ ...createGame(), status: "flying" }, { ...INPUT, dt: -5 }).y).toBe(WORLD_HEIGHT / 2);
  });
});

describe("crash detection", () => {
  it("crashes into the floor and the ceiling", () => {
    expect(hitsGround(WORLD_HEIGHT - DRONE_RADIUS)).toBe(true);
    expect(hitsCeiling(DRONE_RADIUS)).toBe(true);
    expect(hitsGround(WORLD_HEIGHT / 2)).toBe(false);
    expect(hitsCeiling(WORLD_HEIGHT / 2)).toBe(false);
  });

  it("parks the drone inside the world, not through a surface", () => {
    const s = fly({ ...createGame(), status: "flying", y: WORLD_HEIGHT - 20 }, 90);
    expect(s.status).toBe("crashed");
    expect(s.y).toBeLessThanOrEqual(WORLD_HEIGHT - DRONE_RADIUS);
    expect(s.y).toBeGreaterThanOrEqual(DRONE_RADIUS);
  });
});

describe("scoring", () => {
  it("scores an obstacle once, when it is fully behind the drone", () => {
    const state: GameState = {
      ...createGame(),
      status: "flying",
      y: 100,
      obstacles: [at("SAW", 0.9, 0)],
    };
    const scored = fly(state, 30);
    expect(scored.score).toBeGreaterThan(0);
    expect(fly(scored, 30).score).toBe(scored.score);
  });

  it("does not score an obstacle still ahead", () => {
    const state: GameState = {
      ...createGame(),
      status: "flying",
      y: 100,
      obstacles: [at("GATE", 0.5, 240)],
    };
    expect(stepGame(state, INPUT).score).toBe(0);
  });

  it("spawns a mix of kinds and retires them off-screen", () => {
    let s = flap(createGame());
    const seen = new Set<string>();
    for (let i = 0; i < 2400; i += 1) {
      s = stepGame(s, { ...INPUT, kindDraw: (i * 0.6180339887) % 1, placeDraw: (i * 0.4142135624) % 1 });
      for (const o of s.obstacles) seen.add(o.kind);
      if (s.status === "crashed") s = { ...s, status: "flying", y: WORLD_HEIGHT / 2 };
    }
    expect(seen.size).toBeGreaterThan(4);
    expect(s.obstacles.length).toBeLessThan(8);
    expect(s.obstacles.every((o) => o.x + o.width > -8)).toBe(true);
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
  it("says something for every score and does not scold a zero", () => {
    for (const score of [0, 1, 2, 3, 7, 8, 14, 15, 99]) {
      expect(crashLine(score).length).toBeGreaterThan(0);
    }
    expect(crashLine(0)).not.toMatch(/bad|terrible|useless|fail/i);
  });
});

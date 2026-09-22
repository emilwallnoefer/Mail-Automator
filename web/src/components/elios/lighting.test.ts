import { describe, expect, it } from "vitest";
import { easeToward } from "@/components/elios/lighting";

/**
 * The beam's direction is eased rather than pinned to the airframe: a flap
 * changes the drone's attitude in one frame, and swinging the light and its
 * shadows that fast reads as a flicker. This is the easing itself — the only
 * part of the lighting that is worth testing without a canvas.
 */
describe("easeToward", () => {
  it("moves toward the target and stops there", () => {
    expect(easeToward(0, 1, 1 / 60, 0.18)).toBeGreaterThan(0);
    expect(easeToward(0, 1, 1 / 60, 0.18)).toBeLessThan(1);
    expect(easeToward(1, 1, 1 / 60, 0.18)).toBe(1);
  });

  it("closes about 63% of the gap in one time constant, whatever the frame times", () => {
    const lag = 0.18;
    const steady = easeToward(0, 1, lag, lag);
    expect(steady).toBeCloseTo(1 - Math.exp(-1), 6);
    // The same span in many small frames lands in the same place: the easing
    // cannot be faster on a fast machine than on a slow one.
    let stepped = 0;
    for (let i = 0; i < 60; i += 1) stepped = easeToward(stepped, 1, lag / 60, lag);
    expect(stepped).toBeCloseTo(steady, 6);
  });

  it("never overshoots, even after a frame that took a whole second", () => {
    expect(easeToward(0, 1, 1, 0.18)).toBeLessThanOrEqual(1);
    expect(easeToward(0, 1, 30, 0.18)).toBeLessThanOrEqual(1);
    expect(easeToward(1, -1, 30, 0.18)).toBeGreaterThanOrEqual(-1);
  });

  it("holds still across a zero-length frame", () => {
    expect(easeToward(0.4, -0.3, 0, 0.18)).toBe(0.4);
  });

  it("snaps when there is nothing sensible to ease from or with", () => {
    expect(easeToward(Number.NaN, 0.5, 1 / 60, 0.18)).toBe(0.5);
    expect(easeToward(0.2, 0.5, 1 / 60, 0)).toBe(0.5);
  });

  it("takes a few frames to swing the beam after a flap, not one", () => {
    // Nose-down to nose-up is the jump the player was seeing.
    const from = 0.48;
    const to = -0.31;
    let h = from;
    const frames: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      h = easeToward(h, to, 1 / 60, 0.18);
      frames.push(h);
    }
    // The first frame moves a fraction of the way, not most of it.
    expect((from - frames[0]) / (from - to)).toBeLessThan(0.15);
    // And it is still on its way six frames (100 ms) later.
    expect(frames[5]).toBeGreaterThan(to);
    expect(frames[5]).toBeLessThan(frames[0]);
  });
});

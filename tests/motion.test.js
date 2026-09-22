"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EXERCISES, SOURCES, pickExercise } = require("../src/shared/exercises");
const {
  ease,
  sample,
  pose,
  solveIK,
  length,
  sub,
} = require("../src/shared/motion");
const { SessionClock } = require("../src/shared/session-clock");
const near = (a, b, tolerance = 1e-6) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} ≈ ${b}`);
test("minimum-jerk curve has zero endpoint velocity and acceleration", () => {
  near(ease(0), 0);
  near(ease(1), 1);
  const h = 1e-4;
  for (const x of [0, 1]) {
    const sign = x === 0 ? 1 : -1;
    near((ease(x + sign * h) - ease(x)) / h, 0, 1e-5);
    near(
      (ease(x + 2 * sign * h) - 2 * ease(x + sign * h) + ease(x)) / (h * h),
      0,
      0.01,
    );
  }
});
for (const ex of EXERCISES) {
  test(`${ex.id}: finite poses, fixed bone lengths across the entire routine`, () => {
    for (let t = 0; t <= ex.seconds; t += 1 / 30) {
      const p = pose(ex, sample(ex, t)),
        j = p.joints;
      assert.ok(Object.values(j).flat().every(Number.isFinite));
      for (const s of ["L", "R"])
        for (const [a, b, size] of [
          ["shoulder", "elbow", 47],
          ["elbow", "wrist", 44],
          ["hip", "knee", 61],
          ["knee", "ankle", 68],
          ["ankle", "foot", 24],
          ["wrist", "hand", 14],
        ])
          near(length(sub(j[a + s], j[b + s])), size, 1e-5);
    }
  });
  test(`${ex.id}: timing and side changes match the prescribed timeline`, () => {
    near(sample(ex, ex.seconds).progress, 1);
    assert.equal(sample(ex, ex.seconds).done, true);
    assert.equal(sample(ex, 0).rep, 1);
    assert.equal(sample(ex, ex.seconds).rep, ex.repetitions);
    assert.ok(SOURCES[ex.source].url.startsWith("https://"));
    if (ex.mode === "hold") {
      const cycle = ex.hold + 2 * ex.transition;
      near(sample(ex, ex.transition).amount, 1);
      near(sample(ex, ex.transition + ex.hold).amount, 1);
      near(sample(ex, cycle).amount, 0);
      if (ex.alternate) {
        assert.equal(sample(ex, cycle - 0.001).side, -1);
        assert.equal(sample(ex, cycle).side, 1);
      }
    }
  });
  test(`${ex.id}: no position jumps at repetition or side boundaries`, () => {
    const cycle = ex.mode === "hold" ? ex.hold + 2 * ex.transition : ex.cycle;
    for (let t = cycle; t < ex.seconds; t += cycle) {
      const a = pose(ex, sample(ex, t - 1e-5)).joints,
        b = pose(ex, sample(ex, t + 1e-5)).joints;
      for (const key of Object.keys(a))
        assert.ok(
          length(sub(a[key], b[key])) < 0.01,
          `${key} discontinuity at ${t}`,
        );
    }
  });
}
test("IK clamps unreachable targets while preserving both segment lengths", () => {
  for (const target of [
    [1000, 0, 0],
    [0, 0.001, 0],
    [0, 90, 0],
    [20, 20, 20],
  ]) {
    const { elbow, hand } = solveIK([0, 0, 0], target, 47, 44);
    near(length(elbow), 47);
    near(length(sub(hand, elbow)), 44);
  }
});
test("exercise rotation respects focus and avoids the previous movement", () => {
  for (let i = 0; i < 100; i++) {
    const ex = pickExercise("wrist-extensor", "wrists", []);
    assert.equal(ex.id, "wrist-flexor");
  }
  assert.ok(pickExercise(null, "neck", []).tags.includes("neck"));
});
test("clock is frame-rate independent and does not count pause or sleep time", () => {
  const a = new SessionClock(),
    b = new SessionClock();
  a.start(0);
  b.start(0);
  for (let n = 1; n <= 600; n++) a.tick((n * 1000) / 60);
  for (let n = 1; n <= 1440; n++) b.tick((n * 1000) / 144);
  near(a.elapsed, 10);
  near(b.elapsed, 10);
  a.pause(10000);
  a.start(100000);
  a.tick(101000);
  near(a.elapsed, 11);
  a.tick(200000);
  near(a.elapsed, 11);
  assert.equal(a.interrupted, true);
  assert.equal(a.running, false);
});

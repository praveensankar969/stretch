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
  CAMERA_ANGLES,
  cameraPoint,
  project,
  getCamera,
  torsoOutline,
} = require("../src/shared/motion");
const { SessionClock } = require("../src/shared/session-clock");
const near = (a, b, tolerance = 1e-6) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} ≈ ${b}`);
test("camera rotations preserve 3D distances and front/side axes", () => {
  for (const camera of Object.values(CAMERA_ANGLES)) {
    const a = [18, 142, -35],
      b = [-47, 209, 62];
    near(
      length(sub(cameraPoint(a, camera), cameraPoint(b, camera))),
      length(sub(a, b)),
    );
  }
  const start = [0, 200, 0],
    forward = [0, 200, 60];
  near(
    length(
      sub(
        project(start, CAMERA_ANGLES.front),
        project(forward, CAMERA_ANGLES.front),
      ),
    ),
    0,
  );
  near(
    length(
      sub(
        project(start, CAMERA_ANGLES.side),
        project(forward, CAMERA_ANGLES.side),
      ),
    ),
    60,
  );
});
test("recommended views reveal the movement's primary plane", () => {
  const views = Object.fromEntries(
    EXERCISES.map((ex) => [ex.id, getCamera(ex)]),
  );
  assert.equal(views["neck-turn"].angle, "front");
  assert.equal(views["side-bend"].angle, "front");
  assert.equal(views["ankle-pumps"].angle, "side");
  assert.equal(views["walk-break"].angle, "side");
  assert.equal(views["wrist-extensor"].framing, "wrists");
  assert.equal(views["ankle-pumps"].framing, "ankles");
});
test("all camera angles keep the demonstrated joints inside a fixed frame", () => {
  for (const ex of EXERCISES)
    for (const view of ["guide", "front", "side"]) {
      const camera = getCamera(ex, view),
        [x, y, w, h] = camera.frame;
      for (let t = 0; t <= ex.seconds; t += 0.25) {
        const p = pose(ex, sample(ex, t));
        for (const [name, point] of Object.entries(p.joints)) {
          if (camera.framing === "wrists" && !/elbow|wrist|hand/.test(name))
            continue;
          if (camera.framing === "ankles" && !/knee|ankle|foot/.test(name))
            continue;
          const [a, b] = project(point, camera);
          const margin = name === "head" ? 28 : 13;
          assert.ok(
            a >= x + margin &&
              a <= x + w - margin &&
              b >= y + margin &&
              b <= y + h - margin,
            `${ex.id} ${view}: clipped ${name} at ${t}`,
          );
        }
        // An exact profile still needs a solid torso, not a collapsed plane.
        const outline = torsoOutline(p, camera);
        assert.ok(
          Math.max(...outline.map((p) => p[0])) -
            Math.min(...outline.map((p) => p[0])) >
            30,
        );
      }
    }
});
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

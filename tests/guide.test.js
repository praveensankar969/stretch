'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const load = async () => {
  const { createPerson } = await import('../src/guide/person.mjs');
  const { EXERCISES, performAt, timeline, stillTime } = await import('../src/guide/choreography.mjs');
  const motion = require('../src/shared/motion.js');
  return { person: createPerson(), EXERCISES, performAt, timeline, stillTime, motion };
};
const JOINTS = ['head', 'handL', 'handR', 'foreL', 'foreR', 'fingersL', 'fingersR', 'shinL', 'shinR', 'footL', 'footR'];
const CHAINS = [['armL', 'foreL'], ['foreL', 'handL'], ['armR', 'foreR'], ['foreR', 'handR'], ['thighL', 'shinL'], ['shinL', 'footL'], ['thighR', 'shinR'], ['shinR', 'footR'], ['chest', 'neck'], ['neck', 'head']];
function segmentGap(a, b, c, d) {
  let best = Infinity;
  for (let i = 0; i <= 16; i++) for (let j = 0; j <= 16; j++) best = Math.min(best, a.clone().lerp(b, i / 16).distanceTo(c.clone().lerp(d, j / 16)));
  return best;
}

test('torso skinning is normalized and bound to real bones', async () => {
  const { person } = await load();
  const weights = person.top.geometry.attributes.skinWeight, indices = person.top.geometry.attributes.skinIndex;
  for (let i = 0; i < weights.count; i++) {
    const w = [weights.getX(i), weights.getY(i), weights.getZ(i), weights.getW(i)];
    assert.ok(w.every((v) => Number.isFinite(v) && v >= 0 && v <= 1));
    assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-6);
    for (const n of [indices.getX(i), indices.getY(i), indices.getZ(i), indices.getW(i)]) assert.ok(n < person.skeleton.bones.length);
  }
  person.dispose();
});

test('every exercise keeps bone lengths, stays finite and moves without pops', async () => {
  const { person, EXERCISES, performAt } = await load();
  const dist = ([a, b]) => person.worldPos(a).distanceTo(person.worldPos(b));
  person.update();
  const lengths = CHAINS.map(dist);
  for (const ex of EXERCISES) {
    const dt = 1 / 120, end = Math.min(ex.seconds, 2 * (ex.seconds / ex.repetitions) + 1);
    let prev = null, prevStep = null;
    for (let t = 0; t <= end; t += dt) {
      performAt(person, ex, t);
      CHAINS.forEach((chain, i) => assert.ok(Math.abs(dist(chain) - lengths[i]) < 1e-6, `${ex.id}: ${chain} changed length`));
      const pts = JOINTS.map((n) => person.worldPos(n));
      assert.ok(pts.every((p) => p.toArray().every(Number.isFinite)), `${ex.id}: non-finite joint`);
      if (prev) {
        const steps = pts.map((p, i) => p.distanceTo(prev[i]));
        steps.forEach((s, i) => assert.ok(s < .03, `${ex.id}: ${JOINTS[i]} jumped ${s.toFixed(3)} m at ${t.toFixed(2)} s`));
        // A pop shows up as a sudden change in speed between consecutive frames.
        if (prevStep) steps.forEach((s, i) => assert.ok(s < 2.2 * prevStep[i] + 8e-4, `${ex.id}: ${JOINTS[i]} popped at ${t.toFixed(2)} s`));
        prevStep = steps;
      }
      prev = pts;
    }
  }
  person.dispose();
});

test('feet stay planted and contacts hold', async () => {
  const { person, EXERCISES, performAt, timeline } = await load();
  for (const ex of EXERCISES) {
    if (ex.id === 'walk-break') continue;
    performAt(person, ex, 0);
    const start = { L: person.worldPos('footL'), R: person.worldPos('footR') };
    for (let t = 0; t <= Math.min(ex.seconds, 45); t += .1) {
      const tl = performAt(person, ex, t);
      for (const k of ['L', 'R']) {
        if (ex.id === 'ankle-pumps' && (tl.side > 0 ? 'L' : 'R') === k) continue;
        assert.ok(person.worldPos('foot' + k).distanceTo(start[k]) < 1e-3, `${ex.id}: ${k} foot slid at ${t.toFixed(1)} s`);
      }
      if (ex.id.startsWith('wrist-') && tl.phase === 'Hold gently') {
        const active = tl.side > 0 ? 'L' : 'R', support = tl.side > 0 ? -1 : 1;
        const gap = person.palmPoint(support).distanceTo(person.worldPos('fingers' + active));
        assert.ok(gap < .05, `${ex.id}: supporting hand left the fingers (${gap.toFixed(3)} m)`);
      }
      if (ex.id === 'reset-breath' && t > 2 && t < ex.seconds - 2) {
        for (const s of [1, -1]) {
          const d = person.torsoDistance(person.palmPoint(s), s > 0 ? 'chest' : 'spine');
          assert.ok(d > -.006 && d < .012, `reset-breath: palm ${s} off the body by ${d.toFixed(3)} m at ${t.toFixed(1)} s`);
        }
      }
    }
  }
  person.dispose();
});

test('the shirt drapes over the thighs instead of passing through them', async () => {
  const { person, EXERCISES, performAt } = await load();
  const THREE = await import('three');
  const pos = person.top.geometry.attributes.position, v = new THREE.Vector3();
  const hem = [...Array(pos.count).keys()].filter((i) => pos.getY(i) < 1.04);
  for (const ex of EXERCISES) {
    for (const t of [0, 3, ex.seconds / 2, ex.seconds - 4]) {
      performAt(person, ex, t);
      person.top.skeleton.update();
      const legs = ['L', 'R'].map((k) => [person.worldPos('thigh' + k), person.worldPos('shin' + k)]);
      for (const i of hem) {
        person.top.getVertexPosition(i, v).applyMatrix4(person.top.matrixWorld);
        for (const [a, b] of legs) {
          const ab = b.clone().sub(a), u = Math.min(1, Math.max(0, v.clone().sub(a).dot(ab) / ab.lengthSq()));
          const inside = .077 + (.056 - .077) * u - v.distanceTo(a.clone().addScaledVector(ab, u));
          assert.ok(inside < .004, `${ex.id} at ${t.toFixed(1)} s: shirt is ${(inside * 1000).toFixed(0)} mm inside a thigh`);
        }
      }
    }
  }
  person.dispose();
});

test('crossed and supporting arms never pass through each other', async () => {
  const { person, EXERCISES, performAt } = await load();
  for (const ex of EXERCISES.filter((e) => ['seated-twist', 'wrist-extensor', 'wrist-flexor'].includes(e.id))) {
    for (let t = 0; t <= ex.seconds; t += .1) {
      performAt(person, ex, t);
      const gap = segmentGap(person.worldPos('foreL'), person.worldPos('handL'), person.worldPos('foreR'), person.worldPos('handR'));
      assert.ok(gap > .055, `${ex.id}: forearms intersect at ${t.toFixed(1)} s (${gap.toFixed(3)} m)`);
    }
  }
  person.dispose();
});

test('guide shares the app clock: phases match and every exercise loops seamlessly', async () => {
  const { person, EXERCISES, performAt, timeline, stillTime, motion } = await load();
  for (const ex of EXERCISES) {
    for (let t = 0; t <= ex.seconds; t += .37) {
      const a = timeline(ex, t), b = motion.sample(ex, t);
      assert.equal(a.phase, b.phase); assert.equal(a.rep, b.rep); assert.equal(a.side, b.side);
    }
    performAt(person, ex, 0); const first = JOINTS.map((n) => person.worldPos(n));
    performAt(person, ex, ex.seconds); const last = JOINTS.map((n) => person.worldPos(n));
    first.forEach((p, i) => assert.ok(p.distanceTo(last[i]) < .004, `${ex.id}: ${JOINTS[i]} does not return to the start pose`));
    const still = stillTime(ex);
    assert.ok(still > 0 && still < ex.seconds);
  }
  person.dispose();
});

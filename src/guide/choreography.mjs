import * as THREE from 'three';
import motion from '../shared/motion.js';
import catalog from '../shared/exercises.js';
import { SEAT_HEIGHT, smooth as ease } from './person.mjs';

// Exercise choreography for the Three.js character.
//
// Timing, repetitions, sides and phase labels come from the app's own
// `sample()` so the guide, the cues and the countdown can never drift apart.
// On top of that clock each body part gets its own window inside a transition:
// the eyes lead the head, the head leads the spine, the hands follow the arm.
// Contacts (hands on thighs, the supporting hand, feet on the floor) are solved
// with inverse kinematics every frame, so they hold exactly while the body moves.
// Everything is a pure function of time: seeking, pausing and changing the camera
// can never change the pose.

const { Vector3: V3, Quaternion: Q } = THREE;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
const remap = (u, a, b) => clamp((u - a) / (b - a));
const v = (x, y, z) => new V3(x, y, z);
const suffix = (s) => (s > 0 ? 'L' : 'R');

export const EXERCISES = catalog.EXERCISES;
export const SOURCES = catalog.SOURCES;
export const getExercise = catalog.getExerciseById;
const { sample } = motion;

export function timeline(ex, time) {
  const state = sample(ex, time);
  const T = clamp(time, 0, ex.seconds);
  let u = state.amount, dir = 0, hold = 0;
  if (ex.mode === 'hold') {
    const cycle = ex.hold + 2 * ex.transition;
    const local = T === ex.seconds ? cycle : T - (state.rep - 1) * cycle;
    if (local < ex.transition) { u = local / ex.transition; dir = 1; }
    else if (local < ex.transition + ex.hold) { u = 1; hold = local - ex.transition; }
    else { u = 1 - (local - ex.transition - ex.hold) / ex.transition; dir = -1; }
  }
  return { ...state, T, u, dir, hold, s: state.side || 0 };
}
// A body part's share of a transition. With `lead`, the same part also leads the return.
function part(tl, a, b, lead = false) {
  if (!lead || tl.dir >= 0) return ease(remap(tl.u, a, b));
  return 1 - ease(remap(1 - tl.u, a, b));
}
// Set-up envelope for props like crossed arms: in at the start, out at the very end.
const setup = (tl, ex, dur = 1.4) => ease(tl.T / dur) * (1 - ease((tl.T - (ex.seconds - dur)) / dur));

const BREATH = 5.2;
// Idle motion fades out at both ends of a session so looping playback has no seam.
let idleWeight = 1;
const breathWave = (t) => idleWeight * (.5 - .5 * Math.cos(2 * Math.PI * t / BREATH));
// Hold phases stay alive: each exhale eases a fraction deeper, returning to zero at the edges.
function deepen(tl, ex) {
  if (tl.dir !== 0 || ex.mode !== 'hold') return 0;
  return Math.sin(Math.PI * tl.hold / ex.hold) ** 2 * (1 - breathWave(tl.T));
}
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
function blinkAt(t) {
  let open = 1;
  const P = 4.3, k = Math.floor(t / P);
  const lid = (c) => { const d = t - c; return 1 - .96 * Math.exp(-((d / (d < 0 ? .045 : .085)) ** 2)); };
  for (const j of [k - 1, k, k + 1]) {
    const c = j * P + .7 + hash(j) * 2.6;
    open = Math.min(open, lid(c));
    if (hash(j + .37) > .8) open = Math.min(open, lid(c + .3));
  }
  return open;
}
// Small eye movements that settle between quick shifts.
function saccade(t) {
  const P = 1.9, k = Math.floor(t / P), w = ease((t - k * P) / .07);
  const at = (j) => [(hash(j) - .5) * .5, (hash(j + 9.1) - .5) * .3];
  const a = at(k - 1), b = at(k);
  return [mix(a[0], b[0], w), mix(a[1], b[1], w)];
}

// ---------- poses ----------
const seatedPose = () => ({ hips: [0, 0, 0], spine: [-3, 0, 0], chest: [3, 0, 0], neck: [7, 0, 0], head: [-6, 0, 0], clav: { L: [0, 0], R: [0, 0] }, hipsAt: [0, .58, 0] });
const standingPose = () => ({ hips: [0, 0, 0], spine: [-2, 0, 0], chest: [3, 0, 0], neck: [6, 0, 0], head: [-6, 0, 0], clav: { L: [0, 0], R: [0, 0] }, hipsAt: [0, .938, .005] });
const addTo = (arr, d) => d.forEach((x, i) => (arr[i] += x));
function idleLayer(pose, t, breath = 1) {
  const b = breathWave(t) * breath;
  addTo(pose.spine, [-.8 * b, 0, 0]);
  addTo(pose.chest, [-1.2 * b, 0, 0]);
  const w = idleWeight;
  addTo(pose.head, [.6 * b + w * .5 * Math.sin(t * .29 + 2), w * (.9 * Math.sin(t * .37) + .5 * Math.sin(t * .83 + 1)), w * .4 * Math.sin(t * .23)]);
  for (const k of ['L', 'R']) pose.clav[k][0] += 1.4 * b;
  return b;
}
function applyPose(p, pose) {
  p.bones.hips.position.set(...pose.hipsAt);
  for (const k of ['hips', 'spine', 'chest', 'neck', 'head']) p.rot(k, ...pose[k]);
  for (const [k, s] of [['L', 1], ['R', -1]]) {
    const [elevate, retract] = pose.clav[k];
    p.rot('clav' + k, 0, s * retract, s * elevate);
  }
  p.update();
}
function seatedLegs(p, override = {}) {
  for (const s of [1, -1]) {
    const o = override[suffix(s)] || {};
    p.placeFoot(s, o.ankle || v(s * .15, .08, .43), { yaw: s * 8, pole: v(s * .32, .75, .6), ...o.options });
  }
}
function standingLegs(p) {
  for (const s of [1, -1]) p.placeFoot(s, v(s * .1, .08, .015), { yaw: s * 7, pole: v(s * .05, 0, 1) });
}

// ---------- hand placements: { wrist, q, pole } ----------
function blend(a, b, w, arc = 0) {
  w = clamp(w);
  const wrist = a.wrist.clone().lerp(b.wrist, w);
  wrist.y += arc * Math.sin(Math.PI * w);
  return { wrist, q: a.q.clone().slerp(b.q, w), pole: a.pole.clone().lerp(b.pole, w).normalize() };
}
// Rotate through intermediate orientations so a forearm turns the anatomical way.
function turnThrough(qs, w) {
  const n = qs.length - 1, i = Math.min(n - 1, Math.floor(clamp(w) * n));
  return qs[i].clone().slerp(qs[i + 1], ease(clamp(w) * n - i));
}
function palmAt(p, s, contact, fingers, palmNormal, pole) {
  const q = p.handQuat(s, fingers, palmNormal);
  return { wrist: p.palmToWrist(s, contact, q), q, pole: pole.clone().normalize() };
}
const shoulder = (p, s) => p.worldPos('arm' + suffix(s));
function thighRest(p, s) {
  const k = suffix(s);
  const hip = p.worldPos('thigh' + k), knee = p.worldPos('shin' + k);
  const axis = knee.clone().sub(hip).normalize();
  const up = v(0, 1, 0).addScaledVector(axis, -axis.y).normalize();
  const along = .6, r = mix(.084, .058, along);
  const contact = hip.lerp(knee, along).addScaledVector(up, r).add(v(s * .006, 0, 0));
  return palmAt(p, s, contact, axis.clone().add(v(-s * .08, 0, 0)), up.clone().negate().add(v(-s * .15, 0, 0)), v(s * .8, -.1, -.6));
}
// Palm resting against the outer thigh, as low as a relaxed, nearly straight arm reaches.
// As the torso bends, the hand slides exactly as far as the lean allows.
function thighSide(p, s, reachLength = .5) {
  const k = suffix(s), thigh = p.bones['thigh' + k], S = shoulder(p, s);
  const q = thigh.getWorldQuaternion(new Q());
  const out = v(s, 0, .12).normalize().applyQuaternion(q), down = v(0, -1, .05).applyQuaternion(q);
  const at = (y) => {
    const contact = thigh.localToWorld(v(0, y, .01)).addScaledVector(out, mix(.084, .058, -y / .42) + .002);
    return palmAt(p, s, contact, down, out.clone().negate(), v(s * .9, .1, -.5));
  };
  let hi = -.02, lo = -.36;
  for (let i = 0; i < 22; i++) {
    const mid = (hi + lo) / 2;
    if (at(mid).wrist.distanceTo(S) < reachLength) hi = mid; else lo = mid;
  }
  return at(hi);
}
function hang(p, s, swing = 0) {
  const S = shoulder(p, s), fwd = Math.max(0, swing);
  const dir = v(s * .07, -1, .06).normalize().applyAxisAngle(v(1, 0, 0), -swing);
  const palm = S.clone().addScaledVector(dir, .562 - .05 * fwd);
  const fingers = dir.clone().add(v(0, 0, .12 + .25 * fwd));
  return palmAt(p, s, palm, fingers, v(-s, 0, -.35), v(s * .25, 0, -1));
}

// ---------- the library ----------
const perform = {
  'neck-turn'({ p, tl, t, ex }) {
    const pose = seatedPose(), s = tl.s;
    idleLayer(pose, t);
    const eyes = part(tl, 0, .5, true), head = part(tl, .06, 1, true);
    const yaw = s * (52 * head + 4 * deepen(tl, ex) * head);
    addTo(pose.neck, [0, yaw * .38, 0]);
    addTo(pose.head, [-1.5 * head, yaw * .62, -s * 3 * head]);
    addTo(pose.chest, [0, -yaw * .04, 0]);
    applyPose(p, pose); seatedLegs(p);
    for (const s2 of [1, -1]) p.placeHand(s2, thighRest(p, s2));
    return { look: [s * clamp(1.8 * (eyes - head) + .25 * head, -1, 1), 0] };
  },
  'shoulder-roll'({ p, tl, t }) {
    const pose = seatedPose();
    idleLayer(pose, t, .4);
    const theta = ease(tl.cycleProgress) * Math.PI * 2, sin = Math.sin(theta);
    const elevate = 17 * .5 * (1 - Math.cos(theta)), retract = -sin * (10.5 - 3.5 * sin);
    for (const k of ['L', 'R']) addTo(pose.clav[k], [elevate, retract]);
    const open = Math.max(0, retract) / 14;
    addTo(pose.chest, [-5 * open, 0, 0]);
    addTo(pose.spine, [-1.5 * open, 0, 0]);
    addTo(pose.neck, [-2 * elevate / 17, 0, 0]);
    applyPose(p, pose); seatedLegs(p);
    for (const s of [1, -1]) p.placeHand(s, thighRest(p, s));
    return { breath: .45 * (1 - Math.cos(theta)) / 2 };
  },
  'chest-opener'({ p, tl, t, ex }) {
    const pose = seatedPose();
    idleLayer(pose, t, .5);
    const arms = part(tl, 0, .82), lift = part(tl, .18, 1), d = deepen(tl, ex);
    for (const k of ['L', 'R']) addTo(pose.clav[k], [-2 * lift, 15 * lift + 3 * d]);
    addTo(pose.chest, [-8 * lift - 1.5 * d, 0, 0]);
    addTo(pose.spine, [-2.5 * lift, 0, 0]);
    addTo(pose.neck, [5 * lift, 0, 0]);
    addTo(pose.head, [4.5 * lift, 0, 0]);
    applyPose(p, pose); seatedLegs(p);
    for (const s of [1, -1]) {
      const rest = thighRest(p, s), S = shoulder(p, s);
      const openWrist = S.clone().add(v(s * (.29 + .015 * d), -.39, -.1 - .02 * d));
      const qMid = p.handQuat(s, v(s * .15, -.55, .8), v(-s, 0, 0));
      const qOpen = p.handQuat(s, v(s * .4, -.9, -.1), v(s * .1, .05, 1));
      const target = { wrist: openWrist, q: qOpen, pole: v(s * .35, -.1, -1).normalize() };
      const placed = blend(rest, target, arms, .07);
      placed.q = turnThrough([rest.q, qMid, qOpen], arms);
      p.placeHand(s, placed);
      p.curl(s, mix(22, 4, arms), mix(10, -8, arms));
    }
    return { breath: .5 * lift };
  },
  'seated-twist'({ p, tl, t, ex }) {
    const pose = seatedPose(), s = tl.s;
    idleLayer(pose, t, .6);
    const cross = setup(tl, ex, 1.8), torso = part(tl, .08, 1), head = part(tl, 0, .82, true), d = deepen(tl, ex);
    const yaw = s * (44 * torso + 4 * d);
    addTo(pose.spine, [0, yaw * .32, 0]);
    addTo(pose.chest, [-2 * torso, yaw * .5, 0]);
    addTo(pose.neck, [0, yaw * .08 + s * 5 * head, 0]);
    addTo(pose.head, [0, yaw * .1 + s * 9 * head, 0]);
    applyPose(p, pose); seatedLegs(p);
    // Left forearm over the right: hands on the opposite shoulder and upper chest.
    // Found by searching for clearance between the forearms and against the torso.
    const cq = p.bones.chest.getWorldQuaternion(new Q());
    const dirIn = (x, y, z) => v(x, y, z).applyQuaternion(cq);
    for (const [hs, x, y, fy, pole] of [[1, .083, 1.261, .59, [.96, -.82, .69]], [-1, .082, 1.131, .215, [.94, -.27, .81]]]) {
      const crossed = palmAt(p, hs, p.onShirt('chest', -hs * x, y, .012), dirIn(-hs * .8, fy, .08), dirIn(hs * .3, 0, -1),
        dirIn(hs * pole[0], pole[1], pole[2]));
      p.placeHand(hs, blend(thighRest(p, hs), crossed, cross, .08));
      p.curl(hs, mix(22, 14, cross), 6);
    }
    return { look: [s * clamp(1.4 * (head - torso) + .3 * head, -1, 1), 0] };
  },
  'wrist-extensor'(ctx) { return wristRelease(ctx, 'down'); },
  'wrist-flexor'(ctx) { return wristRelease(ctx, 'up'); },
  'ankle-pumps'({ p, tl, t, ex }) {
    const pose = seatedPose(), s = tl.s;
    idleLayer(pose, t, .6);
    const grip = setup(tl, ex, 1.2);
    const block = tl.T - Math.floor((tl.rep - 1) / ex.sideEvery) * ex.sideEvery * ex.cycle;
    const blockLength = ex.sideEvery * ex.cycle;
    const lift = ease(block / 2) * (1 - ease((block - (blockLength - 2)) / 2));
    addTo(pose.spine, [-3 * lift, 0, 0]);
    addTo(pose.chest, [-1.5 * lift, 0, 0]);
    addTo(pose.neck, [3 * lift, 0, 0]);
    applyPose(p, pose);
    const pitch = mix(-14, 30, tl.amount) * lift;
    seatedLegs(p, {
      [suffix(s)]: {
        ankle: v(s * .15, .08, .43).lerp(v(s * .14, .2, .66), lift),
        options: { pitch: pitch, follow: lift, pole: v(s * .3, .8, .5) },
      },
    });
    for (const hs of [1, -1]) {
      // Palm on the seat, fingers curled over its outer edge.
      const hold = palmAt(p, hs, v(hs * .205, SEAT_HEIGHT + .004, .11), v(hs, -.05, .3), v(0, -1, 0), v(hs * .7, 0, -1));
      p.placeHand(hs, blend(thighRest(p, hs), hold, grip, .05));
      p.curl(hs, mix(22, 78, grip), mix(10, 20, grip));
    }
    return {};
  },
  'side-bend'({ p, tl, t, ex }) {
    const pose = standingPose(), s = tl.s;
    idleLayer(pose, t, .7);
    const bend = part(tl, .05, 1), hip = part(tl, 0, .45, true), d = deepen(tl, ex);
    const angle = 24 * bend + 3 * d;
    pose.hipsAt[0] -= s * .034 * bend;
    pose.hipsAt[1] -= .006 * bend;
    addTo(pose.hips, [0, 0, s * 1.5 * bend]);
    addTo(pose.spine, [0, 0, -s * angle * .38]);
    addTo(pose.chest, [0, 0, -s * angle * .47]);
    addTo(pose.neck, [0, 0, -s * angle * .1]);
    addTo(pose.head, [0, 0, -s * angle * .05]);
    applyPose(p, pose); standingLegs(p);
    p.placeHand(s, thighSide(p, s, mix(.5, .515, bend)));
    p.curl(s, 14, 4);
    const o = -s, waist = p.onShirt('spine', o * .12, 1.02);
    const onHip = palmAt(p, o, waist, v(-o * .15, -.45, 1), v(-o * .9, 0, -.3), v(o, .1, -.35));
    p.placeHand(o, blend(thighSide(p, o), onHip, hip, .05));
    p.curl(o, mix(14, 8, hip), 4);
    return {};
  },
  'reset-breath'({ p, tl, t, ex }) {
    const pose = seatedPose();
    idleLayer(pose, t, 0);
    const a = tl.amount, place = setup(tl, ex, 1.6);
    addTo(pose.spine, [-2 * a, 0, 0]);
    addTo(pose.chest, [-2.5 * a, 0, 0]);
    addTo(pose.head, [-1.5 * a, 0, 0]);
    for (const k of ['L', 'R']) pose.clav[k][0] += 3 * a;
    applyPose(p, pose);
    p.breathe(.25 + 1.05 * a);
    seatedLegs(p);
    const cycle = tl.cycleProgress * ex.cycle;
    const belly = palmAt(p, -1, p.onShirt('spine', -.012, 1.0), v(1, -.2, 0), v(0, .05, -1), v(-.7, -.6, -.3));
    const chest = palmAt(p, 1, p.onShirt('chest', .02, 1.23), v(-1, .15, 0), v(0, 0, -1), v(.7, -.7, -.2));
    p.placeHand(-1, blend(thighRest(p, -1), belly, place, .06));
    p.placeHand(1, blend(thighRest(p, 1), chest, place, .08));
    for (const s of [1, -1]) p.curl(s, mix(22, 10, place), 6);
    const closed = ease((tl.T - 1.2) / 1.6) * (1 - ease((tl.T - (ex.seconds - 2)) / 1.4));
    return { breath: null, closed, mouth: closed * (cycle > 5 ? .5 * Math.sin(Math.PI * (cycle - 5) / 5) : 0) };
  },
  'walk-break'({ p, tl, ex }) {
    const pose = standingPose();
    const T = tl.T, amp = ease(T / 1.8) * (1 - ease((T - (ex.seconds - 1.8)) / 1.8));
    idleLayer(pose, T, .6);
    const period = 1.12, phase = T / period;
    const c = Math.cos(2 * Math.PI * phase), sn = Math.sin(2 * Math.PI * phase);
    pose.hipsAt = [.016 * amp * sn, mix(.938, .93, amp) - .01 * amp * Math.cos(4 * Math.PI * phase), .005];
    const pelvisYaw = -5 * amp * c, roll = 2.5 * amp * sn;
    addTo(pose.hips, [1 * amp, pelvisYaw, roll]);
    addTo(pose.spine, [-1 * amp, -pelvisYaw * .9, -roll * .7]);
    addTo(pose.chest, [0, -pelvisYaw * .9, -roll * .3]);
    addTo(pose.neck, [-1 * amp, pelvisYaw * .45, 0]);
    addTo(pose.head, [-1 * amp, pelvisYaw * .45, 0]);
    applyPose(p, pose);
    const stride = .34 * amp, liftH = .055 * amp;
    for (const s of [1, -1]) {
      const psi = ((phase + (s > 0 ? 0 : .5)) % 1 + 1) % 1;
      const { ankle, pitch } = walkFoot(psi, stride, liftH, amp);
      p.placeFoot(s, v(s * .1, ankle[1], ankle[0] + .02), { pitch, yaw: s * 6, pole: v(0, 0, 1) });
    }
    p.update();
    for (const s of [1, -1]) {
      const swing = 20 * Math.PI / 180 * amp * Math.sin(2 * Math.PI * (phase - (s > 0 ? .25 : .75)));
      p.placeHand(s, hang(p, s, swing));
      p.curl(s, 26, 8);
    }
    return { look: [0, .15 * amp] };
  },
};

// Searched for full reach of the supporting hand, forearm clearance and a nearly straight active arm.
const WRIST = { chestYaw: 7, spineYaw: 5.2, protract: 17.3, reach: [-.128, -.061, .496], pole: [.91, -1, -.08], across: .385 };
function wristRelease({ p, tl, t, ex }, palm) {
  const pose = seatedPose(), s = tl.s || -1, o = -s, W = WRIST;
  idleLayer(pose, t, .6);
  const reach = part(tl, 0, .45), support = part(tl, .28, .78), bend = part(tl, .6, 1), d = deepen(tl, ex);
  addTo(pose.chest, [-1.5 * reach, s * W.chestYaw * support, 0]);
  addTo(pose.spine, [0, s * W.spineYaw * support, 0]);
  addTo(pose.neck, [4 * reach, -s * (W.chestYaw + W.spineYaw) * .5 * support, 0]);
  addTo(pose.head, [5 * reach, -s * (W.chestYaw + W.spineYaw) * .4 * support, 0]);
  pose.clav[suffix(s)][1] -= 4 * reach;
  pose.clav[suffix(o)][1] -= W.protract * support;
  applyPose(p, pose); seatedLegs(p);
  const S = shoulder(p, s);
  const theta = (palm === 'down' ? 52 : 62) * bend + 5 * d;
  const th = theta * Math.PI / 180, ct = Math.cos(th), st = Math.sin(th);
  const inward = v(-s * .12, 0, 0);
  const fingers = v(0, -st, ct).add(inward).normalize();
  const normal = palm === 'down' ? v(0, -ct, -st) : v(0, ct, st);
  const out = { wrist: S.clone().add(v(s * W.reach[0], W.reach[1], W.reach[2])), q: p.handQuat(s, fingers, normal), pole: v(s * .7, -1, -.1).normalize() };
  const rest = thighRest(p, s);
  const active = blend(rest, out, reach, .12);
  if (palm === 'up' && reach < 1) {
    // Supinate through a thumb-up position; bending only begins once the palm faces up.
    const flat = p.handQuat(s, v(-s * .12, 0, 1), v(0, 1, 0));
    active.q = turnThrough([rest.q, p.handQuat(s, v(-s * .1, -.3, 1), v(-s, .1, 0)), flat], reach);
  }
  p.placeHand(s, active);
  p.curl(s, mix(22, 2, reach), mix(10, 0, reach));
  // The supporting hand rests across the fingers of the active hand.
  const k = suffix(s), aq = p.bones['hand' + k].getWorldQuaternion(new Q());
  const { f, n } = p.handAxes(s, aq);
  const base = p.worldPos('fingers' + k).addScaledVector(f, .03);
  const contact = palm === 'down' ? base.addScaledVector(n, -.013) : base.addScaledVector(n, .012);
  const across = v(s, 0, W.across).addScaledVector(f, -f.x).normalize();
  const held = palmAt(p, o, contact, across, palm === 'down' ? n : n.clone().negate(), v(o * W.pole[0], W.pole[1], W.pole[2]));
  p.placeHand(o, blend(thighRest(p, o), held, support, .1));
  p.curl(o, mix(22, palm === 'down' ? 16 : 24, support), mix(10, 18, support));
  return { look: [0, -.35 * reach] };
}

// In-place walking foot: heel strike, rolling stance, toe-off pivoting on the ball of the foot.
function walkFoot(psi, stride, lift, amp) {
  const stanceEnd = .6, heel = [-.06, -.08], ball = [.13, -.08];
  const pivot = (z, pitchDeg, around) => {
    const a = pitchDeg * Math.PI / 180, dz = -around[0], dy = -around[1];
    return [z + around[0] + dz * Math.cos(a) + dy * Math.sin(a), .08 + around[1] - dz * Math.sin(a) + dy * Math.cos(a)];
  };
  const stance = (w) => {
    const z = stride / 2 - stride * w;
    const strike = -14 * amp * (1 - ease(w / .16)), toe = 32 * amp * ease((w - .68) / .32);
    if (strike < 0) return { ankle: pivot(z, strike, heel), pitch: strike };
    return { ankle: pivot(z, toe, ball), pitch: toe };
  };
  if (psi < stanceEnd) return stance(psi / stanceEnd);
  const w = (psi - stanceEnd) / (1 - stanceEnd), a = stance(1), b = stance(0);
  // Hermite swing whose end velocities match the stance belt speed: no pop at toe-off or heel strike.
  const m = -stride * (1 - stanceEnd) / stanceEnd, w2 = w * w, w3 = w2 * w;
  const z = (2 * w3 - 3 * w2 + 1) * a.ankle[0] + (w3 - 2 * w2 + w) * m + (-2 * w3 + 3 * w2) * b.ankle[0] + (w3 - w2) * m;
  // Clearance peaks early in the swing and leaves and meets the floor with no vertical snap.
  const arc = Math.sin(Math.PI * (w + .35 * w * (1 - w))) ** 2;
  return {
    ankle: [z, mix(a.ankle[1], b.ankle[1], ease(w)) + lift * arc],
    pitch: mix(a.pitch, b.pitch, ease(w)),
  };
}

// Pose the whole character for an exercise at a moment in its session clock.
export function performAt(person, ex, time) {
  person.reset();
  const tl = timeline(ex, time);
  idleWeight = ease(clamp(Math.min(tl.T, ex.seconds - tl.T) / 1.2, 0, 1));
  const result = perform[ex.id]({ p: person, tl, t: time, ex }) || {};
  if (result.breath !== null) person.breathe(.3 * breathWave(time) + (result.breath || 0));
  const blink = Math.min(blinkAt(time), 1 - .94 * (result.closed || 0));
  const drift = saccade(time).map((x) => x * idleWeight), look = result.look || [0, 0];
  person.face({ blink, look: [look[0] + drift[0] * (1 - Math.abs(look[0])), look[1] + drift[1]], mouth: result.mouth || 0 });
  person.update();
  return tl;
}
// A representative still for reduced motion: well into the first hold.
export function stillTime(ex) {
  if (ex.mode === 'hold') return ex.transition + Math.min(1.2, ex.hold / 2);
  if (ex.id === 'ankle-pumps') return 2 + ex.cycle / 2;
  if (ex.id === 'walk-break') return 6.3;
  return ex.cycle * .5;
}

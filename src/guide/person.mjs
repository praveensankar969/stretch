import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Everything is built locally from signed-distance functions and lathe profiles.
// No downloaded models, textures or motion clips.
const { Vector2: V2, Vector3: V3, Quaternion: Q, Matrix4: M4 } = THREE;
const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;
export const DEG = Math.PI / 180;
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * t * (10 + t * (-15 + 6 * t)); };

export const PALETTE = {
  skin: '#d4a07f', palm: '#e7bea1', lips: '#b06a55', hair: '#2d2824', eye: '#27211d',
  shirt: '#89a37e', shirtDeep: '#6f8a66', pants: '#2e5347', shoe: '#ece4d2', sole: '#f8f4ea', accent: '#c98f5f',
  seat: '#eee7d7', wood: '#b99873',
};

// ---------- signed-distance sculpting ----------
const union = (a, b, k = .03) => { const h = clamp(.5 + .5 * (b - a) / k, 0, 1); return mix(b, a, h) - k * h * (1 - h); };
const cut = (a, b, k = .01) => -union(-a, -b, k);
function ellipsoid(x, y, z, c, r) {
  const px = x - c[0], py = y - c[1], pz = z - c[2];
  const k0 = Math.hypot(px / r[0], py / r[1], pz / r[2]);
  const k1 = Math.hypot(px / (r[0] * r[0]), py / (r[1] * r[1]), pz / (r[2] * r[2]));
  return k1 < 1e-8 ? -Math.min(...r) : k0 * (k0 - 1) / k1;
}
function tube(x, y, z, a, b, ra, rb) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy + (z - a[2]) * dz) / (dx * dx + dy * dy + dz * dz), 0, 1);
  return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t, z - a[2] - dz * t) - mix(ra, rb, t);
}
function roundBox(x, y, z, c, h, r) {
  const qx = Math.abs(x - c[0]) - h[0], qy = Math.abs(y - c[1]) - h[1], qz = Math.abs(z - c[2]) - h[2];
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}
function sculpt(sdf, bounds, resolution = 64) {
  const cubes = new MarchingCubes(resolution, new THREE.MeshBasicMaterial(), false, false, 90000);
  cubes.isolation = 0;
  const [min, max] = bounds, size = max.map((v, i) => v - min[i]);
  for (let z = 0; z < resolution; z++) for (let y = 0; y < resolution; y++) for (let x = 0; x < resolution; x++) {
    cubes.field[x + y * resolution + z * resolution * resolution] =
      -sdf(min[0] + x / resolution * size[0], min[1] + y / resolution * size[1], min[2] + z / resolution * size[2]);
  }
  cubes.update();
  const positions = cubes.positionArray.slice(0, cubes.count * 3);
  const normals = cubes.normalArray.slice(0, cubes.count * 3);
  for (let i = 0; i < positions.length; i += 3) {
    for (let a = 0; a < 3; a++) { positions[i + a] = min[a] + (positions[i + a] + 1) * size[a] / 2; normals[i + a] /= size[a]; }
    const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    for (let a = 0; a < 3; a++) normals[i + a] /= l;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  const welded = mergeVertices(geometry, 1e-5);
  geometry.dispose(); cubes.geometry.dispose(); cubes.material.dispose();
  return welded;
}
// Point on the surface of `sdf`, marching from `from` along `dir`.
function surfacePoint(sdf, from, dir, range = .2) {
  let lo = 0, hi = range;
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2, p = from.map((v, a) => v + dir[a] * m);
    if (sdf(...p) < 0) lo = m; else hi = m;
  }
  return from.map((v, a) => v + dir[a] * (lo + hi) / 2);
}

// ---------- lathe primitives (exact, smooth limbs) ----------
// A round cone from a sphere of radius r0 at y=0 to a sphere of radius r1 at y=-length.
// Adjacent limbs share the joint sphere, so bending never opens a seam.
function capsule(r0, r1, length, radial = 36, seg = 12) {
  const alpha = Math.asin(clamp((r0 - r1) / length, -1, 1)), pts = [];
  for (let i = 0; i <= seg; i++) { const a = -Math.PI / 2 + (alpha + Math.PI / 2) * i / seg; pts.push(new V2(Math.max(1e-5, r1 * Math.cos(a)), -length + r1 * Math.sin(a))); }
  for (let i = 0; i <= seg; i++) { const a = alpha + (Math.PI / 2 - alpha) * i / seg; pts.push(new V2(Math.max(1e-5, r0 * Math.cos(a)), r0 * Math.sin(a))); }
  return new THREE.LatheGeometry(pts, radial);
}
// A short sleeve: shoulder cap, gentle taper and a folded hem that tucks inside the arm.
function sleeve(r0, r1, length, inner, radial = 36) {
  const alpha = Math.asin(clamp((r0 - r1) / length, -1, 1)), pts = [];
  pts.push(new V2(inner, -length + .012), new V2(r1 - .003, -length - .002), new V2(r1 + .0015, -length + .004), new V2(r1 + .002, -length + .014));
  for (let i = 0; i <= 12; i++) { const a = alpha + (Math.PI / 2 - alpha) * i / 12; pts.push(new V2(Math.max(1e-5, r0 * Math.cos(a)), r0 * Math.sin(a))); }
  return new THREE.LatheGeometry(pts, radial);
}

// ---------- materials ----------
const fabric = (color, sheenColor = '#ffffff', roughness = .9) =>
  new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0, sheen: .55, sheenRoughness: .7, sheenColor });
const matte = (color, roughness = .7) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
function add(parent, geometry, material, position) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = true; m.receiveShadow = true;
  if (position) m.position.set(...position);
  parent.add(m); return m;
}
function oval(parent, material, position, scale) {
  const m = add(parent, new THREE.SphereGeometry(1, 24, 16), material, position); m.scale.set(...scale); return m;
}
function curve(parent, material, points, radius) {
  return add(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new V3(...p))), 24, radius, 8, false), material);
}

// ---------- skeleton layout (metres; faces +z, character's left is +x) ----------
export const RIG = {
  hips: [0, .95, 0], spine: [0, .11, 0], chest: [0, .15, 0], neck: [0, .198, -.012], head: [0, .084, .014],
  clav: [.03, .165, 0], arm: [.15, 0, -.01], fore: [0, -.28, 0], hand: [0, -.245, 0], fingers: [0, -.088, 0], thumb: [-.006, -.022, .03],
  thigh: [.09, -.03, 0], shin: [0, -.42, 0], foot: [0, -.42, 0],
};
// Palm contact point relative to the wrist: along the fingers, and out through the palm.
export const PALM = { along: .05, out: .014 };

// ---------- body parts ----------
const shirtProfile = [[.855, .186, .12, -.004], [.95, .176, .112, -.004], [1.06, .15, .1, 0], [1.2, .161, .108, .006], [1.3, .168, .106, .004], [1.36, .15, .094, -.004], [1.41, .098, .074, -.008], [1.455, .058, .054, -.008]];
function profileAt(y, index) {
  const s = shirtProfile;
  if (y <= s[0][0]) return s[0][index];
  if (y >= s.at(-1)[0]) return s.at(-1)[index];
  for (let i = 0; i < s.length - 1; i++) if (y <= s[i + 1][0]) {
    const a = s[i], b = s[i + 1], p = s[Math.max(0, i - 1)], n = s[Math.min(s.length - 1, i + 2)];
    const span = b[0] - a[0], t = (y - a[0]) / span;
    const m0 = (b[index] - p[index]) / (b[0] - p[0]) * span, m1 = (n[index] - a[index]) / (n[0] - a[0]) * span;
    return (2 * t ** 3 - 3 * t * t + 1) * a[index] + (t ** 3 - 2 * t * t + t) * m0 + (-2 * t ** 3 + 3 * t * t) * b[index] + (t ** 3 - t * t) * m1;
  }
}
const SHOULDER_Y = RIG.hips[1] + RIG.spine[1] + RIG.chest[1] + RIG.clav[1];
const SHOULDER_X = RIG.clav[0] + RIG.arm[0];
function shirtSDF(x, y, z) {
  const rx = profileAt(y, 1), rz = profileAt(y, 2), zc = profileAt(y, 3);
  let d = (Math.hypot(x / rx, (z - zc) / rz) - 1) * Math.min(rx, rz);
  for (const s of [-1, 1]) {
    d = union(d, tube(x, y, z, [s * .05, SHOULDER_Y + .05, -.012], [s * (SHOULDER_X - .01), SHOULDER_Y, -.01], .05, .054), .045);
    d = union(d, ellipsoid(x, y, z, [s * (SHOULDER_X - .005), SHOULDER_Y - .005, -.01], [.056, .058, .056]), .03);
  }
  d = cut(d, .858 - y, .006);
  d = Math.max(d, y - 1.462);
  if (y > 1.40) d = cut(d, .047 - Math.hypot(x, z + .008), .006);
  return d;
}
// Rib-cage and belly expansion for one full breath (morph influence 1).
function breathOffset(x, y, z) {
  const ribs = smooth((y - 1.08) / .1) * (1 - smooth((y - 1.36) / .08));
  const belly = smooth((y - .93) / .06) * (1 - smooth((y - 1.12) / .08)) * smooth(z / .05);
  const front = .5 + .5 * smooth((z + .02) / .08);
  return [x * .035 * ribs, .004 * ribs, z * (.06 * ribs * front + .09 * belly)];
}
function pelvisSDF(x, y, z) {
  let d = ellipsoid(x, y, z, [0, -.035, -.008], [.158, .112, .11]);
  for (const s of [-1, 1]) {
    d = union(d, ellipsoid(x, y, z, [s * RIG.thigh[0], RIG.thigh[1], 0], [.079, .079, .079]), .02);
    d = union(d, ellipsoid(x, y, z, [s * .062, -.07, -.045], [.082, .075, .07]), .03);
  }
  return Math.max(d, y - .04);
}
function headSDF(x, y, z) {
  let d = ellipsoid(x, y, z, [0, .105, .012], [.092, .112, .1]);
  d = union(d, ellipsoid(x, y, z, [0, .048, .036], [.069, .058, .07]), .035);
  d = union(d, ellipsoid(x, y, z, [0, .087, .105], [.0105, .017, .013]), .011);
  for (const s of [-1, 1]) d = union(d, ellipsoid(x, y, z, [s * .091, .09, .004], [.014, .024, .012]), .008);
  return d;
}
// A short, modern cut: close at the sides and nape, fuller on top, swept to one side.
function hairSDF(x, y, z) {
  let d = ellipsoid(x, y, z, [0, .107, .008], [.0965, .119, .1065]);
  d = union(d, ellipsoid(x, y, z, [.004, .158, .008], [.082, .068, .096]), .03);
  d = union(d, ellipsoid(x, y, z, [-.012, .182, .052], [.07, .036, .058]), .028);
  d = union(d, ellipsoid(x, y, z, [.026, .176, .08], [.048, .026, .032]), .018);
  // Hairline: forehead, a soft sideburn in front of the ear, and a tapered nape.
  const f = Math.cos(Math.atan2(x, z - .01));
  const hairline = Math.max(.035, .102 + .058 * f - .045 * Math.max(0, -f) - .024 * Math.exp(-(((f - .3) / .13) ** 2)));
  return cut(d, hairline - y, .01);
}
function createHead(parent, skin, hairMat) {
  const group = new THREE.Group(); parent.add(group);
  add(group, sculpt(headSDF, [[-.12, -.03, -.1], [.12, .23, .14]], 76), skin);
  add(group, sculpt(hairSDF, [[-.12, .02, -.12], [.12, .245, .14]], 80), hairMat);
  const face = (x, y) => surfacePoint(headSDF, [x, y, 0], [0, 0, 1], .16);
  const eyeMat = matte(PALETTE.eye, .35), shine = new THREE.MeshBasicMaterial({ color: '#fffaf0' });
  const browMat = matte('#3a302a', .8), eyes = [];
  for (const s of [-1, 1]) {
    const p = face(s * .034, .107);
    const eye = new THREE.Group(); eye.position.set(p[0], p[1], p[2] - .0035); group.add(eye);
    oval(eye, eyeMat, [0, 0, 0], [.0075, .0105, .0045]);
    oval(eye, shine, [-.0022, .0035, .0036], [.0017, .0017, .0008]).castShadow = false;
    eyes.push(eye);
    curve(group, browMat, [[s * .018, .132], [s * .034, .137], [s * .05, .132]].map(([x, y]) => { const q = face(x, y); return [q[0], q[1], q[2] + .0004]; }), .0022);
  }
  const mouth = new THREE.Group(); group.add(mouth);
  curve(mouth, matte(PALETTE.lips, .6), [[-.016, .047], [0, .042], [.016, .047]].map(([x, y]) => { const q = face(x, y); return [q[0], q[1], q[2] + .0003]; }), .0017);
  return { group, eyes, mouth, eyeBase: eyes.map((e) => e.position.clone()) };
}
function palmSDF(s) {
  return (x, y, z) => {
    x *= s;
    let d = roundBox(x, y, z, [.001, -.052, .002], [.004, .033, .028], .011);
    d = union(d, tube(x, y, z, [0, .02, 0], [0, -.028, 0], .027, .025), .016);
    d = union(d, ellipsoid(x, y, z, [-.004, -.036, .026], [.014, .026, .015]), .012);
    return d;
  };
}
const FINGERS = [[.026, .066], [.009, .074], [-.009, .071], [-.025, .057]];
function fingersSDF(s) {
  return (x, y, z) => {
    x *= s;
    let d = Infinity;
    for (const [fz, len] of FINGERS) d = union(d, tube(x, y, z, [0, .012, fz], [-.002, -len, fz * 1.1], .0105, .0086), .0035);
    return d;
  };
}
function thumbSDF(s) {
  const dir = new V3(-.25, -.75, .6).normalize().multiplyScalar(.05);
  return (x, y, z) => tube(x * s, y, z, [0, 0, 0], dir.toArray(), .0125, .0095);
}
function createShoe(parent, side) {
  const group = new THREE.Group(); parent.add(group);
  const body = (x, y, z) => union(ellipsoid(x, y, z, [0, -.036, -.01], [.047, .054, .058]), ellipsoid(x, y, z, [0, -.05, .082], [.05, .04, .112]), .035);
  add(group, sculpt((x, y, z) => Math.max(body(x, y, z), -.066 - y), [[-.07, -.1, -.08], [.07, .03, .22]], 60), fabric(PALETTE.shoe, '#ffffff', .85));
  // The sole follows the shoe's own footprint, with a small rounded lip.
  const footprint = (x, z) => body(x, -.063, z) - .0015;
  const sole = (x, y, z) => Math.max(footprint(x, z) + .003, Math.abs(y + .0725) - .0045) - .003;
  add(group, sculpt(sole, [[-.065, -.09, -.08], [.065, -.058, .21]], 56), matte(PALETTE.sole, .8));
  const lace = matte('#fbf8f0', .7);
  for (const z of [.035, .055, .075]) {
    const top = surfacePoint(body, [0, -.03, z], [0, 1, 0], .08);
    curve(group, lace, [[-.017, top[1] - .003, z], [0, top[1] + .0012, z], [.017, top[1] - .003, z]], .0017);
  }
  oval(group, matte(PALETTE.accent, .7), [side * .045, -.048, .03], [.004, .01, .03]);
  return group;
}

export function createPerson() {
  const group = new THREE.Group(); group.name = 'StretchCharacter';
  const skin = new THREE.MeshPhysicalMaterial({ color: PALETTE.skin, roughness: .62, metalness: 0, sheen: .3, sheenRoughness: .5, sheenColor: '#ffd3bb' });
  const palm = matte(PALETTE.palm, .7);
  const hair = matte(PALETTE.hair, .55), shirt = fabric(PALETTE.shirt, '#eef5e6'), pants = fabric(PALETTE.pants, '#8fb3a4', .92);
  const bones = [], named = {};
  const bone = (name, parent, offset, order = 'XZY') => {
    const b = new THREE.Bone(); b.name = name; b.position.set(...offset); b.rotation.order = order;
    parent.add(b); bones.push(b); named[name] = b; return b;
  };
  const hips = bone('hips', group, RIG.hips, 'YXZ');
  const spine = bone('spine', hips, RIG.spine, 'YXZ');
  const chest = bone('chest', spine, RIG.chest, 'YXZ');
  const neck = bone('neck', chest, RIG.neck, 'YXZ');
  const headBone = bone('head', neck, RIG.head, 'YXZ');
  const sides = { L: 1, R: -1 };
  for (const [k, s] of Object.entries(sides)) {
    const m = (p) => [p[0] * s, p[1], p[2]];
    const clav = bone('clav' + k, chest, m(RIG.clav));
    const arm = bone('arm' + k, clav, m(RIG.arm));
    const fore = bone('fore' + k, arm, RIG.fore);
    const hand = bone('hand' + k, fore, RIG.hand);
    bone('fingers' + k, hand, RIG.fingers);
    bone('thumb' + k, hand, m(RIG.thumb));
    const thigh = bone('thigh' + k, hips, m(RIG.thigh));
    const shin = bone('shin' + k, thigh, RIG.shin);
    bone('foot' + k, shin, RIG.foot);
  }
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const index = (name) => bones.indexOf(named[name]);

  // Torso: one continuous shirt, weighted smoothly along the spine and into the clavicles.
  const torsoGeometry = sculpt(shirtSDF, [[-.27, .84, -.14], [.27, 1.475, .15]], 84);
  const pos = torsoGeometry.attributes.position, si = [], sw = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const hipW = 1 - smooth((y - .9) / .13), upper = 1 - hipW;
    let chestW = upper * smooth((y - 1.1) / .17);
    const spineW = upper - chestW;
    const clavW = chestW * smooth((Math.abs(x) - .075) / .085) * smooth((y - 1.27) / .09);
    chestW -= clavW;
    si.push(index('hips'), index('spine'), index('chest'), index(x > 0 ? 'clavL' : 'clavR'));
    sw.push(hipW, spineW, chestW, clavW);
  }
  torsoGeometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  torsoGeometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  const breathing = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) breathing.set(breathOffset(pos.getX(i), pos.getY(i), pos.getZ(i)), i * 3);
  torsoGeometry.morphAttributes.position = [new THREE.BufferAttribute(breathing, 3)];
  torsoGeometry.morphTargetsRelative = true;
  const bindPos = pos.array.slice(), normals = torsoGeometry.attributes.normal, bindNormals = normals.array.slice();
  const hem = [];
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 1.04) hem.push(i);
  const top = new THREE.SkinnedMesh(torsoGeometry, shirt);
  top.castShadow = top.receiveShadow = true; top.frustumCulled = false;
  group.add(top); top.bind(skeleton); top.updateMorphTargets();
  const collar = add(chest, new THREE.TorusGeometry(.049, .0075, 12, 48), fabric(PALETTE.shirtDeep), [0, 1.453 - RIG.hips[1] - RIG.spine[1] - RIG.chest[1], -.008]);
  collar.rotation.x = Math.PI / 2;

  add(hips, sculpt(pelvisSDF, [[-.19, -.17, -.15], [.19, .06, .14]], 64), pants);
  add(neck, capsule(.047, .05, .13), skin, [0, .11, 0]);
  const head = createHead(headBone, skin, hair);
  head.group.scale.setScalar(1.07);

  const hands = {};
  for (const [k, s] of Object.entries(sides)) {
    add(named['arm' + k], capsule(.045, .036, .28), skin);
    add(named['arm' + k], sleeve(.063, .056, .135, .041), shirt);
    add(named['fore' + k], capsule(.036, .027, .245), skin);
    const p = palmSDF(s);
    add(named['hand' + k], sculpt(p, [[-.04, -.1, -.05], [.04, .035, .05]], 48), skin);
    const pad = surfacePoint(p, [0, -.055, .002], [-s, 0, 0], .05);
    oval(named['hand' + k], palm, [pad[0] + s * .0022, pad[1], pad[2]], [.003, .031, .027]);
    add(named['fingers' + k], sculpt(fingersSDF(s), [[-.02, -.09, -.045], [.02, .025, .045]], 48), skin);
    add(named['thumb' + k], sculpt(thumbSDF(s), [[-.03, -.06, -.02], [.03, .02, .05]], 36), skin);
    add(named['thigh' + k], capsule(.077, .056, .42), pants);
    add(named['shin' + k], capsule(.056, .046, .405), pants);
    createShoe(named['foot' + k], s);
    hands[k] = named['hand' + k];
  }

  const rest = new Map(bones.map((b) => [b, b.position.clone()]));
  const _q = new Q(), _v = new V3(), _m = new M4();
  const worldPos = (name, target = new V3()) => named[name].getWorldPosition(target);

  function reset() {
    for (const b of bones) { b.position.copy(rest.get(b)); b.quaternion.identity(); }
    top.morphTargetInfluences[0] = 0;
    for (const [i, e] of head.eyes.entries()) { e.scale.set(1, 1, 1); e.position.copy(head.eyeBase[i]); }
    head.mouth.scale.set(1, 1, 1);
  }
  // Euler angles in degrees, in each bone's own order.
  function rot(name, x = 0, y = 0, z = 0) { named[name].rotation.set(x * DEG, y * DEG, z * DEG); }
  function turn(name, x = 0, y = 0, z = 0) {
    const b = named[name], e = new THREE.Euler(x * DEG, y * DEG, z * DEG, b.rotation.order);
    b.quaternion.multiply(_q.setFromEuler(e));
  }
  // Rotate `bone` so the direction toward its child points at a world position.
  function aim(b, child, target) {
    const origin = b.getWorldPosition(new V3());
    const dir = target.clone().sub(origin);
    if (dir.lengthSq() < 1e-12) return;
    dir.normalize().applyQuaternion(b.parent.getWorldQuaternion(new Q()).invert());
    b.quaternion.setFromUnitVectors(child.position.clone().normalize(), dir);
    b.updateMatrixWorld(true);
  }
  // Analytic two-bone IK with a pole direction. Bone lengths are fixed by construction.
  function solve(rootName, midName, endName, target, pole, softness = .97) {
    const root = named[rootName], mid = named[midName], end = named[endName];
    const l1 = mid.position.length(), l2 = end.position.length();
    const a = root.getWorldPosition(new V3());
    const axis = target.clone().sub(a);
    // Soft reach limit: the chain eases into full extension instead of snapping straight.
    const reach = l1 + l2, soft = reach * softness;
    let dist = axis.length();
    if (dist > soft) dist = soft + (reach - soft) * (1 - Math.exp(-(dist - soft) / (reach - soft)));
    dist = clamp(dist, Math.abs(l1 - l2) + 1e-4, reach - 1e-4);
    axis.normalize();
    const n = pole.clone().sub(axis.clone().multiplyScalar(pole.dot(axis)));
    if (n.lengthSq() < 1e-10) n.set(0, 0, 1);
    n.normalize();
    const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    const joint = a.clone().addScaledVector(axis, x).addScaledVector(n, h);
    aim(root, mid, joint);
    aim(mid, end, a.clone().addScaledVector(axis, dist));
  }
  function orient(b, x, y, z) {
    _m.makeBasis(x, y, z);
    const world = new Q().setFromRotationMatrix(_m);
    b.quaternion.copy(b.parent.getWorldQuaternion(new Q()).invert().multiply(world));
    b.updateMatrixWorld(true);
  }
  // World orientation of a hand from finger direction and palm normal.
  function handQuat(s, fingers, palmNormal) {
    const f = fingers.clone().normalize();
    const n = palmNormal.clone().addScaledVector(f, -palmNormal.dot(f)).normalize();
    const X = n.clone().multiplyScalar(-s), Y = f.clone().negate(), Z = new V3().crossVectors(X, Y);
    return new Q().setFromRotationMatrix(new M4().makeBasis(X, Y, Z));
  }
  const handAxes = (s, q) => ({
    f: new V3(0, -1, 0).applyQuaternion(q),
    n: new V3(-s, 0, 0).applyQuaternion(q),
  });
  // Convert a desired palm contact into a wrist position for that hand orientation.
  function palmToWrist(s, contact, q) {
    const { f, n } = handAxes(s, q);
    return contact.clone().addScaledVector(f, -PALM.along).addScaledVector(n, -PALM.out);
  }
  function placeHand(s, { wrist, q, pole }) {
    const k = s > 0 ? 'L' : 'R';
    solve('arm' + k, 'fore' + k, 'hand' + k, wrist, pole);
    const m = new M4().makeRotationFromQuaternion(q), x = new V3(), y = new V3(), z = new V3();
    m.extractBasis(x, y, z);
    orient(named['hand' + k], x, y, z);
  }
  function palmPoint(s) {
    const k = s > 0 ? 'L' : 'R', q = named['hand' + k].getWorldQuaternion(new Q());
    const { f, n } = handAxes(s, q);
    return worldPos('hand' + k).addScaledVector(f, PALM.along).addScaledVector(n, PALM.out);
  }
  function curl(s, fingers = 0, thumb = 0) {
    const k = s > 0 ? 'L' : 'R';
    rot('fingers' + k, 0, 0, -s * fingers);
    rot('thumb' + k, thumb * .3, 0, -s * thumb);
  }
  // Plant the ankle at a world position. The foot keeps a world pitch/yaw, or with
  // `follow` blends toward a pitch measured from the shin (for a lifted leg).
  function placeFoot(s, ankle, { pitch = 0, yaw = 0, pole = new V3(0, 0, 1), follow = 0 } = {}) {
    const k = s > 0 ? 'L' : 'R';
    solve('thigh' + k, 'shin' + k, 'foot' + k, ankle, pole, .993);
    const e = (p) => new Q().setFromEuler(new THREE.Euler(p * DEG, yaw * DEG, 0, 'YXZ'));
    const q = e(pitch);
    if (follow > 0) q.slerp(named['shin' + k].getWorldQuaternion(new Q()).multiply(e(pitch)), follow);
    const x = new V3(1, 0, 0).applyQuaternion(q), y = new V3(0, 1, 0).applyQuaternion(q), z = new V3(0, 0, 1).applyQuaternion(q);
    orient(named['foot' + k], x, y, z);
  }
  // A rest-pose shirt point, carried by the skeleton and the current breath, as skinning would.
  const shirtFront = (x, y) => surfacePoint(shirtSDF, [x, y, 0], [0, 0, 1], .2);
  function onShirt(boneName, x, y, lift = 0) {
    const rest = new V3(...shirtFront(x, y)), breath = breathOffset(rest.x, rest.y, rest.z);
    rest.add(new V3(...breath).multiplyScalar(top.morphTargetInfluences[0])).add(new V3(0, 0, lift));
    const b = named[boneName];
    return rest.applyMatrix4(skeleton.boneInverses[bones.indexOf(b)]).applyMatrix4(b.matrixWorld);
  }
  // Signed distance from a world point to the shirt, measured in a bone's rest frame.
  function torsoDistance(point, boneName = 'chest') {
    const b = named[boneName];
    const restPoint = point.clone().applyMatrix4(new M4().copy(b.matrixWorld).invert()).applyMatrix4(new M4().copy(skeleton.boneInverses[bones.indexOf(b)]).invert());
    return shirtSDF(restPoint.x, restPoint.y, restPoint.z);
  }
  function face({ blink = 1, look = [0, 0], mouth = 0 } = {}) {
    for (const [i, e] of head.eyes.entries()) {
      e.scale.y = Math.max(.08, blink);
      e.position.copy(head.eyeBase[i]).add(_v.set(look[0] * .0055, look[1] * .004, 0));
    }
    head.mouth.scale.set(1 - mouth * .25, 1 + mouth * 2.2, 1);
  }
  function breathe(amount) { top.morphTargetInfluences[0] = amount; }
  // The hem is sculpted for standing. Wherever a raised thigh would pass through it, lift the fabric onto
  // the thigh so it rests on the lap. Morph targets are baked into a GPU texture once, so this edits the
  // bind-pose positions (the breath morph is relative and still applies on top).
  const THIGH = { r0: .077, r1: .056, length: .42, clearance: .008 };
  const _rel = new V3(), _r = new V3();
  function drape() {
    const axes = Object.entries(sides).map(([k, s]) => {
      const dir = new V3(0, -1, 0).applyQuaternion(named['thigh' + k].quaternion);
      const up = new V3(0, 1, 0).addScaledVector(dir, -dir.y);
      return { dir, up: up.lengthSq() > 1e-6 ? up.normalize() : null, joint: new V3(s * RIG.thigh[0], RIG.hips[1] + RIG.thigh[1], 0) };
    });
    const breath = torsoGeometry.morphAttributes.position[0].array, b = top.morphTargetInfluences[0];
    const p = new V3();
    for (const i of hem) {
      const o = i * 3;
      p.set(bindPos[o] + b * breath[o], bindPos[o + 1] + b * breath[o + 1], bindPos[o + 2] + b * breath[o + 2]);
      const n = new V3().fromArray(bindNormals, o);
      for (const { dir, up, joint } of axes) {
        if (!up) continue;
        _rel.subVectors(p, joint);
        const t = Math.min(THIGH.length, Math.max(0, _rel.dot(dir)));
        _r.copy(_rel).addScaledVector(dir, -t);
        const R = THIGH.r0 + (THIGH.r1 - THIGH.r0) * t / THIGH.length + THIGH.clearance, d2 = _r.lengthSq();
        if (d2 >= R * R) continue;
        // Push outward, biased upward. A bias below 1 keeps the push radial enough to fade to zero at the
        // thigh surface, so the fold has no seam.
        const e = _r.clone().divideScalar(Math.sqrt(d2) + 1e-9).addScaledVector(up, .8).normalize();
        const re = _r.dot(e), k = -re + Math.sqrt(re * re - d2 + R * R);
        p.addScaledVector(e, k);
        n.lerp(_r.addScaledVector(e, k).normalize(), smooth(k / .012)).normalize();
      }
      pos.array[o] = p.x - b * breath[o]; pos.array[o + 1] = p.y - b * breath[o + 1]; pos.array[o + 2] = p.z - b * breath[o + 2];
      normals.array[o] = n.x; normals.array[o + 1] = n.y; normals.array[o + 2] = n.z;
    }
    pos.needsUpdate = true; normals.needsUpdate = true;
  }
  function update() { drape(); group.updateMatrixWorld(true); }

  reset(); update();
  function dispose() {
    const g = new Set(), m = new Set();
    group.traverse((o) => { if (o.geometry) g.add(o.geometry); if (o.material) m.add(o.material); });
    g.forEach((x) => x.dispose()); m.forEach((x) => x.dispose()); skeleton.dispose();
  }
  return {
    group, bones: named, skeleton, top, head, hands, sides,
    reset, rot, turn, solve, placeHand, placeFoot, handQuat, handAxes, palmToWrist, palmPoint, curl, face, breathe, update, worldPos, onShirt, torsoDistance, dispose,
  };
}

// A light, sturdy chair without wheels — the exercise cues ask for one.
export const SEAT_HEIGHT = .45;
export function createChair() {
  const group = new THREE.Group(); group.name = 'Chair';
  const seatMat = fabric(PALETTE.seat, '#ffffff', .95), wood = matte(PALETTE.wood, .55);
  add(group, new RoundedBoxGeometry(.47, .055, .44, 5, .024), seatMat, [0, SEAT_HEIGHT - .0275, .02]);
  add(group, new RoundedBoxGeometry(.49, .022, .46, 3, .01), wood, [0, SEAT_HEIGHT - .064, .02]);
  const back = add(group, new RoundedBoxGeometry(.44, .2, .04, 5, .018), seatMat, [0, .8, -.245]);
  back.rotation.x = -.1;
  for (const [x, z] of [[-.205, -.17], [.205, -.17], [-.205, .21], [.205, .21]]) {
    const len = SEAT_HEIGHT - .075;
    const leg = add(group, new THREE.CylinderGeometry(.013, .0095, len, 16), wood, [x * 1.03, len / 2, z * 1.03]);
    leg.rotation.set((z > 0 ? 1 : -1) * .035, 0, (x > 0 ? -1 : 1) * .035);
  }
  for (const x of [-.19, .19]) {
    const post = add(group, new THREE.CylinderGeometry(.011, .012, .5, 12), wood, [x, .64, -.225]);
    post.rotation.x = -.1;
  }
  return group;
}

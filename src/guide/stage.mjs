import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createPerson, createChair } from './person.mjs';
import { performAt, stillTime, timeline } from './choreography.mjs';

// Each exercise has a fixed guide framing that covers the whole movement and both sides.
// The camera never tracks or zooms during a repetition; it only glides when the viewer asks.
const FRAMES = {
  body: { target: [0, .7, .12], height: 1.66, width: 1.1 },
  standing: { target: [0, .9, 0], height: 2.02, width: 1.1 },
  wrists: { target: [0, .98, .48], height: .88, width: 1.0 },
  ankles: { target: [0, .36, .44], height: 1.02, width: 1.2 },
};
const ANGLES = { front: [0, .05], 'three-quarter': [.62, .1], 'three-quarter-side': [.95, .1], side: [Math.PI / 2, .04] };
export const cameraAngle = (ex, view) => (view !== 'guide' && ANGLES[view] ? view : ex.view?.angle || 'three-quarter');
const framingOf = (ex) => ex.view?.framing || 'body';
function shot(ex, view, side = 0) {
  const framing = framingOf(ex) === 'body' && !ex.seated ? 'standing' : framingOf(ex);
  let [yaw, elevation] = ANGLES[cameraAngle(ex, view)];
  // The wrist close-up watches from the working arm's side, so the supporting arm never hides the bend.
  if (view === 'guide' && framing === 'wrists') { yaw = (side || -1) * 1.05; elevation = .14; }
  if (view === 'guide' && framing === 'ankles') { yaw = 1.02; elevation = .14; }
  const s = { ...FRAMES[framing], yaw, elevation };
  if (framing === 'wrists') s.target = [(side || -1) * .06, .98, .48];
  return s;
}
// Side-aware framing only re-aims while the pose is neutral between sides.
const followsSide = (ex, view) => view === 'guide' && framingOf(ex) === 'wrists';

export function supportsWebGL() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

function softDisc() {
  const blob = document.createElement('canvas'); blob.width = blob.height = 128;
  const g = blob.getContext('2d'), grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(38,58,46,.32)'); grad.addColorStop(.45, 'rgba(38,58,46,.12)'); grad.addColorStop(1, 'rgba(38,58,46,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(blob);
}

// A 3D exercise guide with the same `render(exercise, seconds, reduced, view)` contract as the SVG figure.
export class Guide {
  constructor(container) {
    this.container = container;
    const renderer = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 0);

    const scene = this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
    scene.environmentIntensity = .5;
    pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xfffbf0, 0xb7c4ad, .55));
    const key = new THREE.DirectionalLight(0xfff3e2, 2.3);
    key.position.set(-2.2, 5.5, 3.2); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -1.3, right: 1.3, top: 2.1, bottom: -.6, near: .5, far: 12 });
    key.shadow.normalBias = .02; key.shadow.bias = -.0002; key.shadow.radius = 5;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xe8f1ff, 1.1); rim.position.set(2.5, 3, -3.5); scene.add(rim);
    const bounce = new THREE.DirectionalLight(0xf2e4cf, .35); bounce.position.set(1, -1, 2); scene.add(bounce);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ color: 0x3d5446, opacity: .13 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    this.contact = new THREE.Mesh(new THREE.PlaneGeometry(1.05, .95), new THREE.MeshBasicMaterial({ map: softDisc(), transparent: true, depthWrite: false }));
    this.contact.rotation.x = -Math.PI / 2; this.contact.position.set(0, .002, .1); scene.add(this.contact);
    // A quiet floor ring that expands with the breath in the breathing exercise.
    this.ring = new THREE.Mesh(new THREE.RingGeometry(.6, .612, 128), new THREE.MeshBasicMaterial({ color: 0x5f8272, transparent: true, opacity: 0, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = .003; scene.add(this.ring);

    this.person = createPerson(); scene.add(this.person.group);
    this.chair = createChair(); scene.add(this.chair);
    this.camera = new THREE.PerspectiveCamera(26, 1, .05, 30);
    this.rig = { yaw: 0, elevation: 0, distance: 4, target: new THREE.Vector3() };
    this.goal = { yaw: 0, elevation: 0, distance: 4, target: new THREE.Vector3() };
    this.want = null; this.drawn = null; this.framedSide = 0; this.size = null; this.raf = 0; this.last = 0;

    this.canvas = renderer.domElement;
    this.canvas.className = 'guide-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; this.onLost?.(); });
    container.append(this.canvas);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
  }

  resize() {
    const width = this.container.clientWidth, height = this.container.clientHeight;
    if (!width || !height || (this.size && this.size[0] === width && this.size[1] === height)) return;
    this.size = [width, height];
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    if (this.want) { this.frame(true); this.draw(); }
  }

  frame(snap, ex = this.want.ex, view = this.want.view, time = this.want.time) {
    this.framedSide = timeline(ex, time).side;
    const s = shot(ex, view, this.framedSide);
    const tan = Math.tan(this.camera.fov * Math.PI / 360);
    const fit = Math.max(s.height / 2 / tan, s.width / 2 / (tan * this.camera.aspect));
    Object.assign(this.goal, { yaw: s.yaw, elevation: s.elevation, distance: fit * 1.02 });
    this.goal.target.set(...s.target);
    if (snap) { Object.assign(this.rig, { yaw: s.yaw, elevation: s.elevation, distance: this.goal.distance }); this.rig.target.copy(this.goal.target); }
  }

  render(ex, seconds, reduced = false, view = 'guide') {
    if (this.lost) return;
    const time = reduced ? stillTime(ex) : Math.min(ex.seconds, Math.max(0, seconds));
    const previous = this.want;
    const newExercise = !previous || previous.ex.id !== ex.id, newView = !previous || previous.view !== view;
    this.want = { ex, time, reduced, view };
    this.container.dataset.camera = cameraAngle(ex, view);
    this.container.dataset.framing = framingOf(ex);
    if (newExercise) {
      this.chair.visible = ex.seated;
      this.frame(true);
      if (previous) this.cut();
    } else if (newView) {
      this.frame(reduced);
    } else if (followsSide(ex, view)) {
      const tl = timeline(ex, time);
      if (tl.side !== this.framedSide && tl.u < .05) this.frame(reduced);
    }
    if (newExercise || newView || !this.drawn || this.drawn.time !== time) this.draw();
    if (this.gliding()) this.schedule();
  }

  // A soft cut between exercises: the new pose fades in rather than snapping.
  cut() {
    const c = this.container;
    c.classList.add('guide-cut');
    requestAnimationFrame(() => requestAnimationFrame(() => c.classList.remove('guide-cut')));
  }

  gliding() {
    const r = this.rig, g = this.goal;
    return Math.abs(r.yaw - g.yaw) > 1e-4 || Math.abs(r.elevation - g.elevation) > 1e-4 || Math.abs(r.distance - g.distance) > 1e-4 || r.target.distanceToSquared(g.target) > 1e-8;
  }
  schedule() {
    if (this.raf) return;
    this.last = performance.now();
    const step = (now) => {
      this.raf = 0;
      const tau = followsSide(this.want.ex, this.want.view) ? .9 : .42;
      const k = 1 - Math.exp(-Math.min((now - this.last) / 1000, .05) / tau);
      this.last = now;
      for (const key of ['yaw', 'elevation', 'distance']) this.rig[key] += (this.goal[key] - this.rig[key]) * k;
      this.rig.target.lerp(this.goal.target, k);
      this.draw();
      if (this.gliding()) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  placeCamera() {
    const { yaw, elevation, distance, target } = this.rig, c = Math.cos(elevation);
    this.camera.position.set(Math.sin(yaw) * c, Math.sin(elevation), Math.cos(yaw) * c).multiplyScalar(distance).add(target);
    this.camera.lookAt(target);
  }

  pose(ex, time) {
    const tl = performAt(this.person, ex, time);
    const breathing = ex.id === 'reset-breath';
    this.ring.material.opacity = breathing ? .22 + .2 * tl.amount : 0;
    this.ring.scale.setScalar(breathing ? .82 + .3 * tl.amount : 1);
    this.contact.position.z = ex.seated ? .12 : .02;
  }

  draw() {
    if (!this.want || !this.size || this.lost) return;
    const { ex, time } = this.want;
    this.pose(ex, time);
    this.placeCamera();
    this.renderer.render(this.scene, this.camera);
    this.drawn = { time };
  }

  // A still of an exercise's representative moment, as a PNG data URL.
  snapshot(ex, width, height, view = 'guide') {
    if (this.lost || !width || !height) return null;
    const saved = { rig: { ...this.rig, target: this.rig.target.clone() }, goal: { ...this.goal, target: this.goal.target.clone() } };
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    const time = stillTime(ex);
    this.frame(true, ex, view, time);
    this.chair.visible = ex.seated;
    this.pose(ex, time);
    this.placeCamera();
    this.renderer.render(this.scene, this.camera);
    const url = this.canvas.toDataURL('image/png');
    Object.assign(this.rig, saved.rig); Object.assign(this.goal, saved.goal);
    this.size = null;
    if (this.want) this.chair.visible = this.want.ex.seated;
    this.resize();
    this.draw();
    return url;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.person.dispose();
    this.scene.traverse((o) => { if (o !== this.person.group) { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); } });
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}

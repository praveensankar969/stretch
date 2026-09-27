import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createPerson, createChair } from '../../src/guide/person.mjs';
import { EXERCISES, SOURCES, getExercise, performAt, stillTime, timeline } from '../../src/guide/choreography.mjs';

const $ = (id) => document.getElementById(id);
const container = $('viewport');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const state = { id: EXERCISES[0].id, time: 0, running: !reduced.matches, view: 'guide', free: false, ready: false, rest: 0 };

// ---------- camera direction ----------
// Each exercise has a fixed guide framing that covers the whole movement and both sides.
// The camera never tracks or zooms during a repetition; it only glides when the viewer asks.
const FRAMES = {
  seated: { target: [0, .74, .12], height: 1.98, width: 1.2 },
  standing: { target: [0, .9, 0], height: 2.24, width: 1.2 },
  wrists: { target: [0, .98, .48], height: .88, width: 1.0 },
  ankles: { target: [0, .36, .44], height: 1.02, width: 1.2 },
};
const ANGLES = { front: [0, .05], 'three-quarter': [.62, .1], 'three-quarter-side': [.95, .1], side: [Math.PI / 2, .04] };
function shot(ex, view, side = 0) {
  const framing = ex.view?.framing === 'wrists' ? 'wrists' : ex.view?.framing === 'ankles' ? 'ankles' : ex.seated ? 'seated' : 'standing';
  let [yaw, elevation] = ANGLES[view === 'guide' ? ex.view?.angle || 'three-quarter' : view];
  // The wrist close-up watches from the working arm's side, so the supporting arm never hides the bend.
  if (view === 'guide' && framing === 'wrists') { yaw = (side || -1) * 1.05; elevation = .14; }
  if (view === 'guide' && framing === 'ankles') { yaw = 1.02; elevation = .14; }
  const s = { ...FRAMES[framing], yaw, elevation };
  if (framing === 'wrists') s.target = [(side || -1) * .06, .98, .48];
  return s;
}
// Side-aware framing only re-aims while the pose is neutral between sides.
const followsSide = (ex) => state.view === 'guide' && ex.view?.framing === 'wrists';

let renderer, person, chair, camera, controls, scene;
const rig = { yaw: 0, elevation: 0, distance: 4, target: new THREE.Vector3() };
const goal = { yaw: 0, elevation: 0, distance: 4, target: new THREE.Vector3() };
let framedSide = 0;
// On tall stages the HUD covers the top and bottom, so the body is framed in the clear band between them.
function clearBand() {
  const box = container.getBoundingClientRect();
  if (camera.aspect > .8 || !box.height) { camera.clearViewOffset(); return 1; }
  const top = document.querySelector('.hud-top').getBoundingClientRect().bottom - box.top + 8;
  const bottom = document.querySelector('.hud-cue').getBoundingClientRect().top - box.top - 4;
  camera.setViewOffset(box.width, box.height, 0, box.height / 2 - (top + bottom) / 2, box.width, box.height);
  return (bottom - top) / box.height;
}
function frameGoal(snap = false) {
  const ex = getExercise(state.id);
  framedSide = timeline(ex, state.time).side;
  const s = shot(ex, state.view, framedSide);
  const fov = camera.fov * Math.PI / 180, aspect = camera.aspect, share = clearBand();
  const fit = Math.max(s.height / share / 2 / Math.tan(fov / 2), s.width / 2 / (Math.tan(fov / 2) * aspect));
  Object.assign(goal, { yaw: s.yaw, elevation: s.elevation, distance: fit * 1.02 });
  goal.target.set(...s.target);
  if (snap) { Object.assign(rig, { yaw: goal.yaw, elevation: goal.elevation, distance: goal.distance }); rig.target.copy(goal.target); }
  state.free = false;
}
function placeCamera() {
  const c = Math.cos(rig.elevation);
  camera.position.set(Math.sin(rig.yaw) * c, Math.sin(rig.elevation), Math.cos(rig.yaw) * c).multiplyScalar(rig.distance).add(rig.target);
  controls.target.copy(rig.target);
}
function glide(dt, tau = .42) {
  const k = 1 - Math.exp(-dt / tau);
  let moving = false;
  for (const key of ['yaw', 'elevation', 'distance']) {
    const d = goal[key] - rig[key];
    if (Math.abs(d) > 1e-4) { rig[key] += d * k; moving = true; }
  }
  if (rig.target.distanceToSquared(goal.target) > 1e-8) { rig.target.lerp(goal.target, k); moving = true; }
  return moving;
}

// ---------- interface ----------
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function buildLibrary() {
  const list = $('library');
  for (const ex of EXERCISES) {
    const li = document.createElement('li'), b = document.createElement('button');
    b.dataset.id = ex.id;
    b.innerHTML = `<span class="name"></span><span class="length"></span><span class="meta"></span>`;
    b.querySelector('.name').textContent = ex.title;
    b.querySelector('.meta').textContent = `${ex.region} · ${ex.seated ? 'Seated' : 'Standing'}`;
    b.querySelector('.length').textContent = fmt(ex.seconds);
    b.addEventListener('click', () => select(ex.id));
    li.append(b); list.append(li);
  }
}
function describe(ex) {
  $('region').textContent = ex.region;
  $('title').textContent = ex.title;
  $('posture').textContent = ex.seated ? 'Seated' : 'Standing';
  $('desc').textContent = ex.desc;
  $('cue').textContent = ex.cue;
  const src = SOURCES[ex.source];
  $('source').textContent = src ? `${src.name} ↗` : '';
  $('source').href = src ? src.url : '#';
  const scrub = $('scrubber');
  scrub.max = String(ex.seconds);
  $('reps').replaceChildren(...Array.from({ length: ex.repetitions }, () => { const i = document.createElement('i'); i.append(document.createElement('b')); return i; }));
  document.querySelectorAll('#library button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === ex.id)));
}
let lastPhase = '';
function hud(ex, tl) {
  const complete = state.time >= ex.seconds;
  const phase = complete ? 'Nicely done.' : tl.phase;
  if (phase !== lastPhase) {
    const el = $('phase');
    el.classList.add('swap');
    setTimeout(() => { el.textContent = phase; el.classList.remove('swap'); }, reduced.matches ? 0 : 160);
    lastPhase = phase;
  }
  $('count').textContent = complete ? '' : String(Math.max(1, Math.ceil(tl.phaseLeft - 1e-6)));
  const side = tl.side < 0 ? 'Right side' : tl.side > 0 ? 'Left side' : '';
  $('side').hidden = !side; $('side').textContent = side;
  $('rep').textContent = ex.repetitions > 1 ? `Rep ${tl.rep} of ${ex.repetitions}` : ex.mode === 'walk' ? 'One easy minute' : '';
  $('time').textContent = `${fmt(state.time)} / ${fmt(ex.seconds)}`;
  const per = ex.seconds / ex.repetitions;
  document.querySelectorAll('#reps b').forEach((b, i) => b.style.setProperty('--fill', String(Math.min(1, Math.max(0, (state.time - i * per) / per)))));
  if (!scrubbing) $('scrubber').value = String(state.time);
}
function syncPlay() {
  const b = $('play');
  b.setAttribute('aria-pressed', String(state.running));
  b.setAttribute('aria-label', state.running ? 'Pause guide' : 'Play guide');
}
function setView(view) {
  state.view = view;
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  frameGoal(reduced.matches);
  dirty = true;
}
let switching = null;
function select(id) {
  if (id === state.id && !switching) return;
  const apply = () => {
    state.id = id; state.time = reduced.matches ? stillTime(getExercise(id)) : 0; state.rest = 0;
    const ex = getExercise(id);
    describe(ex); chair.visible = ex.seated;
    frameGoal(true); lastPhase = ''; dirty = true;
    container.classList.remove('fading');
    switching = null;
  };
  clearTimeout(switching);
  if (reduced.matches) { apply(); return; }
  container.classList.add('fading');
  switching = setTimeout(apply, 280);
}
let scrubbing = false, dirty = true;

try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  container.append(renderer.domElement);

  scene = new THREE.Scene();
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
  const blob = document.createElement('canvas'); blob.width = blob.height = 128;
  const g = blob.getContext('2d'), grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(38,58,46,.32)'); grad.addColorStop(.45, 'rgba(38,58,46,.12)'); grad.addColorStop(1, 'rgba(38,58,46,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(1.05, .95), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(blob), transparent: true, depthWrite: false }));
  contact.rotation.x = -Math.PI / 2; contact.position.set(0, .002, .1); scene.add(contact);
  // A quiet floor ring that expands with the breath in the breathing exercise.
  const ring = new THREE.Mesh(new THREE.RingGeometry(.6, .612, 128), new THREE.MeshBasicMaterial({ color: 0x5f8272, transparent: true, opacity: 0, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .003; scene.add(ring);

  person = createPerson(); scene.add(person.group);
  chair = createChair(); scene.add(chair);

  camera = new THREE.PerspectiveCamera(26, 1, .05, 30);
  controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, dampingFactor: .09, enablePan: false, minDistance: .9, maxDistance: 8, minPolarAngle: .5, maxPolarAngle: Math.PI * .52, rotateSpeed: .7 });
  controls.addEventListener('start', () => { state.free = true; });
  controls.addEventListener('change', () => { dirty = true; });

  const resize = () => {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    camera.aspect = width / height; camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    if (!state.free) frameGoal(true);
    dirty = true;
  };
  buildLibrary();
  describe(getExercise(state.id));
  new ResizeObserver(resize).observe(container); resize();
  frameGoal(true); placeCamera(); controls.update();
  if (reduced.matches) state.time = stillTime(getExercise(state.id));

  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  $('play').addEventListener('click', () => {
    const ex = getExercise(state.id);
    if (!state.running && state.time >= ex.seconds) state.time = 0;
    state.running = !state.running; syncPlay(); dirty = true;
  });
  $('restart').addEventListener('click', () => { state.time = 0; state.rest = 0; dirty = true; });
  const scrub = $('scrubber');
  scrub.addEventListener('input', () => { scrubbing = true; state.time = Number(scrub.value); dirty = true; });
  scrub.addEventListener('change', () => { scrubbing = false; });
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, button, a') || e.metaKey || e.ctrlKey) return;
    if (e.code === 'Space') { e.preventDefault(); $('play').click(); }
    if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
      const ex = getExercise(state.id);
      state.time = Math.min(ex.seconds, Math.max(0, state.time + (e.code === 'ArrowRight' ? 2 : -2))); dirty = true;
    }
  });
  reduced.addEventListener('change', () => { if (reduced.matches) { state.running = false; syncPlay(); state.time = stillTime(getExercise(state.id)); frameGoal(true); dirty = true; } });
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); state.running = false; syncPlay();
    const l = $('loading'); l.textContent = 'Graphics paused. Reload to continue.'; l.hidden = false;
  });

  let previous = performance.now();
  function render(ex) {
    const tl = performAt(person, ex, state.time);
    const breathing = ex.id === 'reset-breath';
    ring.material.opacity = breathing ? .22 + .2 * tl.amount : 0;
    ring.scale.setScalar(breathing ? .82 + .3 * tl.amount : 1);
    contact.position.z = ex.seated ? .12 : .02;
    renderer.render(scene, camera);
    hud(ex, tl);
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - previous) / 1000, .05); previous = now;
    if (document.hidden) return;
    const ex = getExercise(state.id);
    if (state.running && !scrubbing && !switching) {
      if (state.time < ex.seconds) { state.time = Math.min(ex.seconds, state.time + dt); }
      else if ((state.rest += dt) > 2.4) { state.time = 0; state.rest = 0; }
      dirty = true;
    }
    let tau = .42;
    if (!state.free && followsSide(ex)) {
      const tl = timeline(ex, state.time);
      if (tl.side !== framedSide && tl.u < .05) { frameGoal(reduced.matches); dirty = true; }
      tau = .9;
    }
    if (!state.free) {
      const moving = reduced.matches ? false : glide(dt, tau);
      if (reduced.matches) { Object.assign(rig, { yaw: goal.yaw, elevation: goal.elevation, distance: goal.distance }); rig.target.copy(goal.target); }
      if (moving || dirty) placeCamera();
      dirty ||= moving;
    }
    controls.update();
    if (!dirty) return;
    dirty = false;
    render(ex);
  }
  $('loading').hidden = true; syncPlay(); state.ready = true;
  requestAnimationFrame(frame);

  // Deterministic hooks for the review scripts.
  window.characterStudy = {
    state, person, camera, controls, renderer, scene, setView, select, timeline, exercises: EXERCISES,
    renderAt(time, id = state.id) {
      if (id !== state.id) { state.id = id; describe(getExercise(id)); chair.visible = getExercise(id).seated; }
      state.time = time; state.running = false; syncPlay();
      if (!state.free) { frameGoal(true); placeCamera(); }
      controls.update(); render(getExercise(id));
    },
  };
} catch (error) {
  $('loading').textContent = 'This guide needs WebGL. Try a browser with hardware acceleration enabled.';
  console.error(error);
}

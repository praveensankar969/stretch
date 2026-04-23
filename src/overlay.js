'use strict';

const bridge = window.stretch;
const exercisesApi = window.StretchExercises;

const els = {
  title: document.getElementById('ex-title'),
  desc: document.getElementById('ex-desc'),
  timer: document.getElementById('timer'),
  chip: document.getElementById('progress-chip'),
  lottie: document.getElementById('lottie'),
  done: document.getElementById('done-btn'),
  snooze: document.getElementById('snooze-btn'),
  skip: document.getElementById('skip-btn'),
  wash: document.getElementById('wash')
};

let currentExercise = null;
let anim = null;
let countdownTimer = null;

async function loadAnimation(id) {
  if (anim) {
    try { anim.destroy(); } catch (_) { /* ignore */ }
    anim = null;
  }
  els.lottie.innerHTML = '';
  if (typeof lottie === 'undefined') return; // graceful no-op if lib missing
  try {
    // fetch → animationData is more CSP-safe than lottie's internal XHR path.
    const res = await fetch(`assets/lottie/${id}.json`);
    if (!res.ok) throw new Error(`lottie ${id}: ${res.status}`);
    const data = await res.json();
    anim = lottie.loadAnimation({
      container: els.lottie,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData: data
    });
  } catch (err) {
    console.warn('Failed to load lottie', id, err);
  }
}

function startCountdown(seconds) {
  clearInterval(countdownTimer);
  const end = Date.now() + seconds * 1000;
  function render() {
    const left = Math.max(0, Math.round((end - Date.now()) / 1000));
    els.timer.textContent = left > 0 ? `${left}s` : 'take your time';
    if (left === 0) clearInterval(countdownTimer);
  }
  render();
  countdownTimer = setInterval(render, 500);
}

function setExercise(id, meta) {
  const ex = exercisesApi.getExerciseById(id);
  currentExercise = ex;
  els.title.textContent = ex.title;
  els.desc.textContent = ex.desc;
  const today = meta?.todayCount || 0;
  const goal = meta?.dailyGoal || 8;
  els.chip.textContent = `${today} / ${goal} today`;
  loadAnimation(ex.id);
  startCountdown(ex.seconds || 30);
}

function action(which) {
  clearInterval(countdownTimer);
  bridge.overlayAction(which);
}

els.done.addEventListener('click', () => action('done'));
els.snooze.addEventListener('click', () => action('snooze'));
els.skip.addEventListener('click', () => action('skip'));
els.wash.addEventListener('click', () => action('snooze'));

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    action('done');
  } else if (e.key === 'Escape') {
    e.preventDefault();
    action('snooze');
  } else if (e.key === 's' || e.key === 'S') {
    e.preventDefault();
    action('skip');
  }
});

bridge.onOverlayShow((payload) => {
  setExercise(payload.exerciseId, payload);
});

// Fallback in case the show event arrives before subscription:
(async () => {
  // If we were opened without an explicit exercise, pick one.
  setTimeout(() => {
    if (!currentExercise) {
      const ex = exercisesApi.pickExercise(null);
      setExercise(ex.id, { todayCount: 0, dailyGoal: 8 });
    }
  }, 300);
})();

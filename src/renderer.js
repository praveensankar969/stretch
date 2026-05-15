'use strict';

const bridge = window.stretch;

const $ = (id) => document.getElementById(id);

const els = {
  interval: $('interval'),
  dailyGoal: $('daily-goal-input'),
  autoStart: $('auto-start'),
  quietEnabled: $('quiet-enabled'),
  quietStart: $('quiet-start'),
  quietEnd: $('quiet-end'),
  respectFocus: $('respect-focus'),
  save: $('save-btn'),
  preview: $('preview-btn'),
  todayCount: $('today-count'),
  dailyGoalDisplay: $('daily-goal'),
  streakNum: $('streak-num'),
  streakPill: $('streak-pill'),
  spark: $('spark'),
  nextBadge: $('next-badge'),
  privacy: $('privacy-link'),
  diagnostics: $('diagnostics-link'),
  version: $('version-line')
};

function lastSevenDays() {
  const out = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${day}`);
  }
  return out;
}

function renderSpark(history, goal) {
  const days = lastSevenDays();
  const values = days.map((d) => history[d] || 0);
  const max = Math.max(goal || 1, ...values, 1);
  const W = 280;
  const H = 48;
  const padX = 6;
  const step = (W - padX * 2) / (days.length - 1);
  const pts = values.map((v, i) => {
    const x = padX + i * step;
    const y = H - 4 - (v / max) * (H - 12);
    return [x, y];
  });
  const path = pts
    .map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`))
    .join('');

  const dots = pts
    .map(
      ([x, y], i) =>
        `<circle cx="${x}" cy="${y}" r="${i === pts.length - 1 ? 3 : 2}" class="${i === pts.length - 1 ? 'spark-today' : 'spark-dot'
        }" />`
    )
    .join('');

  els.spark.innerHTML = `
    <path d="${path}" class="spark-line" fill="none"/>
    ${dots}
  `;
}

function renderNext(nextFireAt, remindersEnabled) {
  if (!remindersEnabled) {
    els.nextBadge.textContent = 'Reminders paused';
    els.nextBadge.dataset.state = 'paused';
    return;
  }
  if (!nextFireAt) {
    els.nextBadge.textContent = '—';
    return;
  }
  const ms = nextFireAt - Date.now();
  const mins = Math.max(0, Math.round(ms / 60000));
  els.nextBadge.textContent = mins < 1 ? 'Next reminder: any moment' : `Next reminder in ${mins} min`;
  els.nextBadge.dataset.state = 'active';
}

function applyConfig(cfg) {
  els.interval.value = cfg.interval;
  els.dailyGoal.value = cfg.dailyGoal;
  els.autoStart.checked = !!cfg.autoStart;
  els.quietEnabled.checked = !!cfg.quietHoursEnabled;
  els.quietStart.value = cfg.quietStart || '18:00';
  els.quietEnd.value = cfg.quietEnd || '09:00';
  els.respectFocus.checked = !!cfg.respectFocusAssist;

  els.todayCount.textContent = String(cfg.today || 0);
  els.dailyGoalDisplay.textContent = String(cfg.dailyGoal);
  els.streakNum.textContent = String(cfg.streak || 0);
  els.streakPill.classList.toggle('is-active', (cfg.streak || 0) > 0);

  renderSpark(cfg.history || {}, cfg.dailyGoal);
  renderNext(cfg.nextFireAt, cfg.remindersEnabled);

  if (els.version) {
    els.version.textContent = `v${cfg.appVersion || '1.0.0'}`;
  }
}

function readInt(el, fallback, min, max) {
  // Prefer valueAsNumber — parseInt can drop characters silently.
  // Fall back to parseInt in case the input isn't type=number.
  let n = el.valueAsNumber;
  if (!Number.isFinite(n)) n = parseInt(el.value, 10);
  if (!Number.isFinite(n)) n = fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

async function save() {
  const patch = {
    interval: readInt(els.interval, 30, 1, 240),
    dailyGoal: readInt(els.dailyGoal, 8, 1, 50),
    autoStart: els.autoStart.checked,
    quietHoursEnabled: els.quietEnabled.checked,
    quietStart: els.quietStart.value,
    quietEnd: els.quietEnd.value,
    respectFocusAssist: els.respectFocus.checked
  };
  els.save.disabled = true;
  els.save.textContent = 'Saving…';
  try {
    const cfg = await bridge.updateConfig(patch);
    applyConfig(cfg);
    els.save.textContent = 'Saved';
    setTimeout(() => {
      els.save.textContent = 'Save';
      els.save.disabled = false;
    }, 1200);
  } catch (err) {
    console.error(err);
    els.save.textContent = 'Save failed — retry';
    els.save.disabled = false;
  }
}

async function init() {
  const cfg = await bridge.getConfig();
  applyConfig(cfg);

  bridge.onConfigUpdated(applyConfig);

  els.save.addEventListener('click', save);
  els.preview.addEventListener('click', () => bridge.previewOverlay());

  // Let users type freely — the final clamp happens in save().
  // Only clamp on blur if the field is outside the allowed range AND the user
  // has finished interacting with it. Never rewrite an empty field to min
  // while the user is still thinking.
  const softClamp = (el, min, max) => {
    if (el.value === '') return;
    const n = Number(el.value);
    if (!Number.isFinite(n)) return;
    if (n < min) el.value = String(min);
    else if (n > max) el.value = String(max);
  };
  els.interval.addEventListener('blur', () => softClamp(els.interval, 5, 240));
  els.dailyGoal.addEventListener('blur', () => {
    softClamp(els.dailyGoal, 1, 50);
    if (els.dailyGoal.value !== '') {
      els.dailyGoalDisplay.textContent = String(els.dailyGoal.value);
    }
  });
  els.dailyGoal.addEventListener('input', () => {
    const n = Number(els.dailyGoal.value);
    if (Number.isFinite(n) && els.dailyGoal.value !== '') {
      els.dailyGoalDisplay.textContent = String(n);
    }
  });

  els.privacy.addEventListener('click', () => bridge.openPrivacy());
  els.diagnostics.addEventListener('click', async () => {
    await bridge.copyDiagnostics();
    els.diagnostics.textContent = 'Copied';
    setTimeout(() => {
      els.diagnostics.textContent = 'Copy diagnostics';
    }, 1500);
  });

  // Refresh "next reminder" label each minute.
  setInterval(async () => {
    const latest = await bridge.getConfig();
    renderNext(latest.nextFireAt, latest.remindersEnabled);
  }, 30 * 1000);

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      save();
    }
  });

  const platform = window.stretch.platform;
  document.querySelectorAll('[data-win-only]').forEach(el => {
    if (platform !== 'win32') el.style.display = 'none';
  });
  document.querySelectorAll('[data-win]').forEach(el => {
    if (platform !== 'win32') el.style.display = 'none';
  });
  document.querySelectorAll('[data-mac]').forEach(el => {
    if (platform !== 'darwin') el.style.display = 'none';
  });
}

init();

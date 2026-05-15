'use strict';

const bridge = window.stretch;

const platform = window.stretch.platform;
document.querySelectorAll('[data-win]').forEach(el => {
  if (platform !== 'win32') el.style.display = 'none';
});
document.querySelectorAll('[data-mac]').forEach(el => {
  if (platform !== 'darwin') el.style.display = 'none';
});

const slides = Array.from(document.querySelectorAll('.slide'));
const progressDots = Array.from(document.querySelectorAll('.onb-progress .dot'));
let current = 0;
let interval = 30;

function show(idx) {
  slides.forEach((s, i) => s.classList.toggle('hidden', i !== idx));
  progressDots.forEach((d, i) => d.classList.toggle('on', i <= idx));
  current = idx;
}

document.querySelectorAll('[data-next]').forEach((b) =>
  b.addEventListener('click', () => show(Math.min(slides.length - 1, current + 1)))
);
document.querySelectorAll('[data-back]').forEach((b) =>
  b.addEventListener('click', () => show(Math.max(0, current - 1)))
);

document.querySelectorAll('.choice').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.choice').forEach((b) => {
      b.classList.remove('is-selected');
      b.setAttribute('aria-checked', 'false');
    });
    btn.classList.add('is-selected');
    btn.setAttribute('aria-checked', 'true');
    interval = Number(btn.dataset.interval) || 30;
  });
});

document.getElementById('finish-btn').addEventListener('click', async () => {
  const patch = {
    interval,
    quietStart: document.getElementById('q-start').value,
    quietEnd: document.getElementById('q-end').value,
    quietHoursEnabled: true,
    autoStart: document.getElementById('q-autostart').checked
  };
  await bridge.completeOnboarding(patch);
});

show(0);

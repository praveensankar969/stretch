"use strict";
const { getExerciseById, SOURCES } = window.StretchExercises;
const { Figure, sample, getCamera } = window.StretchMotion;
const { SessionClock } = window.StretchClock;
const $ = (id) => document.getElementById(id);
const heroFigure = new Figure($("site-figure")),
  demoFigure = new Figure($("demo-figure"));
const heroExercise = getExerciseById("shoulder-roll");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let exercise,
  clock,
  heroVisible = true,
  demoVisible = false,
  done = false,
  cameraView = "guide";
const choices = [
  ["shoulder-roll", "Shoulders"],
  ["neck-turn", "Neck"],
  ["wrist-extensor", "Wrists"],
  ["ankle-pumps", "Ankles"],
  ["reset-breath", "Breathe"],
];
function renderDemo() {
  demoFigure.render(exercise, clock.elapsed, reduced.matches, cameraView);
}
function setCamera(view) {
  cameraView = view;
  document
    .querySelectorAll("[data-view]")
    .forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.view === view)),
    );
  $("demo-view-label").textContent = getCamera(exercise, view).label;
  renderDemo();
}
function choose(id) {
  exercise = getExerciseById(id);
  clock = new SessionClock();
  done = false;
  $("demo-title").textContent = exercise.title;
  $("demo-region").textContent = exercise.region;
  $("demo-desc").textContent = exercise.desc;
  $("demo-cue").textContent = exercise.cue;
  $("demo-source").textContent = SOURCES[exercise.source].name + " ↗";
  $("demo-source").href = SOURCES[exercise.source].url;
  $("demo-time").textContent = `${exercise.seconds}s`;
  $("demo-phase").textContent = "Ready when you are";
  $("demo-play").textContent = "Try this movement →";
  $("demo-progress").style.width = "0";
  document
    .querySelectorAll("[data-exercise]")
    .forEach((btn) =>
      btn.setAttribute("aria-pressed", String(btn.dataset.exercise === id)),
    );
  setCamera("guide");
}
for (const [id, label] of choices) {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.dataset.exercise = id;
  btn.onclick = () => choose(id);
  $("demo-pills").append(btn);
}
function pause() {
  if (!clock.running) return;
  clock.pause(performance.now());
  $("demo-play").textContent = "Resume movement →";
  $("demo-phase").textContent = "Paused. Take your time.";
}
$("demo-play").onclick = () => {
  if (done) choose(exercise.id);
  if (clock.running) pause();
  else {
    clock.start(performance.now());
    $("demo-play").textContent = "Pause movement";
  }
};
choose("shoulder-roll");
document.querySelectorAll("[data-view]").forEach((button) => {
  button.onclick = () => setCamera(button.dataset.view);
});
reduced.addEventListener("change", renderDemo);
const observer = new IntersectionObserver((entries) =>
  entries.forEach((entry) => {
    if (entry.target.id === "site-figure") heroVisible = entry.isIntersecting;
    if (entry.target.id === "movements") {
      demoVisible = entry.isIntersecting;
      if (!demoVisible) pause();
    }
  }),
);
observer.observe($("site-figure"));
observer.observe($("movements"));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});
function tick(now) {
  if (!document.hidden && heroVisible)
    heroFigure.render(
      heroExercise,
      (now / 1000) % heroExercise.seconds,
      reduced.matches,
    );
  if (!document.hidden && demoVisible && clock.running) {
    const elapsed = clock.tick(now),
      state = sample(exercise, elapsed);
    if (clock.interrupted) {
      $("demo-play").textContent = "Resume movement →";
      $("demo-phase").textContent = "Paused while you were away.";
    } else {
      renderDemo();
      $("demo-phase").textContent =
        state.phase +
        (state.side ? ` · ${state.side < 0 ? "Your right" : "Your left"}` : "");
      $("demo-time").textContent = `${Math.ceil(state.remaining)}s`;
      $("demo-progress").style.width = `${state.progress * 100}%`;
      if (state.done) {
        clock.pause(now);
        done = true;
        $("demo-phase").textContent = "A little more at ease.";
        $("demo-play").textContent = "Try it again ↻";
      }
    }
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

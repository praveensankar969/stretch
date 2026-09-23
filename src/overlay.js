"use strict";
const bridge = window.stretch;
const { getExerciseById, SOURCES } = window.StretchExercises;
const { Figure, sample, getCamera } = window.StretchMotion;
const { SessionClock } = window.StretchClock;
const $ = (id) => document.getElementById(id);
const figure = new Figure($("exercise-figure"));
const clock = new SessionClock();
const reducedQuery = matchMedia("(prefers-reduced-motion: reduce)");
let payload,
  exercises = [],
  index = 0,
  total = 0,
  mode = "ready",
  immersive = false,
  prepareUntil = 0,
  frame,
  sending = false,
  cameraView = "guide",
  movementElapsed = 0;
function renderFigure() {
  if (!payload) return;
  figure.render(
    exercises[index],
    movementElapsed,
    payload.reducedMotion || reducedQuery.matches,
    cameraView,
  );
}
function setCamera(view) {
  cameraView = view;
  document
    .querySelectorAll("[data-view]")
    .forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.view === view)),
    );
  $("camera-label").textContent = getCamera(exercises[index], view).label;
  renderFigure();
}
function setExercise(nextIndex) {
  index = nextIndex;
  movementElapsed = 0;
  const ex = exercises[index];
  $("ex-title").textContent = ex.title;
  $("ex-desc").textContent = ex.desc;
  $("ex-cue").textContent = ex.cue;
  $("region-label").textContent = ex.region;
  $("exercise-position").textContent = ex.seated ? "Seated" : "Standing";
  $("sequence-label").textContent =
    exercises.length > 1
      ? `MOVEMENT ${index + 1} OF ${exercises.length}`
      : payload.preview
        ? "PREVIEW · NOT RECORDED"
        : "A MOMENT FOR YOU";
  $("source-btn").textContent = SOURCES[ex.source].name + " ↗";
  setCamera("guide");
}
function layout(expanded) {
  immersive = expanded;
  document.body.classList.toggle("immersive", expanded);
  $("expand-btn").setAttribute(
    "aria-label",
    expanded ? "Exit immersive view" : "Expand to immersive view",
  );
  $("expand-btn").title = expanded
    ? "Exit immersive view"
    : "Expand to immersive view";
}
function pause(message = "Take your time. Resume when you’re ready.") {
  if (!["running", "preparing"].includes(mode)) return;
  clock.pause(performance.now());
  bridge.setSessionRunning(payload.id, false);
  mode = "paused";
  $("play-btn").textContent = "Resume movement";
  $("phase-label").textContent = "Paused";
  $("player-message").textContent = message;
}
function begin() {
  if (mode === "complete") {
    act("done");
    return;
  }
  if (mode === "running" || mode === "preparing") {
    pause();
    return;
  }
  $("player-message").textContent = "";
  if (mode === "ready" || clock.elapsed === 0) {
    mode = "preparing";
    prepareUntil = performance.now() + 3000;
    $("play-btn").textContent = "Pause";
  } else {
    mode = "running";
    clock.start(performance.now());
    bridge.setSessionRunning(payload.id, true);
    $("play-btn").textContent = "Pause movement";
  }
}
function tick(now) {
  if (!payload) {
    frame = requestAnimationFrame(tick);
    return;
  }
  if (mode === "preparing") {
    $("phase-label").textContent =
      `Find a comfortable position · ${Math.max(1, Math.ceil((prepareUntil - now) / 1000))}`;
    if (now >= prepareUntil) {
      mode = "running";
      clock.start(now);
      bridge.setSessionRunning(payload.id, true);
      $("play-btn").textContent = "Pause movement";
    }
  }
  if (mode === "running") {
    const elapsed = Math.min(total, clock.tick(now));
    if (clock.interrupted) {
      pause("We paused while your device was away. Resume when you’re ready.");
    } else {
      let offset = 0,
        nextIndex = 0;
      while (
        nextIndex < exercises.length - 1 &&
        elapsed >= offset + exercises[nextIndex].seconds
      )
        offset += exercises[nextIndex++].seconds;
      if (nextIndex !== index) setExercise(nextIndex);
      const ex = exercises[index],
        state = sample(ex, elapsed - offset);
      movementElapsed = elapsed - offset;
      renderFigure();
      if ($("phase-label").textContent !== state.phase)
        $("phase-label").textContent = state.phase;
      $("timer").textContent =
        `${ex.mode === "hold" ? Math.ceil(state.phaseLeft) + "s · " : ""}${Math.ceil(total - elapsed)}s left`;
      $("rep-label").textContent =
        ex.mode === "walk"
          ? "Look away from the screen"
          : `${ex.mode === "breath" ? "Breath" : "Round"} ${state.rep} / ${ex.repetitions}`;
      $("side-label").textContent = state.side
        ? `${state.side < 0 ? "Your right" : "Your left"} side`
        : "Breathe naturally";
      $("timeline-fill").style.width = `${(elapsed / total) * 100}%`;
      document
        .querySelector(".timeline")
        .setAttribute(
          "aria-valuenow",
          String(Math.round((elapsed / total) * 100)),
        );
      if (elapsed >= total) {
        clock.pause(now);
        bridge.setSessionRunning(payload.id, false);
        mode = "complete";
        $("phase-label").textContent = "A little more at ease.";
        $("timer").textContent = "Complete";
        $("play-btn").textContent = payload.preview
          ? "Close preview"
          : "Finish & save break";
        $("snooze-btn").hidden = true;
        $("side-label").textContent = "";
        $("rep-label").textContent = "Carry that feeling into your day.";
        $("player-message").textContent =
          "You made a little room for yourself.";
      }
    }
  }
  frame = requestAnimationFrame(tick);
}
async function act(action) {
  if (!payload || sending || (action === "done" && mode !== "complete")) return;
  sending = true;
  try {
    const ok = await bridge.overlayAction(action, payload.id);
    if (!ok)
      $("player-message").textContent =
        "Could not finish just yet. Please try again.";
  } catch {
    $("player-message").textContent =
      "Could not save this break. Please try again.";
  } finally {
    sending = false;
  }
}
$("play-btn").onclick = begin;
document.querySelectorAll("[data-view]").forEach((button) => {
  button.onclick = () => {
    if (payload) setCamera(button.dataset.view);
  };
});
reducedQuery.addEventListener("change", renderFigure);
$("close-btn").onclick = () => act("skip");
$("snooze-btn").onclick = () => act("snooze");
$("expand-btn").onclick = async () => layout(await bridge.expandOverlay());
$("source-btn").onclick = () => {
  pause("Paused while you read the movement guidance.");
  bridge.openSource(exercises[index].source);
};
document.addEventListener("keydown", (event) => {
  if (event.code === "Space" && event.target.tagName !== "BUTTON") {
    event.preventDefault();
    begin();
  } else if (event.key === "Escape") {
    event.preventDefault();
    if (immersive) $("expand-btn").click();
    else act("skip");
  } else if (event.key === "Enter" && event.target.tagName !== "BUTTON") {
    event.preventDefault();
    begin();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause("Paused while this guide is hidden.");
});
bridge.onOverlayPause(() => pause("Welcome back. Resume when you’re ready."));
bridge.onOverlayLayout(layout);
bridge
  .getOverlay()
  .then((data) => {
    if (!data) throw new Error("No session");
    payload = data;
    exercises = data.exerciseIds.map(getExerciseById);
    total = exercises.reduce((sum, ex) => sum + ex.seconds, 0);
    $("progress-chip").textContent =
      `${data.todayCount} / ${data.dailyGoal} today`;
    $("timer").textContent = `${total}s`;
    setExercise(0);
    layout(data.immersive);
    if (!data.automatic) $("play-btn").focus();
    tick(performance.now());
  })
  .catch(() => {
    $("ex-desc").textContent =
      "This session could not load. Close the window and try again.";
    $("play-btn").disabled = true;
  });
window.addEventListener("beforeunload", () => cancelAnimationFrame(frame));

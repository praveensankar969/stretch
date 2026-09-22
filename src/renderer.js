"use strict";
const bridge = window.stretch;
const { EXERCISES, SOURCES, pickExercise } = window.StretchExercises;
const { Figure } = window.StretchMotion;
const $ = (id) => document.getElementById(id);
let config,
  settingsDirty = false,
  currentPage = "today",
  heroExercise = EXERCISES[1];
const heroFigure = new Figure($("hero-figure"));
const reducedQuery = matchMedia("(prefers-reduced-motion: reduce)");
let animationFrame,
  animationOrigin = performance.now();
function animate(t) {
  if (!document.hidden && currentPage === "today")
    heroFigure.render(
      heroExercise,
      ((t - animationOrigin) / 1000) % heroExercise.seconds,
      config?.reducedMotion || reducedQuery.matches,
    );
  animationFrame = requestAnimationFrame(animate);
}
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("toast").hidden = true), 3500);
}
function showPage(page) {
  if (!["today", "library", "settings"].includes(page)) page = "today";
  currentPage = page;
  document
    .querySelectorAll(".page")
    .forEach((el) => (el.hidden = el.id !== `page-${page}`));
  document.querySelectorAll("[data-page]").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page);
    if (button.dataset.page === page)
      button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (page === "library") renderLibrary("all");
  window.scrollTo(0, 0);
}
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function renderWeek() {
  $("week-chart").replaceChildren();
  let total = 0;
  for (let i = 6; i >= 0; i--) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    const count = config.history[dateKey(day)] || 0;
    total += count;
    const column = document.createElement("div");
    column.className = "day-column";
    column.setAttribute(
      "aria-label",
      `${day.toLocaleDateString(undefined, { weekday: "long" })}: ${count} breaks`,
    );
    column.title = `${count} breaks · ${day.toLocaleDateString()}`;
    const track = document.createElement("div");
    track.className = "day-track";
    const bar = document.createElement("div");
    bar.className = "day-bar";
    bar.style.height = `${Math.min(100, (count / config.dailyGoal) * 100)}%`;
    track.append(bar);
    const label = document.createElement("span");
    label.textContent =
      i === 0
        ? "Today"
        : day.toLocaleDateString(undefined, { weekday: "short" });
    column.append(track, label);
    $("week-chart").append(column);
  }
  $("week-total").textContent = `${total} breaks`;
}
function renderStatus() {
  const mins = Math.max(1, Math.ceil((config.nextFireAt - Date.now()) / 60000));
  const time = config.nextFireAt
    ? new Date(config.nextFireAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : "";
  const labels = {
    paused: "Reminders paused",
    quiet: `Quiet until ${time}`,
    away: "Paused while you’re away",
    session: "Enjoy your break",
    setup: "Let’s get set up",
    snoozed: `Snoozed · ${mins} min`,
    scheduled: `Next break in ${mins} min`,
  };
  const status = labels[config.reminderState] || "Ready when you are";
  if ($("next-badge").textContent !== status)
    $("next-badge").textContent = status;
  $("pause-reminders").textContent = config.remindersEnabled
    ? "Pause reminders"
    : "Resume reminders";
  $("snooze-select").disabled = !config.remindersEnabled;
  $("rhythm-title").textContent = config.remindersEnabled
    ? `A nudge every ${config.interval} minutes`
    : "A little space to focus";
  $("rhythm-help").textContent =
    config.reminderState === "quiet"
      ? `Quiet hours are on. Your next reminder is at ${time}.`
      : "A manual stretch is always here when you need it.";
}
function fillSettings() {
  $("interval").value = config.interval;
  $("daily-goal-input").value = config.dailyGoal;
  $("auto-start").checked = config.autoStart;
  $("quiet-enabled").checked = config.quietHoursEnabled;
  $("quiet-start").value = config.quietStart;
  $("quiet-end").value = config.quietEnd;
  $("fullscreen-enabled").checked = config.showOverFullscreen;
  $("reduced-motion").checked = config.reducedMotion;
  $("focus-select").value = config.focus;
  updateQuiet();
}
function updateQuiet() {
  $("quiet-start").disabled = $("quiet-end").disabled =
    !$("quiet-enabled").checked;
}
function applyConfig(next) {
  const previous = config;
  config = next;
  if (!settingsDirty) fillSettings();
  renderStatus();
  $("today-count").textContent = config.today;
  $("daily-goal").textContent = config.dailyGoal;
  $("minutes-count").textContent = Number(config.todayMinutes || 0)
    .toFixed(1)
    .replace(".0", "");
  $("streak-num").textContent = config.streak;
  $("goal-arc").style.strokeDasharray =
    `${Math.min(100, (config.today / config.dailyGoal) * 100)} 100`;
  $("goal-message").textContent =
    config.today >= config.dailyGoal
      ? "You made room for yourself."
      : config.today
        ? "A little more at ease."
        : "Every small pause counts.";
  $("date-label").textContent = new Date()
    .toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    })
    .toUpperCase();
  $("version-line").textContent = `Stretch ${config.appVersion}`;
  if (
    !previous ||
    previous.today !== config.today ||
    previous.focus !== config.focus
  ) {
    heroExercise = pickExercise(
      config.lastExerciseId,
      config.focus,
      config.recentExercises,
    );
    $("suggestion-title").textContent = heroExercise.title;
    $("suggestion-meta").textContent =
      `${heroExercise.seconds} seconds · ${heroExercise.seated ? "Seated" : "Standing"}`;
    $("suggestion-desc").textContent = heroExercise.desc;
    animationOrigin = performance.now();
  }
  if (
    !previous ||
    JSON.stringify(previous.history) !== JSON.stringify(config.history) ||
    previous.dailyGoal !== config.dailyGoal ||
    previous.today !== config.today
  )
    renderWeek();
}
function renderLibrary(filter) {
  $("library-filters").replaceChildren();
  for (const [id, label] of [
    ["all", "All movements"],
    ["neck", "Neck"],
    ["shoulders", "Shoulders"],
    ["back", "Back"],
    ["wrists", "Wrists"],
    ["legs", "Legs"],
  ]) {
    const btn = document.createElement("button");
    btn.className = "filter";
    btn.textContent = label;
    btn.setAttribute("aria-pressed", String(filter === id));
    btn.onclick = () => renderLibrary(id);
    $("library-filters").append(btn);
  }
  $("exercise-grid").replaceChildren();
  for (const ex of EXERCISES.filter(
    (ex) => filter === "all" || ex.tags.includes(filter),
  )) {
    const card = document.createElement("article");
    card.className = "exercise-card";
    card.innerHTML = `<div class="exercise-art"><div class="figure"></div><span class="tag">${ex.seated ? "Seated" : "Standing"}</span></div><div class="exercise-copy"><h3>${ex.title}</h3><p>${ex.region} · ${ex.seconds} sec</p><button class="btn ghost">Start movement <span aria-hidden="true">↗</span></button><button class="source-button">${SOURCES[ex.source].name} ↗</button></div>`;
    new Figure(card.querySelector(".figure")).render(
      ex,
      ex.transition ? ex.transition + 0.5 : ex.cycle / 2,
      true,
    );
    card.querySelector(".btn").onclick = () => bridge.startSession([ex.id]);
    card.querySelector(".source-button").onclick = () =>
      bridge.openSource(ex.source);
    $("exercise-grid").append(card);
  }
}
async function save(event) {
  event?.preventDefault();
  if (!$("settings-form").reportValidity()) return;
  $("save-btn").disabled = true;
  try {
    const result = await bridge.updateConfig({
      interval: $("interval").valueAsNumber,
      dailyGoal: $("daily-goal-input").valueAsNumber,
      autoStart: $("auto-start").checked,
      quietHoursEnabled: $("quiet-enabled").checked,
      quietStart: $("quiet-start").value,
      quietEnd: $("quiet-end").value,
      showOverFullscreen: $("fullscreen-enabled").checked,
      reducedMotion: $("reduced-motion").checked,
      focus: $("focus-select").value,
    });
    settingsDirty = false;
    applyConfig(result);
    $("save-status").textContent = "Preferences saved";
  } catch {
    $("save-status").textContent = "Could not save. Please try again.";
  } finally {
    $("save-btn").disabled = false;
  }
}
document
  .querySelectorAll("[data-page]")
  .forEach((btn) => (btn.onclick = () => showPage(btn.dataset.page)));
document.querySelector(".brand").onclick = (event) => {
  event.preventDefault();
  showPage("today");
};
$("start-btn").onclick = () => bridge.startSession([heroExercise.id]);
$("routine-btn").onclick = () =>
  bridge.startSession(["shoulder-roll", "neck-turn", "reset-breath"]);
$("preview-btn").onclick = () => bridge.previewOverlay();
$("privacy-link").onclick = () => bridge.openPrivacy();
$("pause-reminders").onclick = async () => {
  try {
    applyConfig(
      await bridge.updateConfig({ remindersEnabled: !config.remindersEnabled }),
    );
  } catch {
    toast("Could not change reminders. Please try again.");
  }
};
$("snooze-select").onchange = (event) => {
  const value = Number(event.target.value);
  if (value) bridge.snooze(value);
  event.target.value = "";
};
$("settings-form").onsubmit = save;
$("settings-form").oninput = () => {
  settingsDirty = true;
  $("save-status").textContent = "Unsaved changes";
};
$("quiet-enabled").onchange = updateQuiet;
$("diagnostics-link").onclick = async () => {
  try {
    await bridge.copyDiagnostics();
    toast("Diagnostics copied");
  } catch {
    toast("Could not copy diagnostics");
  }
};
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "s") {
    event.preventDefault();
    if (currentPage === "settings") save();
  }
});
if (bridge.platform !== "darwin") {
  document.querySelector("[data-mac-only]").hidden = true;
  document.querySelector(".profile-btn small").textContent =
    "Private. On your device.";
}
bridge.onConfigUpdated(applyConfig);
bridge
  .getConfig()
  .then((cfg) => {
    applyConfig(cfg);
    animate(performance.now());
  })
  .catch(() => toast("Could not load preferences. Please reopen Stretch."));
window.addEventListener("beforeunload", () =>
  cancelAnimationFrame(animationFrame),
);

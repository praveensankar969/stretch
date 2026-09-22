"use strict";
const DEFAULT_CONFIG = Object.freeze({
  version: 3,
  interval: 30,
  dailyGoal: 6,
  autoStart: true,
  remindersEnabled: true,
  quietHoursEnabled: true,
  quietStart: "18:00",
  quietEnd: "09:00",
  showOverFullscreen: true,
  reducedMotion: false,
  focus: "all",
  onboardingDone: false,
  history: {},
  minutesHistory: {},
  recentExercises: [],
  lastExerciseId: null,
});
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const FOCUS = ["all", "neck", "shoulders", "back", "wrists", "legs"];
const booleanKeys = [
  "autoStart",
  "remindersEnabled",
  "quietHoursEnabled",
  "showOverFullscreen",
  "reducedMotion",
];
function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function sanitizePatch(patch = {}) {
  const out = {};
  if (!patch || typeof patch !== "object") return out;
  for (const key of booleanKeys)
    if (typeof patch[key] === "boolean") out[key] = patch[key];
  for (const [key, min, max] of [
    ["interval", 5, 240],
    ["dailyGoal", 1, 50],
  ]) {
    if (typeof patch[key] === "number" && Number.isFinite(patch[key]))
      out[key] = Math.min(max, Math.max(min, Math.round(patch[key])));
  }
  for (const key of ["quietStart", "quietEnd"])
    if (typeof patch[key] === "string" && TIME.test(patch[key]))
      out[key] = patch[key];
  if (FOCUS.includes(patch.focus)) out.focus = patch.focus;
  return out;
}
function cleanHistory(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw)
      .filter(
        ([k, v]) =>
          /^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isFinite(v) && v >= 0,
      )
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-365),
  );
}
function migrateConfig(raw = {}, now = new Date()) {
  if (!raw || typeof raw !== "object") raw = {};
  const next = {
    ...DEFAULT_CONFIG,
    ...sanitizePatch(raw),
    history: cleanHistory(raw.history),
    minutesHistory: cleanHistory(raw.minutesHistory),
  };
  if (
    (!raw.version || raw.version < 2) &&
    Number.isFinite(raw.stretchCount) &&
    raw.stretchCount > 0
  )
    next.history[dateKey(now)] = Math.floor(raw.stretchCount);
  next.onboardingDone = raw.onboardingDone === true;
  next.lastExerciseId =
    typeof raw.lastExerciseId === "string" ? raw.lastExerciseId : null;
  next.recentExercises = Array.isArray(raw.recentExercises)
    ? raw.recentExercises.filter((v) => typeof v === "string").slice(-10)
    : [];
  return next;
}
function streakFor(history, now = new Date()) {
  const day = new Date(now);
  if (!history[dateKey(day)]) day.setDate(day.getDate() - 1);
  let streak = 0;
  while (history[dateKey(day)] > 0 && streak < 366) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}
module.exports = {
  DEFAULT_CONFIG,
  dateKey,
  sanitizePatch,
  migrateConfig,
  streakFor,
  cleanHistory,
};

"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ReminderScheduler, quietUntil } = require("../src/shared/scheduler");
const {
  migrateConfig,
  sanitizePatch,
  streakFor,
} = require("../src/shared/config");
function setup(patch = {}) {
  let time = new Date(2026, 8, 22, 10).getTime(),
    idle = false,
    due = 0;
  let config = { ...migrateConfig(), onboardingDone: true, ...patch };
  const scheduler = new ReminderScheduler({
    now: () => time,
    getConfig: () => config,
    isIdle: () => idle,
    onDue: () => due++,
  });
  scheduler.reset();
  return {
    scheduler,
    get due() {
      return due;
    },
    get config() {
      return config;
    },
    advance: (ms) => {
      time += ms;
      scheduler.tick();
    },
    setIdle: (value) => {
      idle = value;
    },
    update: (patch) => {
      const previous = config;
      config = { ...config, ...patch };
      scheduler.configure(previous);
    },
  };
}
test("fires once at deadline; active break suppresses duplicate reminders", () => {
  const s = setup();
  s.advance(29 * 60000);
  assert.equal(s.due, 0);
  s.advance(60000);
  assert.equal(s.due, 1);
  s.advance(3600000);
  assert.equal(s.due, 1);
  s.scheduler.finish();
  s.advance(30 * 60000);
  assert.equal(s.due, 2);
});
test("unrelated settings preserve the next deadline and snooze", () => {
  const s = setup();
  s.advance(1000);
  const before = s.scheduler.snapshot().nextFireAt;
  s.update({ dailyGoal: 9, focus: "neck", reducedMotion: true });
  assert.equal(s.scheduler.snapshot().nextFireAt, before);
  s.scheduler.snooze(15);
  const snooze = s.scheduler.snapshot().nextFireAt;
  s.update({ quietEnd: "08:00" });
  assert.equal(s.scheduler.snapshot().nextFireAt, snooze);
});
test("pause cancels snooze; resume starts a fresh interval", () => {
  const s = setup();
  s.scheduler.snooze(5);
  s.update({ remindersEnabled: false });
  s.advance(3600000);
  assert.equal(s.due, 0);
  assert.equal(s.scheduler.snapshot().nextFireAt, null);
  s.update({ remindersEnabled: true });
  s.advance(29 * 60000);
  assert.equal(s.due, 0);
  s.advance(60000);
  assert.equal(s.due, 1);
});
test("no reminders before onboarding; manual sessions still work when paused", () => {
  const s = setup({ onboardingDone: false });
  s.advance(3600000);
  assert.equal(s.due, 0);
  s.update({ onboardingDone: true, remindersEnabled: false });
  s.scheduler.begin();
  assert.equal(s.scheduler.inSession, true);
  s.scheduler.finish();
  s.advance(3600000);
  assert.equal(s.due, 0);
});
test("sleep and lock are separate blockers; no immediate wake reminder", () => {
  const s = setup();
  s.scheduler.block("sleep");
  s.scheduler.block("lock");
  s.advance(3600000);
  assert.equal(s.due, 0);
  s.scheduler.unblock("sleep");
  s.advance(3600000);
  assert.equal(s.due, 0);
  s.scheduler.unblock("lock");
  s.advance(29 * 60000);
  assert.equal(s.due, 0);
  s.advance(60000);
  assert.equal(s.due, 1);
});
test("idle return starts a fresh interval, without catch-up reminders", () => {
  const s = setup();
  s.setIdle(true);
  s.advance(3600000);
  assert.equal(s.scheduler.snapshot().reminderState, "away");
  assert.equal(s.due, 0);
  s.setIdle(false);
  s.advance(1000);
  s.advance(29 * 60000);
  assert.equal(s.due, 0);
  s.advance(60000);
  assert.equal(s.due, 1);
});
test("quiet hours span midnight and end at the configured local time", () => {
  const c = migrateConfig();
  const at = (day, h, m = 0) => new Date(2026, 8, day, h, m).getTime();
  assert.equal(quietUntil(c, at(22, 17, 59)), null);
  assert.equal(quietUntil(c, at(22, 18)), at(23, 9));
  assert.equal(quietUntil(c, at(23, 8, 59)), at(23, 9));
  assert.equal(quietUntil(c, at(23, 9)), null);
  assert.equal(
    quietUntil(
      { ...c, quietStart: "12:00", quietEnd: "13:00" },
      at(22, 12, 30),
    ),
    at(22, 13),
  );
  assert.equal(
    quietUntil({ ...c, quietStart: "12:00", quietEnd: "12:00" }, at(22, 12)),
    null,
  );
});
test("quiet time suppresses a due reminder; exit fires only once", () => {
  const s = setup({ quietStart: "10:15", quietEnd: "11:00" });
  s.advance(30 * 60000);
  assert.equal(s.due, 0);
  s.advance(30 * 60000);
  assert.equal(s.due, 1);
  s.advance(1000);
  assert.equal(s.due, 1);
});
test("configuration validation rejects non-finite values and malformed times", () => {
  assert.deepEqual(
    sanitizePatch({
      interval: Infinity,
      dailyGoal: NaN,
      quietStart: "25:00",
      quietEnd: "9:00",
      autoStart: "false",
      focus: "invalid",
      history: {},
    }),
    {},
  );
  assert.deepEqual(
    sanitizePatch({ interval: 2, dailyGoal: 100, quietStart: "17:30" }),
    { interval: 5, dailyGoal: 50, quietStart: "17:30" },
  );
});
test("migration preserves real history, imports v1 counts, and isolates defaults", () => {
  const day = new Date(2026, 8, 22);
  const c = migrateConfig({ stretchCount: 4, history: null }, day);
  assert.equal(c.history["2026-09-22"], 4);
  assert.equal(c.version, 3);
  const other = migrateConfig();
  other.history.x = 5;
  assert.equal(migrateConfig().history.x, undefined);
  assert.deepEqual(
    migrateConfig({
      history: { "2026-09-21": 2, invalid: 3, "2026-09-20": -1 },
    }).history,
    { "2026-09-21": 2 },
  );
});
test("streak expires without deleting history; local calendar arithmetic works", () => {
  const history = { "2026-09-20": 1, "2026-09-21": 2 };
  assert.equal(streakFor(history, new Date(2026, 8, 22)), 2);
  assert.equal(streakFor(history, new Date(2026, 8, 23)), 0);
  assert.equal(
    streakFor({ "2026-02-28": 1, "2026-03-01": 1 }, new Date(2026, 2, 1)),
    2,
  );
});

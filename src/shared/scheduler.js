"use strict";
// A single clock owns reminders. No competing interval/snooze timeouts.
function quietUntil(config, now) {
  if (!config.quietHoursEnabled || config.quietStart === config.quietEnd)
    return null;
  const [sh, sm] = config.quietStart.split(":").map(Number);
  const [eh, em] = config.quietEnd.split(":").map(Number);
  const start = sh * 60 + sm,
    end = eh * 60 + em;
  const time = new Date(now),
    minutes = time.getHours() * 60 + time.getMinutes();
  const quiet =
    start < end
      ? minutes >= start && minutes < end
      : minutes >= start || minutes < end;
  if (!quiet) return null;
  const until = new Date(time);
  until.setHours(eh, em, 0, 0);
  if (until.getTime() <= now) until.setDate(until.getDate() + 1);
  return until.getTime();
}
class ReminderScheduler {
  constructor({
    now = () => Date.now(),
    getConfig,
    isIdle = () => false,
    onDue,
    onChange = () => {},
  }) {
    Object.assign(this, { now, getConfig, isIdle, onDue, onChange });
    this.dueAt = null;
    this.snoozedUntil = null;
    this.blockers = new Set();
    this.inSession = false;
    this.wasIdle = false;
  }
  interval() {
    return this.getConfig().interval * 60000;
  }
  enabled() {
    const c = this.getConfig();
    return c.remindersEnabled && c.onboardingDone;
  }
  reset() {
    this.snoozedUntil = null;
    this.dueAt = this.enabled() ? this.now() + this.interval() : null;
    this.onChange();
  }
  configure(previous) {
    const c = this.getConfig();
    if (
      ["interval", "remindersEnabled", "onboardingDone"].some(
        (k) => c[k] !== previous[k],
      )
    )
      this.reset();
    else this.onChange();
  }
  block(reason) {
    this.blockers.add(reason);
    this.onChange();
  }
  unblock(reason) {
    this.blockers.delete(reason);
    if (!this.blockers.size) this.reset();
    else this.onChange();
  }
  begin() {
    this.inSession = true;
    this.onChange();
  }
  finish() {
    this.inSession = false;
    this.reset();
  }
  snooze(minutes) {
    this.inSession = false;
    this.snoozedUntil = this.enabled() ? this.now() + minutes * 60000 : null;
    this.dueAt = this.snoozedUntil;
    this.onChange();
  }
  snapshot() {
    const c = this.getConfig(),
      now = this.now(),
      quiet = quietUntil(c, now);
    if (!c.onboardingDone) return { reminderState: "setup", nextFireAt: null };
    if (!c.remindersEnabled)
      return { reminderState: "paused", nextFireAt: null };
    if (this.blockers.size) return { reminderState: "away", nextFireAt: null };
    if (this.inSession) return { reminderState: "session", nextFireAt: null };
    if (quiet)
      return {
        reminderState: "quiet",
        nextFireAt: Math.max(quiet, this.dueAt || 0),
      };
    if (this.wasIdle) return { reminderState: "away", nextFireAt: null };
    return {
      reminderState: this.snoozedUntil > now ? "snoozed" : "scheduled",
      nextFireAt: this.dueAt,
    };
  }
  tick() {
    if (!this.enabled() || this.blockers.size || this.inSession) return;
    if (this.isIdle()) {
      if (!this.wasIdle) {
        this.wasIdle = true;
        this.onChange();
      }
      return;
    }
    if (this.wasIdle) {
      this.wasIdle = false;
      this.reset();
      return;
    }
    if (quietUntil(this.getConfig(), this.now())) return;
    if (this.dueAt === null) {
      this.reset();
      return;
    }
    if (this.now() >= this.dueAt) {
      this.snoozedUntil = null;
      this.inSession = true;
      this.dueAt = null;
      this.onChange();
      this.onDue();
    }
  }
}
module.exports = { ReminderScheduler, quietUntil };

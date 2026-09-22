(function (root) {
  "use strict";
  class SessionClock {
    constructor() {
      this.elapsed = 0;
      this.running = false;
      this.last = null;
      this.interrupted = false;
    }
    start(now) {
      this.running = true;
      this.last = now;
      this.interrupted = false;
    }
    pause(now) {
      if (this.running) this.tick(now);
      this.running = false;
      this.last = null;
    }
    tick(now) {
      if (!this.running) return this.elapsed;
      const delta = Math.max(0, now - this.last);
      this.last = now;
      // A suspended/hidden renderer must never count a laptop sleep as exercise.
      if (delta > 2000) {
        this.running = false;
        this.interrupted = true;
        return this.elapsed;
      }
      this.elapsed += delta / 1000;
      return this.elapsed;
    }
  }
  if (typeof module !== "undefined" && module.exports)
    module.exports = { SessionClock };
  if (root) root.StretchClock = { SessionClock };
})(typeof window !== "undefined" ? window : null);

"use strict";
const { _electron, chromium } = require("playwright");
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { createServer } = require("./serve-site.cjs");
const root = path.resolve(__dirname, ".."),
  out = path.join(root, "artifacts/screenshots");
fs.mkdirSync(out, { recursive: true });
const errors = [];
function monitor(page) {
  page.on("pageerror", (error) => errors.push(error.message));
}
async function noOverflow(page) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "horizontal overflow",
  );
}
async function main() {
  if (!process.argv.includes("--site-only")) {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "stretch-v2-ui-"));
    const electron = await _electron.launch({
      args: [root],
      env: { ...process.env, STRETCH_TEST_USER_DATA: userData },
      timeout: 30000,
    });
    electron.on("window", monitor);
    try {
      const page = await electron.firstWindow();
      monitor(page);
      await page.waitForSelector("#welcome-figure svg");
      await page.screenshot({ path: path.join(out, "onboarding.png") });
      assert.equal(
        (await page.evaluate(() => window.stretch.getConfig())).reminderState,
        "setup",
      );
      await page.locator("#quiet-enabled").uncheck();
      await page.locator("#finish-btn").click();
      await page.waitForSelector("#hero-figure svg");
      assert.equal(await page.locator("#snooze-select option").count(), 4);
      assert.equal(await page.locator("#focus-select option").count(), 6);
      await page.screenshot({ path: path.join(out, "dashboard.png") });
      await noOverflow(page);
      const initial = await page.evaluate(() => window.stretch.getConfig());
      await page.locator("[data-page=settings]").click();
      await page.locator("#daily-goal-input").fill("9");
      await page.waitForTimeout(1200);
      assert.equal(
        await page.locator("#daily-goal-input").inputValue(),
        "9",
        "broadcast overwrote unsaved edit",
      );
      await page.locator("#save-btn").click();
      await page.waitForFunction(
        () =>
          document.getElementById("save-status").textContent ===
          "Preferences saved",
      );
      const saved = await page.evaluate(() => window.stretch.getConfig());
      assert.equal(saved.dailyGoal, 9);
      assert.equal(
        saved.nextFireAt,
        initial.nextFireAt,
        "daily goal reset reminder",
      );
      await page.screenshot({
        path: path.join(out, "preferences.png"),
        fullPage: true,
      });
      await page.locator("[data-page=library]").click();
      assert.equal(await page.locator(".exercise-card").count(), 10);
      await page.screenshot({
        path: path.join(out, "library.png"),
        fullPage: true,
      });
      await page.getByRole("button", { name: "Wrists", exact: true }).click();
      assert.equal(await page.locator(".exercise-card").count(), 2);
      await page.evaluate(() =>
        window.stretch.updateConfig({ remindersEnabled: false }),
      );
      const overlayPromise = electron.waitForEvent("window");
      await page.evaluate(() => window.stretch.startSession(["shoulder-roll"]));
      let overlay = await overlayPromise;
      monitor(overlay);
      await overlay.waitForSelector("#exercise-figure svg");
      assert.equal(
        await overlay.locator("#ex-title").textContent(),
        "Shoulder rolls",
      );
      assert.equal(
        await overlay.evaluate(async () =>
          window.stretch.overlayAction(
            "done",
            (await window.stretch.getOverlay()).id,
          ),
        ),
        false,
        "early completion accepted",
      );
      await overlay.screenshot({ path: path.join(out, "player.png") });
      await overlay.locator("#expand-btn").click();
      await overlay.waitForFunction(() =>
        document.body.classList.contains("immersive"),
      );
      await overlay.screenshot({ path: path.join(out, "immersive.png") });
      await overlay.keyboard.press("Escape");
      assert.equal(await overlay.locator("body").getAttribute("class"), "");
      await overlay.locator("#play-btn").click();
      await overlay.waitForFunction(
        () =>
          document.getElementById("play-btn").textContent === "Pause movement",
      );
      await overlay.waitForTimeout(700);
      await overlay.locator("#play-btn").click();
      const paused = await overlay.locator("#timer").textContent();
      await overlay.waitForTimeout(1200);
      assert.equal(
        await overlay.locator("#timer").textContent(),
        paused,
        "pause counted time",
      );
      await overlay.locator("#play-btn").click();
      await electron.evaluate(({ powerMonitor }) =>
        powerMonitor.emit("lock-screen"),
      );
      await overlay.waitForFunction(
        () => document.getElementById("phase-label").textContent === "Paused",
      );
      await electron.evaluate(({ powerMonitor }) =>
        powerMonitor.emit("unlock-screen"),
      );
      await overlay.locator("#play-btn").click();
      await overlay.waitForFunction(
        () =>
          document.getElementById("play-btn").textContent ===
          "Finish & save break",
        {},
        { timeout: 40000 },
      );
      await overlay.locator("#play-btn").click();
      await page.waitForFunction(
        () => document.getElementById("today-count").textContent === "1",
      );
      const completed = await page.evaluate(() => window.stretch.getConfig());
      assert.equal(completed.today, 1);
      assert.equal(completed.todayMinutes, 0.5);
      assert.equal(completed.remindersEnabled, false);
      console.log(
        "PASS: real Electron setup, editing, manual session while paused, timing, pause, lock/resume, immersive bounds, completion.",
      );
      await page.evaluate(() =>
        window.stretch.updateConfig({ remindersEnabled: true }),
      );
      const snoozePromise = electron.waitForEvent("window");
      await page.evaluate(() => window.stretch.startSession(["neck-turn"]));
      overlay = await snoozePromise;
      await overlay.waitForSelector("#exercise-figure svg");
      await overlay.locator("#snooze-btn").click();
      await page.waitForFunction(
        async () =>
          (await window.stretch.getConfig()).reminderState === "snoozed",
      );
      const snoozed = await page.evaluate(() => window.stretch.getConfig());
      assert.equal(snoozed.reminderState, "snoozed");
      assert.ok(snoozed.nextFireAt - Date.now() > 295000);
      await electron.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setSize(740, 600),
      );
      await page.locator("[data-page=today]").click();
      await noOverflow(page);
      await page.screenshot({
        path: path.join(out, "dashboard-small.png"),
        fullPage: true,
      });
      console.log("PASS: snooze and minimum Mac window size.");
      await page.locator("#snooze-select").selectOption("15");
      await page.waitForFunction(
        async () =>
          (await window.stretch.getConfig()).reminderState === "snoozed",
      );
      assert.ok(
        (await page.evaluate(() => window.stretch.getConfig())).nextFireAt -
          Date.now() >
          895000,
      );
      await page.evaluate(() =>
        window.stretch.updateConfig({ interval: 5, quietHoursEnabled: false }),
      );
      await electron.evaluate(async ({ BrowserWindow }) => {
        const main = BrowserWindow.getAllWindows()[0];
        await new Promise((resolve) => {
          main.once("enter-full-screen", resolve);
          main.setFullScreen(true);
        });
      });
      const automaticWindow = electron.waitForEvent("window");
      await electron.evaluate(({ powerMonitor }) => {
        globalThis.stretchTestDateNow = Date.now;
        Date.now = () => globalThis.stretchTestDateNow() + 301000;
        powerMonitor.getSystemIdleTime = () => 0;
      });
      overlay = await automaticWindow;
      await overlay.waitForSelector("#exercise-figure svg");
      assert.equal(
        (await overlay.evaluate(() => window.stretch.getOverlay())).automatic,
        true,
      );
      const flags = await electron.evaluate(({ BrowserWindow }) => {
        const wins = BrowserWindow.getAllWindows();
        return {
          fullscreen: wins.some((w) => w.isFullScreen()),
          visible: wins.find(w=>w.webContents.getURL().endsWith('overlay.html')).isVisible(),
          focused: wins.find(w=>w.webContents.getURL().endsWith('overlay.html')).isFocused(),
          allSpaces: wins.find(w=>w.webContents.getURL().endsWith('overlay.html')).isVisibleOnAllWorkspaces(),
        };
      });
      assert.equal(flags.fullscreen, true);
      assert.equal(flags.visible, true);
      assert.equal(flags.focused, false);
      assert.equal(flags.allSpaces, true);
      await overlay.screenshot({
        path: path.join(out, "automatic-reminder.png"),
      });
      await overlay.locator("#close-btn").click();
      await electron.evaluate(async ({ BrowserWindow }) => {
        Date.now = globalThis.stretchTestDateNow;
        const main = BrowserWindow.getAllWindows()[0];
        await new Promise((resolve) => {
          main.once("leave-full-screen", resolve);
          main.setFullScreen(false);
        });
      });
      console.log(
        "PASS: actual automatic reminder over native Mac fullscreen, without keyboard focus.",
      );
    } finally {
      await electron.close();
    }
  }
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    monitor(page);
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForSelector("#site-figure svg");
    await page.screenshot({
      path: path.join(out, "website-desktop.png"),
      fullPage: true,
    });
    await noOverflow(page);
    await page.locator("#movements").scrollIntoViewIfNeeded();
    await page.locator("#demo-play").click();
    await page.waitForTimeout(300);
    assert.equal(
      await page.locator("#demo-play").textContent(),
      "Pause movement",
    );
    await page.locator("#demo-play").click();
    await page.getByRole("button", { name: "Wrists", exact: true }).click();
    assert.equal(
      await page.locator("#demo-title").textContent(),
      "Wrist release",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await noOverflow(page);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: path.join(out, "website-mobile.png"),
      fullPage: true,
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await page.waitForSelector("#site-figure svg");
    const pose = await page.locator("#site-figure").innerHTML();
    await page.waitForTimeout(300);
    assert.equal(
      await page.locator("#site-figure").innerHTML(),
      pose,
      "reduced motion still moves",
    );
    for (const route of ["/privacy.html", "/download/"]) {
      await page.goto(`http://127.0.0.1:${server.address().port}${route}`);
      await noOverflow(page);
      assert.equal(await page.locator("h1").count(), 1);
    }
    console.log(
      "PASS: website desktop/mobile, interactive demo, reduced motion, privacy and download pages.",
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  assert.deepEqual(errors, [], "renderer errors");
  console.log("All UI checks passed. Screenshots: " + out);
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});

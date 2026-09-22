"use strict";
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  screen,
  powerMonitor,
  shell,
  clipboard,
  nativeImage,
} = require("electron");
const path = require("path");
const fs = require("fs");
const { performance } = require("perf_hooks");
const { randomUUID } = require("crypto");
const {
  migrateConfig,
  sanitizePatch,
  dateKey,
  streakFor,
  cleanHistory,
} = require("./src/shared/config");
const { ReminderScheduler } = require("./src/shared/scheduler");
const { EXERCISES, SOURCES, pickExercise } = require("./src/shared/exercises");
app.name = "Stretch";
if (!app.isPackaged && process.env.STRETCH_TEST_USER_DATA)
  app.setPath("userData", process.env.STRETCH_TEST_USER_DATA);
if (process.platform === "darwin") app.setActivationPolicy("accessory");
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
const configPath = path.join(app.getPath("userData"), "config.json");
let config = migrateConfig();
let mainWindow, overlayWindow, tray, session, scheduler, heartbeat;
let immersive = false;
const webPreferences = {
  preload: path.join(__dirname, "src/preload.js"),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  spellcheck: false,
};
const asset = (name) => path.join(__dirname, "src/assets", name);
function saveConfig() {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath + ".tmp", JSON.stringify(config, null, 2));
  fs.renameSync(configPath + ".tmp", configPath);
}
function persist() {
  try {
    saveConfig();
  } catch (error) {
    console.error("Could not save settings:", error);
  }
}
function applyAutoStart() {
  if (!app.isPackaged) return;
  try {
    app.setLoginItemSettings({
      openAtLogin: config.autoStart,
      ...(process.platform === "win32"
        ? { path: app.getPath("exe"), args: ["--hidden"] }
        : {}),
    });
  } catch (error) {
    console.warn("Login item:", error.message);
  }
}
function publicConfig() {
  return {
    ...config,
    ...(scheduler?.snapshot() || {}),
    today: config.history[dateKey()] || 0,
    todayMinutes: config.minutesHistory[dateKey()] || 0,
    streak: streakFor(config.history),
    appVersion: app.getVersion(),
  };
}
function broadcast() {
  for (const win of BrowserWindow.getAllWindows())
    if (!win.isDestroyed())
      win.webContents.send("config-updated", publicConfig());
  updateTray();
}
function secureWindow(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
}
function createMainWindow({ show = true } = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (show) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    return mainWindow;
  }
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 790,
    minWidth: 740,
    minHeight: 600,
    show: false,
    backgroundColor: "#f6f7f2",
    title: "Stretch",
    ...(process.platform === "darwin"
      ? { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 20, y: 20 } }
      : { autoHideMenuBar: true }),
    webPreferences,
  });
  secureWindow(mainWindow);
  mainWindow.loadFile(
    path.join(
      __dirname,
      "src",
      config.onboardingDone ? "index.html" : "onboarding.html",
    ),
  );
  mainWindow.once("ready-to-show", () => {
    if (show) mainWindow.show();
  });
  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  return mainWindow;
}
function overlayBounds() {
  const display =
    overlayWindow && !overlayWindow.isDestroyed()
      ? screen.getDisplayMatching(overlayWindow.getBounds())
      : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  if (immersive) return display.bounds;
  const { x, y, width, height } = display.workArea;
  const w = Math.min(420, width - 32),
    h = Math.min(700, height - 32);
  return {
    x: x + width - w - 20,
    y: y + Math.round((height - h) / 2),
    width: w,
    height: h,
  };
}
function overlayPayload() {
  return session
    ? {
        id: session.id,
        exerciseIds: session.exerciseIds,
        preview: session.preview,
        automatic: session.automatic,
        reducedMotion: config.reducedMotion,
        todayCount: config.history[dateKey()] || 0,
        dailyGoal: config.dailyGoal,
        immersive,
      }
    : null;
}
function openSession(ids, { preview = false, automatic = false } = {}) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    if (!automatic) {
      overlayWindow.show();
      overlayWindow.focus();
    }
    return;
  }
  const selected = pickExercise(
    config.lastExerciseId,
    config.focus,
    config.recentExercises,
  );
  const exerciseIds = Array.isArray(ids)
    ? ids.filter((id) => EXERCISES.some((ex) => ex.id === id)).slice(0, 5)
    : [selected.id];
  if (!exerciseIds.length) return;
  session = {
    id: randomUUID(),
    exerciseIds,
    preview,
    automatic,
    elapsed: 0,
    runningAt: null,
    credited: false,
  };
  scheduler.begin();
  immersive = false;
  const win = (overlayWindow = new BrowserWindow({
    ...overlayBounds(),
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: "#f9faf5",
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    ...(process.platform === "darwin" ? { type: "panel" } : {}),
    webPreferences: { ...webPreferences, backgroundThrottling: false },
  }));
  secureWindow(win);
  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: config.showOverFullscreen,
    skipTransformProcessType: true,
  });
  win.loadFile(path.join(__dirname, "src/overlay.html"));
  win.once("ready-to-show", () => {
    if (win.isDestroyed()) return;
    if (automatic) win.showInactive();
    else win.show();
  });
  win.on("closed", () => {
    if (overlayWindow !== win) return;
    const snoozing = session?.closeDisposition === "snooze";
    overlayWindow = null;
    session = null;
    immersive = false;
    if (!snoozing) scheduler.finish();
    else broadcast();
  });
  win.webContents.on("render-process-gone", () => {
    if (!win.isDestroyed()) win.close();
  });
}
function setRunning(running) {
  if (!session) return;
  if (!running && session.runningAt !== null) {
    session.elapsed += (performance.now() - session.runningAt) / 1000;
    session.runningAt = null;
  }
  if (running && session.runningAt === null && !scheduler.blockers.size)
    session.runningAt = performance.now();
}
function closeSession() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.close();
}
function snooze(minutes) {
  if (session) session.closeDisposition = "snooze";
  scheduler.snooze(minutes);
  closeSession();
}
function trusted(event, win) {
  return (
    win &&
    !win.isDestroyed() &&
    event.sender === win.webContents &&
    event.senderFrame === win.webContents.mainFrame
  );
}
function humanNext() {
  const state = scheduler?.snapshot();
  const labels = {
    setup: "Welcome to Stretch",
    paused: "Reminders paused",
    quiet: "Quiet hours",
    away: "Away from your desk",
    session: "Time for yourself",
  };
  if (!state || labels[state.reminderState])
    return labels[state?.reminderState] || "Stretch";
  const minutes = Math.max(
    1,
    Math.ceil((state.nextFireAt - Date.now()) / 60000),
  );
  return `${state.reminderState === "snoozed" ? "Snoozed · next" : "Next break"} in ${minutes} min`;
}
function updateTray() {
  if (!tray || tray.isDestroyed()) return;
  const menu = Menu.buildFromTemplate([
    { label: humanNext(), enabled: false },
    { label: `${config.history[dateKey()] || 0} breaks today`, enabled: false },
    { type: "separator" },
    { label: "Open Stretch", click: () => createMainWindow() },
    { label: "Stretch now", click: () => openSession() },
    {
      label: "Reminders",
      type: "checkbox",
      checked: config.remindersEnabled,
      click: (item) => {
        config.remindersEnabled = item.checked;
        persist();
        scheduler.reset();
      },
    },
    {
      label: "Snooze",
      enabled: config.remindersEnabled,
      submenu: [5, 15, 60].map((m) => ({
        label: `${m} minutes`,
        click: () => snooze(m),
      })),
    },
    { type: "separator" },
    { label: "Quit Stretch", click: () => app.quit() },
  ]);
  tray.setToolTip(`Stretch · ${humanNext()}`);
  if (process.platform === "darwin") tray.menu = menu;
  else tray.setContextMenu(menu);
}
function createTray() {
  let icon = nativeImage.createFromPath(
    asset(process.platform === "darwin" ? "tray-Template.png" : "tray.png"),
  );
  if (icon.isEmpty())
    icon = nativeImage
      .createFromPath(path.join(__dirname, "logo.png"))
      .resize({ width: 18, height: 18 });
  if (process.platform === "darwin") icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.on("click", () => createMainWindow());
  tray.on("right-click", () => {
    updateTray();
    if (tray.menu) tray.popUpContextMenu(tray.menu);
  });
  updateTray();
}

ipcMain.handle("config:get", () => publicConfig());
ipcMain.handle("config:update", (event, patch) => {
  if (!trusted(event, mainWindow))
    throw new Error("Unsupported settings sender");
  const previous = config;
  config = { ...config, ...sanitizePatch(patch) };
  try {
    saveConfig();
  } catch (error) {
    config = previous;
    throw error;
  }
  if (config.autoStart !== previous.autoStart) applyAutoStart();
  if (overlayWindow && !overlayWindow.isDestroyed())
    overlayWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: config.showOverFullscreen,
      skipTransformProcessType: true,
    });
  scheduler.configure(previous);
  return publicConfig();
});
ipcMain.handle("onboarding:complete", (event, patch) => {
  if (!trusted(event, mainWindow)) throw new Error("Unsupported setup sender");
  const previous = config;
  config = { ...config, ...sanitizePatch(patch), onboardingDone: true };
  try {
    saveConfig();
  } catch (error) {
    config = previous;
    throw error;
  }
  applyAutoStart();
  scheduler.reset();
  mainWindow.loadFile(path.join(__dirname, "src/index.html"));
  return publicConfig();
});
ipcMain.on("session:start", (event, ids) => {
  if (trusted(event, mainWindow)) openSession(ids);
});
ipcMain.on("overlay:preview", (event) => {
  if (trusted(event, mainWindow)) openSession(undefined, { preview: true });
});
ipcMain.handle("overlay:get", (event) =>
  trusted(event, overlayWindow) ? overlayPayload() : null,
);
ipcMain.on("overlay:running", (event, id, running) => {
  if (
    trusted(event, overlayWindow) &&
    id === session?.id &&
    typeof running === "boolean"
  )
    setRunning(running);
});
ipcMain.handle("overlay:expand", (event) => {
  if (!trusted(event, overlayWindow)) return false;
  immersive = !immersive;
  overlayWindow.setBounds(overlayBounds());
  overlayWindow.webContents.send("overlay:layout", immersive);
  return immersive;
});
ipcMain.handle("overlay:action", (event, action, id) => {
  if (!trusted(event, overlayWindow) || id !== session?.id) return false;
  if (!["done", "skip", "snooze"].includes(action)) return false;
  if (action === "done") {
    const elapsed =
      session.elapsed +
      (session.runningAt === null
        ? 0
        : (performance.now() - session.runningAt) / 1000);
    const total = session.exerciseIds.reduce(
      (sum, id) => sum + EXERCISES.find((ex) => ex.id === id).seconds,
      0,
    );
    if (elapsed + 0.3 < total || session.credited) return false;
    if (!session.preview) {
      const previous = config;
      const today = dateKey();
      config = {
        ...config,
        history: cleanHistory({
          ...config.history,
          [today]: (config.history[today] || 0) + 1,
        }),
        minutesHistory: cleanHistory({
          ...config.minutesHistory,
          [today]: (config.minutesHistory[today] || 0) + total / 60,
        }),
        lastExerciseId: session.exerciseIds.at(-1),
        recentExercises: [
          ...config.recentExercises,
          ...session.exerciseIds,
        ].slice(-10),
      };
      try {
        saveConfig();
      } catch (error) {
        config = previous;
        throw error;
      }
      session.credited = true;
    }
  }
  if (action === "snooze") snooze(5);
  else closeSession();
  broadcast();
  return true;
});
ipcMain.on("reminders:snooze", (event, minutes) => {
  if (trusted(event, mainWindow) && [5, 15, 60].includes(minutes))
    snooze(minutes);
});
ipcMain.on("source:open", (event, key) => {
  if (
    (trusted(event, mainWindow) || trusted(event, overlayWindow)) &&
    SOURCES[key]
  )
    shell.openExternal(SOURCES[key].url);
});
ipcMain.on("open:privacy", () =>
  shell.openExternal("https://stretchapp.in/privacy.html"),
);
ipcMain.handle("diagnostics:copy", () => {
  clipboard.writeText(
    JSON.stringify(
      {
        version: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        electron: process.versions.electron,
        scheduler: scheduler.snapshot(),
      },
      null,
      2,
    ),
  );
  return true;
});
ipcMain.on("app:quit", () => app.quit());

app.on("second-instance", () => createMainWindow());
app.whenReady().then(() => {
  try {
    config = migrateConfig(JSON.parse(fs.readFileSync(configPath, "utf8")));
  } catch (error) {
    if (error.code !== "ENOENT")
      console.error("Could not read config:", error.message);
  }
  applyAutoStart();
  scheduler = new ReminderScheduler({
    getConfig: () => config,
    isIdle: () => powerMonitor.getSystemIdleTime() > 300,
    onDue: () => openSession(undefined, { automatic: true }),
    onChange: broadcast,
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      process.platform === "darwin"
        ? [
            {
              label: "Stretch",
              submenu: [
                { role: "about" },
                { type: "separator" },
                { role: "hide" },
                { role: "quit" },
              ],
            },
            { role: "editMenu" },
            { role: "windowMenu" },
          ]
        : [{ role: "editMenu" }],
    ),
  );
  createTray();
  const hidden =
    process.argv.includes("--hidden") ||
    (process.platform === "darwin" &&
      app.getLoginItemSettings().wasOpenedAtLogin);
  createMainWindow({ show: !config.onboardingDone || !hidden });
  scheduler.reset();
  heartbeat = setInterval(() => {
    scheduler.tick();
    broadcast();
  }, 1000);
  for (const reason of ["suspend", "lock-screen"])
    powerMonitor.on(reason, () => {
      scheduler.block(reason);
      setRunning(false);
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send("overlay:pause");
        overlayWindow.hide();
      }
    });
  for (const [event, reason] of [
    ["resume", "suspend"],
    ["unlock-screen", "lock-screen"],
  ])
    powerMonitor.on(event, () => {
      scheduler.unblock(reason);
      if (
        !scheduler.blockers.size &&
        overlayWindow &&
        !overlayWindow.isDestroyed()
      )
        overlayWindow.showInactive();
    });
  const reposition = () => {
    if (overlayWindow && !overlayWindow.isDestroyed())
      overlayWindow.setBounds(overlayBounds());
  };
  screen.on("display-removed", reposition);
  screen.on("display-metrics-changed", reposition);
  app.on("activate", () => createMainWindow());
});
app.on("before-quit", () => {
  app.isQuitting = true;
  clearInterval(heartbeat);
});
app.on("window-all-closed", () => {});

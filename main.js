'use strict';

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
  nativeImage
} = require('electron');

const path = require('path');
const fs = require('fs');
const os = require('os');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

const DEFAULT_CONFIG = {
  version: 2,
  interval: 30,               // minutes between reminders
  dailyGoal: 8,               // stretches per day
  autoStart: true,
  remindersEnabled: true,
  quietHoursEnabled: true,
  quietStart: '18:00',        // 24h HH:MM — local time
  quietEnd: '09:00',
  respectFocusAssist: true,
  notifyBeforeSeconds: 0,     // 0 = no pre-notification, else e.g. 60
  soundEnabled: false,
  onboardingDone: false,
  history: {},                // { 'YYYY-MM-DD': count }
  streak: 0,
  streakLastDay: null,
  lastExerciseId: null
};

const configPath = path.join(app.getPath('userData'), 'config.json');
let config = { ...DEFAULT_CONFIG };

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function migrateConfig(raw) {
  const next = { ...DEFAULT_CONFIG, ...raw };
  if (!next.version || next.version < 2) {
    if (typeof raw.stretchCount === 'number' && raw.stretchCount > 0) {
      next.history = next.history || {};
      next.history[todayKey()] = raw.stretchCount;
    }
    delete next.stretchCount;
    next.version = 2;
  }
  return next;
}

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      config = migrateConfig(JSON.parse(data));
    }
  } catch (err) {
    console.error('Failed to load config, starting fresh', err);
    config = { ...DEFAULT_CONFIG };
  }
  applyAutoStart();
}

function saveConfig() {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('Failed to save config', err);
  }
}

function applyAutoStart() {
  if (!app.isPackaged) return;
  try {
    app.setLoginItemSettings({
      openAtLogin: !!config.autoStart,
      path: app.getPath('exe'),
      args: ['--hidden']
    });
  } catch (err) {
    console.warn('setLoginItemSettings failed', err);
  }
}

let mainWindow = null;
let overlayWindow = null;
let tray = null;

const iconPath = () => {
  const ico = path.join(__dirname, 'build', 'icon.ico');
  if (process.platform === 'win32' && fs.existsSync(ico)) return ico;
  return path.join(__dirname, 'logo.png');
};

const baseWebPreferences = {
  preload: path.join(__dirname, 'src', 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  spellcheck: false
};

function createMainWindow({ show = true } = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (show) mainWindow.show();
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 480,
    height: 680,
    show: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    icon: iconPath(),
    backgroundColor: '#17130F',
    autoHideMenuBar: true,
    webPreferences: baseWebPreferences
  });

  const entry = config.onboardingDone ? 'index.html' : 'onboarding.html';
  mainWindow.loadFile(path.join(__dirname, 'src', entry));
  mainWindow.once('ready-to-show', () => {
    if (show) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

function createOverlayWindow(exerciseId) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.focus();
    return;
  }

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.workArea;

  overlayWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    show: false,
    backgroundColor: '#00000000',
    icon: iconPath(),
    webPreferences: baseWebPreferences
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  overlayWindow.loadFile(path.join(__dirname, 'src', 'overlay.html'));

  overlayWindow.once('ready-to-show', () => {
    overlayWindow.show();
    overlayWindow.focus();
    overlayWindow.webContents.send('overlay:show', {
      exerciseId,
      dailyGoal: config.dailyGoal,
      todayCount: config.history[todayKey()] || 0,
      streak: config.streak
    });
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

let reminderTimer = null;
let snoozeTimer = null;
let nextFireAt = null;

function isQuietNow() {
  if (!config.quietHoursEnabled) return false;
  const now = new Date();
  const [sH, sM] = (config.quietStart || '18:00').split(':').map(Number);
  const [eH, eM] = (config.quietEnd || '09:00').split(':').map(Number);
  const minNow = now.getHours() * 60 + now.getMinutes();
  const minStart = sH * 60 + sM;
  const minEnd = eH * 60 + eM;
  if (minStart === minEnd) return false;
  if (minStart < minEnd) return minNow >= minStart && minNow < minEnd;
  return minNow >= minStart || minNow < minEnd;
}

function isFocusAssistOn() {
  if (process.platform !== 'win32') return false;
  try {
    const { execSync } = require('child_process');
    const out = execSync(
      'powershell -NoProfile -Command "(Get-ItemProperty -Path \'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CloudStore\\Store\\Cache\\DefaultAccount\\$windows.data.notifications.quiethourssettings\\Current\').Data | Out-String"',
      { timeout: 800, stdio: ['ignore', 'pipe', 'ignore'] }
    ).toString();
    return /ALARMS_ONLY|PRIORITY_ONLY/i.test(out);
  } catch {
    return false;
  }
}

function isUserAwayOrBusy() {
  if (powerMonitor.getSystemIdleTime() > 60 * 10) return true; // 10 min idle
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && focused.isFullScreen()) return true;
  if (config.respectFocusAssist && isFocusAssistOn()) return true;
  return false;
}

function scheduleNext() {
  clearTimeout(reminderTimer);
  clearTimeout(snoozeTimer);
  reminderTimer = null;
  if (!config.remindersEnabled) {
    nextFireAt = null;
    updateTrayMenu();
    return;
  }
  const ms = Math.max(1, Number(config.interval) || 30) * 60 * 1000;
  nextFireAt = Date.now() + ms;
  reminderTimer = setTimeout(onTick, ms);
  updateTrayMenu();
}

function onTick() {
  if (!config.remindersEnabled) return;

  if (isQuietNow() || isUserAwayOrBusy()) {
    reminderTimer = setTimeout(onTick, 2 * 60 * 1000);
    nextFireAt = Date.now() + 2 * 60 * 1000;
    updateTrayMenu();
    return;
  }

  const { pickExercise } = require('./src/shared/exercises');
  const next = pickExercise(config.lastExerciseId);
  config.lastExerciseId = next.id;
  saveConfig();

  createOverlayWindow(next.id);
  scheduleNext();
}

function snoozeFor(minutes) {
  clearTimeout(reminderTimer);
  clearTimeout(snoozeTimer);
  reminderTimer = null;
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.close();
  const ms = minutes * 60 * 1000;
  nextFireAt = Date.now() + ms;
  snoozeTimer = setTimeout(() => {
    onTick();
  }, ms);
  updateTrayMenu();
  sendConfigToRenderers();
}

function trimHistory() {
  const keep = 365;
  const keys = Object.keys(config.history).sort();
  if (keys.length <= keep) return;
  const drop = keys.slice(0, keys.length - keep);
  for (const k of drop) delete config.history[k];
}

function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function recordStretchDone() {
  const today = todayKey();
  const yesterday = yesterdayKey();

  config.history[today] = (config.history[today] || 0) + 1;
  trimHistory();

  if (config.streakLastDay === today) {
  } else if (config.streakLastDay === yesterday) {
    config.streak = (config.streak || 0) + 1;
  } else {
    config.streak = 1;
  }
  config.streakLastDay = today;

  saveConfig();
  sendConfigToRenderers();
}

function sendConfigToRenderers() {
  const snapshot = publicConfig();
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) {
      w.webContents.send('config-updated', snapshot);
    }
  }
}

function publicConfig() {
  return {
    ...config,
    today: config.history[todayKey()] || 0,
    nextFireAt,
    appVersion: app.getVersion()
  };
}

function trayImage() {
  const p = iconPath();
  const img = nativeImage.createFromPath(p);
  if (process.platform === 'darwin') {
    return img.resize({ width: 18, height: 18 });
  }
  return img;
}

function humanNext() {
  if (!nextFireAt) return 'Reminders off';
  const ms = nextFireAt - Date.now();
  if (ms <= 0) return 'Any moment';
  const m = Math.round(ms / 60000);
  return m < 1 ? 'In under a minute' : `Next in ${m} min`;
}

function updateTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  const menu = Menu.buildFromTemplate([
    { label: humanNext(), enabled: false },
    { type: 'separator' },
    { label: 'Open Stretch', click: () => createMainWindow({ show: true }) },
    {
      label: 'Reminders',
      type: 'checkbox',
      checked: config.remindersEnabled,
      click: (item) => {
        config.remindersEnabled = item.checked;
        saveConfig();
        scheduleNext();
        sendConfigToRenderers();
      }
    },
    {
      label: 'Snooze 15 min',
      enabled: config.remindersEnabled,
      click: () => snoozeFor(15)
    },
    {
      label: 'Snooze 1 hour',
      enabled: config.remindersEnabled,
      click: () => snoozeFor(60)
    },
    { type: 'separator' },
    {
      label: 'Stretch now',
      click: () => onTick()
    },
    { type: 'separator' },
    {
      label: 'Quit Stretch',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(`Stretch — ${humanNext()}`);
}

function createTray() {
  tray = new Tray(trayImage());
  tray.on('click', () => createMainWindow({ show: true }));
  tray.on('double-click', () => createMainWindow({ show: true }));
  updateTrayMenu();
  setInterval(updateTrayMenu, 60 * 1000);
}

ipcMain.handle('config:get', () => publicConfig());

ipcMain.handle('config:update', (_e, patch) => {
  if (!patch || typeof patch !== 'object') return publicConfig();
  const allowed = [
    'interval',
    'dailyGoal',
    'autoStart',
    'remindersEnabled',
    'quietHoursEnabled',
    'quietStart',
    'quietEnd',
    'respectFocusAssist',
    'notifyBeforeSeconds',
    'soundEnabled'
  ];
  for (const k of allowed) {
    if (k in patch) config[k] = patch[k];
  }
  if (typeof config.interval === 'number') {
    config.interval = Math.min(240, Math.max(5, Math.round(config.interval)));
  }
  if (typeof config.dailyGoal === 'number') {
    config.dailyGoal = Math.min(50, Math.max(1, Math.round(config.dailyGoal)));
  }
  saveConfig();
  applyAutoStart();
  scheduleNext();
  sendConfigToRenderers();
  return publicConfig();
});

ipcMain.handle('onboarding:complete', (_e, patch) => {
  if (patch && typeof patch === 'object') {
    if ('interval' in patch) config.interval = Math.min(240, Math.max(5, Number(patch.interval) || 30));
    if ('quietStart' in patch) config.quietStart = String(patch.quietStart);
    if ('quietEnd' in patch) config.quietEnd = String(patch.quietEnd);
    if ('quietHoursEnabled' in patch) config.quietHoursEnabled = !!patch.quietHoursEnabled;
    if ('autoStart' in patch) config.autoStart = !!patch.autoStart;
  }
  config.onboardingDone = true;
  saveConfig();
  applyAutoStart();
  scheduleNext();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  }
  return publicConfig();
});

ipcMain.on('overlay:action', (_e, action) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.close();

  if (action === 'done') {
    recordStretchDone();
  } else if (action === 'snooze') {
    snoozeFor(5);
  } else if (action === 'skip') {
    scheduleNext();
  }
});

ipcMain.on('overlay:preview', () => {
  const { pickExercise } = require('./src/shared/exercises');
  const ex = pickExercise(config.lastExerciseId);
  createOverlayWindow(ex.id);
});

ipcMain.on('open:privacy', () => {
  shell.openExternal('https://github.com/praveensankar969/stretch/blob/main/PRIVACY.md');
});

ipcMain.on('app:quit', () => {
  app.isQuitting = true;
  app.quit();
});

ipcMain.handle('diagnostics:copy', () => {
  const diag = {
    app: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: `${process.platform} ${os.release()}`,
    locale: app.getLocale(),
    configPath,
    config: {
      ...config,
      history: Object.fromEntries(
        Object.entries(config.history).slice(-7)
      )
    }
  };
  clipboard.writeText(JSON.stringify(diag, null, 2));
  return true;
});

function setupAutoUpdater() {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('error', (err) => console.warn('updater error', err?.message));
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    setInterval(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    }, 6 * 60 * 60 * 1000);
  } catch (err) {
    console.warn('electron-updater unavailable', err?.message);
  }
}

app.name = 'Stretch';
if (process.platform === 'win32') {
  app.setAppUserModelId('com.stretchapp.in');
}

app.on('second-instance', () => {
  createMainWindow({ show: true });
});

app.whenReady().then(() => {
  loadConfig();
  Menu.setApplicationMenu(null);
  createTray();

  const startedHidden = process.argv.includes('--hidden');
  if (!config.onboardingDone) {
    createMainWindow({ show: true });
  } else {
    createMainWindow({ show: !startedHidden });
  }

  scheduleNext();
  setupAutoUpdater();

  app.on('activate', () => {
    createMainWindow({ show: true });
  });
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('window-all-closed', () => {});

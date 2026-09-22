const { contextBridge, ipcRenderer } = require("electron");
function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
contextBridge.exposeInMainWorld("stretch", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  updateConfig: (patch) => ipcRenderer.invoke("config:update", patch),
  completeOnboarding: (patch) =>
    ipcRenderer.invoke("onboarding:complete", patch),
  startSession: (ids) => ipcRenderer.send("session:start", ids),
  getOverlay: () => ipcRenderer.invoke("overlay:get"),
  overlayAction: (action, id) =>
    ipcRenderer.invoke("overlay:action", action, id),
  setSessionRunning: (id, running) =>
    ipcRenderer.send("overlay:running", id, running),
  expandOverlay: () => ipcRenderer.invoke("overlay:expand"),
  previewOverlay: () => ipcRenderer.send("overlay:preview"),
  snooze: (minutes) => ipcRenderer.send("reminders:snooze", minutes),
  openSource: (key) => ipcRenderer.send("source:open", key),
  openPrivacy: () => ipcRenderer.send("open:privacy"),
  copyDiagnostics: () => ipcRenderer.invoke("diagnostics:copy"),
  quitApp: () => ipcRenderer.send("app:quit"),
  onConfigUpdated: (callback) => subscribe("config-updated", callback),
  onOverlayPause: (callback) => subscribe("overlay:pause", callback),
  onOverlayLayout: (callback) => subscribe("overlay:layout", callback),
  platform: process.platform,
});

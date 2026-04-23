const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stretch', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  updateConfig: (patch) => ipcRenderer.invoke('config:update', patch),
  completeOnboarding: (patch) => ipcRenderer.invoke('onboarding:complete', patch),
  overlayAction: (action) => ipcRenderer.send('overlay:action', action),
  previewOverlay: () => ipcRenderer.send('overlay:preview'),
  openPrivacy: () => ipcRenderer.send('open:privacy'),
  copyDiagnostics: () => ipcRenderer.invoke('diagnostics:copy'),
  quitApp: () => ipcRenderer.send('app:quit'),
  onConfigUpdated: (callback) => {
    const listener = (_event, cfg) => callback(cfg);
    ipcRenderer.on('config-updated', listener);
    return () => ipcRenderer.removeListener('config-updated', listener);
  },
  onOverlayShow: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('overlay:show', listener);
    return () => ipcRenderer.removeListener('overlay:show', listener);
  },
  platform: process.platform
});

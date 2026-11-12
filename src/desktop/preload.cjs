const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("books", {
  settings: () => ipcRenderer.invoke("books:settings"),
  chooseFolder: () => ipcRenderer.invoke("books:choose-folder"),
  start: (request) => ipcRenderer.invoke("books:start", request),
  cancel: () => ipcRenderer.invoke("books:cancel"),
  openOutput: () => ipcRenderer.invoke("books:open-output"),
  library: () => ipcRenderer.invoke("books:library"),
  history: () => ipcRenderer.invoke("books:history"),
  schedules: () => ipcRenderer.invoke("books:schedules"),
  saveSchedule: (schedule) => ipcRenderer.invoke("books:save-schedule", schedule),
  toggleSchedule: (id, enabled) => ipcRenderer.invoke("books:toggle-schedule", id, enabled),
  deleteSchedule: (id) => ipcRenderer.invoke("books:delete-schedule", id),
  preferences: () => ipcRenderer.invoke("books:preferences"),
  savePreferences: (preferences) => ipcRenderer.invoke("books:save-preferences", preferences),
  onEvent: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("books:event", listener);
    return () => ipcRenderer.removeListener("books:event", listener);
  },
});

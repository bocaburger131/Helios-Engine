/**
 * Preload — contextBridge API for Helios Dev Console renderer.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("helios", {
  startService: (id) => ipcRenderer.invoke("service:start", { id }),
  stopService: (id) => ipcRenderer.invoke("service:stop", { id }),
  resetService: (id) => ipcRenderer.invoke("service:reset", { id }),
  getServiceStatus: () => ipcRenderer.invoke("service:status"),
  getLogHistory: (options) => ipcRenderer.invoke("logs:history", options || {}),
  subscribeLogs: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("logs:data", listener);
    return () => ipcRenderer.removeListener("logs:data", listener);
  },
  readReports: (options) => ipcRenderer.invoke("reports:read", options || {}),
  listUploadReports: () => ipcRenderer.invoke("reports:listUploads"),
  getDbStatus: () => ipcRenderer.invoke("db:status"),
  nukeAndPave: () => ipcRenderer.invoke("db:nuke"),
  getSimToggles: () => ipcRenderer.invoke("sim:getToggles"),
  setSimToggles: (toggles) => ipcRenderer.invoke("sim:setToggles", { toggles }),
  getAiModels: () => ipcRenderer.invoke("sim:getAiModels"),
  setAiModels: (models) => ipcRenderer.invoke("sim:setAiModels", { models }),
  addCustomModel: (payload) =>
    ipcRenderer.invoke("sim:addCustomModel", payload || {}),
  readEnvPreview: (options) =>
    ipcRenderer.invoke("sim:readEnvPreview", options || {}),
  getHitlQueuePayload: () => ipcRenderer.invoke("sim:hitlQueue"),
  fetchHitlQueue: () => ipcRenderer.invoke("hitl:fetchQueue"),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", { url }),
});

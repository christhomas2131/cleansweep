/**
 * CleanSweep — Preload Script
 * Exposes a safe subset of Electron APIs via contextBridge.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  /** Open native folder picker dialog */
  selectFolder: () => ipcRenderer.invoke("select-folder"),

  /** Get the app version string */
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),

  /** Open a file in the system file explorer */
  showInExplorer: (filePath) => ipcRenderer.invoke("show-in-explorer", filePath),

  /** Window controls */
  minimizeWindow: () => ipcRenderer.invoke("minimize-window"),
  maximizeWindow: () => ipcRenderer.invoke("maximize-window"),
  closeWindow: () => ipcRenderer.invoke("close-window"),

  /** Notify main process that a scan is in progress (for close dialog) */
  setScanRunning: (isRunning) => ipcRenderer.invoke("set-scan-running", isRunning),
});

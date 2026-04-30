/**
 * CleanSweep — Preload Script
 * Exposes a safe subset of Electron APIs via contextBridge.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  /** Host platform identifier ('darwin' | 'win32' | 'linux') — used to swap title-bar style. */
  platform: process.platform,

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

  /** Update Windows taskbar progress (0..1, or -1 to clear) */
  setTaskbarProgress: (p) => ipcRenderer.send("taskbar-progress", p),

  /** Install/uninstall Windows right-click context menu */
  installContextMenu: () => ipcRenderer.invoke("install-context-menu"),
  uninstallContextMenu: () => ipcRenderer.invoke("uninstall-context-menu"),

  /** Listen for deep-link scan folder (from --scan-folder CLI arg) */
  onScanFolder: (cb) => ipcRenderer.on("scan-folder-cli", (_e, folder) => cb(folder)),

  /** Open a file's containing folder in Explorer with the file selected */
  openContainingFolder: (filePath) => ipcRenderer.invoke("open-containing-folder", filePath),
});

/**
 * CleanSweep — Electron Main Process
 * Spawns the Python backend, creates the BrowserWindow, handles IPC.
 */

const { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeTheme } = require("electron");
const path = require("path");
const { spawn, execSync } = require("child_process");
const http = require("http");
const fs = require("fs");

const isDev = !app.isPackaged;

let mainWindow = null;
let backendProcess = null;
let scanIsRunning = false;
let intentionalShutdown = false;
let backendRestarts = 0;
const MAX_RESTARTS = 3;

// ── Backend spawn ─────────────────────────────────────────────────────────────
function detectPythonInterpreter() {
  // 1. Project-local virtualenv at backend/.venv (preferred — has all deps installed).
  const venvPython =
    process.platform === "win32"
      ? path.join(__dirname, "..", "backend", ".venv", "Scripts", "python.exe")
      : path.join(__dirname, "..", "backend", ".venv", "bin", "python");
  if (fs.existsSync(venvPython)) {
    return { cmd: venvPython, prefixArgs: [] };
  }

  // 2. Windows: the py launcher can pick a specific Python version.
  if (process.platform === "win32") {
    return { cmd: "py", prefixArgs: ["-3.12"] };
  }

  // 3. macOS / Linux: try a specific 3.12 binary, then fall back through 3.11/3.10/3.
  const candidates = ["python3.12", "python3.11", "python3.10", "python3"];
  for (const candidate of candidates) {
    try {
      execSync(`command -v ${candidate}`, { stdio: ["ignore", "pipe", "ignore"] });
      return { cmd: candidate, prefixArgs: [] };
    } catch (_) {
      // not found, try next
    }
  }

  // 4. Last resort
  return { cmd: "python3", prefixArgs: [] };
}

function getBackendCommand() {
  if (isDev) {
    const serverPath = path.join(__dirname, "..", "backend", "server.py");
    const { cmd, prefixArgs } = detectPythonInterpreter();
    return { cmd, args: [...prefixArgs, serverPath], cwd: path.join(__dirname, "..") };
  } else {
    // Production: use the packaged binary (extension differs per platform)
    const exeName = process.platform === "win32" ? "cleansweep-engine.exe" : "cleansweep-engine";
    const backendExe = path.join(process.resourcesPath, "backend", exeName);
    return { cmd: backendExe, args: [], cwd: process.resourcesPath };
  }
}

function getErrorLogPath() {
  return path.join(app.getPath("userData"), "backend_errors.log");
}

function logBackendError(msg) {
  try {
    fs.appendFileSync(
      getErrorLogPath(),
      `[${new Date().toISOString()}] ${msg}\n`
    );
  } catch (_) {}
  console.error(msg);
}

function spawnBackend() {
  const { cmd, args, cwd } = getBackendCommand();
  console.log(`Spawning backend: ${cmd} ${args.join(" ")}`);

  // Resolve bundled ffmpeg path so the backend doesn't need it on system PATH.
  // On macOS/Linux the binary has no extension; if no bundled binary exists,
  // the backend's own search (which includes Homebrew paths and PATH) takes over.
  const ffmpegName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const ffmpegPath = isDev
    ? path.join(__dirname, "..", "resources", ffmpegName)
    : path.join(process.resourcesPath, ffmpegName);

  const env = { ...process.env };
  if (fs.existsSync(ffmpegPath)) {
    env.CLEANSWEEP_FFMPEG_PATH = ffmpegPath;
  }

  try {
    backendProcess = spawn(cmd, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });

    backendProcess.stdout.on("data", (data) => {
      if (isDev) process.stdout.write(`[backend] ${data}`);
    });

    backendProcess.stderr.on("data", (data) => {
      const msg = data.toString();
      logBackendError(`[backend:err] ${msg}`);
    });

    backendProcess.on("exit", (code, signal) => {
      logBackendError(`[backend] exited with code ${code}, signal ${signal}`);

      if (!intentionalShutdown) {
        if (backendRestarts < MAX_RESTARTS) {
          backendRestarts++;
          logBackendError(
            `[backend] Restarting backend (attempt ${backendRestarts}/${MAX_RESTARTS})...`
          );
          setTimeout(spawnBackend, 2000);
        } else {
          logBackendError("[backend] Max restarts reached. Showing error to user.");
          if (mainWindow) {
            dialog.showErrorBox(
              "CleanSweep Error",
              "The scanner keeps crashing. This might be due to insufficient memory.\n\n" +
              "Try:\n- Closing other applications\n- Scanning a smaller folder\n- Restarting CleanSweep\n\n" +
              `Error log: ${getErrorLogPath()}`
            );
          }
        }
      }
    });

    backendProcess.on("error", (err) => {
      logBackendError(`[backend] spawn error: ${err.message}`);
    });
  } catch (err) {
    logBackendError(`Failed to spawn backend: ${err.message}`);
  }
}

// ── Health check poll ─────────────────────────────────────────────────────────
function checkHealth(retries = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    let settled = false;
    const check = () => {
      let called = false;
      const once = () => { if (called) return; called = true; retry(); };
      const req = http.get("http://127.0.0.1:8899/health", (res) => {
        if (res.statusCode === 200) {
          if (!settled) { settled = true; resolve(); }
        } else {
          once();
        }
        res.resume();
      });
      req.on("error", once);
      req.setTimeout(1000, () => { req.destroy(); once(); });
    };
    const retry = () => {
      attempts++;
      if (attempts >= retries) {
        if (!settled) { settled = true; reject(new Error("Backend did not start within 30 seconds")); }
      } else {
        setTimeout(check, 1000);
      }
    };
    check();
  });
}

// ── Create Window ─────────────────────────────────────────────────────────────
function createWindow() {
  const isMac = process.platform === "darwin";
  mainWindow = new BrowserWindow({
    title: "CleanSweep",
    width: 1000,
    height: 700,
    minWidth: 900,
    minHeight: 600,
    // Mac: hiddenInset puts the traffic-light buttons inset over the page,
    // no native title bar — gives a modern Mac look.
    // Windows / Linux: keep the chromeless window so the custom HTML title bar provides controls.
    frame: isMac ? true : false,
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    // Mac vibrancy: frosted-glass window background. CSS makes the body
    // partially translucent so this shows through subtly.
    vibrancy: isMac ? "under-window" : undefined,
    visualEffectState: isMac ? "active" : undefined,
    backgroundColor: isMac ? "#00000000" : "#0f0f0f",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load frontend
  const frontendPath = isDev
    ? path.join(__dirname, "..", "frontend", "index.html")
    : path.join(process.resourcesPath, "frontend", "index.html");

  mainWindow.loadFile(frontendPath);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  // Deep-link CLI: forward --scan-folder to the renderer once DOM is ready
  const scanFolderArg = getScanFolderArg();
  if (scanFolderArg) {
    mainWindow.webContents.once("did-finish-load", () => {
      try { mainWindow.webContents.send("scan-folder-cli", scanFolderArg); } catch (_) {}
    });
  }

  // Close dialog if scan is running
  mainWindow.on("close", (e) => {
    if (scanIsRunning) {
      e.preventDefault();
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: "question",
        buttons: ["Keep Scanning", "Quit"],
        defaultId: 0,
        cancelId: 0,
        title: "Scan in Progress",
        message: "A scan is in progress. Progress will be saved automatically. Quit anyway?",
      });
      if (choice === 1) {
        scanIsRunning = false;
        mainWindow.close();
      }
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ── Kill backend ──────────────────────────────────────────────────────────────
async function shutdownBackend() {
  intentionalShutdown = true;
  // Signal backend to save progress
  try {
    await new Promise((resolve, reject) => {
      const req = http.request(
        { hostname: "127.0.0.1", port: 8899, path: "/stop", method: "POST" },
        (res) => { res.resume(); resolve(); }
      );
      req.on("error", reject);
      req.setTimeout(2000, () => { req.destroy(); resolve(); });
      req.end();
    });
  } catch (_) {}

  if (backendProcess) {
    try {
      backendProcess.kill("SIGTERM");
      setTimeout(() => {
        if (backendProcess) {
          try { backendProcess.kill("SIGKILL"); } catch (_) {}
        }
      }, 2000);
    } catch (_) {}
    backendProcess = null;
  }
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────
ipcMain.handle("select-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Select folder to scan",
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle("get-app-version", () => {
  const pkg = require(path.join(__dirname, "package.json"));
  return pkg.version || "0.1.0";
});

ipcMain.handle("show-in-explorer", (_event, filePath) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle("minimize-window", () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle("maximize-window", () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle("close-window", () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle("set-scan-running", (_event, isRunning) => {
  scanIsRunning = isRunning;
});

// ── B4: Taskbar progress ──────────────────────────────────────────────────────
ipcMain.on("taskbar-progress", (_event, percent) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.setProgressBar(percent >= 0 ? percent : -1);
    } catch (e) {
      // setProgressBar not supported on some platforms
    }
  }
});

// ── E1: Windows right-click context menu ─────────────────────────────────────
function installContextMenu() {
  if (process.platform !== "win32") return { ok: false, error: "Only supported on Windows" };
  try {
    const exePath = app.getPath("exe");
    const escapedExe = exePath.replace(/\\/g, "\\\\");
    const commands = [
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\CleanSweep" /ve /d "Scan with CleanSweep" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\CleanSweep" /v Icon /d "${escapedExe}" /f`,
      `reg add "HKCU\\Software\\Classes\\Directory\\shell\\CleanSweep\\command" /ve /d "\\"${escapedExe}\\" --scan-folder \\"%1\\"" /f`,
    ];
    for (const cmd of commands) execSync(cmd, { windowsHide: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function uninstallContextMenu() {
  if (process.platform !== "win32") return { ok: false, error: "Only supported on Windows" };
  try {
    execSync(`reg delete "HKCU\\Software\\Classes\\Directory\\shell\\CleanSweep" /f`, { windowsHide: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

ipcMain.handle("install-context-menu", () => installContextMenu());
ipcMain.handle("uninstall-context-menu", () => uninstallContextMenu());

// ── FIX 3: Open containing folder in Explorer ─────────────────────────────────
ipcMain.handle("open-containing-folder", (_event, filePath) => {
  try {
    shell.showItemInFolder(filePath);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ── Native application menu (Mac-first; works on Windows/Linux too) ─────────
function sendToRenderer(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

function buildAppMenu() {
  const isMac = process.platform === "darwin";
  const appName = app.name || "CleanSweep";

  const template = [
    // App menu (Mac only) — quit, services, hide, etc.
    ...(isMac ? [{
      label: appName,
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: "Settings…",
          accelerator: "Cmd+,",
          click: () => sendToRenderer("menu-action", "settings"),
        },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    }] : []),

    {
      label: "File",
      submenu: [
        {
          label: "New Scan…",
          accelerator: "CmdOrCtrl+N",
          click: () => sendToRenderer("menu-action", "new-scan"),
        },
        {
          label: "Open Folder…",
          accelerator: "CmdOrCtrl+O",
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ["openDirectory"],
              title: "Select folder to scan",
            });
            if (!result.canceled && result.filePaths.length) {
              sendToRenderer("menu-action", "open-folder", result.filePaths[0]);
            }
          },
        },
        { type: "separator" },
        {
          label: "Export Results…",
          accelerator: "CmdOrCtrl+E",
          click: () => sendToRenderer("menu-action", "export"),
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },

    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
        { type: "separator" },
        {
          label: "Find…",
          accelerator: "CmdOrCtrl+F",
          click: () => sendToRenderer("menu-action", "find"),
        },
      ],
    },

    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },

    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac ? [
          { type: "separator" },
          { role: "front" },
          { type: "separator" },
          { role: "window" },
        ] : [
          { role: "close" },
        ]),
      ],
    },

    {
      role: "help",
      submenu: [
        {
          label: "CleanSweep on GitHub",
          click: () => shell.openExternal("https://github.com/christhomas2131/cleansweep"),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Parse --scan-folder CLI arg ──────────────────────────────────────────────
function getScanFolderArg() {
  for (const arg of process.argv) {
    if (arg.startsWith("--scan-folder=")) {
      return arg.slice("--scan-folder=".length);
    }
    if (arg === "--scan-folder") {
      const idx = process.argv.indexOf(arg);
      if (idx >= 0 && idx + 1 < process.argv.length) {
        return process.argv[idx + 1];
      }
    }
  }
  return null;
}

// ── App Lifecycle ─────────────────────────────────────────────────────────────
// Track dock-icon folder drops fired before the renderer is ready.
let pendingOpenFolder = null;

app.on("open-file", (event, filePath) => {
  // macOS dock drops + Finder "Open With" route through here.
  event.preventDefault();
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.isLoading() === false) {
    sendToRenderer("menu-action", "open-folder", filePath);
  } else {
    pendingOpenFolder = filePath;
  }
});

app.whenReady().then(async () => {
  buildAppMenu();
  spawnBackend();

  try {
    await checkHealth(30);
  } catch (err) {
    dialog.showErrorBox(
      "CleanSweep — Startup Error",
      "CleanSweep couldn't start the scanning engine. Make sure Python and dependencies are installed.\n\n" + err.message
    );
    app.quit();
    return;
  }

  createWindow();

  // If a dock-drop arrived before the window existed, replay it once loaded.
  if (pendingOpenFolder) {
    mainWindow.webContents.once("did-finish-load", () => {
      sendToRenderer("menu-action", "open-folder", pendingOpenFolder);
      pendingOpenFolder = null;
    });
  }

  // Push system theme changes to the renderer for the 'system' theme option.
  nativeTheme.on("updated", () => {
    sendToRenderer("native-theme-updated", {
      shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
    });
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", async () => {
  await shutdownBackend();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async (e) => {
  e.preventDefault();
  await shutdownBackend();
  app.exit(0);
});

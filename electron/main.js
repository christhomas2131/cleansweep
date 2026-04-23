/**
 * CleanSweep — Electron Main Process
 * Spawns the Python backend, creates the BrowserWindow, handles IPC.
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
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
function getBackendCommand() {
  if (isDev) {
    // Development: run Python 3.12 via the py launcher
    const serverPath = path.join(__dirname, "..", "backend", "server.py");
    return { cmd: "py", args: ["-3.12", serverPath], cwd: path.join(__dirname, "..") };
  } else {
    // Production: use the packaged exe
    const backendExe = path.join(
      process.resourcesPath,
      "backend",
      "cleansweep-engine.exe"
    );
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
  console.log('Spawning backend with Python 3.12');

  // Resolve bundled ffmpeg path so the backend doesn't need it on system PATH
  const ffmpegPath = isDev
    ? path.join(__dirname, "..", "resources", "ffmpeg.exe")
    : path.join(process.resourcesPath, "ffmpeg.exe");

  try {
    backendProcess = spawn(cmd, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CLEANSWEEP_FFMPEG_PATH: ffmpegPath },
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
    const check = () => {
      const req = http.get("http://127.0.0.1:8899/health", (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          retry();
        }
        res.resume();
      });
      req.on("error", retry);
      req.setTimeout(1000, () => { req.abort(); retry(); });
    };
    const retry = () => {
      attempts++;
      if (attempts >= retries) {
        reject(new Error("Backend did not start within 30 seconds"));
      } else {
        setTimeout(check, 1000);
      }
    };
    check();
  });
}

// ── Create Window ─────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    title: "CleanSweep",
    width: 1000,
    height: 700,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hidden",
    backgroundColor: "#0f0f0f",
    frame: false,
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
      req.setTimeout(2000, () => { req.abort(); resolve(); });
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

// ── App Lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
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

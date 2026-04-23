# Phase 5: Electron Shell + Wiring
# Estimated time: ~20 minutes
# Prerequisite: Phases 1-4 working — backend + full frontend functional in browser
# Test this phase before moving to phase-6.md

Wire everything into a real desktop app with Electron.

## electron/main.js:

1. On app ready:
   - Spawn the Python backend as a child process:
     `python backend/server.py` (use path relative to app root, resolve correctly)
   - Capture stdout/stderr from the child process and log to console for debugging
   - Wait for the backend to be ready by polling GET http://127.0.0.1:8899/health every 500ms
   - Timeout after 30 seconds. If backend fails to start, show an error dialog:
     "CleanSweep couldn't start the scanning engine. Make sure Python and dependencies are installed."
     Then quit the app.
   - Once /health returns ok, create a BrowserWindow:
     - Width: 1200, Height: 800, minWidth: 900, minHeight: 600
     - titleBarStyle: 'hidden' (we'll add a custom title bar in the frontend)
     - backgroundColor: '#0f0f0f'
     - webPreferences: preload pointing to preload.js, contextIsolation: true, nodeIntegration: false
     - Load frontend/index.html via a file:// URL

2. On window close / app quit:
   - Send POST http://127.0.0.1:8899/stop (saves scan progress if running)
   - Kill the Python child process and all its subprocesses
   - Use process.kill() or tree-kill to make sure nothing orphans
   - app.quit()

3. IPC handlers registered in main.js:
   - 'select-folder': Opens Electron's dialog.showOpenDialog with properties ['openDirectory']. Returns the selected folder path string, or null if cancelled.
   - 'get-app-version': Returns the version string from electron/package.json
   - 'show-in-explorer': Accepts a file path, opens it in the system file explorer using shell.showItemInFolder()

## electron/preload.js:

Expose IPC methods via contextBridge on window.electronAPI:

```
window.electronAPI = {
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    showInExplorer: (path) => ipcRenderer.invoke('show-in-explorer', path)
}
```

## Frontend Updates:

### Update scan-setup.js — folder picker:
- Check if window.electronAPI exists (means we're running in Electron)
- If yes: clicking the drop zone or browse button calls window.electronAPI.selectFolder()
  - On result: set the folder path, trigger the /preview call for file count
- If no (running in browser for development): fall back to the text input field
- Make sure both paths work — Electron users get the native dialog, browser testers can paste a path

### Add custom title bar to index.html:
- Add a div at the very top of the body, before all screen divs
- Height: 32px, background: #0a0a0a, display flex, align-items center
- Left side: small app icon (just a Unicode shield 🛡️ or a simple SVG) + "CleanSweep" text, 12px font, #888 color
- Right side: three window control buttons:
  - Minimize (─), Maximize (□), Close (✕)
  - Each: 46px wide, 32px tall, centered text, no border, transparent background
  - Hover states: minimize/maximize → #2a2a2a, close → #dc2626
  - Font size 12px for the symbols
- Make the title bar draggable: -webkit-app-region: drag on the container
- Make buttons NOT draggable: -webkit-app-region: no-drag on each button
- Wire buttons via IPC — add these to preload.js and main.js:
  - 'minimize-window': mainWindow.minimize()
  - 'maximize-window': toggle mainWindow.maximize/unmaximize
  - 'close-window': mainWindow.close()

### Update styles.css:
- Add padding-top to the body or main content area to account for the 32px title bar
- Make sure the title bar doesn't overlap any screen content

## electron/package.json:

```json
{
  "name": "cleansweep",
  "version": "0.1.0",
  "description": "Find and remove sensitive content from your files",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "dev": "electron . --dev"
  },
  "devDependencies": {
    "electron": "^28.0.0"
  }
}
```

## Update README.md — Development Instructions:

Running in development (two separate terminal windows):

Terminal 1 — start the Python backend:
```
cd backend
pip install -r requirements.txt
python server.py
```

Terminal 2 — start the Electron app (after backend is running):
```
cd electron
npm install
npm start
```

Note: In production, these will be bundled together into a single installer.

## Verification (test these before moving to Phase 6):
- [ ] `cd electron && npm install && npm start` launches the app window
- [ ] Backend starts automatically as a child process (check terminal output)
- [ ] Custom title bar is visible, draggable, window controls work
- [ ] Native folder picker opens when clicking the drop zone
- [ ] Selected folder path populates correctly
- [ ] Full scan flow works end-to-end inside Electron: setup → progress → review
- [ ] Closing the Electron window kills the Python backend (check no orphaned python process)
- [ ] App still works in browser (frontend/index.html) with manual backend start for dev

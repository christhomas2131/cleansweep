# Phase 9: Packaging + Windows Installer
# Estimated time: ~25 minutes
# Prerequisite: Phases 1-8 passing verification
# After this phase, CleanSweep is a real installable app.

Package CleanSweep as a standalone Windows .exe installer. Users should be able to download, install, and run it without Python, Node, or any dev tools.

## Backend Packaging with PyInstaller:

### New file: backend/build_backend.py (or a spec file)

Create a PyInstaller build script that:
- Compiles backend/server.py into a single-folder distribution (not single-file — faster startup)
- Output directory: build/backend-dist/
- Includes all dependencies: flask, flask-cors, transformers, torch, pillow, pymupdf, python-docx, python-pptx, openpyxl
- Hides the console window (--noconsole flag) since Electron manages the UI
- Name the output executable: cleansweep-engine.exe

### PyInstaller command (for reference):
```
pyinstaller --name cleansweep-engine --noconsole --distpath build/backend-dist backend/server.py
```

### Important PyInstaller considerations:
- torch is huge — the dist will be ~500MB+. This is expected and acceptable.
- transformers may need hidden imports: add --hidden-import=transformers.models.vit
- PIL/Pillow may need: --hidden-import=PIL._tkinter_finder (or use --exclude-module tkinter)
- Test that the built exe actually starts and responds to GET /health

### ML Model handling:
- The NSFW model should NOT be bundled in the installer (too large, updates separately)
- On first run, the app downloads the model to: %LOCALAPPDATA%/CleanSweep/models/
- Update scanner.py to:
  1. Check if model exists in the local cache directory
  2. If not, set a flag: model_needs_download = True
  3. New endpoint: GET /model-status → {downloaded: bool, download_size_mb: float}
  4. New endpoint: POST /download-model → starts downloading model in background thread
  5. GET /model-download-progress → {status: "downloading"|"complete"|"error", percent: float, speed_mbps: float}
  6. The model downloads via huggingface_hub or transformers' built-in caching
  7. Set the cache dir: os.environ["TRANSFORMERS_CACHE"] = local_cache_path
  8. After download completes, scanning can begin

## Electron Packaging with electron-builder:

### Update electron/package.json:
Add electron-builder config and build scripts:
```json
{
  "name": "cleansweep",
  "version": "0.1.0",
  "description": "Find and remove sensitive content from your files",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder"
  },
  "build": {
    "appId": "com.cleansweep.app",
    "productName": "CleanSweep",
    "directories": {
      "output": "../build/installer"
    },
    "files": [
      "main.js",
      "preload.js",
      "package.json"
    ],
    "extraResources": [
      {
        "from": "../frontend",
        "to": "frontend"
      },
      {
        "from": "../build/backend-dist/cleansweep-engine",
        "to": "backend"
      }
    ],
    "win": {
      "target": "nsis",
      "icon": "icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "installerIcon": "icon.ico",
      "uninstallerIcon": "icon.ico",
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true
    }
  },
  "devDependencies": {
    "electron": "^28.0.0",
    "electron-builder": "^24.0.0"
  }
}
```

### Update electron/main.js for production paths:
- Detect if running in dev mode or production (packaged):
  ```
  const isDev = !app.isPackaged;
  ```
- In dev mode: spawn `python backend/server.py` as before
- In production: spawn the packaged backend exe:
  ```
  const backendPath = path.join(process.resourcesPath, 'backend', 'cleansweep-engine.exe');
  ```
- Frontend path in production:
  ```
  const frontendPath = path.join(process.resourcesPath, 'frontend', 'index.html');
  ```
- Make sure both dev and production paths work correctly

### App icon:
- Create a simple placeholder icon (256x256 .ico file)
- Use a shield or broom concept — or just generate a simple colored square with "CS" text
- Save as electron/icon.ico
- We can replace with a proper icon later — don't block shipping on design

## First-Run Experience:

### Update frontend — add a first-run/model-download screen:

New screen div in index.html: #first-run
New JS file: frontend/js/first-run.js

Flow on app launch:
1. Frontend calls GET /model-status
2. If model is already downloaded → skip to setup screen as normal
3. If model needs download → show the first-run screen:
   - "Setting up CleanSweep" heading
   - "Downloading AI model — this only happens once."
   - Progress bar (same style as scan progress bar)
   - Download speed and ETA below the bar
   - Small reassurance text: "Your files are never uploaded. Everything runs locally."
4. Frontend calls POST /download-model to start the download
5. Poll GET /model-download-progress every 500ms
6. On complete → transition to setup screen

### Update app.js screen routing:
- Add 'first-run' as a screen option
- On app load: check model status first, route to first-run if needed

## Build Script:

### New file: build.py (in project root)

Master build script that:
1. Installs backend dependencies (pip install -r backend/requirements.txt)
2. Runs PyInstaller to build the backend exe
3. Installs Electron dependencies (cd electron && npm install)
4. Runs electron-builder to create the installer
5. Reports the final installer path and size

```python
# This is a convenience script — the actual commands are:
# Step 1 (run separately): pip install pyinstaller
# Step 2 (run separately): python build.py
```

Note: The actual build may not work inside Claude Code's environment (no Windows, no display for Electron). That's fine — create the build script and config so the USER can run it on their Windows machine. The verification for this phase checks that the configs and scripts are correct, not that the build itself succeeds.

## Verification:
- [ ] backend/build_backend.py or pyinstaller spec file exists
- [ ] electron/package.json has electron-builder config with win/nsis target
- [ ] electron/main.js handles both dev and production paths (app.isPackaged check)
- [ ] GET /model-status endpoint exists and returns download status
- [ ] POST /download-model endpoint exists
- [ ] GET /model-download-progress endpoint exists
- [ ] frontend/js/first-run.js exists with model download UI
- [ ] index.html has #first-run screen div
- [ ] app.js routes to first-run screen when model not downloaded
- [ ] build.py exists with build instructions
- [ ] Backend still starts and passes Phase 1 health check (no regressions)

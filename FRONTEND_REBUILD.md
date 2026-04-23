# CleanSweep — Frontend Rebuild
# ================================
# OS reinstalled, full backup restored, but frontend/ folder is gone.
# Backend is 100% intact. Electron shell intact. Need to rebuild
# the entire UI from scratch using the existing backend API.
#
# Run in Claude Code from the CleanSweep project root.
# Estimated time: ~90 minutes
#
# RULES:
# - Read phase files for the design and screen requirements
# - DO NOT modify backend/ — it works perfectly
# - DO NOT touch electron/main.js or preload.js — they work
# - This is a frontend-only rebuild


## STEP 0: Read the existing system to understand the API contract

Before writing any frontend code, read these files completely:

1. backend/server.py — list every endpoint with its method, params, and response shape.
   Print this list. The frontend MUST call these correctly.

2. electron/main.js — verify what window.electronAPI methods exist
   (selectFolder, openFile, openFolder, etc.)

3. electron/preload.js — confirm the contextBridge exposes the API correctly

4. phase-2.md through phase-6.md — for the original screen specifications

Print a summary of:
- Every API endpoint the frontend needs to call
- Every electronAPI method available
- Every screen that needs to be built


## STEP 1: Create the file structure

```
frontend/
├── index.html
├── css/
│   └── styles.css
└── js/
    ├── api.js          # API wrapper
    ├── app.js          # Screen routing + connection monitoring + global state
    ├── first-run.js    # Welcome + model download
    ├── scan-setup.js   # Folder picker + options + start scan
    ├── progress.js     # Live scan progress
    ├── review.js       # Flagged items grid
    └── settings.js     # Settings screen
```


## STEP 2: Design system (CSS variables in styles.css)

Use the zinc palette + Inter font system. Define these as :root variables:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

:root {
  --bg-base:       #09090b;
  --bg-surface:    #18181b;
  --bg-surface-2:  #27272a;
  --bg-overlay:    rgba(0, 0, 0, 0.8);
  --border-subtle: #27272a;
  --border-default:#3f3f46;
  --text-primary:  #fafafa;
  --text-secondary:#a1a1aa;
  --text-muted:    #71717a;
  --accent:        #818cf8;
  --accent-hover:  #6366f1;
  --accent-subtle: rgba(129, 140, 248, 0.1);
  --danger:        #f87171;
  --danger-subtle: rgba(248, 113, 113, 0.1);
  --warning:       #fb923c;
  --warning-subtle:rgba(251, 146, 60, 0.1);
  --success:       #4ade80;
  --success-subtle:rgba(74, 222, 128, 0.1);
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;
}
```

Global styles MUST include defensive fallbacks (lessons from v1 black screen bug):
```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; overflow: hidden; }
body {
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-base);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  /* DEFENSIVE: never invisible */
  opacity: 1 !important;
  visibility: visible !important;
}
#app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* DEFENSIVE: never invisible */
  opacity: 1 !important;
  visibility: visible !important;
}
```

Custom scrollbars:
```css
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-default); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
```


## STEP 3: index.html structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CleanSweep</title>
    <link rel="stylesheet" href="css/styles.css">
</head>
<body>
    <!-- Title bar (40px, custom window controls) -->
    <div id="title-bar">
        <div class="title-bar-left">
            <svg id="title-shield"><!-- shield icon --></svg>
            <span>CleanSweep</span>
        </div>
        <div class="title-bar-right">
            <button id="btn-settings-gear" title="Settings">⚙</button>
            <button id="btn-minimize">─</button>
            <button id="btn-maximize">□</button>
            <button id="btn-close">✕</button>
        </div>
    </div>

    <!-- Connection lost banner (hidden by default) -->
    <div id="connection-banner" class="hidden">
        Reconnecting to scanner...
    </div>

    <!-- Main app area -->
    <div id="app">
        <div id="first-run" class="screen hidden"><!-- ... --></div>
        <div id="scan-setup" class="screen hidden"><!-- ... --></div>
        <div id="scan-progress" class="screen hidden"><!-- ... --></div>
        <div id="scan-review" class="screen hidden"><!-- ... --></div>
        <div id="settings" class="screen hidden"><!-- ... --></div>
    </div>

    <!-- Modals (delete, quarantine, activation, history, stop, shortcuts) -->
    <!-- ... -->

    <!-- Toast container -->
    <div id="toast-container"></div>

    <!-- Scripts in order -->
    <script src="js/api.js"></script>
    <script src="js/app.js"></script>
    <script src="js/first-run.js"></script>
    <script src="js/scan-setup.js"></script>
    <script src="js/progress.js"></script>
    <script src="js/review.js"></script>
    <script src="js/settings.js"></script>
</body>
</html>
```

CRITICAL: Every screen has class "screen hidden" by default. The .hidden class
must use `display: none !important;` to ensure it works. The .active class
removes hidden visibility.

```css
.screen { display: none; flex: 1; overflow-y: auto; padding: 48px; }
.screen.hidden { display: none !important; }
.screen.active { display: flex; flex-direction: column; align-items: center; }
```


## STEP 4: api.js — backend wrapper

Build a clean wrapper for EVERY endpoint discovered in step 0:

```javascript
const API_BASE = 'http://127.0.0.1:8899';

const api = {
  async _fetch(path, options = {}) {
    const resp = await fetch(API_BASE + path, options);
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({error: 'Unknown'}));
      throw new Error(err.message || err.error || `HTTP ${resp.status}`);
    }
    return resp.json();
  },
  health:        () => api._fetch('/health'),
  capabilities:  () => api._fetch('/capabilities'),
  modelStatus:   () => api._fetch('/model-status'),
  downloadModel: () => api._fetch('/download-model', {method: 'POST'}),
  modelProgress: () => api._fetch('/model-download-progress'),
  config:        () => api._fetch('/config'),
  setConfig: (data) => api._fetch('/config', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data)
  }),
  license:       () => api._fetch('/license'),
  activate: (key) => api._fetch('/activate', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({license_key: key})
  }),
  preview: (folder) => api._fetch('/preview?folder=' + encodeURIComponent(folder)),
  startScan: (folder, threshold, opts) => api._fetch('/scan', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({folder, threshold, ...opts})
  }),
  stopScan:      () => api._fetch('/stop', {method: 'POST'}),
  progress:      () => api._fetch('/progress'),
  results: (page=1, perPage=50, sortBy='score', sortOrder='desc', type='all') => 
    api._fetch(`/results?page=${page}&per_page=${perPage}&sort_by=${sortBy}&sort_order=${sortOrder}&type=${type}`),
  thumb: (idx)   => api._fetch(`/thumb/${idx}`),
  filmstrip: (idx) => api._fetch(`/filmstrip/${idx}`),
  delete: (paths) => api._fetch('/delete', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({paths})
  }),
  quarantine: (paths, dest) => api._fetch('/quarantine', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({paths, destination: dest})
  }),
  history:       () => api._fetch('/history'),
  exportCsv:     () => API_BASE + '/export?format=csv'  // direct download URL
};
```

Adjust based on what backend ACTUALLY exposes (from your Step 0 discovery).


## STEP 5: app.js — startup, routing, connection monitoring

CRITICAL: showScreen() must REMOVE .hidden AND ADD .active. Both. (v1 bug.)

```javascript
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.classList.add('hidden');
  });
  const target = document.getElementById(name);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('active');
    console.log('Showing screen:', name);
  }
}

document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
  // Wire up title bar buttons
  document.getElementById('btn-settings-gear')?.addEventListener('click', () => showScreen('settings'));
  if (window.electronAPI) {
    document.getElementById('btn-minimize')?.addEventListener('click', () => window.electronAPI.minimizeWindow?.());
    document.getElementById('btn-maximize')?.addEventListener('click', () => window.electronAPI.maximizeWindow?.());
    document.getElementById('btn-close')?.addEventListener('click', () => window.electronAPI.closeWindow?.());
  }

  // Health check with retries (5 tries, 1s apart)
  let healthy = false;
  for (let i = 0; i < 5; i++) {
    try {
      await api.health();
      healthy = true;
      break;
    } catch {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  if (!healthy) {
    // Show setup screen anyway — better than black screen
    showScreen('scan-setup');
    showConnectionBanner();
    startConnectionMonitor();
    return;
  }

  startConnectionMonitor();

  // Decide which screen to start on
  try {
    const modelStatus = await api.modelStatus();
    if (!modelStatus.downloaded) {
      showScreen('first-run');
      return;
    }
    const config = await api.config();
    if (!config.first_run_complete) {
      showScreen('first-run');
    } else {
      showScreen('scan-setup');
    }
  } catch (e) {
    console.error('Startup error:', e);
    showScreen('scan-setup');  // safe fallback — never black screen
  }
}

let connectionLost = false;
function startConnectionMonitor() {
  setInterval(async () => {
    try {
      await api.health();
      if (connectionLost) {
        connectionLost = false;
        document.getElementById('connection-banner')?.classList.add('hidden');
      }
    } catch {
      if (!connectionLost) {
        connectionLost = true;
        document.getElementById('connection-banner')?.classList.remove('hidden');
      }
    }
  }, 5000);
}

function showConnectionBanner() {
  document.getElementById('connection-banner')?.classList.remove('hidden');
}

// Toast utility
function toast(message, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = message;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 3000);
}
```


## STEP 6: Build each screen following the spec in phase files

For each screen, read the relevant phase file for the layout specification:

- first-run.js — Welcome + model download (phase-9.md, phase-12.md)
- scan-setup.js — Folder picker + options + Start Scan (phase-2.md)
- progress.js — Live progress with stats grid (phase-3.md)
- review.js — Grid + actions + delete/quarantine (phase-4.md, phase-11.md)
- settings.js — Theme + threshold + license (phase-12.md)

KEY LESSONS FROM V1 (don't repeat these mistakes):

1. The .hidden class MUST use display: none !important
2. showScreen() must remove .hidden AND add .active
3. Body and #app need `opacity: 1 !important` defensive CSS
4. Review toolbar must use flex-wrap so it doesn't overflow at 900-1000px width
5. When 0 items flagged, hide the entire selection toolbar — don't show empty controls
6. When user stops a scan with flagged items, offer "Review Results" button
   (don't bounce them to setup)
7. Loading states on every async button
8. Free tier limit must be a graceful "complete" status, not a crash
9. ALL fetch() calls must have .catch() — silent failures are unacceptable
10. Show "Loading AI model..." on progress screen for status='loading_model'
11. Confidence badges color-coded: red (90%+), orange (65-89%), yellow (<65%)
12. Cards blurred by default, hover to unblur, "Unblur All" toggle for grid
13. Type badges (VIDEO/PDF/etc.) on top-left corner, color-coded


## STEP 7: Build modals

Required modals:
- Delete confirmation (with file list)
- Quarantine confirmation (with destination path)
- License activation (input + buy link)
- Scan history (list of past scans)
- Stop scan confirmation (with Review Results option)

All modals share base CSS:
```css
.modal {
  display: none;
  position: fixed;
  inset: 0;
  background: var(--bg-overlay);
  z-index: 100;
  align-items: center;
  justify-content: center;
}
.modal.visible { display: flex; }
.modal-card {
  background: var(--bg-surface);
  border-radius: 12px;
  padding: 24px;
  max-width: 440px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
}
```


## STEP 8: Verify

After building everything:

1. Run `python verify.py --phase 2` — should pass (frontend setup screen checks)
2. Run `python verify.py --phase 3` — should pass (progress screen)
3. Run `python verify.py --phase 4` — should pass (review screen)
4. Run `python verify.py --phase 5` — should pass (Electron integration)
5. Run `python verify.py --phase 6` — should pass (polish)
6. Run `python verify.py --phase 9` — should pass (first-run + model download UI)
7. Run `python verify.py --phase 10` — should pass (license UI)
8. Run `python verify.py --phase 11` — should pass (quick-select, histogram)
9. Run `python verify.py --phase 12` — should pass (settings, themes)

If verify.py reports missing features, add them.

## Final summary:

Print:
1. Every file created with line count
2. Every API endpoint the frontend now calls
3. Every screen built and what it does
4. Confirmation that all 9 lessons from v1 are applied
5. Any features that need manual Electron testing

// Global app state
const appState = {
  currentScreen: null,
  prevScreen: null,
  folder: '',
  threshold: 0.5,
  scanTotal: 0,
  connectionLost: false,
};

// ── Screen routing ───────────────────────────────────────────
function showScreen(name) {
  const prev = appState.currentScreen;
  if (prev && prev !== name && prev !== 'settings') appState.prevScreen = prev;

  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.classList.add('hidden');
  });

  const target = document.getElementById(name);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('active');
    appState.currentScreen = name;
  }

  // Manage progress polling lifecycle
  if (prev === 'scan-progress' && name !== 'scan-progress') {
    if (typeof stopProgressPolling === 'function') stopProgressPolling();
  }
  if (name === 'scan-progress') {
    if (typeof startProgressPolling === 'function') startProgressPolling();
  }

  // Init screen if needed
  if (name === 'settings' && typeof initSettings === 'function') initSettings();
  if (name === 'scan-setup' && typeof initScanSetup === 'function') initScanSetup();
  if (name === 'scan-review' && typeof initReview === 'function') initReview();
}

// ── Toast notifications ──────────────────────────────────────
function toast(message, type = 'success', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('show'));
  });
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ── Loading state helper ─────────────────────────────────────
function withLoading(btn, asyncFn) {
  const orig = btn.textContent;
  btn.disabled = true;
  btn.classList.add('loading');
  return asyncFn().finally(() => {
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.textContent = orig;
  });
}

// ── Connection monitor ───────────────────────────────────────
function startConnectionMonitor() {
  setInterval(async () => {
    try {
      await api.healthCheck();
      if (appState.connectionLost) {
        appState.connectionLost = false;
        document.getElementById('connection-banner')?.classList.add('hidden');
      }
    } catch {
      if (!appState.connectionLost) {
        appState.connectionLost = true;
        document.getElementById('connection-banner')?.classList.remove('hidden');
      }
    }
  }, 5000);
}

// ── Tier badge ───────────────────────────────────────────────
async function updateTierBadge() {
  const badge = document.getElementById('title-tier-badge');
  if (!badge) return;
  try {
    const license = await api.license();
    const isPro = license && license.tier === 'pro';
    badge.textContent = isPro ? 'PRO' : 'FREE';
    badge.className = 'title-tier-badge ' + (isPro ? 'tier-pro' : 'tier-free');
    badge.title = isPro ? 'Pro member — click for details' : 'Free tier — click to upgrade';
  } catch {
    badge.textContent = '';
    badge.className = 'title-tier-badge';
  }
}
window.updateTierBadge = updateTierBadge;

// ── Wire up title bar ────────────────────────────────────────
function wireUpTitleBar() {
  document.getElementById('btn-settings-gear')?.addEventListener('click', () => {
    showScreen('settings');
  });

  document.getElementById('title-tier-badge')?.addEventListener('click', () => {
    showScreen('settings');
  });

  if (window.electronAPI) {
    // On macOS the OS provides traffic-light buttons via the native frame,
    // so the custom HTML min/max/close are redundant. Hide them.
    if (window.electronAPI.platform === 'darwin') {
      document.documentElement.classList.add('platform-mac');
      ['btn-minimize', 'btn-maximize', 'btn-close'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
    } else {
      document.getElementById('btn-minimize')?.addEventListener('click', () =>
        window.electronAPI.minimizeWindow?.()
      );
      document.getElementById('btn-maximize')?.addEventListener('click', () =>
        window.electronAPI.maximizeWindow?.()
      );
      document.getElementById('btn-close')?.addEventListener('click', () =>
        window.electronAPI.closeWindow?.()
      );
    }
  } else {
    // Non-Electron: hide native window buttons, flag for CSS
    document.documentElement.classList.add('no-electron');
    ['btn-minimize', 'btn-maximize', 'btn-close'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }
}

// ── Folder watch — poll backend for new flags and notify ─────
let _watchLastFlagId = 0;
let _watchPollHandle = null;

function startWatchPolling() {
  if (_watchPollHandle) return;
  _watchPollHandle = setInterval(async () => {
    try {
      const s = await api.watchStatus(_watchLastFlagId);
      // Stop polling if backend says watch is off
      if (!s.watching) {
        stopWatchPolling();
        return;
      }
      const flags = s.recent_flags || [];
      if (flags.length > 0) {
        flags.forEach(fireWatchNotification);
        _watchLastFlagId = Math.max(_watchLastFlagId, ...flags.map(f => f.id || 0));
      }
    } catch { /* network blip — keep polling */ }
  }, 3000);
}

function stopWatchPolling() {
  if (_watchPollHandle) {
    clearInterval(_watchPollHandle);
    _watchPollHandle = null;
  }
}

function fireWatchNotification(flag) {
  const pct = Math.round((flag.score || 0) * 100);
  const body = `${flag.filename}  ·  ${pct}%`;
  // Native NotificationCenter
  if ('Notification' in window) {
    const send = () => {
      try {
        const n = new Notification('CleanSweep — Flagged file', { body });
        n.onclick = () => {
          window.focus();
          if (flag.path && window.electronAPI?.openContainingFolder) {
            window.electronAPI.openContainingFolder(flag.path);
          }
        };
      } catch (_) {}
    };
    if (Notification.permission === 'granted') send();
    else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(p => p === 'granted' && send());
    }
  }
  // In-app toast as a backup
  toast(`Auto-scan flagged: ${flag.filename} (${pct}%)`, 'warning', 5000);
}

// On app load, resume polling if backend already has a watch active.
async function maybeResumeWatchPolling() {
  try {
    const s = await api.watchStatus(0);
    if (s.watching) {
      _watchLastFlagId = s.max_flag_id || 0;
      startWatchPolling();
    }
  } catch (_) { /* backend may not be up yet */ }
}

window.startWatchPolling = startWatchPolling;
window.stopWatchPolling = stopWatchPolling;

// ── Mac TCC permission detection ─────────────────────────────
// macOS blocks access to ~/Pictures, ~/Documents, ~/Downloads, etc. for apps
// that haven't been granted "Files and Folders" or "Full Disk Access". When
// a backend response indicates a permission failure, surface a Mac-flavored
// dialog with a one-click jump to System Settings.
const PERMISSION_PATTERNS = [
  /permission denied/i,
  /operation not permitted/i,
  /errno 1\b/,
  /access is denied/i, // Windows wording, harmless
];

function looksLikePermissionError(message) {
  if (!message || typeof message !== 'string') return false;
  return PERMISSION_PATTERNS.some(re => re.test(message));
}

function showMacPermissionDialog(folderPath) {
  // De-dup: don't pile up dialogs for repeated rejections
  if (document.getElementById('mac-tcc-dialog')) return;

  const dialog = document.createElement('div');
  dialog.id = 'mac-tcc-dialog';
  dialog.className = 'modal visible';
  dialog.innerHTML = `
    <div class="modal-card">
      <div class="modal-title">macOS is blocking access</div>
      <div class="modal-body">
        <p>CleanSweep needs permission to read this folder:</p>
        <div class="modal-file-list"><div>${folderPath ? escapeHtml(folderPath) : '(folder)'}</div></div>
        <p>Open System Settings → Privacy &amp; Security → Files &amp; Folders, find CleanSweep in the list, and toggle access on. You may need to relaunch after granting.</p>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="mac-tcc-cancel">Not now</button>
        <button class="btn btn-primary" id="mac-tcc-open">Open System Settings</button>
      </div>
    </div>`;
  document.body.appendChild(dialog);

  const close = () => dialog.remove();
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
  document.getElementById('mac-tcc-cancel')?.addEventListener('click', close);
  document.getElementById('mac-tcc-open')?.addEventListener('click', () => {
    window.electronAPI?.openSystemPrivacySettings?.()
      .catch(() => toast('Could not open System Settings.', 'error'));
    close();
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Public helper: any module that gets a permission-flavored error message
// can call this. On Mac it shows the TCC dialog; elsewhere it falls back
// to a regular toast.
window.handlePermissionError = function (message, folderPath) {
  if (window.electronAPI?.platform === 'darwin' && looksLikePermissionError(message)) {
    showMacPermissionDialog(folderPath);
    return true;
  }
  return false;
};

// ── Menu actions (Mac native menu bar) ───────────────────────
function wireMenuActions() {
  if (!window.electronAPI?.onMenuAction) return;
  window.electronAPI.onMenuAction((action, payload) => {
    switch (action) {
      case 'new-scan':
        showScreen('scan-setup');
        break;
      case 'open-folder':
        showScreen('scan-setup');
        if (payload && typeof window.addScanFolder === 'function') {
          window.addScanFolder(payload);
        }
        break;
      case 'settings':
        showScreen('settings');
        break;
      case 'export':
        // /export is a CSV download — open it via the native handler
        if (window.electronAPI?.platform) {
          window.open('http://127.0.0.1:8899/export?format=csv', '_blank');
        }
        break;
      case 'find':
        // No global search yet; for now jump to review screen if it has results
        document.getElementById('review-search-input')?.focus();
        break;
      default:
        break;
    }
  });
}

// ── Drag-and-drop a folder anywhere on the window ────────────
function wireGlobalDragDrop() {
  // Prevent the browser's default behavior of opening the dropped file
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
    document.addEventListener(evt, e => e.preventDefault(), false);
  });

  document.addEventListener('drop', e => {
    const files = Array.from(e.dataTransfer?.files || []);
    if (!files.length) return;
    const folder = files.find(f => f.path && (!f.type || f.type === ''));
    if (!folder?.path) return;
    showScreen('scan-setup');
    if (typeof window.addScanFolder === 'function') {
      window.addScanFolder(folder.path);
    }
  }, false);
}

// ── System theme follow (Mac auto-switch dark/light) ─────────
function applySystemTheme() {
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  document.body.classList.toggle('theme-light', prefersLight);
}

function wireSystemTheme(currentTheme) {
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  const handler = () => {
    if (window.cleanSweepThemeMode === 'system') applySystemTheme();
  };
  if (mq.addEventListener) {
    mq.addEventListener('change', handler);
  } else if (mq.addListener) {
    mq.addListener(handler);
  }
  // Native theme change (when sent from Electron main)
  window.electronAPI?.onNativeThemeUpdated?.(() => {
    if (window.cleanSweepThemeMode === 'system') applySystemTheme();
  });
}

// ── App initialization ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
  wireUpTitleBar();
  wireMenuActions();
  wireGlobalDragDrop();
  startConnectionMonitor();

  // Apply saved theme as early as possible. theme: 'system' follows the OS.
  api.config().then(cfg => {
    const mode = cfg?.theme || 'dark';
    window.cleanSweepThemeMode = mode;
    if (mode === 'light') {
      document.body.classList.add('theme-light');
    } else if (mode === 'system') {
      applySystemTheme();
    }
    wireSystemTheme(mode);
  }).catch(() => { wireSystemTheme('dark'); });

  // Health check with retries before doing anything
  let healthy = false;
  for (let i = 0; i < 5; i++) {
    try {
      await api.healthCheck();
      healthy = true;
      break;
    } catch {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  if (!healthy) {
    // Show setup anyway — never show a black screen
    showScreen('scan-setup');
    document.getElementById('connection-banner')?.classList.remove('hidden');
    appState.connectionLost = true;
    return;
  }

  updateTierBadge();
  maybeResumeWatchPolling();

  // Determine start screen based on model and config state
  try {
    const modelStatus = await api.modelStatus().catch(() => ({ downloaded: true }));
    if (!modelStatus.downloaded) {
      showScreen('first-run');
      if (typeof initFirstRun === 'function') initFirstRun(false);
      return;
    }

    const config = await api.config().catch(() => ({ first_run_complete: true }));
    if (!config.first_run_complete) {
      showScreen('first-run');
      if (typeof initFirstRun === 'function') initFirstRun(true);
    } else {
      showScreen('scan-setup');
    }
  } catch {
    // Safe fallback — never show black screen
    showScreen('scan-setup');
  }
}

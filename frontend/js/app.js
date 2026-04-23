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
  if (prev && prev !== name) appState.prevScreen = prev;

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

// ── Wire up title bar ────────────────────────────────────────
function wireUpTitleBar() {
  document.getElementById('btn-settings-gear')?.addEventListener('click', () => {
    showScreen('settings');
  });

  if (window.electronAPI) {
    document.getElementById('btn-minimize')?.addEventListener('click', () =>
      window.electronAPI.minimizeWindow?.()
    );
    document.getElementById('btn-maximize')?.addEventListener('click', () =>
      window.electronAPI.maximizeWindow?.()
    );
    document.getElementById('btn-close')?.addEventListener('click', () =>
      window.electronAPI.closeWindow?.()
    );
  } else {
    // Non-Electron: hide native window buttons
    ['btn-minimize', 'btn-maximize', 'btn-close'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }
}

// ── App initialization ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
  wireUpTitleBar();
  startConnectionMonitor();

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

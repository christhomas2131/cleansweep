// Scan progress screen — polling and UI updates
(function () {
  let pollInterval = null;
  let lastFlaggedCount = 0;
  let isPaused = false;
  let soundPlayed = false;
  let currentConfig = {};

  function startProgressPolling() {
    if (pollInterval) clearInterval(pollInterval);
    lastFlaggedCount = 0;
    isPaused = false;
    soundPlayed = false;
    updateProgressUI({ status: 'loading_model', percent: 0, scanned: 0, flagged_count: 0 });
    pollInterval = setInterval(fetchProgress, 500);
    // Load config for sound preference
    api.config().then(c => { currentConfig = c || {}; }).catch(() => {});
  }

  function stopProgressPolling() {
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  }

  async function fetchProgress() {
    try {
      const p = await api.getProgress();
      lastFlaggedCount = p.flagged_count || 0;
      updateProgressUI(p);

      if (p.status === 'complete') {
        stopProgressPolling();
        onScanComplete(p);
      } else if (p.status === 'stopped') {
        stopProgressPolling();
        onScanStopped(p);
      } else if (p.status === 'error') {
        stopProgressPolling();
        onScanError(p);
      }
    } catch { /* network error — keep polling */ }
  }

  function getOrCreateLoadingBanner() {
    let banner = document.getElementById('loading-model-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'loading-model-banner';
      banner.className = 'loading-model-banner';
      banner.innerHTML = `
        <div class="loading-model-spinner"></div>
        <div class="loading-model-text">
          <div class="loading-model-title">Loading AI model</div>
          <div class="loading-model-sub">Takes 30–60 seconds the first time</div>
        </div>`;
      const pctEl = document.getElementById('progress-percent');
      if (pctEl) pctEl.parentNode.insertBefore(banner, pctEl);
    }
    return banner;
  }

  function setLoadingModelMode(active) {
    const banner = getOrCreateLoadingBanner();
    banner.classList.toggle('visible', active);

    const hide = (id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = active ? 'none' : '';
    };
    hide('progress-percent');
    const barSection = document.querySelector('.progress-bar-section');
    if (barSection) barSection.style.display = active ? 'none' : '';
    const statsGrid = document.querySelector('.stats-grid');
    if (statsGrid) statsGrid.style.display = active ? 'none' : '';
    hide('current-file');
    hide('current-folder-label');
  }

  function updateProgressUI(p) {
    const status = p.status || 'idle';
    const pct = Math.round(p.percent || 0);
    const isLoadingModel = status === 'loading_model';
    isPaused = !!p.paused;

    setLoadingModelMode(isLoadingModel);
    updatePauseButton();

    // B4: Taskbar progress
    if (window.electronAPI?.setTaskbarProgress) {
      if (isLoadingModel || status === 'idle') {
        window.electronAPI.setTaskbarProgress(-1);
      } else if (status === 'scanning') {
        window.electronAPI.setTaskbarProgress(pct / 100);
      } else {
        window.electronAPI.setTaskbarProgress(-1);
      }
    }

    // Progress bar and percent
    const bar = document.getElementById('progress-bar');
    const pctEl = document.getElementById('progress-percent');
    if (bar) bar.style.width = pct + '%';
    if (pctEl) pctEl.textContent = pct + '%';

    // Status dot and label
    const dot = document.getElementById('progress-dot');
    const label = document.getElementById('progress-status-label');
    if (dot) {
      dot.className = 'progress-dot';
      if (status === 'idle' || status === 'stopped') dot.classList.add('idle');
      else if (status === 'error') dot.classList.add('error');
    }
    if (label) {
      if (status === 'loading_model') label.textContent = 'Loading AI model';
      else if (status === 'scanning' && isPaused) label.textContent = `Paused at ${pct}%`;
      else if (status === 'scanning') label.textContent = 'Scanning';
      else if (status === 'complete') label.textContent = 'Scan complete';
      else if (status === 'stopped') label.textContent = 'Scan stopped';
      else if (status === 'error') label.textContent = 'Error';
      else label.textContent = 'Scanning';
    }

    // Title bar reflects paused state
    if (status === 'scanning' && isPaused) {
      document.title = `CleanSweep — Paused at ${pct}%`;
    } else if (status === 'scanning') {
      document.title = `CleanSweep — Scanning (${pct}%)`;
    } else {
      document.title = 'CleanSweep';
    }

    // Pulse dot: don't animate while paused
    if (dot) {
      if (isPaused && status === 'scanning') dot.classList.add('idle');
    }

    // Stats
    const scanned = p.scanned || 0;
    const total = p.total || 0;
    const flagged = p.flagged_count || 0;
    const rate = p.rate || 0;
    const eta = p.eta_seconds || 0;
    const skipped = p.skipped_unchanged || 0;

    const scannedEl = document.getElementById('stat-scanned');
    const flaggedEl = document.getElementById('stat-flagged');
    const speedEl = document.getElementById('stat-speed');
    const etaEl = document.getElementById('stat-eta');

    if (scannedEl) {
      const skippedNote = skipped > 0 ? ` (+${skipped.toLocaleString()} skipped)` : '';
      scannedEl.textContent = `${scanned.toLocaleString()} / ${total.toLocaleString()}${skippedNote}`;
    }
    if (flaggedEl) flaggedEl.textContent = flagged.toLocaleString();
    const dataEl = document.getElementById('stat-data');
    if (dataEl) {
      const bytesTotal = p.bytes_total || 0;
      const bytesDone = p.bytes_processed || 0;
      dataEl.textContent = (bytesTotal > 0 && !isLoadingModel)
        ? formatBytesMatched(bytesDone, bytesTotal)
        : '— / —';
    }
    if (speedEl) speedEl.textContent = rate > 0 ? `${rate.toFixed(1)}/s` : '—';
    if (etaEl) etaEl.textContent = eta > 0 ? formatEta(eta) : '—';

    // Current file
    const cf = document.getElementById('current-file');
    if (cf) {
      const filename = p.current_file || '';
      cf.textContent = filename ? 'Scanning: ' + truncate(filename, 70) : '';
    }

    // Current folder (multi-folder scan awareness)
    const cfol = document.getElementById('current-folder-label');
    if (cfol) {
      const scannedFolders = p.scanned_folders || [];
      const current = p.current_folder || '';
      if (scannedFolders.length > 1 && current) {
        const idx = scannedFolders.findIndex(f =>
          f && (f.replace(/\\/g, '/').replace(/\/+$/, '') === current.replace(/\\/g, '/').replace(/\/+$/, ''))
        );
        const pos = idx >= 0 ? `${idx + 1}/${scannedFolders.length}` : '';
        cfol.textContent = `Folder ${pos} — ${truncate(current, 60)}`;
      } else if (scannedFolders.length === 1 || !scannedFolders.length) {
        cfol.textContent = '';
      } else {
        cfol.textContent = `${scannedFolders.length} folders in this scan`;
      }
    }

    // Limit reached notice
    if (p.limit_reached) {
      const label2 = document.getElementById('progress-status-label');
      if (label2) label2.textContent = 'Free tier limit reached';
    }

    // Error message
    const errEl = document.getElementById('progress-error');
    if (errEl) {
      if (p.error_message) { errEl.textContent = p.error_message; errEl.classList.add('visible'); }
      else errEl.classList.remove('visible');
    }

    // Show review button if items flagged and scan not running
    const reviewBtn = document.getElementById('btn-review-from-progress');
    if (reviewBtn) {
      if (flagged > 0 && status !== 'scanning' && status !== 'loading_model') {
        reviewBtn.classList.remove('hidden');
      } else {
        reviewBtn.classList.add('hidden');
      }
    }

    // Notify Electron of scan running state
    if (window.electronAPI?.setScanRunning) {
      const isRunning = status === 'scanning' || status === 'loading_model';
      window.electronAPI.setScanRunning(isRunning).catch(() => {});
    }
  }

  function onScanComplete(p) {
    updateProgressUI(p);
    const flagged = p.flagged_count || 0;
    const scanned = p.scanned || 0;
    toast(`Scan complete! Found ${flagged} item${flagged !== 1 ? 's' : ''} to review.`, 'success', 4000);
    window.electronAPI?.setScanRunning?.(false).catch(() => {});
    window.electronAPI?.setTaskbarProgress?.(-1);

    // B2: Completion sound
    if (!soundPlayed) {
      soundPlayed = true;
      playCompletionSound();
    }

    // Native NotificationCenter alert — only if user has switched away from
    // the app, otherwise the in-app toast is sufficient.
    fireCompletionNotification(scanned, flagged);

    // Mac dock badge — surfaces the flagged count even when the app isn't focused.
    window.electronAPI?.setDockBadge?.(flagged);
    // Gentle dock bounce (no-op if the window has focus) — Mac attention cue.
    window.electronAPI?.bounceDock?.(flagged > 0 ? 'informational' : 'informational');

    // Store total scanned count for review screen header
    try { sessionStorage.setItem('lastScanTotal', JSON.stringify({ total: p.total || 0, scanned: p.scanned || 0 })); } catch {}

    // Auto-navigate after 3 seconds
    const timer = setTimeout(() => {
      showScreen('scan-review');
    }, 3000);

    const reviewBtn = document.getElementById('btn-review-from-progress');
    if (reviewBtn) {
      reviewBtn.classList.remove('hidden');
      reviewBtn.onclick = () => { clearTimeout(timer); showScreen('scan-review'); };
    }
  }

  // ── B2: Completion sound ─────────────────────────────────────
  function playCompletionSound() {
    if (currentConfig && currentConfig.sound_enabled === false) return;
    // On Mac, prefer the system Glass.aiff — it sounds native + matches the
    // macOS sound design. Falls back to the synth chime if the file isn't
    // there or playback is blocked (e.g. in browser dev mode).
    const isMac = window.electronAPI?.platform === 'darwin';
    if (isMac) {
      try {
        const audio = new Audio('file:///System/Library/Sounds/Glass.aiff');
        audio.volume = 0.5;
        const promise = audio.play();
        if (promise && typeof promise.then === 'function') {
          promise.catch(() => playSynthChime());
        }
        return;
      } catch (_) {
        // fall through to synth
      }
    }
    playSynthChime();
  }

  function playSynthChime() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);        // A5
      osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.15); // E6
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
      // Silent failure is fine for a nice-to-have
    }
  }

  // ── Native completion notification (NotificationCenter on Mac) ─────────
  function fireCompletionNotification(scanned, flagged) {
    if (!('Notification' in window)) return;
    // Only show if the window is unfocused — otherwise the in-app toast
    // already covers it and we'd be double-notifying.
    if (document.hasFocus()) return;
    const send = () => {
      try {
        const body = flagged > 0
          ? `${flagged.toLocaleString()} flagged of ${scanned.toLocaleString()} scanned. Click to review.`
          : `${scanned.toLocaleString()} scanned, nothing flagged.`;
        const n = new Notification('CleanSweep — Scan complete', {
          body,
          silent: currentConfig && currentConfig.sound_enabled === false,
        });
        n.onclick = () => {
          window.focus();
          if (flagged > 0) showScreen('scan-review');
        };
      } catch (_) {}
    };
    if (Notification.permission === 'granted') {
      send();
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(perm => {
        if (perm === 'granted') send();
      });
    }
  }

  // ── B1: Pause/Resume ─────────────────────────────────────────
  function updatePauseButton() {
    const btn = document.getElementById('btn-pause-scan');
    if (!btn) return;
    btn.textContent = isPaused ? 'Resume' : 'Pause';
    // Per design brief: only ONE accent button per screen.
    // While paused, Resume becomes the primary; otherwise Pause is a ghost.
    btn.classList.toggle('btn-primary', isPaused);
    btn.classList.toggle('btn-ghost', !isPaused);
    btn.classList.remove('btn-warning');
  }
  function wirePauseButton() {
    const btn = document.getElementById('btn-pause-scan');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        if (isPaused) await api.resumeScan();
        else await api.pauseScan();
      } catch (e) {
        toast('Pause/resume failed: ' + e.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }
  document.addEventListener('DOMContentLoaded', wirePauseButton);

  function onScanStopped(p) {
    updateProgressUI(p);
    window.electronAPI?.setScanRunning?.(false).catch(() => {});
    window.electronAPI?.setTaskbarProgress?.(-1);
    const flagged = p.flagged_count || 0;
    if (flagged > 0) {
      toast(`Scan stopped — ${flagged} items flagged so far. Click "Review Results" to review.`, 'warning', 5000);
    } else {
      toast('Scan stopped.', 'warning');
      setTimeout(() => showScreen('scan-setup'), 1500);
    }
  }

  function onScanError(p) {
    updateProgressUI(p);
    window.electronAPI?.setScanRunning?.(false).catch(() => {});
    window.electronAPI?.setTaskbarProgress?.(-1);
    const msg = p.error_message || 'Unknown error';
    // Mac TCC blocking? Show the System Settings dialog instead of a toast.
    if (window.handlePermissionError?.(msg)) return;
    toast('Scanner error: ' + msg, 'error', 5000);
  }

  function formatBytesMatched(done, total) {
    const GB = 1024 ** 3;
    const MB = 1024 ** 2;
    const KB = 1024;
    if (total >= GB) return `${(done / GB).toFixed(1)} / ${(total / GB).toFixed(1)} GB`;
    if (total >= MB) return `${Math.round(done / MB)} / ${Math.round(total / MB)} MB`;
    return `${Math.round(done / KB)} / ${Math.round(total / KB)} KB`;
  }

  function formatEta(seconds) {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) {
      const m = Math.floor(seconds / 60);
      const s = Math.round(seconds % 60);
      return s > 0 ? `${m}m ${s}s` : `${m}m`;
    }
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  function truncate(str, max) {
    return str.length > max ? '...' + str.slice(-(max - 3)) : str;
  }

  // ── Stop scan modal ──────────────────────────────────────────
  function wireStopModal() {
    const btnStop = document.getElementById('btn-stop-scan');
    const modal = document.getElementById('modal-stop');
    const btnCancel = document.getElementById('btn-stop-cancel');
    const btnConfirm = document.getElementById('btn-stop-confirm');
    const btnReview = document.getElementById('btn-stop-review');
    const reviewFromProgress = document.getElementById('btn-review-from-progress');

    btnStop?.addEventListener('click', () => {
      // Show "Review Results" option only if items are flagged
      if (btnReview) {
        btnReview.style.display = lastFlaggedCount > 0 ? 'inline-flex' : 'none';
      }
      modal?.classList.add('visible');
    });

    btnCancel?.addEventListener('click', () => modal?.classList.remove('visible'));

    btnConfirm?.addEventListener('click', () => {
      modal?.classList.remove('visible');
      stopProgressPolling();
      api.stopScan().catch(() => {}).finally(() => {
        window.electronAPI?.setScanRunning?.(false).catch(() => {});
        if (lastFlaggedCount > 0) {
          showScreen('scan-review');
        } else {
          showScreen('scan-setup');
        }
      });
    });

    btnReview?.addEventListener('click', () => {
      modal?.classList.remove('visible');
      stopProgressPolling();
      api.stopScan().catch(() => {}).finally(() => {
        window.electronAPI?.setScanRunning?.(false).catch(() => {});
        showScreen('scan-review');
      });
    });

    reviewFromProgress?.addEventListener('click', () => showScreen('scan-review'));
  }

  document.addEventListener('DOMContentLoaded', wireStopModal);

  // Expose for app.js routing
  window.startProgressPolling = startProgressPolling;
  window.stopProgressPolling = stopProgressPolling;
})();

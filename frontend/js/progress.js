// Scan progress screen — polling and UI updates
(function () {
  let pollInterval = null;
  let lastFlaggedCount = 0;

  function startProgressPolling() {
    if (pollInterval) clearInterval(pollInterval);
    lastFlaggedCount = 0;
    updateProgressUI({ status: 'loading_model', percent: 0, scanned: 0, flagged_count: 0 });
    pollInterval = setInterval(fetchProgress, 500);
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
          <div class="loading-model-title">Loading AI model…</div>
          <div class="loading-model-sub">This takes 30–60 seconds the first time</div>
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
  }

  function updateProgressUI(p) {
    const status = p.status || 'idle';
    const pct = Math.round(p.percent || 0);
    const isLoadingModel = status === 'loading_model';

    setLoadingModelMode(isLoadingModel);

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
      if (status === 'loading_model') label.textContent = 'Loading AI model...';
      else if (status === 'scanning') label.textContent = 'Scanning...';
      else if (status === 'complete') label.textContent = 'Scan complete';
      else if (status === 'stopped') label.textContent = 'Scan stopped';
      else if (status === 'error') label.textContent = 'Error';
      else label.textContent = 'Scanning...';
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
    if (speedEl) speedEl.textContent = rate > 0 ? `${rate.toFixed(1)}/s` : '—';
    if (etaEl) etaEl.textContent = eta > 0 ? formatEta(eta) : '—';

    // Current file
    const cf = document.getElementById('current-file');
    if (cf) {
      const filename = p.current_file || '';
      cf.textContent = filename ? 'Scanning: ' + truncate(filename, 70) : '';
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
    toast(`Scan complete! Found ${flagged} item${flagged !== 1 ? 's' : ''} to review.`, 'success', 4000);
    window.electronAPI?.setScanRunning?.(false).catch(() => {});

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

  function onScanStopped(p) {
    updateProgressUI(p);
    window.electronAPI?.setScanRunning?.(false).catch(() => {});
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
    toast('Scanner error: ' + (p.error_message || 'Unknown error'), 'error', 5000);
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

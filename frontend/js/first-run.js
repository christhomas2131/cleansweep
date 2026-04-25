// First-run onboarding: Welcome → Model Download → Tutorial
(function () {
  let downloadInterval = null;

  function initFirstRun(modelAlreadyDownloaded) {
    const el = document.getElementById('first-run');
    if (!el) return;

    if (modelAlreadyDownloaded) {
      // Model is ready, just show tutorial before setup
      showTutorialOverlay();
      return;
    }

    renderWelcomeStep(el);
  }

  function renderWelcomeStep(el) {
    el.innerHTML = `
      <div class="first-run-card">
        <div class="first-run-step-dots">
          <div class="step-dot active"></div>
          <div class="step-dot"></div>
          <div class="step-dot"></div>
        </div>
        <div class="first-run-title">Welcome to CleanSweep</div>
        <div class="first-run-subtitle">
          Find and remove sensitive content from your photos, videos, and documents.
          Everything runs privately on your machine — your files are never uploaded.
        </div>
        <button class="btn btn-primary fr-cta" id="fr-get-started">Get started</button>
      </div>
    `;
    document.getElementById('fr-get-started')?.addEventListener('click', () => {
      renderDownloadStep(el);
    });
  }

  function renderDownloadStep(el) {
    el.innerHTML = `
      <div class="first-run-card">
        <div class="first-run-step-dots">
          <div class="step-dot"></div>
          <div class="step-dot active"></div>
          <div class="step-dot"></div>
        </div>
        <div class="first-run-title">Setting up</div>
        <div class="first-run-subtitle">Downloading the AI model — this only happens once (~350 MB).</div>
        <div class="first-run-progress">
          <div class="first-run-progress-label">
            <span id="dl-status-text">Starting download…</span>
            <span id="dl-percent-text">0%</span>
          </div>
          <div class="progress-bar-track">
            <div class="progress-bar-fill" id="dl-bar" style="width:0%"></div>
          </div>
          <div class="first-run-progress-label fr-progress-secondary">
            <span id="dl-speed-text"></span>
          </div>
        </div>
        <div class="first-run-privacy">Your files are never uploaded. Everything runs locally.</div>
      </div>
    `;

    // Start the model download
    api.downloadModel().catch(() => {
      document.getElementById('dl-status-text').textContent = 'Download failed — retrying...';
    });

    pollDownloadProgress();
  }

  function pollDownloadProgress() {
    downloadInterval = setInterval(async () => {
      try {
        const p = await api.modelProgress();
        const bar = document.getElementById('dl-bar');
        const pct = document.getElementById('dl-percent-text');
        const status = document.getElementById('dl-status-text');
        const speed = document.getElementById('dl-speed-text');

        if (bar) bar.style.width = (p.percent || 0) + '%';
        if (pct) pct.textContent = Math.round(p.percent || 0) + '%';

        if (p.status === 'complete') {
          clearInterval(downloadInterval);
          if (bar) bar.style.width = '100%';
          if (pct) pct.textContent = '100%';
          if (status) status.textContent = 'Download complete!';
          if (speed) speed.textContent = p.speed_mbps ? `${p.speed_mbps} MB/s average` : '';
          setTimeout(() => {
            api.setConfig({ first_run_complete: false })
              .catch(() => {})
              .finally(() => showTutorialOverlay());
          }, 800);
        } else if (p.status === 'error') {
          clearInterval(downloadInterval);
          if (status) status.textContent = 'Download failed. Please restart and try again.';
        } else if (p.status === 'downloading') {
          if (status) status.textContent = 'Downloading AI model...';
          if (speed && p.speed_mbps) speed.textContent = `${p.speed_mbps} MB/s`;
        } else {
          if (status) status.textContent = 'Loading AI model...';
        }
      } catch { /* network error — keep polling */ }
    }, 500);
  }

  function showTutorialOverlay() {
    const overlay = document.getElementById('tutorial-overlay');
    if (!overlay) {
      completeTutorial();
      return;
    }

    // Build the tutorial overlay HTML
    overlay.innerHTML = `
      <div class="tutorial-callout" style="top:140px;left:96px;">
        <div class="tutorial-callout-num">Step 1 of 3</div>
        Start by selecting a folder to scan — drop it in or browse your files.
      </div>
      <div class="tutorial-callout" style="top:280px;left:96px;">
        <div class="tutorial-callout-num">Step 2 of 3</div>
        Adjust sensitivity — lower values catch more, higher values reduce false positives.
      </div>
      <div class="tutorial-callout" style="top:420px;right:96px;left:auto;">
        <div class="tutorial-callout-num">Step 3 of 3</div>
        Hit scan and let the AI do the work. You review and decide what to keep or remove.
      </div>
      <div class="tutorial-dismiss-area">
        <button class="btn btn-primary" id="tutorial-got-it">Got it</button>
      </div>
    `;

    overlay.classList.add('visible');
    // Show setup screen behind the overlay
    const setupEl = document.getElementById('scan-setup');
    if (setupEl) {
      setupEl.classList.remove('hidden');
      setupEl.classList.add('active');
      appState.currentScreen = 'scan-setup';
    }
    // Ensure first-run screen is hidden behind overlay
    const frEl = document.getElementById('first-run');
    if (frEl) { frEl.classList.remove('active'); frEl.classList.add('hidden'); }

    document.getElementById('tutorial-got-it')?.addEventListener('click', () => {
      overlay.classList.remove('visible');
      completeTutorial();
    });
  }

  function completeTutorial() {
    api.setConfig({ first_run_complete: true }).catch(() => {});
    showScreen('scan-setup');
    if (typeof initScanSetup === 'function') initScanSetup();
  }

  // Expose globally
  window.initFirstRun = initFirstRun;
})();

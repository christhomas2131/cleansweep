// Settings screen
(function () {
  let currentConfig = {};
  let currentLicense = {};
  let returnScreen = 'scan-setup';

  async function initSettings() {
    const el = document.getElementById('settings');
    if (!el) return;

    // Capture return destination before any async gap
    returnScreen = appState.prevScreen || 'scan-setup';

    el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;flex:1;"><div class="spinner"></div></div>';

    try {
      [currentConfig, currentLicense] = await Promise.all([
        api.config().catch(() => ({})),
        api.license().catch(() => ({ activated: false, tier: 'free' })),
      ]);
    } catch { currentConfig = {}; currentLicense = { activated: false, tier: 'free' }; }

    renderSettings(el);
  }

  function renderSettings(el) {
    const isPro = currentLicense.activated && currentLicense.tier === 'pro';
    const theme = currentConfig.theme || 'dark';
    const threshold = currentConfig.default_threshold !== undefined
      ? Math.round(currentConfig.default_threshold * 100)
      : 50;
    const batchSize = currentConfig.batch_size || 4;
    const useGpu = currentConfig.use_gpu || false;
    const checkUpdates = currentConfig.check_updates !== false;

    el.innerHTML = `
      <div style="overflow-y:auto;flex:1;display:flex;flex-direction:column;align-items:center;">
        <div class="settings-layout">
          <button class="settings-back" id="settings-back-btn">← Back</button>
          <div class="settings-title">Settings</div>

          <!-- Scanning -->
          <div class="settings-section">
            <div class="settings-section-title">Scanning</div>
            <div>
              <div class="settings-row-name">Default sensitivity threshold</div>
              <div class="settings-row-desc">Used as the default when starting a new scan.</div>
              <div class="settings-slider-row" style="margin-top:8px;">
                <div class="settings-slider-value" id="settings-threshold-value">${threshold}%</div>
                <input type="range" id="settings-threshold" min="10" max="90" step="5" value="${threshold}">
                <div class="threshold-labels">
                  <span>More sensitive</span><span>More strict</span>
                </div>
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row-info">
                <div class="settings-row-name">Default quarantine folder</div>
                <div class="settings-row-desc">Where quarantined files are moved by default.</div>
              </div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              <input type="text" id="settings-quarantine-path" placeholder="Default: next to scanned folder"
                value="${currentConfig.default_quarantine_path || ''}">
              <button class="btn btn-secondary btn-sm" id="settings-quarantine-browse">Browse</button>
            </div>
          </div>

          <!-- Performance -->
          <div class="settings-section">
            <div class="settings-section-title">Performance</div>
            <div class="settings-row" id="settings-gpu-row" style="display:none;">
              <div class="settings-row-info">
                <div class="settings-row-name">Use GPU when available</div>
                <div class="settings-row-desc">Faster scanning with NVIDIA/AMD graphics cards.</div>
              </div>
              <div class="settings-row-control">
                <div class="toggle ${useGpu ? 'on' : ''}" id="toggle-gpu">
                  <div class="toggle-track"></div>
                  <span class="toggle-label">${useGpu ? 'On' : 'Off'}</span>
                </div>
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row-info">
                <div class="settings-row-name">Batch size</div>
                <div class="settings-row-desc">Images processed at once. Lower if scanning crashes.</div>
              </div>
              <div class="settings-row-control">
                <select id="settings-batch-size" style="width:80px;">
                  <option value="1" ${batchSize===1?'selected':''}>1</option>
                  <option value="2" ${batchSize===2?'selected':''}>2</option>
                  <option value="4" ${batchSize===4?'selected':''}>4</option>
                  <option value="8" ${batchSize===8?'selected':''}>8</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Appearance -->
          <div class="settings-section">
            <div class="settings-section-title">Appearance</div>
            <div class="settings-row">
              <div class="settings-row-info">
                <div class="settings-row-name">Theme</div>
                <div class="settings-row-desc">Switch between dark and light mode.</div>
              </div>
              <div class="settings-row-control">
                <div class="toggle ${theme === 'light' ? 'on' : ''}" id="toggle-theme">
                  <div class="toggle-track"></div>
                  <span class="toggle-label" id="theme-toggle-label">${theme === 'light' ? 'Light' : 'Dark'}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- License -->
          <div class="settings-section">
            <div class="settings-section-title">License</div>
            <div class="settings-row">
              <div class="settings-row-info">
                <div class="settings-row-name">License status</div>
                <div class="settings-row-desc">${isPro ? 'Pro features unlocked.' : 'Free tier — limited to images only.'}</div>
              </div>
              <div class="settings-row-control license-status">
                <span class="license-badge ${isPro ? 'license-badge-pro' : 'license-badge-free'}">
                  ${isPro ? '★ Pro' : 'Free'}
                </span>
              </div>
            </div>
            ${isPro ? `
              <div class="settings-row">
                <div class="settings-row-info">
                  <div class="settings-row-name">License key</div>
                  <div class="settings-row-desc" style="font-family:var(--font-mono);font-size:11px;">${currentLicense.key || '—'}</div>
                </div>
                <button class="btn btn-ghost btn-sm" id="btn-deactivate-license">Deactivate</button>
              </div>
            ` : `
              <div>
                <button class="btn btn-primary btn-sm" id="btn-activate-license">Enter License Key</button>
              </div>
            `}
          </div>

          <!-- About -->
          <div class="settings-section">
            <div class="settings-section-title">About</div>
            <div class="about-version" id="about-version">CleanSweep v0.1.0</div>
            <div class="about-links">
              <button class="about-link" onclick="void 0">Website</button>
              <button class="about-link" onclick="void 0">Support</button>
              <button class="about-link" onclick="void 0">Privacy Policy</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Load app version
    window.electronAPI?.getAppVersion?.().then(v => {
      const el = document.getElementById('about-version');
      if (el && v) el.textContent = `CleanSweep v${v}`;
    }).catch(() => {});

    // Show GPU row if GPU available
    api.capabilities().then(caps => {
      if (caps.gpu_available) {
        document.getElementById('settings-gpu-row')?.style.setProperty('display', 'flex');
      }
    }).catch(() => {});

    wireSettingsControls(isPro);
  }

  function wireSettingsControls(isPro) {
    // Back button
    document.getElementById('settings-back-btn')?.addEventListener('click', () => {
      showScreen(returnScreen);
    });

    // Threshold slider
    const thresholdSlider = document.getElementById('settings-threshold');
    const thresholdDisplay = document.getElementById('settings-threshold-value');
    thresholdSlider?.addEventListener('input', () => {
      const pct = parseInt(thresholdSlider.value, 10);
      if (thresholdDisplay) thresholdDisplay.textContent = pct + '%';
    });
    thresholdSlider?.addEventListener('change', () => {
      const pct = parseInt(thresholdSlider.value, 10);
      saveConfig({ default_threshold: pct / 100 });
    });

    // Quarantine path
    document.getElementById('settings-quarantine-path')?.addEventListener('change', e => {
      saveConfig({ default_quarantine_path: e.target.value });
    });
    document.getElementById('settings-quarantine-browse')?.addEventListener('click', () => {
      window.electronAPI?.selectFolder?.().then(f => {
        if (f) {
          const input = document.getElementById('settings-quarantine-path');
          if (input) { input.value = f; saveConfig({ default_quarantine_path: f }); }
        }
      }).catch(() => {});
    });

    // GPU toggle
    document.getElementById('toggle-gpu')?.addEventListener('click', function () {
      this.classList.toggle('on');
      const isOn = this.classList.contains('on');
      this.querySelector('.toggle-label').textContent = isOn ? 'On' : 'Off';
      saveConfig({ use_gpu: isOn });
    });

    // Batch size
    document.getElementById('settings-batch-size')?.addEventListener('change', e => {
      saveConfig({ batch_size: parseInt(e.target.value, 10) });
    });

    // Theme toggle
    document.getElementById('toggle-theme')?.addEventListener('click', function () {
      this.classList.toggle('on');
      const isLight = this.classList.contains('on');
      this.querySelector('.toggle-label').textContent = isLight ? 'Light' : 'Dark';
      document.body.classList.toggle('theme-light', isLight);
      saveConfig({ theme: isLight ? 'light' : 'dark' });
    });

    // License activation
    document.getElementById('btn-activate-license')?.addEventListener('click', () => {
      document.getElementById('license-error')?.classList.add('hidden');
      document.getElementById('license-key-input') && (document.getElementById('license-key-input').value = '');
      document.getElementById('modal-license')?.classList.add('visible');
    });

    // Deactivate license
    document.getElementById('btn-deactivate-license')?.addEventListener('click', () => {
      api.deactivate().then(() => {
        toast('License deactivated.', 'info');
        initSettings();
      }).catch(err => toast('Error: ' + err.message, 'error'));
    });
  }

  function saveConfig(updates) {
    api.setConfig(updates).catch(() => {
      toast('Failed to save setting.', 'error');
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && appState.currentScreen === 'settings') {
      showScreen(returnScreen);
    }
  });

  window.initSettings = initSettings;
})();

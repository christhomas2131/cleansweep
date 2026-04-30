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
      <div class="screen-scroll">
        <div class="settings-layout">
          <button class="btn btn-ghost btn-back" id="settings-back-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back
          </button>
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

          <!-- Notifications / Integration -->
          <div class="settings-section">
            <div class="settings-section-title">Notifications</div>
            <div class="settings-row">
              <div class="settings-row-info">
                <div class="settings-row-name">Play sound on scan complete</div>
                <div class="settings-row-desc">Subtle chime when a scan finishes.</div>
              </div>
              <div class="settings-row-control">
                <div class="toggle ${currentConfig.sound_enabled !== false ? 'on' : ''}" id="toggle-sound">
                  <div class="toggle-track"></div>
                  <span class="toggle-label">${currentConfig.sound_enabled !== false ? 'On' : 'Off'}</span>
                </div>
              </div>
            </div>
            <div class="settings-row" id="settings-context-row" style="display:none;">
              <div class="settings-row-info">
                <div class="settings-row-name">Show 'Scan with CleanSweep' in Windows right-click menu</div>
                <div class="settings-row-desc">Right-click any folder in Explorer to start a scan.</div>
              </div>
              <div class="settings-row-control">
                <div class="toggle ${currentConfig.context_menu_installed ? 'on' : ''}" id="toggle-context-menu">
                  <div class="toggle-track"></div>
                  <span class="toggle-label">${currentConfig.context_menu_installed ? 'On' : 'Off'}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Appearance -->
          <div class="settings-section">
            <div class="settings-section-title">Appearance</div>
            <div class="settings-row">
              <div class="settings-row-info">
                <div class="settings-row-name">Theme</div>
                <div class="settings-row-desc">Dark, light, or follow your system setting.</div>
              </div>
              <div class="settings-row-control">
                <div class="theme-segmented" id="theme-segmented" role="group" aria-label="Theme">
                  <button class="theme-seg ${theme === 'dark' ? 'active' : ''}" data-theme="dark">Dark</button>
                  <button class="theme-seg ${theme === 'light' ? 'active' : ''}" data-theme="light">Light</button>
                  <button class="theme-seg ${theme === 'system' ? 'active' : ''}" data-theme="system">System</button>
                </div>
              </div>
            </div>
          </div>

          <!-- License / Pro Member (D2) -->
          <div class="settings-section">
            <div class="settings-section-title">${isPro ? 'Pro Member' : 'Upgrade to Pro'}</div>
            ${isPro ? `
              <div class="settings-row">
                <div class="settings-row-info">
                  <div class="settings-row-name">Status <span class="pro-badge">PRO</span></div>
                  <div class="settings-row-desc">✓ Activated — all features unlocked.</div>
                </div>
              </div>
              <div class="settings-row">
                <div class="settings-row-info">
                  <div class="settings-row-name">License key</div>
                  <div class="settings-row-desc" style="font-family:var(--font-mono);font-size:11px;">${currentLicense.key || '—'}</div>
                </div>
                <button class="btn btn-ghost btn-sm" id="btn-deactivate-license">Deactivate</button>
              </div>
            ` : `
              <div class="settings-row">
                <div class="settings-row-info">
                  <div class="settings-row-name">Unlock Pro features</div>
                  <div class="settings-row-desc">Unlimited scanning, video support, and document scanning for $29 (one-time).</div>
                </div>
              </div>
              <div style="display:flex;gap:8px;">
                <button class="btn btn-primary btn-sm" id="btn-upgrade-pro">Upgrade to Pro</button>
                <button class="btn btn-ghost btn-sm" id="btn-activate-license">Already have a key? Activate</button>
              </div>
            `}
          </div>

          <!-- Your Stats (D3) -->
          <div class="settings-section">
            <div class="settings-section-title">Your stats</div>
            <div class="stats-row">
              <div class="stat-block">
                <div class="stat-block-label">Files scanned</div>
                <div class="stat-block-value">${(currentConfig.lifetime_files_scanned || 0).toLocaleString()}</div>
              </div>
              <div class="stat-block">
                <div class="stat-block-label">Scan time</div>
                <div class="stat-block-value">${formatLifetimeSeconds(currentConfig.lifetime_scan_seconds || 0)}</div>
              </div>
              <div class="stat-block">
                <div class="stat-block-label">Items flagged</div>
                <div class="stat-block-value">${(currentConfig.lifetime_flagged || 0).toLocaleString()}</div>
              </div>
            </div>
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

    // Theme segmented control (Dark / Light / System)
    document.querySelectorAll('#theme-segmented .theme-seg').forEach(btn => {
      btn.addEventListener('click', () => {
        const value = btn.dataset.theme;
        if (!value) return;
        document.querySelectorAll('#theme-segmented .theme-seg').forEach(b =>
          b.classList.toggle('active', b === btn)
        );
        // Apply immediately
        window.cleanSweepThemeMode = value;
        if (value === 'system') {
          const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
          document.body.classList.toggle('theme-light', prefersLight);
        } else {
          document.body.classList.toggle('theme-light', value === 'light');
        }
        saveConfig({ theme: value });
      });
    });

    // License activation / Upgrade
    document.getElementById('btn-activate-license')?.addEventListener('click', () => {
      document.getElementById('license-error')?.classList.add('hidden');
      document.getElementById('license-key-input') && (document.getElementById('license-key-input').value = '');
      document.getElementById('modal-license')?.classList.add('visible');
    });
    document.getElementById('btn-upgrade-pro')?.addEventListener('click', () => {
      // Open the license activation modal for now (in future could link to pricing page)
      document.getElementById('license-error')?.classList.add('hidden');
      document.getElementById('license-key-input') && (document.getElementById('license-key-input').value = '');
      document.getElementById('modal-license')?.classList.add('visible');
    });

    // B2: Sound toggle
    document.getElementById('toggle-sound')?.addEventListener('click', function () {
      this.classList.toggle('on');
      const on = this.classList.contains('on');
      this.querySelector('.toggle-label').textContent = on ? 'On' : 'Off';
      saveConfig({ sound_enabled: on });
    });

    // E1: Context menu toggle (only meaningful on Windows)
    if (window.electronAPI?.installContextMenu && navigator.userAgent.includes('Windows')) {
      const ctxRow = document.getElementById('settings-context-row');
      if (ctxRow) ctxRow.style.display = 'flex';
    }
    document.getElementById('toggle-context-menu')?.addEventListener('click', async function () {
      const wasOn = this.classList.contains('on');
      this.classList.toggle('on');
      const on = !wasOn;
      this.querySelector('.toggle-label').textContent = on ? 'On' : 'Off';
      try {
        const result = on
          ? await window.electronAPI?.installContextMenu?.()
          : await window.electronAPI?.uninstallContextMenu?.();
        if (result && result.ok) {
          saveConfig({ context_menu_installed: on });
          toast(on ? 'Right-click menu enabled.' : 'Right-click menu removed.', 'success');
        } else {
          // Revert toggle on failure
          this.classList.toggle('on');
          this.querySelector('.toggle-label').textContent = wasOn ? 'On' : 'Off';
          toast('Could not modify the right-click menu. ' + (result?.error || 'Try running CleanSweep as administrator once.'), 'error', 5000);
        }
      } catch (err) {
        this.classList.toggle('on');
        this.querySelector('.toggle-label').textContent = wasOn ? 'On' : 'Off';
        toast('Context menu update failed: ' + err.message, 'error');
      }
    });

    // Deactivate license
    document.getElementById('btn-deactivate-license')?.addEventListener('click', () => {
      api.deactivate().then(() => {
        toast('License deactivated.', 'info');
        window.updateTierBadge?.();
        initSettings();
      }).catch(err => toast('Error: ' + err.message, 'error'));
    });
  }

  function saveConfig(updates) {
    api.setConfig(updates).catch(() => {
      toast('Failed to save setting.', 'error');
    });
  }

  function formatLifetimeSeconds(s) {
    const total = Math.round(s || 0);
    if (total < 60) return `${total}s`;
    if (total < 3600) return `${Math.floor(total / 60)}m`;
    const hours = total / 3600;
    return hours >= 10 ? `${Math.round(hours)}h` : `${hours.toFixed(1)}h`;
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && appState.currentScreen === 'settings') {
      showScreen(returnScreen);
    }
  });

  window.initSettings = initSettings;
})();

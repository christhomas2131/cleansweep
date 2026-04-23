// Scan setup screen
(function () {
  let setupInitialized = false;
  let previewDebounce = null;
  let useReset = true;

  function initScanSetup() {
    if (setupInitialized) {
      // Refresh capabilities and reset state on re-entry
      loadCapabilities();
      checkResumeState();
      return;
    }
    setupInitialized = true;

    wireDropZone();
    wirePathInput();
    wireBrowseButton();
    wireThresholdSlider();
    wireStartScan();
    wireHistoryButton();
    wireResumeBanner();
    loadCapabilities();
    loadDefaultConfig();
  }

  function loadDefaultConfig() {
    api.config().then(cfg => {
      if (cfg.default_threshold !== undefined) {
        const slider = document.getElementById('threshold-slider');
        if (slider) {
          const pct = Math.round(cfg.default_threshold * 100);
          slider.value = pct;
          document.getElementById('threshold-display').textContent = pct + '%';
          appState.threshold = cfg.default_threshold;
        }
      }
    }).catch(() => {});
  }

  function loadCapabilities() {
    api.capabilities().then(caps => {
      const gpuInfo = document.getElementById('gpu-info');
      const gpuText = document.getElementById('gpu-text');
      const gpuOpt = document.getElementById('opt-videos');

      if (caps.gpu_available && gpuInfo && gpuText) {
        gpuInfo.classList.add('visible');
        gpuText.textContent = caps.gpu_name
          ? `GPU detected (${caps.gpu_name}) — scanning will be faster`
          : 'GPU detected — scanning will be faster';
      }

      // Disable video option if ffmpeg not available
      if (!caps.ffmpeg) {
        const vidCheck = document.getElementById('opt-videos');
        if (vidCheck) { vidCheck.checked = false; vidCheck.disabled = true; }
        const vidLabel = vidCheck?.closest('label');
        if (vidLabel) {
          vidLabel.style.opacity = '0.4';
          vidLabel.title = 'ffmpeg not found — video scanning unavailable';
        }
      }
    }).catch(() => {});
  }

  // ── Drop zone ─────────────────────────────────────────────────
  function wireDropZone() {
    const zone = document.getElementById('drop-zone');
    if (!zone) return;

    zone.addEventListener('click', () => {
      if (window.electronAPI?.selectFolder) {
        window.electronAPI.selectFolder().then(folder => {
          if (folder) setFolder(folder);
        }).catch(() => {});
      }
    });

    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file && file.path) setFolder(file.path);
    });
  }

  function wireBrowseButton() {
    document.getElementById('btn-browse')?.addEventListener('click', () => {
      if (window.electronAPI?.selectFolder) {
        window.electronAPI.selectFolder().then(folder => {
          if (folder) setFolder(folder);
        }).catch(() => {});
      }
    });
  }

  function wirePathInput() {
    const input = document.getElementById('folder-path-input');
    if (!input) return;
    input.addEventListener('input', () => {
      clearTimeout(previewDebounce);
      previewDebounce = setTimeout(() => setFolder(input.value.trim()), 600);
    });
    input.addEventListener('change', () => {
      clearTimeout(previewDebounce);
      setFolder(input.value.trim());
    });
  }

  function setFolder(path) {
    if (!path) return;
    appState.folder = path;
    const input = document.getElementById('folder-path-input');
    if (input) input.value = path;
    loadPreview(path);
  }

  function loadPreview(folder) {
    const btn = document.getElementById('btn-start-scan');
    const preview = document.getElementById('folder-preview');

    api.previewFolder(folder).then(data => {
      const count = document.getElementById('preview-count');
      const size = document.getElementById('preview-size');
      const pathEl = document.getElementById('preview-path');
      if (count) count.textContent = (data.total_images || 0).toLocaleString();
      if (size) size.textContent = formatSize(data.total_size_mb || 0);
      if (pathEl) pathEl.textContent = folder;
      if (preview) preview.classList.add('visible');
      if (btn) btn.disabled = false;
      checkResumeState();
    }).catch(() => {
      if (preview) preview.classList.remove('visible');
      if (btn) btn.disabled = true;
    });
  }

  function checkResumeState() {
    api.getProgress().then(p => {
      const banner = document.getElementById('resume-banner');
      const resumeText = document.getElementById('resume-text');
      if (!banner) return;
      if (p.status === 'stopped' && (p.scanned || 0) > 0) {
        useReset = false;
        if (resumeText) {
          resumeText.textContent = `Previous scan found (${p.scanned.toLocaleString()} of ${p.total.toLocaleString()} files scanned). Resume or start fresh?`;
        }
        banner.classList.add('visible');
      } else {
        banner.classList.remove('visible');
        useReset = true;
      }
    }).catch(() => {});
  }

  function formatSize(mb) {
    if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
    return mb.toFixed(1) + ' MB';
  }

  // ── Threshold slider ──────────────────────────────────────────
  function wireThresholdSlider() {
    const slider = document.getElementById('threshold-slider');
    const display = document.getElementById('threshold-display');
    if (!slider) return;
    slider.addEventListener('input', () => {
      const pct = parseInt(slider.value, 10);
      if (display) display.textContent = pct + '%';
      appState.threshold = pct / 100;
    });
  }

  // ── Resume banner buttons ─────────────────────────────────────
  function wireResumeBanner() {
    document.getElementById('btn-resume')?.addEventListener('click', () => {
      useReset = false;
      document.getElementById('resume-banner')?.classList.remove('visible');
      startScan(false);
    });
    document.getElementById('btn-fresh')?.addEventListener('click', () => {
      useReset = true;
      document.getElementById('resume-banner')?.classList.remove('visible');
      startScan(true);
    });
  }

  // ── Start scan ────────────────────────────────────────────────
  function wireStartScan() {
    const btn = document.getElementById('btn-start-scan');
    if (!btn) return;
    btn.addEventListener('click', () => {
      withLoading(btn, () => startScan(useReset));
    });
  }

  async function startScan(reset) {
    const folder = appState.folder;
    if (!folder) { toast('Please select a folder first.', 'error'); return; }

    const threshold = appState.threshold || 0.5;
    const scanImages = document.getElementById('opt-images')?.checked ?? true;
    const scanVideos = document.getElementById('opt-videos')?.checked ?? true;
    const scanDocs = document.getElementById('opt-documents')?.checked ?? true;
    const useGpu = document.getElementById('opt-gpu')?.checked ?? false;

    try {
      await api.startScan(folder, threshold, {
        scan_images: scanImages,
        scan_videos: scanVideos,
        scan_documents: scanDocs,
        use_gpu: useGpu,
        reset,
      });
      window.electronAPI?.setScanRunning?.(true).catch(() => {});
      showScreen('scan-progress');
    } catch (err) {
      toast('Failed to start scan: ' + err.message, 'error');
    }
  }

  // ── History modal ─────────────────────────────────────────────
  function wireHistoryButton() {
    document.getElementById('btn-history')?.addEventListener('click', openHistoryModal);
    document.getElementById('btn-history-close')?.addEventListener('click', () => {
      document.getElementById('modal-history')?.classList.remove('visible');
    });
  }

  function openHistoryModal() {
    const modal = document.getElementById('modal-history');
    const list = document.getElementById('history-list');
    if (!modal || !list) return;
    list.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">Loading...</div>';
    modal.classList.add('visible');

    api.history().then(entries => {
      if (!entries.length) {
        list.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:12px 0;text-align:center;">No scan history yet.</div>';
        return;
      }
      list.innerHTML = entries.map(e => `
        <div style="padding:10px 0;border-bottom:1px solid var(--border-subtle);display:flex;gap:10px;align-items:center;">
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:500;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.folder}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
              ${formatDate(e.date)} · ${(e.total_files||0).toLocaleString()} files · ${e.flagged_count||0} flagged · ${formatDuration(e.duration_seconds)}
            </div>
          </div>
          <button class="btn btn-ghost btn-xs" onclick="deleteHistoryEntry('${e.id}', this)">🗑</button>
        </div>
      `).join('');
    }).catch(() => {
      list.innerHTML = '<div style="color:var(--danger);font-size:13px;padding:8px 0;">Failed to load history.</div>';
    });
  }

  function formatDate(iso) {
    try { return new Date(iso).toLocaleString(); } catch { return iso || '—'; }
  }
  function formatDuration(s) {
    if (!s) return '—';
    if (s < 60) return `${Math.round(s)}s`;
    return `${Math.floor(s/60)}m ${Math.round(s%60)}s`;
  }

  window.deleteHistoryEntry = function(id, btn) {
    btn.textContent = '...';
    btn.disabled = true;
    api.deleteHistory(id).then(() => {
      btn.closest('div[style]')?.remove();
    }).catch(() => { btn.textContent = '🗑'; btn.disabled = false; });
  };

  window.initScanSetup = initScanSetup;
})();

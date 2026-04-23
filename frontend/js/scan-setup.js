// Scan setup screen
(function () {
  let setupInitialized = false;
  let previewDebounce = null;
  let useReset = true;
  let scanOnlyNew = false;
  let avgSpeed = 6.0;
  let currentConfig = {};

  function initScanSetup() {
    if (setupInitialized) {
      // Refresh capabilities and reset state on re-entry
      loadCapabilities();
      checkResumeState();
      loadRecentScans();
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
    wireNewFilesBanner();
    loadCapabilities();
    loadDefaultConfig();
    loadRecentScans();
    wireCliScanFolder();
  }

  function wireCliScanFolder() {
    // E1 deep-link: --scan-folder arg from context-menu invocation
    if (window.electronAPI?.onScanFolder) {
      window.electronAPI.onScanFolder((folder) => {
        if (folder) {
          showScreen('scan-setup');
          setFolder(folder);
        }
      });
    }
  }

  function loadDefaultConfig() {
    api.config().then(cfg => {
      currentConfig = cfg || {};
      if (cfg.default_threshold !== undefined) {
        const slider = document.getElementById('threshold-slider');
        if (slider) {
          const pct = Math.round(cfg.default_threshold * 100);
          slider.value = pct;
          document.getElementById('threshold-display').textContent = pct + '%';
          appState.threshold = cfg.default_threshold;
        }
      }
      if (cfg.avg_speed_imgs_per_sec) {
        avgSpeed = Math.max(1, cfg.avg_speed_imgs_per_sec);
      }
      // A4: first-scan tooltip
      if (!cfg.first_scan_complete) {
        showThresholdTip();
      }
    }).catch(() => {});
  }

  // ── A4: Onboarding tips ───────────────────────────────────────
  function showThresholdTip() {
    const tip = document.getElementById('onboarding-tip-threshold');
    if (!tip) return;
    tip.style.display = 'block';
    const dismiss = () => {
      if (tip.style.display === 'none') return;
      tip.style.display = 'none';
      api.setConfig({ first_scan_complete: true }).catch(() => {});
      document.removeEventListener('click', dismiss, true);
    };
    setTimeout(() => document.addEventListener('click', dismiss, true), 50);
    setTimeout(dismiss, 8000);
  }

  // ── A1: Recent scans ──────────────────────────────────────────
  function loadRecentScans() {
    const section = document.getElementById('recent-scans-section');
    const list = document.getElementById('recent-scans-list');
    if (!section || !list) return;

    api.history().then(entries => {
      if (!entries || !entries.length) {
        section.style.display = 'none';
        return;
      }
      const top3 = entries.slice(0, 3);
      list.innerHTML = top3.map(e => `
        <div class="recent-scan-card" data-folder="${encodeURIComponent(e.folder || '')}" data-id="${e.id}">
          <div class="rsc-body">
            <div class="rsc-folder">📁 ${shortFolder(e.folder || '')}</div>
            <div class="rsc-meta">Scanned ${formatRelative(e.date)} · ${(e.flagged_count || 0).toLocaleString()} flagged</div>
          </div>
          <button class="rsc-remove" data-rm="${e.id}" title="Remove from history">×</button>
        </div>
      `).join('');

      // Wire card clicks
      list.querySelectorAll('.recent-scan-card').forEach(card => {
        card.addEventListener('click', (ev) => {
          if (ev.target.classList.contains('rsc-remove')) return;
          const folder = decodeURIComponent(card.dataset.folder || '');
          if (folder) setFolder(folder);
        });
      });

      // Wire remove buttons
      list.querySelectorAll('.rsc-remove').forEach(btn => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const id = btn.dataset.rm;
          if (!id) return;
          api.deleteHistory(id).then(() => {
            loadRecentScans();
          }).catch(() => toast('Failed to remove entry.', 'error'));
        });
      });

      section.style.display = 'block';
    }).catch(() => {
      section.style.display = 'none';
    });
  }

  function shortFolder(p) {
    if (!p) return '—';
    const parts = p.split(/[\\/]/);
    return parts[parts.length - 1] || p;
  }

  function formatRelative(iso) {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffMs = now - d;
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (days === 0) return 'Today';
      if (days === 1) return 'Yesterday';
      if (days < 7) return `${days} days ago`;
      if (days < 14) return 'Last week';
      if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch { return iso || '—'; }
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
      const total = data.total_images || 0;
      if (count) count.textContent = total.toLocaleString();
      if (size) size.textContent = formatSize(data.total_size_mb || 0);
      if (pathEl) pathEl.textContent = folder;
      if (preview) preview.classList.add('visible');
      if (btn) btn.disabled = false;
      showScanEstimate(total);
      checkResumeState();
      checkFolderDiff(folder, total);
    }).catch(() => {
      if (preview) preview.classList.remove('visible');
      if (btn) btn.disabled = true;
      hideScanEstimate();
      hideNewFilesBanner();
    });
  }

  // ── A3: Scan time estimate ────────────────────────────────────
  function showScanEstimate(fileCount) {
    const el = document.getElementById('scan-estimate');
    if (!el) return;
    if (!fileCount) { el.style.display = 'none'; return; }
    const rate = Math.max(1, avgSpeed);
    el.innerHTML = `⏱ Estimated scan time: ${formatEstimate(fileCount, rate)} (${fileCount.toLocaleString()} files at ~${rate.toFixed(1)}/s)`;
    el.style.display = 'block';
  }
  function hideScanEstimate() {
    const el = document.getElementById('scan-estimate');
    if (el) el.style.display = 'none';
  }
  function formatEstimate(fileCount, imgsPerSec) {
    const seconds = Math.ceil(fileCount / imgsPerSec);
    if (seconds < 60) return `${seconds} seconds`;
    if (seconds < 3600) return `~${Math.ceil(seconds / 60)} minutes`;
    const h = Math.floor(seconds / 3600);
    const m = Math.ceil((seconds % 3600) / 60);
    return `~${h}h ${m}m`;
  }

  // ── A2: Folder diff banner ────────────────────────────────────
  function checkFolderDiff(folder, total) {
    const banner = document.getElementById('new-files-banner');
    if (!banner) return;
    if (total < 100) { hideNewFilesBanner(); return; }
    api.folderDiff(folder).then(diff => {
      const newCount = diff.new_since_last_scan || 0;
      if (diff.has_prior_scan && newCount > 0) {
        const txt = document.getElementById('new-files-text');
        if (txt) txt.textContent = `${newCount.toLocaleString()} new file${newCount !== 1 ? 's' : ''} since your last scan.`;
        banner.style.display = 'flex';
      } else {
        hideNewFilesBanner();
      }
    }).catch(() => hideNewFilesBanner());
  }
  function hideNewFilesBanner() {
    const banner = document.getElementById('new-files-banner');
    if (banner) banner.style.display = 'none';
    scanOnlyNew = false;
  }
  function wireNewFilesBanner() {
    document.getElementById('btn-scan-only-new')?.addEventListener('click', () => {
      scanOnlyNew = true;
      hideNewFilesBanner();
      startScan(true);
    });
    document.getElementById('btn-scan-all')?.addEventListener('click', () => {
      scanOnlyNew = false;
      hideNewFilesBanner();
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
        only_new: scanOnlyNew,
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

// Scan setup screen — multi-folder aware
(function () {
  const MAX_FOLDERS = 10;

  let setupInitialized = false;
  let previewDebounce = null;
  let useReset = true;
  let scanOnlyNew = false;
  let avgSpeed = 6.0;
  let currentConfig = {};

  // Selected folders: [{path, count, sizeMb, newSinceLast}]
  let selectedFolders = [];

  function initScanSetup() {
    if (setupInitialized) {
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
    renderFoldersList();
  }

  function wireCliScanFolder() {
    if (window.electronAPI?.onScanFolder) {
      window.electronAPI.onScanFolder((folder) => {
        if (folder) {
          showScreen('scan-setup');
          addFolder(folder);
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
      if (!cfg.first_scan_complete) {
        showThresholdTip();
      }
    }).catch(() => {});
  }

  // ── A4: Onboarding tip ────────────────────────────────────────
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
      list.innerHTML = top3.map(e => {
        const folders = (e.folders && e.folders.length) ? e.folders : (e.folder ? [e.folder] : []);
        const label = folders.length > 1
          ? `${folders.length} folders`
          : shortFolder(folders[0] || '');
        const title = folders.join('\n');
        const encoded = encodeURIComponent(JSON.stringify(folders));
        return `
          <div class="recent-scan-card" data-folders="${encoded}" data-id="${e.id}" title="${escapeAttr(title)}">
            <div class="rsc-body">
              <div class="rsc-folder">${label}</div>
              <div class="rsc-meta">Scanned ${formatRelative(e.date)} · ${(e.flagged_count || 0).toLocaleString()} flagged</div>
            </div>
            <button class="rsc-remove" data-rm="${e.id}" title="Remove from history">×</button>
          </div>
        `;
      }).join('');

      list.querySelectorAll('.recent-scan-card').forEach(card => {
        card.addEventListener('click', (ev) => {
          if (ev.target.classList.contains('rsc-remove')) return;
          try {
            const folders = JSON.parse(decodeURIComponent(card.dataset.folders || '[]'));
            if (folders.length) {
              // Replace any current selection with the recent-scan folders
              selectedFolders = [];
              renderFoldersList();
              folders.forEach(f => addFolder(f));
            }
          } catch {}
        });
      });

      list.querySelectorAll('.rsc-remove').forEach(btn => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const id = btn.dataset.rm;
          if (!id) return;
          api.deleteHistory(id).then(() => loadRecentScans())
            .catch(() => toast('Failed to remove entry.', 'error'));
        });
      });

      section.style.display = 'block';
    }).catch(() => {
      section.style.display = 'none';
    });
  }

  function escapeAttr(s) {
    return String(s).replace(/"/g, '&quot;');
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
      const days = Math.floor((now - d) / (1000 * 60 * 60 * 24));
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

      if (caps.gpu_available && gpuInfo && gpuText) {
        gpuInfo.classList.add('visible');
        gpuText.textContent = caps.gpu_name
          ? `GPU detected (${caps.gpu_name}) — scanning will be faster`
          : 'GPU detected — scanning will be faster';
      }

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
          if (folder) addFolder(folder);
        }).catch(() => {});
      }
    });

    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      // Accept multiple folders dropped at once
      const items = Array.from(e.dataTransfer.files || []);
      items.forEach(file => {
        if (file && file.path) addFolder(file.path);
      });
    });
  }

  function wireBrowseButton() {
    document.getElementById('btn-browse')?.addEventListener('click', () => {
      if (window.electronAPI?.selectFolder) {
        window.electronAPI.selectFolder().then(folder => {
          if (folder) addFolder(folder);
        }).catch(() => {});
      }
    });
  }

  function wirePathInput() {
    const input = document.getElementById('folder-path-input');
    if (!input) return;
    const submitPath = () => {
      const v = input.value.trim();
      if (!v) return;
      addFolder(v).then(added => { if (added) input.value = ''; });
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(previewDebounce);
        submitPath();
      }
    });
    input.addEventListener('change', submitPath);
  }

  // ── Folder list model ─────────────────────────────────────────
  function normalize(p) {
    return (p || '').replace(/\\/g, '/').replace(/\/+$/, '');
  }

  function hasFolder(p) {
    const np = normalize(p);
    return selectedFolders.some(f => normalize(f.path) === np);
  }

  function syncAppState() {
    const paths = selectedFolders.map(f => f.path);
    appState.folders = paths;
    appState.folder = paths[0] || '';  // backward compat for rest of app
  }

  async function addFolder(path) {
    if (!path) return false;
    if (selectedFolders.length >= MAX_FOLDERS) {
      toast(`Maximum ${MAX_FOLDERS} folders per scan.`, 'warning');
      return false;
    }
    if (hasFolder(path)) {
      return false; // silent dedup
    }

    const entry = { path, count: null, sizeMb: null, loading: true, newSinceLast: 0, hasPriorScan: false };
    selectedFolders.push(entry);
    syncAppState();
    renderFoldersList();

    try {
      const data = await api.previewFolder(path);
      entry.count = data.total_images || 0;
      entry.sizeMb = data.total_size_mb || 0;
      entry.loading = false;
    } catch (err) {
      // Invalid folder — remove silently (or show a toast)
      toast(`Couldn't read folder: ${shortFolder(path)}`, 'error');
      const idx = selectedFolders.indexOf(entry);
      if (idx >= 0) selectedFolders.splice(idx, 1);
      syncAppState();
      renderFoldersList();
      return false;
    }

    // Per-folder diff — aggregates reflected in the shared banner below
    api.folderDiff(path).then(diff => {
      entry.newSinceLast = diff.new_since_last_scan || 0;
      entry.hasPriorScan = !!diff.has_prior_scan;
      renderFoldersList();
      updateNewFilesBanner();
    }).catch(() => {});

    renderFoldersList();
    updateNewFilesBanner();
    checkResumeState();
    return true;
  }

  function removeFolder(path) {
    const np = normalize(path);
    selectedFolders = selectedFolders.filter(f => normalize(f.path) !== np);
    syncAppState();
    renderFoldersList();
    updateNewFilesBanner();
  }

  // ── Render folder list + totals ──────────────────────────────
  function renderFoldersList() {
    const list = document.getElementById('folders-list');
    const total = document.getElementById('folders-total');
    const btn = document.getElementById('btn-start-scan');
    const legacyPreview = document.getElementById('folder-preview');
    if (!list) return;

    if (!selectedFolders.length) {
      list.innerHTML = '';
      if (total) total.style.display = 'none';
      if (btn) btn.disabled = true;
      if (legacyPreview) legacyPreview.classList.remove('visible');
      hideScanEstimate();
      return;
    }

    list.innerHTML = selectedFolders.map((f, idx) => {
      const countText = f.loading ? 'Reading…'
        : `${(f.count || 0).toLocaleString()} files · ${formatSize(f.sizeMb || 0)}`;
      return `
        <div class="folder-entry" data-idx="${idx}">
          <div class="fe-body">
            <div class="fe-path" title="${escapeAttr(f.path)}">${escapeAttr(f.path)}</div>
            <div class="fe-meta">${countText}</div>
          </div>
          <button class="fe-remove" data-remove-idx="${idx}" title="Remove">×</button>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.fe-remove').forEach(btn2 => {
      btn2.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const idx = parseInt(btn2.dataset.removeIdx, 10);
        if (!isNaN(idx) && selectedFolders[idx]) {
          removeFolder(selectedFolders[idx].path);
        }
      });
    });

    // Totals
    const doneFolders = selectedFolders.filter(f => !f.loading);
    const totalCount = doneFolders.reduce((s, f) => s + (f.count || 0), 0);
    const totalMb = doneFolders.reduce((s, f) => s + (f.sizeMb || 0), 0);
    if (total) {
      total.textContent = `Total: ${selectedFolders.length} folder${selectedFolders.length !== 1 ? 's' : ''} · ${totalCount.toLocaleString()} files · ${formatSize(totalMb)}`;
      total.style.display = 'block';
    }

    if (btn) btn.disabled = selectedFolders.some(f => f.loading) || !totalCount;
    if (legacyPreview) legacyPreview.classList.remove('visible');
    showScanEstimate(totalCount);
  }

  // ── A3: Scan time estimate (total across folders) ────────────
  function showScanEstimate(fileCount) {
    const el = document.getElementById('scan-estimate');
    if (!el) return;
    if (!fileCount) { el.style.display = 'none'; return; }
    const rate = Math.max(1, avgSpeed);
    el.innerHTML = `Estimated scan time: ${formatEstimate(fileCount, rate)} (${fileCount.toLocaleString()} files at ~${rate.toFixed(1)}/s)`;
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

  // ── A2: New-files banner (aggregate across folders) ──────────
  function updateNewFilesBanner() {
    const banner = document.getElementById('new-files-banner');
    if (!banner) return;

    const anyPriorScan = selectedFolders.some(f => f.hasPriorScan);
    const totalNew = selectedFolders.reduce((s, f) => s + (f.newSinceLast || 0), 0);
    const totalFiles = selectedFolders.reduce((s, f) => s + (f.count || 0), 0);

    if (anyPriorScan && totalNew > 0 && totalFiles >= 100) {
      const txt = document.getElementById('new-files-text');
      if (txt) txt.textContent = `${totalNew.toLocaleString()} new file${totalNew !== 1 ? 's' : ''} since your last scan${selectedFolders.length > 1 ? ' of these folders' : ''}.`;
      banner.style.display = 'flex';
    } else {
      hideNewFilesBanner();
    }
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
    return (mb || 0).toFixed(1) + ' MB';
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
    const folders = selectedFolders.map(f => f.path);
    if (!folders.length) { toast('Please add at least one folder.', 'error'); return; }

    const threshold = appState.threshold || 0.5;
    const scanImages = document.getElementById('opt-images')?.checked ?? true;
    const scanVideos = document.getElementById('opt-videos')?.checked ?? true;
    const scanDocs = document.getElementById('opt-documents')?.checked ?? true;
    const useGpu = document.getElementById('opt-gpu')?.checked ?? false;

    try {
      await api.startScan(folders, threshold, {
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
    list.innerHTML = '<div class="history-empty">Loading…</div>';
    modal.classList.add('visible');

    api.history().then(entries => {
      if (!entries.length) {
        list.innerHTML = '<div class="history-empty history-empty-centered">No scan history yet.</div>';
        return;
      }
      list.innerHTML = entries.map(e => {
        const folders = (e.folders && e.folders.length) ? e.folders : (e.folder ? [e.folder] : []);
        const label = folders.length > 1 ? `${folders.length} folders` : (folders[0] || '—');
        const hover = folders.join('\n');
        return `
          <div class="history-entry" title="${escapeAttr(hover)}">
            <div class="history-entry-body">
              <div class="history-entry-label">${escapeAttr(label)}</div>
              <div class="history-entry-meta">
                ${formatDate(e.date)} · ${(e.total_files||0).toLocaleString()} files · ${e.flagged_count||0} flagged · ${formatDuration(e.duration_seconds)}
              </div>
            </div>
            <button class="btn btn-ghost btn-xs history-entry-remove" data-id="${e.id}">Remove</button>
          </div>
        `;
      }).join('');
      list.querySelectorAll('.history-entry-remove').forEach(btn => {
        btn.addEventListener('click', () => deleteHistoryEntry(btn.dataset.id, btn));
      });
    }).catch(() => {
      list.innerHTML = '<div class="history-empty history-empty-error">Failed to load history.</div>';
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

  function deleteHistoryEntry(id, btn) {
    const original = btn.textContent;
    btn.textContent = '…';
    btn.disabled = true;
    api.deleteHistory(id).then(() => {
      btn.closest('.history-entry')?.remove();
    }).catch(() => { btn.textContent = original; btn.disabled = false; });
  }
  window.deleteHistoryEntry = deleteHistoryEntry;

  window.initScanSetup = initScanSetup;
  // Exposed so the global menu/drop handlers in app.js can add a folder
  // from anywhere (e.g. ⌘O, drag-drop onto the window, dock-icon drop).
  window.addScanFolder = (path) => {
    // If scan-setup hasn't been initialized yet (first-run state), kick it off.
    if (!setupInitialized) initScanSetup();
    return addFolder(path);
  };
})();

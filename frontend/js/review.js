// Review screen — flagged items grid with selection, actions, pagination
(function () {
  const PER_PAGE = 50;
  const thumbCache = new Map();

  let allResults = [];      // full results list (all pages, all types)
  let selectedSet = new Set(); // selected item indices
  let currentPage = 1;
  let currentSort = 'score_desc';
  let currentTypeFilter = 'all';
  let histScoreFilter = null; // null = no filter, or [min, max]
  let showTopOnly = false;    // C2: "Top 10 Worst" filter
  let skipDuplicates = false; // C3
  let duplicatesHidden = 0;   // C3
  let reviewInitialized = false;
  let pendingDeletePaths = [];
  let pendingQuarantinePaths = [];
  let lastStagingId = null;   // C4: last delete for Ctrl+Z undo
  let lastStagingTimer = null;

  // ── Entry point ───────────────────────────────────────────────
  async function initReview() {
    reviewInitialized = true;
    selectedSet.clear();
    currentPage = 1;
    histScoreFilter = null;
    showTopOnly = false;

    // Load config to respect hide_duplicates_default
    try {
      const cfg = await api.config();
      if (cfg && cfg.hide_duplicates_default) {
        skipDuplicates = true;
        const cb = document.getElementById('opt-skip-duplicates');
        if (cb) cb.checked = true;
      }
    } catch {}

    try {
      await loadAllResults();
    } catch {
      toast('Failed to load results.', 'error');
      return;
    }

    renderGrid();
    renderHistogram();
    updateSelectionUI();
    wireReviewToolbar();
    wireModals();
    wireKeyboard();
    wireTypeFilter();
    maybeShowReviewTip();
  }

  // ── A4: Review screen onboarding tip ────────────────────────
  function maybeShowReviewTip() {
    api.config().then(cfg => {
      if (cfg && cfg.first_scan_complete && !cfg.review_tip_shown && allResults.length > 0) {
        const tip = document.createElement('div');
        tip.className = 'review-onboarding-tip';
        tip.innerHTML = `
          <span>💡 Hover any card to unblur. Click to select. Use the toolbar to delete or quarantine.</span>
          <button class="btn btn-xs" id="tip-dismiss">Got it</button>`;
        document.body.appendChild(tip);
        const dismiss = () => {
          tip.remove();
          api.setConfig({ review_tip_shown: true }).catch(() => {});
        };
        tip.querySelector('#tip-dismiss')?.addEventListener('click', dismiss);
        setTimeout(dismiss, 12000);
      }
    }).catch(() => {});
  }

  async function loadAllResults() {
    // Uses api.getAllResults (a getResults wrapper) to fetch the full results list in one request.
    // Regular delete via api.deleteFiles is replaced with stage-delete/confirm-delete so Ctrl+Z can undo.
    const data = await api.getAllResults(skipDuplicates);
    allResults = (data.items || []);
    duplicatesHidden = data.duplicates_hidden || 0;
    const dupEl = document.getElementById('dup-count-text');
    if (dupEl) {
      if (duplicatesHidden > 0) {
        dupEl.textContent = ` (hides ${duplicatesHidden.toLocaleString()})`;
      } else {
        dupEl.textContent = '';
      }
    }
    updateReviewHeader(data.total || allResults.length);
  }

  function updateReviewHeader(total) {
    const title = document.getElementById('review-title');
    const sub = document.getElementById('review-sub');
    if (title) title.textContent = `${total.toLocaleString()} item${total !== 1 ? 's' : ''} flagged`;
    if (sub) {
      try {
        const prog = JSON.parse(sessionStorage.getItem('lastScanTotal') || '{}');
        if (prog.total) sub.textContent = `Scanned ${prog.total.toLocaleString()} files`;
      } catch { sub.textContent = ''; }
    }
  }

  // ── Filtering and sorting helpers ─────────────────────────────
  function getFilteredResults() {
    let items = allResults;

    // Type filter
    if (currentTypeFilter !== 'all') {
      items = items.filter(r => r.type === currentTypeFilter);
    }

    // Histogram score band filter
    if (histScoreFilter) {
      items = items.filter(r => r.score >= histScoreFilter[0] && r.score < histScoreFilter[1]);
    }

    // Sort
    const [sortBy, sortOrder] = currentSort.split('_');
    const asc = sortOrder === 'asc';
    items = [...items].sort((a, b) => {
      if (sortBy === 'score') return asc ? a.score - b.score : b.score - a.score;
      if (sortBy === 'filename') return asc
        ? (a.filename || '').localeCompare(b.filename || '')
        : (b.filename || '').localeCompare(a.filename || '');
      return 0;
    });

    // C2: Top 10 Worst — override sort to descending score, take top 10
    if (showTopOnly) {
      items = [...items].sort((a, b) => b.score - a.score).slice(0, 10);
    }

    return items;
  }

  // ── Grid rendering ────────────────────────────────────────────
  function renderGrid() {
    const grid = document.getElementById('results-grid');
    if (!grid) return;

    const filtered = getFilteredResults();
    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / PER_PAGE));
    currentPage = Math.min(currentPage, pages);

    const start = (currentPage - 1) * PER_PAGE;
    const pageItems = filtered.slice(start, start + PER_PAGE);

    if (total === 0) {
      grid.innerHTML = '';
      grid.appendChild(renderEmptyState());
      document.getElementById('pagination')?.classList.add('hidden');
      document.getElementById('quick-select-bar')?.classList.add('hidden');
      return;
    }

    document.getElementById('pagination')?.classList.remove('hidden');
    document.querySelector('.quick-select-bar')?.classList.remove('hidden');
    document.querySelector('.type-filter-bar')?.classList.remove('hidden');

    grid.innerHTML = '';
    pageItems.forEach(item => {
      grid.appendChild(renderCard(item));
    });

    // Load thumbnails async
    pageItems.forEach(item => loadThumbnail(item.index));

    // Apply unblur state
    const unblur = document.getElementById('unblur-toggle')?.classList.contains('active');
    if (unblur) grid.classList.add('grid-unblurred');
    else grid.classList.remove('grid-unblurred');

    // Pagination
    const pageText = document.getElementById('page-text');
    const prevBtn = document.getElementById('btn-prev-page');
    const nextBtn = document.getElementById('btn-next-page');
    if (pageText) pageText.textContent = `Page ${currentPage} of ${pages} (${total.toLocaleString()} items)`;
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= pages;
  }

  function renderCard(item) {
    const div = document.createElement('div');
    div.className = 'result-card' + (selectedSet.has(item.index) ? ' selected' : '');
    div.dataset.index = item.index;
    div.title = item.path || '';

    const score = item.score || 0;
    const pct = Math.round(score * 100);
    const confClass = pct >= 90 ? 'conf-red' : pct >= 65 ? 'conf-orange' : 'conf-yellow';
    const typeClass = item.type === 'video' ? 'type-badge-video' : item.type === 'document' ? 'type-badge-document' : '';

    div.innerHTML = `
      <div class="card-thumb-area">
        <div class="card-loading" id="loading-${item.index}"></div>
        <img class="card-thumb" id="thumb-${item.index}" src="" alt="${item.filename || ''}" style="display:none;">
        ${typeClass ? `<div class="type-badge ${typeClass}">${item.type.toUpperCase()}</div>` : ''}
        <button class="card-open-folder-btn" title="Open containing folder" aria-label="Open containing folder">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 5a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5z"/>
          </svg>
        </button>
        <div class="card-check">
          <span class="card-check-mark">✓</span>
        </div>
      </div>
      <div class="card-info">
        <span class="card-filename" title="${item.filename || ''}">${item.filename || '—'}</span>
        <span class="conf-badge ${confClass}">${pct}%</span>
      </div>
    `;

    // Card click: toggle selection, but ignore clicks on the folder button
    div.addEventListener('click', (e) => {
      if (e.target.closest('.card-open-folder-btn')) return;
      toggleSelect(item.index);
    });

    // Open containing folder button
    const folderBtn = div.querySelector('.card-open-folder-btn');
    if (folderBtn) {
      folderBtn.dataset.path = item.path || '';
      folderBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const filePath = folderBtn.dataset.path;
        if (!filePath || !window.electronAPI?.openContainingFolder) return;
        try {
          await window.electronAPI.openContainingFolder(filePath);
        } catch {
          toast('Could not open folder', 'error');
        }
      });
    }

    // Video filmstrip: show frame timeline on hover for video items
    if (item.type === 'video') {
      div.title = `${item.path || ''}\n[Video — hover to reveal filmstrip frames]`;
      div.addEventListener('mouseenter', () => loadFilmstrip(item.index, div));
    }

    return div;
  }

  function loadFilmstrip(index, card) {
    if (card.dataset.filmstripLoaded) return;
    card.dataset.filmstripLoaded = '1';
    api.filmstrip(index).catch(() => {}); // preload; display handled by future enhancement
  }

  function renderEmptyState() {
    // Pull scan stats for celebration
    let scanned = 0, durationStr = '';
    try {
      const stored = JSON.parse(sessionStorage.getItem('lastScanTotal') || '{}');
      scanned = stored.total || stored.scanned || 0;
    } catch {}

    const div = document.createElement('div');
    div.className = 'empty-celebration';
    div.style.gridColumn = '1 / -1';
    const detail = scanned > 0
      ? `Scanned ${scanned.toLocaleString()} file${scanned !== 1 ? 's' : ''}. No sensitive content found.`
      : 'No sensitive content was detected. Safe to share.';
    div.innerHTML = `
      <div class="empty-celebration-icon">✓</div>
      <div class="empty-title">All clear!</div>
      <div class="empty-text">${detail}</div>
      <button class="btn btn-primary" onclick="showScreen('scan-setup')">Scan Another Folder</button>
    `;

    // Hide the toolbars + histogram when empty for a clean celebration
    document.querySelector('.quick-select-bar')?.classList.add('hidden');
    document.getElementById('histogram-panel')?.classList.remove('visible');
    document.querySelector('.type-filter-bar')?.classList.add('hidden');
    return div;
  }

  // ── Thumbnail loading ─────────────────────────────────────────
  function loadThumbnail(index) {
    const thumbEl = document.getElementById(`thumb-${index}`);
    const loadEl = document.getElementById(`loading-${index}`);
    if (!thumbEl) return;

    if (thumbCache.has(index)) {
      applyThumbnail(thumbEl, loadEl, thumbCache.get(index));
      return;
    }

    api.getThumb(index).then(data => {
      if (data.thumbnail) {
        const src = 'data:image/jpeg;base64,' + data.thumbnail;
        thumbCache.set(index, src);
        applyThumbnail(thumbEl, loadEl, src);
      }
    }).catch(() => {
      if (loadEl) loadEl.style.display = 'none';
    });
  }

  function applyThumbnail(img, loader, src) {
    img.src = src;
    img.style.display = 'block';
    if (loader) loader.style.display = 'none';
  }

  // ── Selection ─────────────────────────────────────────────────
  function toggleSelect(index) {
    if (selectedSet.has(index)) selectedSet.delete(index);
    else selectedSet.add(index);
    const card = document.querySelector(`.result-card[data-index="${index}"]`);
    if (card) card.classList.toggle('selected', selectedSet.has(index));
    updateSelectionUI();
  }

  function updateSelectionUI() {
    const count = selectedSet.size;
    const info = document.getElementById('select-info');
    const total = getFilteredResults().length;
    if (info) {
      info.textContent = count > 0 ? `${count} of ${total} selected` : '';
    }
    const delBtn = document.getElementById('btn-delete-sel');
    const qBtn = document.getElementById('btn-quarantine-sel');
    if (delBtn) delBtn.disabled = count === 0;
    if (qBtn) qBtn.disabled = count === 0;
  }

  // ── Quick-select buttons ──────────────────────────────────────
  function wireQuickSelect() {
    document.getElementById('qs-90')?.addEventListener('click', () => quickSelect(0.90));
    document.getElementById('qs-80')?.addEventListener('click', () => quickSelect(0.80));
    document.getElementById('qs-70')?.addEventListener('click', () => quickSelect(0.70));
  }

  function quickSelect(minScore) {
    allResults.forEach(r => {
      if ((r.score || 0) >= minScore) selectedSet.add(r.index);
    });
    // Re-render current page to reflect selection
    const filtered = getFilteredResults();
    const start = (currentPage - 1) * PER_PAGE;
    filtered.slice(start, start + PER_PAGE).forEach(item => {
      const card = document.querySelector(`.result-card[data-index="${item.index}"]`);
      if (card) card.classList.toggle('selected', selectedSet.has(item.index));
    });
    updateSelectionUI();
    toast(`Selected ${selectedSet.size} item${selectedSet.size !== 1 ? 's' : ''} with ${Math.round(minScore * 100)}%+ confidence.`, 'info');
  }

  // ── Histogram ─────────────────────────────────────────────────
  function renderHistogram() {
    const container = document.getElementById('histogram-bars');
    if (!container) return;

    const bands = [
      { min: 0.5, max: 0.6, label: '50–60%', color: '#facc15' },
      { min: 0.6, max: 0.7, label: '60–70%', color: '#fb923c' },
      { min: 0.7, max: 0.8, label: '70–80%', color: '#f97316' },
      { min: 0.8, max: 0.9, label: '80–90%', color: '#ef4444' },
      { min: 0.9, max: 1.01, label: '90–100%', color: '#dc2626' },
    ];

    const counts = bands.map(b => ({
      ...b,
      count: allResults.filter(r => r.score >= b.min && r.score < b.max).length,
    }));
    const maxCount = Math.max(...counts.map(c => c.count), 1);

    container.innerHTML = counts.map(b => `
      <div class="hist-col" data-min="${b.min}" data-max="${b.max}" title="Click to filter: ${b.label}">
        <div class="hist-count">${b.count}</div>
        <div class="hist-bar" style="height:${Math.round((b.count / maxCount) * 44)}px;background:${b.color};"></div>
        <div class="hist-bar-label">${b.label}</div>
      </div>
    `).join('');

    container.querySelectorAll('.hist-col').forEach(col => {
      col.addEventListener('click', () => {
        const min = parseFloat(col.dataset.min);
        const max = parseFloat(col.dataset.max);
        if (histScoreFilter && histScoreFilter[0] === min) {
          histScoreFilter = null;
          col.style.opacity = '';
          container.querySelectorAll('.hist-col').forEach(c => c.style.opacity = '');
        } else {
          histScoreFilter = [min, max];
          container.querySelectorAll('.hist-col').forEach(c => c.style.opacity = '0.4');
          col.style.opacity = '1';
        }
        currentPage = 1;
        renderGrid();
      });
    });

    // C1: Adaptive tip based on distribution
    const tipEl = document.getElementById('histogram-tip');
    if (tipEl) {
      const totalCount = counts.reduce((s, b) => s + b.count, 0);
      if (totalCount === 0) {
        tipEl.textContent = '';
      } else {
        const lowPct = (counts[0].count + counts[1].count) / totalCount;
        const highPct = (counts[3].count + counts[4].count) / totalCount;
        if (highPct >= 0.6) {
          tipEl.textContent = '💡 Most flags are high confidence — likely true matches.';
        } else if (lowPct >= 0.6) {
          tipEl.textContent = '💡 Most flags are lower confidence — many may be false positives.';
        } else {
          tipEl.textContent = '💡 Mixed confidence — review by category using filters above.';
        }
      }
    }
  }

  // ── Toolbar wiring ────────────────────────────────────────────
  function wireReviewToolbar() {
    // Unblur toggle
    const unblurBtn = document.getElementById('unblur-toggle');
    unblurBtn?.addEventListener('click', () => {
      unblurBtn.classList.toggle('active');
      const grid = document.getElementById('results-grid');
      grid?.classList.toggle('grid-unblurred', unblurBtn.classList.contains('active'));
    });

    // Sort
    document.getElementById('sort-select')?.addEventListener('change', e => {
      currentSort = e.target.value;
      currentPage = 1;
      renderGrid();
    });

    // Select page
    document.getElementById('btn-select-page')?.addEventListener('click', () => {
      const filtered = getFilteredResults();
      const start = (currentPage - 1) * PER_PAGE;
      filtered.slice(start, start + PER_PAGE).forEach(r => selectedSet.add(r.index));
      document.querySelectorAll('.result-card').forEach(c => {
        const idx = parseInt(c.dataset.index);
        if (selectedSet.has(idx)) c.classList.add('selected');
      });
      updateSelectionUI();
    });

    // Select all
    document.getElementById('btn-select-all')?.addEventListener('click', () => {
      getFilteredResults().forEach(r => selectedSet.add(r.index));
      document.querySelectorAll('.result-card').forEach(c => c.classList.add('selected'));
      updateSelectionUI();
      toast(`Selected all ${selectedSet.size} items.`, 'info');
    });

    // Deselect all
    document.getElementById('btn-deselect-all')?.addEventListener('click', () => {
      selectedSet.clear();
      document.querySelectorAll('.result-card').forEach(c => c.classList.remove('selected'));
      updateSelectionUI();
    });

    // Delete selected
    document.getElementById('btn-delete-sel')?.addEventListener('click', () => openDeleteModal());

    // Quarantine selected
    document.getElementById('btn-quarantine-sel')?.addEventListener('click', () => openQuarantineModal());

    // Export
    document.getElementById('btn-export')?.addEventListener('click', () => {
      window.location.href = api.exportCsvUrl();
      toast('Exporting CSV...', 'info');
    });

    // New scan
    document.getElementById('btn-new-scan')?.addEventListener('click', () => showScreen('scan-setup'));

    // Pagination
    document.getElementById('btn-prev-page')?.addEventListener('click', () => {
      if (currentPage > 1) { currentPage--; renderGrid(); window.scrollTo(0, 0); }
    });
    document.getElementById('btn-next-page')?.addEventListener('click', () => {
      const pages = Math.ceil(getFilteredResults().length / PER_PAGE);
      if (currentPage < pages) { currentPage++; renderGrid(); window.scrollTo(0, 0); }
    });

    // Histogram toggle
    document.getElementById('histogram-toggle')?.addEventListener('click', () => {
      const panel = document.getElementById('histogram-panel');
      panel?.classList.toggle('visible');
    });

    // C2: Top 10 Worst
    document.getElementById('qs-worst')?.addEventListener('click', () => {
      showTopOnly = !showTopOnly;
      const btn = document.getElementById('qs-worst');
      if (btn) {
        btn.classList.toggle('active', showTopOnly);
        btn.textContent = showTopOnly ? 'Showing top 10 worst' : '🚨 Top 10 Worst';
      }
      currentPage = 1;
      renderGrid();
    });

    // C3: Skip duplicates
    document.getElementById('opt-skip-duplicates')?.addEventListener('change', async (ev) => {
      skipDuplicates = !!ev.target.checked;
      api.setConfig({ hide_duplicates_default: skipDuplicates }).catch(() => {});
      try {
        await loadAllResults();
      } catch { toast('Failed to reload results.', 'error'); return; }
      currentPage = 1;
      renderGrid();
      renderHistogram();
      updateSelectionUI();
    });

    wireQuickSelect();
  }

  // ── Type filter ───────────────────────────────────────────────
  function wireTypeFilter() {
    document.querySelectorAll('.type-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentTypeFilter = tab.dataset.type || 'all';
        currentPage = 1;
        histScoreFilter = null;
        renderGrid();
      });
    });
  }

  // ── Delete modal ──────────────────────────────────────────────
  function openDeleteModal() {
    if (selectedSet.size === 0) return;
    const paths = allResults
      .filter(r => selectedSet.has(r.index))
      .map(r => r.path);
    pendingDeletePaths = paths;

    const title = document.getElementById('delete-modal-title');
    const fileList = document.getElementById('delete-file-list');
    if (title) title.textContent = `Permanently delete ${paths.length} file${paths.length !== 1 ? 's' : ''}?`;
    if (fileList) {
      const preview = paths.slice(0, 5).map(p => `<div>${p.split(/[\\/]/).pop()}</div>`).join('');
      const extra = paths.length > 5 ? `<div style="color:var(--text-muted)">...and ${paths.length - 5} more</div>` : '';
      fileList.innerHTML = preview + extra;
    }
    document.getElementById('modal-delete')?.classList.add('visible');
    document.getElementById('btn-delete-confirm')?.focus();
  }

  // ── Quarantine modal ──────────────────────────────────────────
  function openQuarantineModal() {
    if (selectedSet.size === 0) return;
    const paths = allResults
      .filter(r => selectedSet.has(r.index))
      .map(r => r.path);
    pendingQuarantinePaths = paths;

    const title = document.getElementById('quarantine-modal-title');
    const body = document.getElementById('quarantine-modal-body');
    const fileList = document.getElementById('quarantine-file-list');
    if (title) title.textContent = `Move ${paths.length} file${paths.length !== 1 ? 's' : ''} to quarantine?`;
    if (body) body.textContent = 'Files will be moved to a _cleansweep_quarantine folder next to your scanned folder.';
    if (fileList) {
      const preview = paths.slice(0, 5).map(p => `<div>${p.split(/[\\/]/).pop()}</div>`).join('');
      const extra = paths.length > 5 ? `<div style="color:var(--text-muted)">...and ${paths.length - 5} more</div>` : '';
      fileList.innerHTML = preview + extra;
    }
    document.getElementById('modal-quarantine')?.classList.add('visible');
    document.getElementById('btn-quarantine-confirm')?.focus();
  }

  // ── Modal wiring ──────────────────────────────────────────────
  function wireModals() {
    // Delete modal
    document.getElementById('btn-delete-cancel')?.addEventListener('click', () => {
      document.getElementById('modal-delete')?.classList.remove('visible');
    });
    document.getElementById('btn-delete-confirm')?.addEventListener('click', () => {
      const btn = document.getElementById('btn-delete-confirm');
      withLoading(btn, async () => {
        try {
          // Use staging so Ctrl+Z can undo
          const staged = await api.stageDelete(pendingDeletePaths);
          document.getElementById('modal-delete')?.classList.remove('visible');
          const count = staged.count || 0;
          if (staged.staging_id) {
            trackStaging(staged.staging_id);
          }
          toast(`Deleted ${count} file${count !== 1 ? 's' : ''}. Press Ctrl+Z to undo.`, 'success', 5000);
          const pathSet = new Set(pendingDeletePaths);
          allResults = allResults.filter(r => !pathSet.has(r.path));
          selectedSet.clear();
          pendingDeletePaths = [];
          renderGrid();
          renderHistogram();
          updateSelectionUI();
          // Auto-confirm (purge staged files) after 30 seconds
          setTimeout(() => {
            if (lastStagingId === staged.staging_id && staged.staging_id) {
              api.confirmDelete(staged.staging_id).catch(() => {});
              lastStagingId = null;
            }
          }, 30000);
        } catch (err) {
          toast('Delete failed: ' + err.message, 'error');
        }
      });
    });

    // Quarantine modal
    document.getElementById('btn-quarantine-cancel')?.addEventListener('click', () => {
      document.getElementById('modal-quarantine')?.classList.remove('visible');
    });
    document.getElementById('btn-quarantine-confirm')?.addEventListener('click', () => {
      const btn = document.getElementById('btn-quarantine-confirm');
      withLoading(btn, async () => {
        try {
          const res = await api.quarantineFiles(pendingQuarantinePaths);
          document.getElementById('modal-quarantine')?.classList.remove('visible');
          const moved = res.moved || 0;
          toast(`Moved ${moved} file${moved !== 1 ? 's' : ''} to quarantine.`, 'success');
          const pathSet = new Set(pendingQuarantinePaths);
          allResults = allResults.filter(r => !pathSet.has(r.path));
          selectedSet.clear();
          pendingQuarantinePaths = [];
          renderGrid();
          renderHistogram();
          updateSelectionUI();
        } catch (err) {
          toast('Quarantine failed: ' + err.message, 'error');
        }
      });
    });

    // License modal (wired here so it works from review screen too)
    document.getElementById('btn-license-cancel')?.addEventListener('click', () => {
      document.getElementById('modal-license')?.classList.remove('visible');
    });
    document.getElementById('btn-license-activate')?.addEventListener('click', () => {
      const btn = document.getElementById('btn-license-activate');
      const key = document.getElementById('license-key-input')?.value.trim();
      const err = document.getElementById('license-error');
      withLoading(btn, async () => {
        try {
          const res = await api.activate(key);
          if (res.valid) {
            document.getElementById('modal-license')?.classList.remove('visible');
            toast('License activated! CleanSweep Pro unlocked.', 'success');
            window.updateTierBadge?.();
          } else {
            if (err) { err.textContent = res.error || 'Invalid license key.'; err.classList.remove('hidden'); }
          }
        } catch (e) {
          if (err) { err.textContent = e.message; err.classList.remove('hidden'); }
        }
      });
    });
  }

  // ── C4: Track last staging for undo ──────────────────────────
  function trackStaging(stagingId) {
    lastStagingId = stagingId;
    if (lastStagingTimer) clearTimeout(lastStagingTimer);
    lastStagingTimer = setTimeout(() => {
      lastStagingId = null;
      lastStagingTimer = null;
    }, 30000);
  }

  // ── Keyboard shortcuts ────────────────────────────────────────
  function wireKeyboard() {
    document.addEventListener('keydown', e => {
      // Escape closes any open modal
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal.visible').forEach(m => m.classList.remove('visible'));
        const overlay = document.getElementById('tutorial-overlay');
        if (overlay?.classList.contains('visible')) overlay.classList.remove('visible');
      }
      // C4: Ctrl+Z / Cmd+Z undoes last delete (only on review screen)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        if (appState.currentScreen === 'scan-review') {
          e.preventDefault();
          if (lastStagingId) {
            const id = lastStagingId;
            lastStagingId = null;
            if (lastStagingTimer) { clearTimeout(lastStagingTimer); lastStagingTimer = null; }
            api.undoDelete(id).then(async () => {
              toast('Undid last delete', 'success');
              try {
                await loadAllResults();
                renderGrid();
                renderHistogram();
                updateSelectionUI();
              } catch {}
            }).catch(() => {
              toast('Undo failed — files may have been permanently deleted.', 'error');
            });
          } else {
            toast('Nothing to undo', 'info');
          }
        }
      }
      // Arrow keys for pagination when on review screen
      if (appState.currentScreen === 'scan-review') {
        if (e.key === 'ArrowRight' && !e.target.matches('input, select')) {
          const btn = document.getElementById('btn-next-page');
          if (!btn?.disabled) btn?.click();
        }
        if (e.key === 'ArrowLeft' && !e.target.matches('input, select')) {
          const btn = document.getElementById('btn-prev-page');
          if (!btn?.disabled) btn?.click();
        }
      }
    });
  }

  window.initReview = initReview;
})();

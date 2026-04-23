# Phase 11: Performance + Smart Features
# Estimated time: ~25 minutes
# Prerequisite: Phases 1-10 passing verification
# Makes the app faster and smarter at scale.

Optimize scanning performance for large libraries and add intelligent features that save users time in the review process.

## Performance Optimizations:

### 1. Batch image processing (update scanner.py):

Current behavior: classify images one at a time.
New behavior: batch 4 images at once through the model.

- Load 4 images into a batch using Pillow
- Process the batch through the classifier pipeline in one call:
  ```python
  results = classifier(images_batch, batch_size=4)
  ```
- The ViT model supports batched inputs — this gives roughly 2-3x speedup on CPU
- Adjust batch size based on available RAM:
  - Default: 4
  - If a batch fails with OOM, fall back to batch_size=2, then 1
- Update progress reporting: still report per-image progress, even within batches

### 2. Pre-loading with thread pool (update scanner.py):

- Use concurrent.futures.ThreadPoolExecutor(max_workers=2) for I/O
- While the current batch is being classified (CPU-bound), pre-load the next batch's images from disk (I/O-bound)
- This hides the file reading latency behind the classification time
- Pattern:
  ```
  Thread 1 (I/O): read batch N+1 images from disk
  Main thread (CPU): classify batch N
  → when classification done, swap: classify N+1, read N+2
  ```
- This should improve throughput by 20-40% on typical hardware

### 3. Smart skip with file hashing (update scanner.py + progress.py):

- When a file is scanned and found to be SFW, compute a fast hash:
  - Read first 64KB of the file + file size → md5 hash
  - This is NOT a full file hash — it's fast (~0.1ms per file)
- Store the hash in the progress file under a "clean_hashes" set
- On re-scan of the same folder:
  - For each file, compute the quick hash
  - If hash matches a known-clean file, skip classification entirely
  - Report: "Skipped X,XXX unchanged files"
- On the progress screen, show: "Skipped: 42,000 (unchanged)" as a stat
- The hash check should happen BEFORE loading the image into memory — pure file I/O

### 4. GPU auto-detection (update scanner.py + server.py):

- On backend startup, check: torch.cuda.is_available()
- New field in GET /capabilities: {gpu_available: bool, gpu_name: string|null}
- If GPU available:
  - Setup screen shows: "GPU detected (NVIDIA RTX 3060) — scanning will be faster"
  - Add toggle on setup screen: "☑ Use GPU (recommended)" — checked by default
  - POST /scan accepts new field: use_gpu (bool)
  - scanner.py sets device=0 (GPU) or device=-1 (CPU) based on this
- If GPU not available: hide the toggle, use CPU silently

## Smart Review Features:

### 5. Quick-select by confidence (update review.js):

Add a row of quick-action buttons above the grid (below the existing action bar):
- "Select 90%+" — selects all items with score >= 0.90
- "Select 80%+" — selects all items with score >= 0.80
- "Select 70%+" — selects all items with score >= 0.70
- Styled as small pill buttons, subtle gray, active state shows count
- These work across ALL pages, not just the current page
- After clicking: selected count updates, Delete/Quarantine buttons enable
- The idea: users nuke the obvious stuff first with one click, then manually review borderline items

Implementation:
- These need to work on the full flagged list, not just the current page
- The 'selected' Set already stores indices globally, so this just adds all matching indices
- May need to fetch all results at once (or store the full list client-side)
  - Update api.js: add api.getAllResults() that fetches with per_page=9999
  - Call this once when entering review screen, cache the full list
  - Pagination still shows 50 per page, but selection operates on the full cached list

### 6. Confidence histogram (update review.js):

Add a small histogram chart above the grid (collapsible, collapsed by default):
- Toggle button: "📊 Show Distribution" / "📊 Hide Distribution"
- Chart: horizontal bar chart or simple visual distribution
- X-axis: confidence ranges (50-60%, 60-70%, 70-80%, 80-90%, 90-100%)
- Y-axis: count of items in each range
- Each bar is clickable: clicking a bar filters the view to that range
- Build with pure CSS/HTML (div bars with percentage widths) — no chart library needed
- Color the bars matching the score badge colors (yellow → orange → red)

Data: compute from the full cached results list client-side.

### 7. Scan history (update server.py + new frontend):

#### Backend:
- After each completed scan, save a summary to %LOCALAPPDATA%/CleanSweep/history/
- Filename: scan_{timestamp}.json
- Contents: {folder, date, total_files, flagged_count, threshold, types_scanned, duration_seconds}
- New endpoint: GET /history → returns list of past scan summaries, newest first
- New endpoint: DELETE /history/<id> → deletes a history entry

#### Frontend:
- New screen: #scan-history (or a panel/modal accessible from setup screen)
- "📋 Scan History" button on the setup screen
- Shows a list of past scans:
  - Date/time | Folder path | Files scanned | Flagged | Duration
  - Each row clickable — but for now, just informational (no re-opening old results)
  - Delete button (trash icon) on each row to remove history entry
- Keep it simple: a scrollable list, same dark theme, no fancy animations

### 8. Export report (update server.py + review.js):

#### Backend:
- New endpoint: GET /export?format=csv
  - Returns a CSV file download with headers:
    Path, Filename, Type, Score, Status, Timestamp
  - Status: "flagged" for all current results (we track deletions separately)
  - Content-Type: text/csv, Content-Disposition: attachment; filename=cleansweep_report_{date}.csv
- Future: format=pdf (defer to later — CSV is enough for v1)

#### Frontend:
- "📥 Export Report" button on the review screen top bar
- Calls GET /export?format=csv
- Triggers browser download of the CSV file
- Small and subtle button — this is for power users and corporate compliance

## Backend: Update progress.py for smart skip:

- save_progress() now also saves clean_hashes: set of (hash_string) for all SFW files
- load_progress() loads clean_hashes back
- New function: compute_quick_hash(filepath) → string
  - Read first 64KB + append file size as bytes → md5 hexdigest
  - Return the hash string
- Progress file will be larger now (storing hashes for potentially 50k files)
  - Use a separate file: .cleansweep_hashes.json
  - This avoids bloating the main progress file

## Verification:
- [ ] Batch processing works: scanner processes 4 images at a time (check logs/output)
- [ ] Scanning 100+ images is measurably faster than Phase 6 (compare rate in progress)
- [ ] Smart skip: scan a folder, scan again → second scan skips unchanged files
- [ ] Progress screen shows "Skipped: X (unchanged)" stat
- [ ] GET /capabilities shows gpu_available field
- [ ] If GPU present: toggle appears on setup screen (ok if CI has no GPU — just verify the UI)
- [ ] Quick-select buttons appear on review screen (90%+, 80%+, 70%+)
- [ ] Quick-select selects across all pages, not just current page
- [ ] Confidence histogram appears when toggled, bars are clickable
- [ ] GET /history returns list of past scans
- [ ] Scan history screen/modal is accessible and shows past scans
- [ ] GET /export?format=csv returns a valid CSV download
- [ ] Export button on review screen triggers CSV download

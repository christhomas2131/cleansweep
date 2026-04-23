# Phase 6: Polish + Error Handling
# Estimated time: ~20 minutes
# Prerequisite: Phases 1-5 working — full app running in Electron
# After this phase, run the full verification checklist at the bottom.

Polish pass on CleanSweep. Fix edge cases, improve error handling, and tighten the UX.

## Error Handling:

### 1. Backend connection lost:
- Frontend should detect if /progress or /health calls fail (fetch throws or non-200)
- Show a non-blocking banner at the top of the screen (below title bar):
  - Yellow/amber background, dark text: "Connection to scanner lost. Retrying..."
  - Auto-retry GET /health every 2 seconds
  - Dismiss banner immediately when reconnected
- If disconnected for 30+ seconds, replace banner with a modal:
  "Scanner stopped responding. Please restart the app."
  Single button: "Close" → window.close() or app quit

### 2. Scan errors:
- If POST /scan returns an error (bad folder path, permissions, folder doesn't exist):
  - Show inline error on the setup screen directly below the folder picker
  - Red text (#dc2626), clear message like "Folder not found" or "Cannot read folder (permission denied)"
  - Clear the error when user changes the folder path
- If scanner crashes mid-scan:
  - Backend should catch the exception in the scanning thread
  - Save progress before setting status to "error"
  - Include an error_message field in the /progress response
  - Frontend shows on the progress screen: "Scan encountered an error after X files. You can review what was found or try again."
  - Two buttons: "Review Results" (go to review) + "Back to Setup" (go to setup)

### 3. Backend input validation (update server.py):
- POST /scan: folder must exist, must be a directory, must be readable. Threshold must be float between 0.0 and 1.0. Return 400 with {error: "message"} on invalid input.
- POST /delete and /quarantine: every path must exist on disk. Every path must be within the originally scanned folder (prevent path traversal — resolve paths and check they start with the scan folder). Return {deleted/moved: int, failed: int, errors: [{path, reason}]}.
- GET /results: page must be >= 1, per_page must be 1-200. Clamp silently if out of range.

### 4. File access errors:
- If a file can't be deleted or moved (permissions, locked):
  - Backend returns it in a "errors" array: [{path: "...", reason: "Permission denied"}]
  - Frontend toast shows: "Deleted 22 files. 3 files couldn't be deleted." in amber/yellow instead of green
  - Undeletable files remain in the grid (not removed)

## UX Polish:

### 5. Keyboard shortcuts (add event listeners in review.js):
- Ctrl+A (or Cmd+A on mac): select all items on the current page. Prevent default browser select-all.
- Escape: if modal is open → close modal. If items are selected → deselect all.
- ArrowLeft: go to previous page (if not on first page)
- ArrowRight: go to next page (if not on last page)
- Delete key: if items are selected → open delete confirmation modal

### 6. Navigation:
- Add "Scan Another Folder" text button on the review screen top bar (left side, subtle, muted color)
- On click: return to setup screen, reset appState (but don't clear the backend scan data)
- Add "← Back to Results" button on setup screen if a completed scan exists (so users can navigate back without re-scanning)

### 7. Confirmation dialog improvements:
- Delete/quarantine modals should list the first 5 filenames in a small scrollable list
- If more than 5 selected, show "and X more files" below the list
- File names in monospace font, muted color, small text

### 8. Scanning pulse animation:
- On the progress screen, add a subtle pulsing indigo dot next to the "Scanning..." label
- CSS keyframe: scale(1) → scale(1.4) → scale(1), opacity 1 → 0.5 → 1, duration 1.5s, infinite
- Communicates activity even when progress updates are slow (large images)

### 9. Close-during-scan confirmation:
- In Electron main.js, listen for 'close' event on the BrowserWindow
- If a scan is running (track this state), show a dialog before closing:
  "A scan is in progress. Progress will be saved automatically. Quit anyway?"
  Buttons: "Keep Scanning" (cancel close) + "Quit" (proceed with close)
- Use dialog.showMessageBoxSync() for this

### 10. App load animation:
- On the body element: start with opacity 0
- On DOMContentLoaded: add class 'loaded' which transitions opacity to 1 over 300ms
- Prevents the flash of unstyled content on startup

## Performance:

### 11. Thumbnail LRU cache on the backend:
- In server.py, use functools.lru_cache or a manual dict with max 200 entries for thumbnails
- Key: file path, Value: base64 thumbnail string
- When cache is full, evict least recently used entry
- This prevents re-reading and re-resizing the same image files on repeated page visits

### 12. Results sorting in memory:
- The /results endpoint should sort the in-memory flagged list, not re-read from disk
- Sort should be fast even for 5000+ flagged items (just a list sort in Python)

### 13. Frontend polling debounce:
- In progress.js, don't use a fixed setInterval for polling
- Instead: after each /progress response arrives, wait 500ms, then send the next request
- This prevents stacking up requests if the backend is slow to respond
- Use a pattern like: async function pollLoop() { await api.getProgress(); await sleep(500); if (stillPolling) pollLoop(); }

## Final Review:

After implementing all the above, review every file in the project for:
- Console.log statements that should be removed or made conditional
- Inconsistent variable names or API parameter names between frontend and backend
- Any hardcoded localhost:8899 that should use the api.js wrapper instead
- Missing error handling on any fetch() call
- Any TODO comments that need resolving

## Full Verification Checklist (test ALL of these):
- [ ] App launches: Electron window opens, backend starts, custom title bar visible
- [ ] Title bar: drag to move, minimize/maximize/close buttons work
- [ ] Setup screen: folder picker works (Electron dialog), file count/size preview loads
- [ ] Setup screen: threshold slider works, value displays correctly
- [ ] Setup screen: invalid folder shows inline error
- [ ] Setup screen: previous scan detected, resume/fresh options shown
- [ ] Progress screen: bar animates, stats update live, current file shown
- [ ] Progress screen: pulsing dot animation visible
- [ ] Progress screen: Stop Scan → confirmation → saves progress → back to setup
- [ ] Progress screen: scan error → error message shown with review/retry options
- [ ] Review screen: flagged images appear in grid with blurred thumbnails
- [ ] Review screen: hover to unblur individual images
- [ ] Review screen: Unblur All toggle works
- [ ] Review screen: sort dropdown changes order, reloads results
- [ ] Review screen: click to select, Select Page, Select All, Deselect All
- [ ] Review screen: selected count updates
- [ ] Review screen: Delete → confirmation with file list → files deleted → toast → grid updates
- [ ] Review screen: Quarantine → confirmation → files moved → toast → grid updates
- [ ] Review screen: pagination works, scroll to top on page change
- [ ] Review screen: empty state shows when all items handled
- [ ] Review screen: "Scan Another Folder" returns to setup
- [ ] Keyboard shortcuts: Ctrl+A, Escape, Arrow keys, Delete key
- [ ] Connection lost: banner appears, auto-reconnects
- [ ] Close during scan: confirmation dialog appears
- [ ] Resume: stop a scan, relaunch app, scan same folder → resumes from where it left off
- [ ] Closing Electron kills the Python backend process (no orphans)

# Phase 2: Frontend — Scan Configuration Screen
# Estimated time: ~20 minutes
# Prerequisite: Phase 1 backend is running and tested
# Test this phase before moving to phase-3.md

Build the frontend for CleanSweep in the frontend/ directory. Use vanilla HTML + CSS + JS (no React, no build step — keep it simple and fast to iterate).

## File Structure:

frontend/
├── index.html         # Main entry point, loads the right screen
├── css/
│   └── styles.css     # All styles, dark theme
├── js/
│   ├── app.js         # Screen routing and shared state
│   ├── scan-setup.js  # Scan configuration screen logic
│   └── api.js         # Wrapper for all backend API calls
└── assets/
    └── (empty for now, we'll add icons later)

## Design Requirements:

Dark theme. Background #0f0f0f, cards #1a1a1a, accent color #6366f1 (indigo). Clean, modern, minimal. Think Linear or Raycast aesthetics — not generic bootstrap. Use -apple-system/Segoe UI font stack. No border-radius over 8px. Subtle shadows only. Text: #eee for primary, #999 for secondary, #666 for muted.

## Scan Setup Screen (the first thing users see):

1. App title "CleanSweep" centered at top with a subtle tagline like "Find and remove sensitive content from your files"

2. Folder selection area:
   - Large drop zone with dashed border: "Drop a folder here or click to browse"
   - Also include a text input fallback where users can paste a folder path manually
   - Shows selected folder path once chosen
   - Shows file count and total size after folder is selected (calls GET /preview)

3. Threshold slider:
   - Range 0.1 to 0.9, default 0.5, step 0.05
   - Labels: left side "More sensitive (catches more)", right side "More strict (fewer false positives)"
   - Shows current value as percentage
   - Styled to match dark theme (custom slider track and thumb)

4. "Start Scan" button — large, indigo (#6366f1), disabled until a folder is selected
   - On click: calls POST /scan, then switches to the progress screen (Phase 3)
   - Disabled state: #333 background, not-allowed cursor

5. If a previous scan exists for the selected folder, show a banner:
   "Previous scan found (X of Y images scanned). Resume or start fresh?"
   with two buttons: "Resume Scan" (indigo) and "Start Fresh" (subtle/gray)

## api.js:

Create a clean API wrapper object with methods for every backend endpoint. All methods return promises. Base URL defaults to http://127.0.0.1:8899. Methods:

   api.startScan(folder, threshold)       → POST /scan
   api.getProgress()                       → GET /progress
   api.getResults(page, perPage, sortBy, sortOrder) → GET /results
   api.getThumb(index)                     → GET /thumb/<index>
   api.deleteFiles(paths)                  → POST /delete
   api.quarantineFiles(paths, destination) → POST /quarantine
   api.stopScan()                          → POST /stop
   api.healthCheck()                       → GET /health
   api.previewFolder(folder)               → GET /preview

## app.js:

- Manages screen routing. Three main screen divs: #scan-setup, #scan-progress, #scan-review
- Only one visible at a time. Others hidden with display:none.
- Global appState object: {currentScreen, folder, threshold, scanStatus}
- Functions: showScreen('setup'|'progress'|'review')
- Simple 200ms opacity fade transition between screens

## Verification (test these before moving to Phase 3):
- [ ] Open frontend/index.html in a browser (with backend running)
- [ ] Dark theme renders correctly, looks clean
- [ ] Can paste a folder path into the text input
- [ ] File count loads after entering a valid folder path
- [ ] Threshold slider works and shows value
- [ ] Start Scan button is disabled until folder is set
- [ ] Clicking Start Scan calls POST /scan (check browser dev tools Network tab)

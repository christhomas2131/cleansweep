# Phase 3: Frontend — Scan Progress Screen
# Estimated time: ~15 minutes
# Prerequisite: Phase 2 setup screen working, backend running
# Test this phase before moving to phase-4.md

Add the scan progress screen to the CleanSweep frontend.

## New File:

frontend/js/progress.js

## Progress Screen — shown while a scan is running:

1. Animated progress bar (horizontal, full width of a centered container):
   - Track: #1a1a1a, fill: indigo #6366f1, height ~8px, rounded
   - Smooth CSS transition on width changes
   - Large percentage number above/beside it (e.g. "34%" in big bold text)

2. Stats row below the progress bar — four stat cards in a horizontal row:
   - "Scanned" — e.g. "12,450 / 50,000" (use toLocaleString for commas)
   - "Flagged" — e.g. "87" (red-tinted if > 0)
   - "Speed" — e.g. "1.2 img/sec"
   - "ETA" — e.g. "2h 34m" (format as Xh Xm, or Xm Xs, or Xs depending on magnitude)
   Each stat in a subtle card (#1a1a1a background, small label above, large value below).

3. Current file indicator — small muted text below the stats:
   "Currently scanning: IMG_20240315_142233.jpg"
   Truncate with ellipsis if filename is longer than 60 characters.

4. Pulsing dot animation next to "Scanning..." label at the top of the screen. Small indigo dot that pulses (CSS keyframe, scale 1 to 1.5 and back, 1.5s infinite).

5. "Stop Scan" button — centered below everything, styled as a subtle outlined button (not filled):
   - On click: show confirmation modal: "Stop scanning? Progress is saved and you can resume later."
   - Confirm → calls POST /stop → returns to setup screen
   - Cancel → dismiss modal

6. Polling:
   - Call GET /progress every 500ms while on this screen
   - When status becomes "complete", stop polling and show completion overlay
   - Completion overlay: centered card that says "Scan complete! Found X items to review across Y files."
   - Auto-dismiss after 3 seconds OR click "Review Results" button to go immediately
   - Then transition to the review screen

## Update app.js:

- Update showScreen() to start/stop the progress polling interval when entering/leaving the progress screen
- Make sure navigating away from progress screen always clears the polling interval
- appState should now also track: {totalFiles, scannedFiles, flaggedCount, scanRate, eta}

## Update scan-setup.js:

- After successful POST /scan response, call showScreen('progress')

## Verification (test these before moving to Phase 4):
- [ ] Start a scan from the setup screen
- [ ] Progress screen appears with animated progress bar
- [ ] Stats update in real time (scanned count, flagged, speed, ETA)
- [ ] Current file name updates
- [ ] Pulsing dot animation is visible
- [ ] Stop Scan shows confirmation, stopping returns to setup
- [ ] Scan completion triggers overlay, then transitions to review screen
- [ ] Re-running after a stop correctly resumes

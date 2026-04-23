# CleanSweep — Premium UX Build
# ===============================
# 15 features that make CleanSweep feel like a $29 product, not a free tool.
# Five phases, one session, one command.
# Estimated time: ~2-2.5 hours
#
# Usage in Claude Code (with --dangerously-skip-permissions):
#   "Read cleansweep-phases/PREMIUM_UX.md and execute it start to finish."
#
# RULES:
# 1. Execute phases in order. Test each before moving on.
# 2. If something breaks, fix it before continuing.
# 3. After ALL phases, run verify.py for phases 1-12. All 120 must pass.
# 4. Print a final summary of every change.


# ============================================================
# PHASE A — Welcome & First Impression (~25 min)
# Make the welcome screen and first-scan flow feel intelligent.
# ============================================================

## A1: Last 3 scans quick-access on welcome screen

The welcome/setup screen currently has just a folder picker. Add a "Recent Scans"
section above or below the folder picker that shows the last 3 folders the user
scanned, with relative timestamps.

Layout (above the folder picker):
```
┌─────────────────────────────────────────────┐
│  RECENT SCANS                               │
│  ┌───────────────────────────────────┐ ╳  │
│  │ 📁 Pictures                       │    │
│  │    Scanned yesterday · 1,247 flagged│   │
│  └───────────────────────────────────┘    │
│  ┌───────────────────────────────────┐ ╳  │
│  │ 📁 Downloads                      │    │
│  │    Scanned 3 days ago · 12 flagged│    │
│  └───────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

Implementation:
- New function in scan-setup.js: loadRecentScans()
- Calls GET /history (already exists) and takes the most recent 3 entries
- Each entry is a clickable card that pre-fills the folder path and navigates
  to scan options ready to start
- Each card has a small × button to remove from history (calls DELETE /history/<id>)
- Format timestamps: "Today", "Yesterday", "3 days ago", "Last week", "Mar 15"
- If no scan history: hide the section entirely (don't show empty state)
- Card hover: subtle background lift

CSS for cards:
```css
.recent-scan-card {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 12px 16px;
    cursor: pointer;
    transition: all 150ms ease;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}
.recent-scan-card:hover {
    background: var(--bg-surface-2);
    border-color: var(--border-default);
}
```

## A2: Auto-detect new files since last scan

When the user selects a folder that was scanned before:
- Backend GET /preview already returns total_images
- Add a check: compare current file count + modification times to the last scan
- New endpoint: GET /folder-diff?folder=PATH
  - Returns: {total_files: int, new_since_last_scan: int, last_scan_date: str}
  - "new" means file exists now but wasn't in the last scan's file list, OR
    file's modification time is newer than last_scan_date
- In scan-setup.js, when folder is selected:
  - Call /folder-diff
  - If new_since_last_scan > 0 AND total_files > 100, show a banner:
    "📂 12 new files since your last scan. [Scan only new] or scan all"
  - "Scan only new" = pass {only_new: true} to POST /scan
- In scanner.py, support the only_new parameter — only process files newer than
  the last scan's progress timestamp

If folder was never scanned: don't show the banner.

## A3: Scan estimate before committing

When folder is selected and file count is known, show estimated scan time.

Implementation:
- Track average img/sec from previous scans (store in config: avg_speed_imgs_per_sec)
- Default if no history: 6 (CPU baseline with optimizations)
- Display under the folder info bar:
  "⏱ Estimated scan time: ~14 minutes (3,400 files at ~4 img/sec)"
- Color: var(--text-secondary), small text
- After each scan completes, update the rolling average in config

Calculation:
```javascript
function formatEstimate(fileCount, imgsPerSec) {
    const seconds = Math.ceil(fileCount / imgsPerSec);
    if (seconds < 60) return `${seconds} seconds`;
    if (seconds < 3600) return `~${Math.ceil(seconds/60)} minutes`;
    return `~${Math.floor(seconds/3600)}h ${Math.ceil((seconds%3600)/60)}m`;
}
```

## A4: First-time onboarding tooltips

First scan ever (config.first_scan_complete = false):
- Add a subtle tooltip pointing at the threshold slider:
  "💡 Lower = catches more potential matches. Higher = fewer false positives. 50% is a good starting point."
- Tooltip dismisses on click anywhere or after 8 seconds
- After dismiss: set config.first_scan_complete = true
- Never shows again

Implementation:
- New function showOnboardingHint() in scan-setup.js
- Call on screen mount only if !config.first_scan_complete
- CSS for tooltip:
```css
.onboarding-tip {
    position: absolute;
    background: var(--accent);
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    max-width: 280px;
    font-size: 13px;
    box-shadow: 0 8px 24px rgba(129, 140, 248, 0.3);
    z-index: 50;
    animation: tipFadeIn 300ms ease;
}
.onboarding-tip::after {
    /* Arrow pointing down at the slider */
    content: '';
    position: absolute;
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%);
    border: 8px solid transparent;
    border-top-color: var(--accent);
}
```

After the threshold slider tip dismisses on first scan, also queue a second
tip on the review screen (first time it loads with results):
"💡 Hover any card to unblur. Click to select. Use the toolbar to delete or quarantine."


# ============================================================
# PHASE B — Scan Control & Speed (~25 min)
# Give users more control during scans.
# ============================================================

## B1: Pause/Resume scan (different from Stop)

Stop = saves progress, exits scan thread, requires re-starting from setup.
Pause = scan thread pauses in memory, resume continues immediately, no disk write.

Implementation:
- New endpoint: POST /pause
  - Sets a pause_flag (threading.Event)
  - Scan loop checks this flag every iteration: if set, time.sleep(0.5) and recheck
  - Returns {status: "paused"}
- New endpoint: POST /resume
  - Clears the pause_flag
  - Returns {status: "resumed"}
- In scanner.py main loop:
```python
while pause_flag.is_set():
    if stop_flag.is_set():
        break
    time.sleep(0.5)
```
- Frontend: progress.js
  - Add a "Pause" button next to "Stop Scan" button
  - When clicked: POST /pause, button changes to "Resume"
  - When resumed: POST /resume, button changes back to "Pause"
  - Status text changes: "Scanning..." → "Paused"
  - Pulse dot stops animating when paused
  - Progress bar stops moving but stays at current %
  - Title bar: "CleanSweep — Paused at 47%"

## B2: Scan complete sound

When scan finishes, play a subtle "ding" notification sound.

Implementation:
- Add a small audio file: frontend/assets/sounds/complete.mp3 (or use a base64 data URI)
- Or generate a tone using Web Audio API (no asset needed):
```javascript
function playCompletionSound() {
    if (!config.sound_enabled) return; // respect user setting
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        // Pleasant two-note "ding"
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
        osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.15); // E6
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
        console.warn('Audio playback failed:', e);
    }
}
```

Call playCompletionSound() in progress.js when scan transitions to status='complete'.

Add a setting in Settings screen:
- "Play sound on scan complete" — toggle, default ON
- Stored in config as sound_enabled (boolean)

## B3: Auto-save scan results to disk (already exists, verify + improve)

Phase 11/12 added periodic save. Verify it's working and improve:
- Confirm save_progress() is called every 25 images
- Confirm flagged results are written to .cleansweep_results.json in the scan folder
- On next app launch:
  - GET /resumable-scan returns any in-progress scan
  - If found, show banner on welcome screen:
    "📋 Resume your last scan of 'Pictures' (47% complete, 1,247 flagged)"
    Buttons: [Resume] [Discard]
- This prevents loss on crash/close

If auto-save isn't already in place, implement it.

## B4: Progress bar in Windows taskbar

Electron supports native taskbar progress.

In electron/main.js:
- Listen for IPC messages from frontend with current progress percentage
- Call mainWindow.setProgressBar(percent / 100)
- Reset when scan completes or stops:
  mainWindow.setProgressBar(-1)

In frontend/js/progress.js, every poll:
- window.electronAPI.setTaskbarProgress(percent)

In electron/preload.js, expose:
- setTaskbarProgress: (p) => ipcRenderer.send('taskbar-progress', p)

In main.js IPC handler:
```javascript
ipcMain.on('taskbar-progress', (event, percent) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setProgressBar(percent >= 0 ? percent / 100 : -1);
    }
});
```


# ============================================================
# PHASE C — Review Screen Power Features (~30 min)
# The review screen is where users spend 90% of their time.
# ============================================================

## C1: Confidence histogram at top of review screen

Above the grid (between toolbar and grid), add a small horizontal histogram
showing distribution of flagged confidence scores.

Layout:
```
Confidence distribution:
  50-60%  ████░░░░░░░░  12 items
  60-70%  ████████████  47 items  ← largest bucket
  70-80%  ████████░░░░  31 items
  80-90%  ████░░░░░░░░  18 items
  90-100% ██░░░░░░░░░░   8 items

💡 Most flags are 60-70% confidence — review carefully for false positives.
```

Implementation:
- New function in review.js: renderHistogram(results)
- Buckets: 50-60, 60-70, 70-80, 80-90, 90-100
- Each row: bucket label + filled bar + count
- Bar color matches the confidence color (yellow/orange/red)
- Below the histogram: a "tip" line that adapts:
  - If most items are 50-70%: "💡 Most flags are lower confidence — many may be false positives."
  - If most items are 90-100%: "💡 Most flags are high confidence — likely true matches."
  - If evenly distributed: "💡 Mixed confidence — review by category using filters above."

CSS:
```css
.histogram {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
}
.histogram-row {
    display: grid;
    grid-template-columns: 60px 1fr 60px;
    gap: 8px;
    align-items: center;
    margin-bottom: 4px;
    font-size: 12px;
    font-family: var(--font-mono);
}
.histogram-bar {
    height: 8px;
    background: var(--bg-surface-2);
    border-radius: 2px;
    overflow: hidden;
}
.histogram-bar-fill {
    height: 100%;
    transition: width 300ms ease;
}
```

Make the histogram collapsible — small chevron toggle to hide/show.
Default: shown.

## C2: "Show me the worst 10" quick filter

Add a button to the review toolbar: "🚨 Top 10 Worst"
- One click filters the grid to only the 10 highest-confidence items
- Button toggles state: when active, shows "Showing top 10 worst"
- Click again to clear and show all results

Implementation in review.js:
- New filter state: showTopOnly (boolean)
- When true: sort by score desc, take only first 10
- Button styling: red-tinted when inactive, accent when active

## C3: Skip duplicates toggle

When loading results, detect duplicate files by hash. The backend already has
file paths but probably doesn't hash. Add it:

In scanner.py (or a new dedup.py):
- During scan, compute a quick hash for each file (SHA256 of first 1MB is enough
  for practical dedup — full hash is wasteful)
- Store the hash with each result
- This adds ~5% overhead to scan time

In server.py GET /results:
- Add query param: ?skip_duplicates=true
- When true: group results by hash, return only the first occurrence of each
- Include in response: {duplicates_hidden: int}

In review.js:
- New toolbar checkbox: "[ ] Skip duplicates (hides 23 duplicates)"
- The count "(hides 23 duplicates)" updates dynamically based on the response
- When checked: re-fetch results with skip_duplicates=true
- Setting persists in config: hide_duplicates_default (boolean)

If implementing the hash takes too long this session, defer it. The toggle should
exist but say "(coming soon)" if dedup isn't ready. DO IT — don't skip.

## C4: Quick-undo last action (Ctrl+Z)

The staging logic already exists for delete (Phase D in the previous build).
Expose it as a keyboard shortcut.

Implementation in review.js:
- Track lastStagingId in module scope
- On any delete action that returns staging_id, save it
- Add global keyboard listener:
```javascript
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (lastStagingId) {
            api.undoDelete(lastStagingId).then(() => {
                toast('Undid last delete', 'success');
                lastStagingId = null;
                loadResults(); // refresh grid
            });
        }
    }
});
```
- Show a toast on successful undo: "Undid last delete"
- After 30 seconds (when staging auto-confirms), clear lastStagingId
- If user presses Ctrl+Z after that: toast "Nothing to undo"

Also add Ctrl+Z to the keyboard shortcuts help modal.

## C5: Empty review screen state — celebration

When a scan completes with 0 flagged items, the review screen currently might
show an empty grid. Replace with a celebration state:

```
        ┌─────────────────────┐
        │       ✓ (large green checkmark)
        │
        │   All clear!
        │
        │   Scanned 1,200 files in 3 minutes.
        │   No sensitive content found.
        │
        │   [Scan Another Folder]
        │
        └─────────────────────┘
```

Implementation in review.js:
- After loading results, if results.total === 0:
  - Hide all toolbars, histogram, and grid
  - Show centered celebration card
  - Show: large checkmark icon, "All clear!" headline, summary stats, primary button
- Stats from progress: total scanned, scan duration

CSS:
```css
.empty-celebration {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 64px 32px;
    text-align: center;
    max-width: 480px;
    margin: 64px auto;
}
.empty-celebration-icon {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: var(--success-subtle);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 24px;
    animation: celebrationPop 500ms cubic-bezier(0.4, 0, 0.2, 1);
}
@keyframes celebrationPop {
    0% { transform: scale(0); }
    60% { transform: scale(1.1); }
    100% { transform: scale(1); }
}
```


# ============================================================
# PHASE D — Pro Polish & Premium Feel (~20 min)
# Make Pro users feel they got their money's worth.
# ============================================================

## D1: Hide ALL free tier traces for Pro users

Audit the entire codebase for any "Free tier" or "Upgrade to Pro" UI elements.
For Pro users (license.tier === 'pro'):
- Remove the "Free tier limited to 500 files" banner from setup screen
- Remove "(Pro)" badges from Videos and Documents checkboxes (just show normal text)
- Remove any "Upgrade" buttons
- Remove the orange/yellow warning bars
- The "PRO" badge in the title bar can stay — it's a status, not an upsell

Quick audit prompt: "Search the frontend for 'free', 'upgrade', 'pro', 'tier' and
hide any element that's for upselling free users when license.tier === 'pro'."

## D2: Settings → "Pro Member" section

For Pro users, add a small section in Settings:
```
PRO MEMBER
✓ Activated
License key: CSWEEP-XXXX-XXXX-XXXX-2024
Activated: March 15, 2026

[Deactivate License]
```

For Free users:
```
UPGRADE TO PRO
Get unlimited scanning, video support, and document scanning for $29 (one-time).
[Upgrade to Pro]   [Already have a key? Activate]
```

## D3: Total time saved counter (subtle, in Settings)

In Settings screen, add a small "Stats" section:
```
YOUR STATS
📊 Files scanned: 47,283
⏱ Scan time: 12.5 hours
🛡 Items flagged: 1,247
```

Backend tracks these:
- Add to config: lifetime_files_scanned, lifetime_scan_seconds, lifetime_flagged
- Increment after each scan completes
- Display formatted: "47,283 files" not "47283 files"

This makes users feel ROI on their purchase. "Damn, I scanned 47k files."

## D4: Consistent Pro badge styling

Audit all "PRO" badges across the UI. Make them consistent:
- Background: var(--accent-subtle)
- Color: var(--accent)
- Border: 1px solid var(--accent)
- Padding: 2px 6px
- Border-radius: 4px
- Font: 10px, 600 weight, uppercase
- Letter-spacing: 0.5px


# ============================================================
# PHASE E — Windows Integration (~25 min)
# Native OS feel.
# ============================================================

## E1: Right-click "Scan with CleanSweep" in Windows Explorer

Add a Windows registry entry that creates a context menu item on folders.

In electron/main.js (or a new install_context_menu.js):
- On first run, prompt: "Add 'Scan with CleanSweep' to right-click menu? [Yes] [Not now]"
- If yes: create the registry entries
- Store user choice in config: context_menu_installed (boolean)

Registry implementation:
```javascript
const { execSync } = require('child_process');
const path = require('path');

function installContextMenu() {
    try {
        const exePath = app.getPath('exe').replace(/\\/g, '\\\\');
        const commands = [
            `reg add "HKCU\\Software\\Classes\\Directory\\shell\\CleanSweep" /ve /d "Scan with CleanSweep" /f`,
            `reg add "HKCU\\Software\\Classes\\Directory\\shell\\CleanSweep" /v Icon /d "${exePath}" /f`,
            `reg add "HKCU\\Software\\Classes\\Directory\\shell\\CleanSweep\\command" /ve /d "\\"${exePath}\\" --scan-folder \\"%1\\"" /f`,
        ];
        for (const cmd of commands) {
            execSync(cmd);
        }
        return true;
    } catch (e) {
        console.error('Failed to install context menu:', e);
        return false;
    }
}

function uninstallContextMenu() {
    try {
        execSync(`reg delete "HKCU\\Software\\Classes\\Directory\\shell\\CleanSweep" /f`);
        return true;
    } catch (e) {
        return false;
    }
}
```

In main.js, handle the --scan-folder command line argument on app startup:
- Parse process.argv for --scan-folder=PATH
- After backend starts and frontend loads, send IPC to frontend with the path
- Frontend pre-fills the folder and goes straight to scan options

Add a Settings toggle: "Show 'Scan with CleanSweep' in Windows right-click menu"
- When toggled on: install registry entries
- When toggled off: remove them

NOTE: This may require admin privileges on some Windows configurations. Wrap in
try/catch and show user-friendly error if it fails: "Could not modify the right-click
menu. Try running CleanSweep as administrator once."

## E2: Verify Stop button uses /stop, not browser back

Make sure the existing Stop Scan button calls POST /stop properly and doesn't
try to navigate using browser back/forward, which would break Electron.


# ============================================================
# FINAL: Regression + Summary
# ============================================================

1. Run all 12 verify.py phases — must be 120/120
2. Manual smoke test:
   - Start backend, start Electron
   - Welcome screen shows recent scans (if any history exists)
   - Pick a folder, see scan estimate
   - First-run users see the threshold tooltip
   - Start scan, see Pause button next to Stop
   - Pause/Resume works
   - Scan completes with sound
   - Empty result shows celebration
   - Non-empty result shows histogram and "Top 10 Worst" button
   - Skip duplicates toggle works (or shows "coming soon" if deferred)
   - Ctrl+Z undoes last delete
   - Settings shows lifetime stats and Pro section
   - Right-click menu installs (or fails gracefully)

3. Print final summary:
   - All files modified with line counts
   - All new endpoints added to backend
   - All new features per phase
   - Any features deferred or partially implemented
   - Speed benchmarks if measurable
   - Recommendations for what to test manually

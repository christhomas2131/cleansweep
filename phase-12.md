# Phase 12: Onboarding + Polish + Ship Prep
# Estimated time: ~25 minutes
# Prerequisite: Phases 1-11 passing verification
# Final phase. After this, CleanSweep is ready to ship.

Make the first 60 seconds flawless, add settings, polish every rough edge, and prepare for launch.

## First-Run Onboarding:

### Update frontend/js/first-run.js:

The first-run screen (built in Phase 9 for model download) now becomes a full onboarding flow:

Step 1 — Welcome (shown only if this is the very first launch):
- "Welcome to CleanSweep" heading
- Brief text: "Find and remove sensitive content from your photos, videos, and documents. Everything runs privately on your machine."
- "Get Started" button → advances to step 2

Step 2 — Model Download (from Phase 9, already built):
- Progress bar for the AI model download
- If model is already downloaded, skip this step automatically

Step 3 — Quick Tutorial overlay:
- After model is ready, before going to setup screen
- Show 3 tooltip-style callouts overlaid on the setup screen (semi-transparent backdrop):
  1. Points to folder picker: "Start by selecting a folder to scan"
  2. Points to threshold slider: "Adjust sensitivity — lower catches more"
  3. Points to Start Scan button: "Hit scan and let the AI do the work"
- "Got it" button dismisses the overlay and stores a flag so it never shows again
- Store first_run_complete: true in %LOCALAPPDATA%/CleanSweep/config.json

### Backend:
- New endpoint: GET /config → returns app config from config.json
  {first_run_complete: bool, default_threshold: float, default_quarantine_path: string, theme: "dark"|"light", check_updates: bool}
- New endpoint: POST /config → saves partial config updates
  Accepts any subset of the config fields, merges with existing

## Settings Screen:

### New screen: #settings (accessible from a gear icon ⚙️ in the top bar of any screen)

New file: frontend/js/settings.js

Settings layout — single column, scrollable, grouped sections:

**Section: Scanning**
- Default threshold: slider (same as setup screen), saves to config
- Default quarantine folder: text input + browse button
  - Default: "[scanned_folder]_cleansweep_quarantine"
  - Custom: let user pick any folder

**Section: Performance**
- "Use GPU when available" toggle (only shown if GPU detected)
- Batch size: dropdown (1, 2, 4, 8) — default 4
  - Help text: "Lower if you experience crashes. Higher for faster scanning."

**Section: Appearance**
- Theme: "Dark" (default) | "Light" toggle
  - For now, just implement the toggle and store the preference
  - Actual light theme CSS: create a .theme-light class on <body> that overrides
    key CSS variables. Minimum viable light theme:
    - Body background: #f5f5f5
    - Cards: #ffffff
    - Text: #1a1a1a
    - Secondary text: #666
    - Borders: #e0e0e0
    - Keep accent color #6366f1
  - Add CSS custom properties (variables) to styles.css:
    ```
    :root {
      --bg-primary: #0f0f0f;
      --bg-card: #1a1a1a;
      --text-primary: #eeeeee;
      --text-secondary: #999999;
      --border-color: #333333;
    }
    .theme-light {
      --bg-primary: #f5f5f5;
      --bg-card: #ffffff;
      --text-primary: #1a1a1a;
      --text-secondary: #666666;
      --border-color: #e0e0e0;
    }
    ```
  - Update ALL existing CSS to use these variables instead of hardcoded colors
  - This is a significant refactor — search all of styles.css for hardcoded colors

**Section: License**
- Current status: "Free" or "Pro (CSWEEP-XXXX-...)"
- If free: "Enter License Key" button → opens activation modal
- If pro: "Deactivate" button

**Section: About**
- "CleanSweep v0.1.0"
- "Built with ❤️" or similar
- Links: "Website" | "Support" | "Privacy Policy" (placeholder URLs)

**Navigation:**
- Gear icon ⚙️ in the custom title bar (right side, before window controls)
- Clicking it shows the settings screen
- "← Back" button at top of settings returns to previous screen
- Settings changes save immediately via POST /config (no save button needed)

## UI Polish:

### Loading states on all async buttons:

Every button that triggers an API call should:
1. Show a small CSS spinner inside the button
2. Change text (e.g., "Start Scan" → "Starting...")
3. Become disabled to prevent double-clicks
4. Revert on success or error

Buttons to update:
- "Start Scan" on setup screen
- "Stop Scan" on progress screen
- "Delete Selected" on review screen
- "Quarantine Selected" on review screen
- "Activate" on license modal
- "Export Report" on review screen

Implementation: create a utility function in app.js:
```javascript
function withLoading(button, asyncFn) {
  const originalText = button.textContent;
  button.disabled = true;
  button.classList.add('loading');
  button.textContent = originalText.replace(/^(.+)$/, '$1...');
  return asyncFn().finally(() => {
    button.disabled = false;
    button.classList.remove('loading');
    button.textContent = originalText;
  });
}
```

Add CSS for .loading state: small spinner via ::after pseudo-element.

### Animations and transitions:

1. Screen transitions: update app.js showScreen()
   - Outgoing screen: opacity 1 → 0 over 150ms, then display:none
   - Incoming screen: display:block, opacity 0 → 1 over 150ms
   - Use CSS transition on opacity + a small JS delay

2. Card hover: subtle translateY(-2px) on hover (already exists, verify it works)

3. Card selection: add a quick scale(1.02) → scale(1) CSS animation on select
   - @keyframes selectPop { 0% { transform: scale(1) } 50% { transform: scale(1.03) } 100% { transform: scale(1) } }
   - Duration: 150ms, triggered by adding a class momentarily

4. Toast slide-up: animate from bottom: -50px to bottom: 30px on appear

5. Modal: fade in backdrop (opacity 0→1, 200ms) + scale modal card from 0.95→1 (200ms)

6. Body fade on load (from Phase 6 — verify it works)

### Responsive layout verification:

Test and fix all screens at these widths:
- 1200px (full desktop)
- 900px (minimum window size)
- Below 900px should not be possible (enforced by Electron minWidth)

Things to verify:
- Review grid: columns collapse from 5 → 4 → 3 at smaller widths
- Action buttons wrap gracefully (flex-wrap is already set)
- Progress stats cards don't overflow
- Settings screen is scrollable if content exceeds viewport
- Title bar doesn't break on resize

### Accessibility basics:

1. Focus states: add visible outline on :focus-visible for all interactive elements
   ```css
   button:focus-visible, input:focus-visible, select:focus-visible {
     outline: 2px solid #6366f1;
     outline-offset: 2px;
   }
   ```

2. All img tags should have alt attributes (already done for thumbnails)

3. Modals should trap focus (tab should cycle within the modal, not escape behind it):
   - On modal open: store the previously focused element
   - Focus the first button in the modal
   - On modal close: restore focus to the previously focused element
   - Add keydown listener: if Tab on last focusable element → focus first, and vice versa for Shift+Tab

4. Buttons and interactive elements should be minimum 44x44px tap target (already satisfied by our 8px 18px padding)

5. Ensure text contrast ratio meets 4.5:1 minimum:
   - #eee on #0f0f0f = ~18:1 ✓
   - #999 on #0f0f0f = ~6.5:1 ✓
   - #666 on #0f0f0f = ~4:1 — bump to #777 (~4.8:1) ✓

## Final Code Review:

After implementing everything above, do a final review pass across ALL files:

1. Remove or conditionalize all console.log statements:
   - Dev logs should be wrapped in: if (isDev) console.log(...)
   - Or just remove them entirely

2. Check for consistent naming:
   - Backend uses snake_case everywhere
   - Frontend uses camelCase for JS, kebab-case for CSS classes
   - API endpoint params use snake_case

3. Verify all fetch() calls in frontend have .catch() error handling

4. Check that all new endpoints added in Phases 7-12 are documented:
   - Add a comment block at the top of server.py listing all endpoints

5. Verify no hardcoded file paths that would break on different Windows machines:
   - All user-specific paths should use %LOCALAPPDATA% or os.environ
   - No paths with "C:\Users\specific_username"

6. Make sure the .cleansweep_* files (progress, results, hashes) are listed
   in a comment somewhere so users know they can safely delete them

## Final Verification (FULL APP):
- [ ] First-run onboarding: welcome → model download → tutorial → setup
- [ ] Tutorial overlay shows tooltips, dismisses with "Got it"
- [ ] Second launch skips onboarding entirely
- [ ] Settings accessible via gear icon from any screen
- [ ] Settings: threshold slider saves and persists
- [ ] Settings: theme toggle switches between dark and light
- [ ] Settings: light theme is readable and consistent
- [ ] Settings: license section shows correct status
- [ ] All async buttons show loading state and prevent double-click
- [ ] Screen transitions are smooth (opacity fade)
- [ ] Card selection has subtle pop animation
- [ ] Toast notifications slide up smoothly
- [ ] Modal open/close is animated
- [ ] Focus states visible on tab navigation
- [ ] Modal traps focus
- [ ] Layout works at 1200px and 900px widths
- [ ] No console.log spam in the browser console
- [ ] All API endpoints have error handling
- [ ] Backend GET /config and POST /config work
- [ ] Config persists across backend restarts
- [ ] Full flow works: first-run → setup → scan → progress → review → delete → back to setup
- [ ] Free tier limits enforced (500 files, no video/docs)
- [ ] Pro activation unlocks all features
- [ ] Export CSV works
- [ ] Scan history accessible and shows past scans
- [ ] Video scanning works end-to-end (if ffmpeg available)
- [ ] Document scanning works end-to-end
- [ ] Smart skip works on re-scan
- [ ] Quick-select buttons work (90%+, 80%+, 70%+)

# Phase 4: Frontend — Review Grid Screen
# Estimated time: ~25 minutes
# Prerequisite: Phases 1-3 working, scan completes and transitions to this screen
# Test this phase before moving to phase-5.md

Add the review/results screen to the CleanSweep frontend. This is the most important screen in the app — it's where users spend the most time.

## New File:

frontend/js/review.js

## Review Screen Layout:

### Top Bar (sticky, stays visible while scrolling):

Left side:
- "CleanSweep" small text + "X items flagged" + "Scanned Y total"

Right side — action buttons row:
- Unblur All toggle button with sliding dot indicator (like iOS toggle):
  - Off state: gray dot left, label "Unblur All"
  - On state: indigo dot right, label "Unblur All"
  - Toggles the CSS class 'unblurred' on the grid container
- Sort dropdown styled as a select element matching the dark theme:
  - Options: "Confidence ↓" (default) | "Confidence ↑" | "Filename A-Z" | "Filename Z-A"
  - On change: re-fetch results from GET /results with new sort params, reset to page 1
- "Select Page" button (subtle/gray) — selects all items on the current page
- "Select All (X)" button (subtle/gray) — selects ALL flagged items across all pages
- "Deselect All" button (subtle/gray)
- "Quarantine Selected" button (orange #ea580c, disabled when nothing selected)
- "Delete Selected" button (red #dc2626, disabled when nothing selected)

Below buttons: selected count indicator text — "23 of 87 selected" (updates live)

### Image Grid:

- Responsive CSS grid: roughly 5 columns on wide screens (1200px+), 4 on medium, 3 on narrow, 2 on very narrow
- grid-template-columns: repeat(auto-fill, minmax(200px, 1fr))
- Gap: 12px

Each card:
- Container: #1a1a1a background, 6px border-radius, overflow hidden, 2px solid transparent border
- Square thumbnail area: aspect-ratio 1, object-fit cover
  - Blurred by default: filter: blur(20px), transition: filter 0.2s
  - On hover: filter: blur(0px) — smooth reveal
  - When grid has class 'unblurred': all images filter: blur(0px) regardless of hover
  - Placeholder while loading: #222 background with a small CSS spinner centered
- Click anywhere on card: toggle selected state
- Selected state: border-color #6366f1, checkmark badge visible top-right corner
  - Checkmark badge: 24px circle, position absolute top 8px right 8px
  - Unselected: dark semi-transparent circle with gray border, hidden checkmark
  - Selected: indigo background, white checkmark visible
- Bottom info bar: 8px padding
  - Left: filename, truncated with ellipsis, 11px font, #aaa color
  - Right: confidence badge — small rounded label
    - >= 85%: red background #dc2626, white text
    - >= 65%: orange background #ea580c, white text
    - < 65%: yellow background #ca8a04, dark text
    - Shows percentage like "92%"
- Title attribute on the card with full file path (shows on hover as browser tooltip)

Thumbnail loading:
- Call GET /thumb/<index> for each visible card
- Load asynchronously — don't block the grid render
- Cache loaded thumbnails in a JavaScript Map object keyed by index
- On page revisit, serve from cache instantly (no re-fetch)
- If thumb fails to load, show a broken-image placeholder

### Pagination:

- Centered below the grid, 24px margin top
- "← Prev" button | "Page 3 of 12 (87 items)" text | "Next →" button
- Buttons: dark styled, disabled at first/last page (opacity 0.3, not-allowed cursor)
- Page size: 50 items
- On page change: scroll window to top, render new page, load new thumbnails

### Delete Confirmation Modal:

- Fixed overlay: rgba(0,0,0,0.8) backdrop, z-index 100, flex centered
- Modal card: #222 background, 12px border-radius, 30px padding, max-width 440px
- Title: "Permanently delete X file(s)?"
- Body: "This cannot be undone. Files will be removed from disk."
- If X <= 5, list all filenames. If X > 5, list first 5 filenames + "and X more..."
- Buttons: "Cancel" (gray) + "Yes, Delete" (red)
- After successful delete:
  - Remove deleted items from the flagged list
  - Update grid, counts, pagination
  - Show green toast: "Deleted X file(s)"
  - If current page is now empty, go to previous page

### Quarantine Confirmation Modal:

- Same layout as delete modal but:
- Title: "Move X file(s) to quarantine?"
- Body: "Files will be moved to: [scanned_folder]\_cleansweep_quarantine/"
- Buttons: "Cancel" (gray) + "Move to Quarantine" (orange)
- After successful quarantine: same UX updates as delete + toast "Moved X file(s) to quarantine"

### Empty State (when zero flagged items):

- Centered in the grid area
- Large green checkmark (CSS-drawn or Unicode ✓ in a green circle)
- Heading: "All clear!"
- Subtext: "No sensitive content was detected in your library. Safe to share."
- Button: "Scan Another Folder" (indigo) → returns to setup screen

### Toast Notifications:

- Fixed position, bottom center (bottom: 30px, left: 50%, transform: translateX(-50%))
- Slides up with CSS animation, auto-dismiss after 3 seconds
- Green (#22c55e) background for success, red (#dc2626) for errors
- White text, 600 font-weight, 8px border-radius, 12px 24px padding

## Verification (test these before moving to Phase 5):
- [ ] After scan completes, review screen loads with flagged images
- [ ] Thumbnails load asynchronously with spinner placeholders
- [ ] Images are blurred by default, unblur on hover
- [ ] Unblur All toggle works
- [ ] Clicking a card selects/deselects it with visual feedback
- [ ] Select Page / Select All / Deselect All work
- [ ] Sort dropdown re-sorts the results
- [ ] Pagination works, scroll-to-top on page change
- [ ] Delete flow: select items → click Delete → confirmation → items removed → toast
- [ ] Quarantine flow: same as delete but moves files
- [ ] Empty state shows when all items are deleted
- [ ] Selected count updates in real time

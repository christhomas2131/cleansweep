# Phase 10: Landing Page + Payments
# Estimated time: ~20 minutes
# Prerequisite: Phases 1-9 passing verification
# This is where money starts flowing.

Build a landing page for CleanSweep and integrate a license key system into the app.

## Landing Page:

### New directory: website/

Create a single-page marketing site. Static HTML + CSS + minimal JS. No frameworks.

### File structure:
website/
├── index.html
├── css/
│   └── styles.css
└── assets/
    └── (screenshots will go here later)

### Design:
- Clean, professional, dark theme matching the app (#0f0f0f background)
- Accent: indigo #6366f1
- Font: Inter (Google Fonts) or system font stack
- Responsive: works on mobile and desktop
- Total page: no more than 5 viewport heights of content

### Sections (top to bottom):

1. **Navigation bar** (sticky):
   - Left: "CleanSweep" logo text
   - Right: "Features" | "Pricing" | "Download" links (anchor scroll)
   - Compact, 60px height, subtle bottom border

2. **Hero section**:
   - Headline: "Your files. Your privacy. Cleaned up."
   - Subheadline: "AI-powered scanner finds sensitive content in your photos, videos, and documents. Runs 100% on your machine — nothing is ever uploaded."
   - Two buttons: "Download Free" (indigo, primary) | "See Pricing" (outlined, secondary)
   - Below buttons: small trust text: "Windows 10/11 • No account required • 100% offline"
   - Right side or below: a screenshot placeholder div (gray box with text "App screenshot" — we'll add real screenshots later)

3. **Feature cards** (3-column grid, collapses to 1 on mobile):
   Card 1 - "Scan Everything":
   - Icon: 🔍 (or simple SVG)
   - "Photos, videos, PDFs, Word docs, PowerPoints, Excel files. If there's an image in it, CleanSweep will find it."
   
   Card 2 - "100% Private":
   - Icon: 🔒
   - "No cloud. No uploads. No account. The AI model runs entirely on your computer. Your files never leave your machine."
   
   Card 3 - "Review & Act":
   - Icon: ✨
   - "Visual review grid with confidence scores. Delete or quarantine flagged files in bulk. Sort by severity. Export reports."

4. **How It Works** (3 steps, horizontal on desktop, vertical on mobile):
   - Step 1: "Pick a folder" — "Select any folder on your computer. CleanSweep scans subfolders automatically."
   - Step 2: "AI scans your files" — "The scanner extracts and classifies every image — even those embedded in documents and videos."
   - Step 3: "Review and clean" — "See everything flagged in a visual grid. Delete, quarantine, or keep with one click."

5. **Pricing section** (centered card):
   
   Free tier (left side or top of card):
   - "Free"
   - ✓ Scan up to 500 images
   - ✓ Visual review grid
   - ✓ Delete & quarantine
   - ✗ Video scanning
   - ✗ Document scanning
   - ✗ Unlimited files
   - [Download Free] button
   
   Pro tier (right side or bottom, highlighted with indigo border):
   - "$29" with "one-time purchase" subtitle
   - ✓ Everything in Free
   - ✓ Unlimited file scanning
   - ✓ Video scanning (MP4, MOV, AVI, MKV...)
   - ✓ Document scanning (PDF, DOCX, PPTX, XLSX)
   - ✓ Export compliance reports
   - ✓ Free updates for life
   - [Buy Pro] button → links to payment URL (placeholder href for now)

6. **FAQ section** (accordion-style, click to expand):
   - "Is my data really private?" → "Yes. CleanSweep runs entirely on your computer..."
   - "Do I need an internet connection?" → "Only for the initial AI model download (~350MB)..."
   - "What file types are supported?" → list them
   - "How accurate is the detection?" → "The AI model has ~93% accuracy..."
   - "Can I get a refund?" → "Yes, 30-day money-back guarantee, no questions asked."
   - "Is this safe to install?" → "CleanSweep is open about what it does..."
   Simple JS toggle: click question → answer div toggles display.

7. **Footer**:
   - Left: "© 2026 CleanSweep"
   - Center: "Privacy Policy" | "Terms" | "Contact" links (placeholder hrefs)
   - Right: support email placeholder

### Responsive breakpoints:
- Desktop: max-width 1100px centered container
- Tablet (<768px): feature cards stack to 1 column, hero text centers
- Mobile (<480px): pricing cards stack, nav hamburger not needed (page is short enough)

## License Key System:

### Backend changes (server.py):

New endpoints:
- POST /activate — accepts {license_key: string}
  - For now, implement a simple offline validation:
    - Key format: CSWEEP-XXXX-XXXX-XXXX-XXXX (alphanumeric)
    - Store activated key in %LOCALAPPDATA%/CleanSweep/license.json
    - Return {valid: true, tier: "pro"} or {valid: false, error: "Invalid key"}
  - NOTE: For v1, we'll use a simple check — any key matching the format is "valid"
    Real validation against LemonSqueezy/Stripe API comes later when you set up the payment provider
  - This is a pragmatic shortcut: ship the app, add real validation when payments are live

- GET /license — returns current license status
  - {activated: true, tier: "pro", key: "CSWEEP-XXXX-..."} or
  - {activated: false, tier: "free"}

- POST /deactivate — removes the license key, reverts to free tier

### Frontend changes:

#### Pro badge / upgrade prompt (update review.js, scan-setup.js):
- Top bar: if free tier, show a small "FREE" badge next to CleanSweep title
- If pro, show "PRO" badge in indigo
- Setup screen: if free tier and user checks "Videos" or "Documents" checkbox:
  - Show inline message: "Video/document scanning requires CleanSweep Pro."
  - "Enter License Key" button opens the activation modal
- Setup screen: if free tier and folder has >500 scannable files:
  - Show: "Free tier limited to 500 files. Upgrade to scan all X files."
  - Still allow scanning — just cap at 500 files processed

#### Activation modal (new):
- Triggered by clicking "FREE" badge, "Enter License Key" button, or a new "Activate Pro" option in the UI
- Modal with dark overlay (same style as delete confirmation):
  - Title: "Activate CleanSweep Pro"
  - Text input field for license key (styled, placeholder: "CSWEEP-XXXX-XXXX-XXXX-XXXX")
  - "Activate" button (indigo)
  - "Buy a license" link → opens the landing page pricing section in default browser
  - On success: green toast "Pro activated!", close modal, update badge
  - On failure: inline error "Invalid license key. Check and try again."

#### Free tier enforcement (update scanner.py):
- When license is free tier:
  - Max 500 files per scan (images only)
  - Skip video files even if checkbox is checked
  - Skip document files even if checkbox is checked
- When scanning hits the 500-file limit:
  - Set a flag in progress: limit_reached: true
  - Progress screen shows: "Free tier limit reached (500 files). Upgrade to continue."
  - Still transition to review screen to see what was found

### Where to enforce limits:
- Backend enforces hard limits (file count cap, skip video/doc files)
- Frontend shows the messaging (upgrade prompts, limit warnings)
- Never rely on frontend-only enforcement — it's trivially bypassable

## Verification:
- [ ] website/index.html exists with all sections (hero, features, pricing, FAQ, footer)
- [ ] Website renders properly when opened in a browser
- [ ] Website is responsive (test at 1200px, 768px, 480px widths)
- [ ] FAQ accordion expand/collapse works
- [ ] GET /license returns license status
- [ ] POST /activate with a valid-format key returns success
- [ ] POST /activate with a garbage key returns failure
- [ ] License persists after backend restart (stored in file)
- [ ] Free tier badge shows in the app
- [ ] Pro badge shows after activation
- [ ] Free tier scan stops at 500 files with appropriate message
- [ ] Video/document checkboxes show upgrade prompt on free tier
- [ ] Activation modal opens, accepts key, updates UI

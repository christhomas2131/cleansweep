# Changelog

All notable changes to CleanSweep are documented here.

---

## [0.1.0] — 2026-03-30

Initial release.

### Core App
- Scan any folder or drive for sensitive/explicit content using an on-device AI classifier
- Visual review grid: thumbnails, confidence scores, sortable results
- Delete (permanent) or Quarantine (moves to safe folder) flagged files
- Adjustable sensitivity threshold slider
- Quick-select buttons: flag all above 90%, 80%, 70% confidence

### File Support
- **Images:** JPG, PNG, GIF, BMP, WebP, TIFF
- **Videos:** MP4, MOV, AVI, MKV, WebM — via ffmpeg frame extraction (Pro)
- **Documents:** PDF, DOCX, PPTX, XLSX — scans embedded images (Pro)

### Performance
- Smart re-scan: skips files that haven't changed since the last scan
- GPU acceleration support (NVIDIA CUDA)
- Configurable batch size for memory-constrained machines
- Real-time progress: files scanned, flags found, speed, ETA

### Privacy & Security
- 100% offline after initial model download (~350 MB)
- No telemetry, no analytics, no network calls during scanning
- All data stored locally in `%LOCALAPPDATA%/CleanSweep/`

### Product
- Free tier: up to 500 image files
- Pro tier: unlimited files, video scanning, document scanning, CSV export ($29 one-time)
- License key activation system
- Scan history with past run summaries
- CSV export of flagged files with confidence scores

### UX
- First-run onboarding with model download progress and interactive tutorial
- Settings screen: threshold defaults, quarantine folder, GPU toggle, batch size, dark/light theme
- Screen transitions, card animations, loading states on all async buttons
- Dark theme (default) + light theme
- Accessible: focus states, focus trap in modals, keyboard navigable

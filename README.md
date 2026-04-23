# CleanSweep

**AI-powered scanner that finds and removes sensitive content from your files. Runs 100% on your machine — nothing is ever uploaded.**

---

## What it does

CleanSweep scans a folder (or an entire drive) and surfaces every image, video frame, or embedded document image that contains sensitive or explicit content. You review the results in a visual grid, then delete or quarantine with one click. The AI model runs locally — your files never leave your computer.

**Who it's for:** IT professionals cleaning company devices, parents reviewing shared family drives, anyone who inherited a large photo library and needs to audit it fast.

---

## Screenshots

> _Screenshots coming soon. Drop a `.gif` of the scan → review flow here._

---

## Features

| Feature | Free | Pro |
|---|---|---|
| Image scanning (JPG, PNG, GIF, BMP, WebP, TIFF) | ✓ up to 500 files | ✓ unlimited |
| Visual review grid with confidence scores | ✓ | ✓ |
| Delete & quarantine | ✓ | ✓ |
| Video scanning (MP4, MOV, AVI, MKV, WebM) | — | ✓ |
| Document scanning (PDF, DOCX, PPTX, XLSX) | — | ✓ |
| Export CSV report | — | ✓ |
| Scan history | — | ✓ |
| Smart re-scan (skip unchanged files) | — | ✓ |
| **Price** | Free | $29 one-time |

---

## System Requirements

- Windows 10 or 11 (64-bit)
- 4 GB RAM minimum (8 GB recommended)
- ~500 MB disk space for the AI model
- Internet connection for initial model download only — works fully offline after that
- GPU optional (NVIDIA CUDA supported for faster scanning)
- ffmpeg required for video scanning (free, [download here](https://ffmpeg.org/download.html))

---

## Installation

### Option A — Installer (recommended)

1. Download `CleanSweep-Setup.exe` from [Releases](../../releases)
2. Run the installer and follow the prompts
3. Launch CleanSweep from the Start Menu or Desktop shortcut
4. On first launch, the app will download the AI model (~350 MB) — this takes 1–3 minutes depending on your connection

### Option B — Build from source

Requirements: Python 3.9+, Node.js 18+, npm, PyInstaller

```bash
git clone https://github.com/your-username/cleansweep
cd cleansweep
pip install pyinstaller
python build.py
```

The installer will be output to `build/installer/`. See [Building from Source](#building-from-source) for details.

---

## Usage

1. **Select a folder** — click Browse and pick any folder. Subfolders are included automatically.
2. **Adjust sensitivity** — the threshold slider controls how strict the AI is. Lower = catches more (but more false positives). Start at 70% if you're unsure.
3. **Start scan** — the AI processes every supported file. A progress bar shows files scanned, flags found, and estimated time remaining.
4. **Review results** — flagged files appear in a visual grid sorted by confidence score. Click any thumbnail to preview.
5. **Act** — select files and hit Delete (permanent) or Quarantine (moves to a safe folder). Or dismiss false positives with one click.

---

## Building from Source

```bash
# 1. Install Python dependencies
pip install -r backend/requirements.txt
pip install pyinstaller

# 2. Build the backend executable
python backend/build_backend.py

# 3. Install Electron dependencies
cd electron
npm install

# 4. Build the Windows installer
npm run build
# Output: build/installer/CleanSweep Setup X.X.X.exe

# Or run all steps at once:
python build.py
```

**To run in development mode (no build required):**
```bash
# Terminal 1 — start the backend
cd backend
pip install -r requirements.txt
python server.py

# Terminal 2 — start Electron
cd electron
npm install
npm run dev
```

---

## Privacy

CleanSweep is designed from the ground up to be offline-first:

- The AI model (NSFW classifier) runs entirely on your CPU or GPU
- No telemetry, no analytics, no network calls during scanning
- Scan results, thumbnails, and history are stored locally in `%LOCALAPPDATA%/CleanSweep/`
- The only network request the app ever makes is the one-time model download on first launch

---

## License

[License TBD — see LICENSE file]

This is a commercial product. All rights reserved.

---

## Contributing

CleanSweep is a commercial, closed-source product and is not open to external contributions at this time.

---

## Support

Found a bug or have a question? Open an issue or reach out via the [website](https://cleansweep.app).

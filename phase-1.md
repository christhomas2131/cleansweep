# Phase 1: Project Scaffold + Python Backend API
# Estimated time: ~20 minutes
# Test this phase before moving to phase-2.md

Create a desktop app project called CleanSweep in the current directory.

## Project Structure:

cleansweep/
├── backend/
│   ├── server.py          # Flask API server
│   ├── scanner.py         # NSFW scanning engine
│   ├── progress.py        # Save/resume progress management
│   └── requirements.txt   # Python dependencies
├── electron/
│   ├── main.js            # Electron main process (placeholder for now)
│   ├── preload.js         # Context bridge (placeholder for now)
│   └── package.json       # Electron deps
├── frontend/
│   └── (empty for now)
└── README.md

## Backend Requirements (Python + Flask):

server.py — Flask API on localhost:8899 with these endpoints:

- POST /scan — accepts JSON {folder: string, threshold: float}. Validates folder exists. Starts scanning in a background thread. Returns {status: "started", total_files: int} or error.
- GET /progress — returns {status: "scanning"|"complete"|"idle"|"error", total: int, scanned: int, flagged_count: int, percent: float, rate: float, eta_seconds: float, current_file: string}
- GET /results — accepts query params: page (default 1), per_page (default 50), sort_by (default "score"), sort_order (default "desc"). Returns {items: [{path, filename, score, index}], total: int, page: int, pages: int}
- GET /thumb/<int:index> — returns JSON {thumbnail: base64_string}. Generates 300x300 JPEG thumbnail on demand, caches in memory.
- POST /delete — accepts {paths: [string]}. Deletes files from disk. Updates results. Returns {deleted: int, failed: int}.
- POST /quarantine — accepts {paths: [string], destination: string}. Moves files to destination folder (creates it if needed). Updates results. Returns {moved: int, failed: int}.
- POST /stop — stops the current scan gracefully, saves progress. Returns {status: "stopped"}.
- GET /health — returns {status: "ok"} for Electron to verify backend is running.
- GET /preview — accepts query param: folder. Returns {total_images: int, total_size_mb: float} for the given folder. Used by the frontend to show file count before scanning.

scanner.py — the scanning engine:

- Uses AdamCodd/vit-base-nsfw-detector via transformers pipeline, device=-1 (CPU).
- Recursively finds all .jpg, .jpeg, .png, .gif, .bmp, .webp, .tiff files.
- Classifies each image and stores results for any above threshold.
- Reports progress back to server.py via a shared state dict (thread-safe).
- Handles errors per-image gracefully (skip broken files, log error, continue).
- Supports a stop flag to halt scanning mid-run.

progress.py — save/resume management:

- Saves progress to .cleansweep_progress.json in the scanned folder every 25 images.
- Saves flagged results to .cleansweep_results.json separately.
- On scan start, checks for existing progress file. If threshold matches, resumes from where it left off. If threshold differs, warns and offers fresh start.
- Provides load_progress(), save_progress(), clear_progress() functions.

requirements.txt should include: flask, flask-cors, transformers, torch, pillow

Make sure the Flask server enables CORS (all origins, since Electron will connect from file:// or localhost).

Do NOT build the frontend or Electron shell yet. I want to test the backend independently first. Include a brief section in README.md explaining how to start the backend manually for testing:
    pip install -r backend/requirements.txt
    python backend/server.py

## Verification (test these before moving to Phase 2):
- [ ] `python backend/server.py` starts without errors
- [ ] `curl http://127.0.0.1:8899/health` returns {"status": "ok"}
- [ ] `curl -X POST http://127.0.0.1:8899/scan -H "Content-Type: application/json" -d "{\"folder\": \"C:/some/test/folder\", \"threshold\": 0.5}"` starts a scan
- [ ] `curl http://127.0.0.1:8899/progress` returns live scan status
- [ ] Ctrl+C on the server saves progress

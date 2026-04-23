"""
CleanSweep — Flask API Server
==============================
All endpoints for the CleanSweep NSFW scanner desktop app.

Endpoints:
  GET  /health                     -> {status: "ok"}
  GET  /preview?folder=...         -> {total_images, total_size_mb}
  POST /scan                       -> {status: "started", total_files: int}
  GET  /progress                   -> full scan status object
  GET  /results                    -> {items, total, page, pages}
  GET  /thumb/<index>              -> {thumbnail: base64}
  POST /delete                     -> {deleted, failed}
  POST /quarantine                 -> {moved, failed}
  POST /stop                       -> {status: "stopped"}
  GET  /capabilities               -> {ffmpeg, video_scanning, gpu_available, gpu_name}
  GET  /filmstrip/<index>          -> {frames: [{timestamp, thumbnail}]}
  GET  /doc-details/<index>        -> {doc_type, total_images_extracted, flagged_images}
  GET  /model-status               -> {downloaded, download_size_mb}
  POST /download-model             -> starts model download
  GET  /model-download-progress    -> {status, percent, speed_mbps}
  GET  /license                    -> {activated, tier, key}
  POST /activate                   -> {valid, tier} or {valid: false, error}
  POST /deactivate                 -> {status: "deactivated"}
  GET  /export?format=csv          -> CSV file download
  GET  /history                    -> list of past scan summaries
  DELETE /history/<id>             -> deletes history entry
  GET  /config                     -> app config
  POST /config                     -> saves config
"""

import os
import sys
import io
import json
import time
import uuid
import shutil
import base64
import signal
import logging
import threading
import csv
import re
from datetime import datetime
from functools import lru_cache
from flask import Flask, request, jsonify, Response, g
from flask_cors import CORS

# ── Setup ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger(__name__)


def setup_logging():
    """Add a rotating file handler so errors survive terminal/app restarts."""
    try:
        from logging.handlers import RotatingFileHandler
        _local = os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
        log_dir = os.path.join(_local, "CleanSweep", "logs")
        os.makedirs(log_dir, exist_ok=True)
        log_file = os.path.join(log_dir, "cleansweep.log")
        fh = RotatingFileHandler(log_file, maxBytes=5 * 1024 * 1024, backupCount=3)
        fh.setLevel(logging.DEBUG)
        fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
        logging.getLogger().addHandler(fh)
        log.info(f"Log file: {log_file}")
    except Exception as e:
        log.warning(f"Could not set up file logging: {e}")


setup_logging()

# Add backend dir to path for imports
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from scanner import shared_state, run_scan, set_stop, find_files, _scan_lock, IMAGE_EXTENSIONS
from video_scanner import check_ffmpeg, VIDEO_EXTENSIONS
from document_scanner import DOCUMENT_EXTENSIONS
from progress import load_progress, save_progress, clear_progress

# ── App Config ───────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app, origins="*")

# Local app data directory
LOCAL_APP_DATA = os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
APP_DATA_DIR = os.path.join(LOCAL_APP_DATA, "CleanSweep")
os.makedirs(APP_DATA_DIR, exist_ok=True)

LICENSE_FILE = os.path.join(APP_DATA_DIR, "license.json")
CONFIG_FILE = os.path.join(APP_DATA_DIR, "config.json")
HISTORY_DIR = os.path.join(APP_DATA_DIR, "history")
os.makedirs(HISTORY_DIR, exist_ok=True)

# ── Request Timing ────────────────────────────────────────────────────────────

@app.before_request
def _start_timer():
    g.t0 = time.time()

@app.after_request
def _log_request(response):
    if request.path != '/progress' and request.path != '/health':
        ms = (time.time() - g.t0) * 1000
        log.info(f"{request.method} {request.path} -> {response.status_code} ({ms:.0f}ms)")
    return response

# ── Capabilities ─────────────────────────────────────────────────────────────
FFMPEG_AVAILABLE = check_ffmpeg()
log.info(f"ffmpeg available: {FFMPEG_AVAILABLE}")

try:
    import torch
    GPU_AVAILABLE = torch.cuda.is_available()
    GPU_NAME = torch.cuda.get_device_name(0) if GPU_AVAILABLE else None
except Exception:
    GPU_AVAILABLE = False
    GPU_NAME = None

# ── Model download state ──────────────────────────────────────────────────────
_model_download_state = {
    "status": "idle",  # idle | downloading | complete | error
    "percent": 0.0,
    "speed_mbps": 0.0,
    "error": None,
}
_model_download_lock = threading.Lock()

# ── Thumbnail cache (LRU, max 200 entries) ────────────────────────────────────
_thumb_cache = {}
_thumb_cache_order = []
THUMB_CACHE_MAX = 200


def _cache_thumbnail(key, value):
    global _thumb_cache, _thumb_cache_order
    if key in _thumb_cache:
        _thumb_cache_order.remove(key)
    elif len(_thumb_cache) >= THUMB_CACHE_MAX:
        oldest = _thumb_cache_order.pop(0)
        _thumb_cache.pop(oldest, None)
    _thumb_cache[key] = value
    _thumb_cache_order.append(key)


# ── Config helpers ────────────────────────────────────────────────────────────
DEFAULT_CONFIG = {
    "first_run_complete": False,
    "default_threshold": 0.5,
    "default_quarantine_path": "",
    "theme": "dark",
    "check_updates": True,
    "use_gpu": False,
    "batch_size": 4,
}


def load_config():
    if os.path.isfile(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            cfg = dict(DEFAULT_CONFIG)
            cfg.update(data)
            return cfg
        except Exception:
            pass
    return dict(DEFAULT_CONFIG)


def save_config(updates):
    cfg = load_config()
    cfg.update(updates)
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
    except Exception as e:
        log.warning(f"Failed to save config: {e}")
    return cfg


# ── License helpers ───────────────────────────────────────────────────────────
LICENSE_KEY_PATTERN = re.compile(r'^CSWEEP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$', re.IGNORECASE)


def load_license():
    if os.path.isfile(LICENSE_FILE):
        try:
            with open(LICENSE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    # DEV MODE: auto-activate pro for testing. Remove before shipping.
    dev_license = {"activated": True, "tier": "pro", "key": "CSWEEP-DEV0-ADMN-TEST-0000"}
    save_license(dev_license)
    return dev_license


def save_license(data):
    try:
        with open(LICENSE_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        log.warning(f"Failed to save license: {e}")


def is_pro():
    lic = load_license()
    return lic.get("activated", False) and lic.get("tier") == "pro"


# ── Scan history helpers ──────────────────────────────────────────────────────
def save_scan_history(folder, total_files, flagged_count, threshold, types_scanned, duration_seconds):
    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"scan_{timestamp}.json"
        data = {
            "id": timestamp,
            "folder": folder,
            "date": datetime.now().isoformat(),
            "total_files": total_files,
            "flagged_count": flagged_count,
            "threshold": threshold,
            "types_scanned": types_scanned,
            "duration_seconds": duration_seconds,
        }
        with open(os.path.join(HISTORY_DIR, filename), "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        log.warning(f"Failed to save scan history: {e}")


def load_scan_history():
    entries = []
    try:
        for fname in sorted(os.listdir(HISTORY_DIR), reverse=True):
            if fname.startswith("scan_") and fname.endswith(".json"):
                try:
                    with open(os.path.join(HISTORY_DIR, fname), "r", encoding="utf-8") as f:
                        entries.append(json.load(f))
                except Exception:
                    pass
    except Exception:
        pass
    return entries


# ── Scan background thread ────────────────────────────────────────────────────
_scan_thread = None
_scan_start_time = None


def _get_results_list():
    """Get a copy of current scan results."""
    with _scan_lock:
        return list(shared_state.get("results", []))


def _get_result_by_index(index):
    """Get a result item by its index field."""
    results = _get_results_list()
    for item in results:
        if item.get("index") == index:
            return item
    # Fallback: index into list
    if 0 <= index < len(results):
        return results[index]
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/preview", methods=["GET"])
def preview():
    folder = request.args.get("folder", "")
    if not folder or not os.path.isdir(folder):
        return jsonify({"error": "Invalid or missing folder path"}), 400

    total_images = 0
    total_size_bytes = 0
    all_extensions = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS | DOCUMENT_EXTENSIONS

    try:
        for root, dirs, files in os.walk(folder):
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            for fname in files:
                if fname.startswith("."):
                    continue
                ext = os.path.splitext(fname)[1].lower()
                if ext in all_extensions:
                    total_images += 1
                    try:
                        fpath = os.path.join(root, fname)
                        total_size_bytes += os.path.getsize(fpath)
                    except OSError:
                        pass
    except PermissionError as e:
        return jsonify({"error": f"Permission denied: {e}"}), 400

    return jsonify({
        "total_images": total_images,
        "total_size_mb": round(total_size_bytes / (1024 * 1024), 2),
    })


@app.route("/scan", methods=["POST"])
def start_scan():
    global _scan_thread, _scan_start_time

    data = request.get_json(force=True, silent=True) or {}
    folder = os.path.normpath(data.get("folder", "")).replace("\\", "/")
    threshold = data.get("threshold", 0.5)
    scan_images = data.get("scan_images", True)
    scan_videos = data.get("scan_videos", True)
    scan_documents = data.get("scan_documents", True)
    use_gpu = data.get("use_gpu", False)
    batch_size = data.get("batch_size", 4)
    reset = data.get("reset", False)

    # Prevent duplicate scans
    if shared_state.get("status") == "scanning":
        return jsonify({"error": "A scan is already running. Stop it first."}), 409

    # Validate folder
    if not folder:
        return jsonify({"error": "Folder path is required"}), 400
    if not os.path.exists(folder):
        return jsonify({"error": "Folder not found"}), 400
    if not os.path.isdir(folder):
        return jsonify({"error": "Path is not a directory"}), 400
    try:
        os.listdir(folder)
    except PermissionError:
        return jsonify({"error": "Cannot read folder (permission denied)"}), 400

    # Validate threshold
    try:
        threshold = float(threshold)
        if not (0.0 <= threshold <= 1.0):
            raise ValueError("out of range")
    except (TypeError, ValueError):
        return jsonify({"error": "Threshold must be a float between 0.0 and 1.0"}), 400

    # Validate batch_size
    try:
        batch_size = int(batch_size)
        if batch_size < 1:
            batch_size = 1
        elif batch_size > 32:
            batch_size = 32
    except (TypeError, ValueError):
        batch_size = 4

    # Refuse to scan if model is not downloaded
    if not _check_model_downloaded():
        return jsonify({
            "error": "Model not downloaded. Please complete the initial setup to download "
                     "the NSFW detection model before scanning."
        }), 400

    # License check
    pro = is_pro()
    is_free_tier = not pro

    # Count total files for the response
    images, videos, documents = find_files(folder, scan_images, scan_videos and FFMPEG_AVAILABLE, scan_documents)
    if is_free_tier:
        videos = []
        documents = []
    total_files = len(images) + len(videos) + len(documents)

    _scan_start_time = time.time()

    def run():
        """Top-level scan thread wrapper. Must never raise."""
        try:
            if reset:
                clear_progress(folder)
            run_scan(
                folder=folder,
                threshold=threshold,
                scan_images=scan_images,
                scan_videos=scan_videos and FFMPEG_AVAILABLE,
                scan_documents=scan_documents,
                use_gpu=use_gpu and GPU_AVAILABLE,
                batch_size=batch_size,
                is_free_tier=is_free_tier,
            )
        except MemoryError:
            import gc
            gc.collect()
            log.error("FATAL: Scan thread ran out of memory")
            with _scan_lock:
                shared_state["status"] = "error"
                shared_state["error_message"] = (
                    "Ran out of memory. Try scanning a smaller folder or closing other applications."
                )
        except Exception as e:
            log.error(f"FATAL: Scan thread crashed: {e}")
            import traceback
            traceback.print_exc()
            with _scan_lock:
                if shared_state.get("status") not in ("complete", "stopped", "error"):
                    shared_state["status"] = "error"
                    shared_state["error_message"] = f"Scanner crashed unexpectedly: {str(e)[:200]}"
        # Save history when scan completes
        with _scan_lock:
            state = dict(shared_state)
        if state.get("status") in ("complete", "stopped"):
            duration = time.time() - (_scan_start_time or time.time())
            types = []
            if scan_images:
                types.append("images")
            if scan_videos:
                types.append("videos")
            if scan_documents:
                types.append("documents")
            save_scan_history(
                folder=folder,
                total_files=state.get("scanned", 0),
                flagged_count=state.get("flagged_count", 0),
                threshold=threshold,
                types_scanned=types,
                duration_seconds=round(duration, 1),
            )

    _scan_thread = threading.Thread(target=run, daemon=True)
    _scan_thread.start()

    return jsonify({
        "status": "started",
        "total_files": total_files,
    })


@app.route("/progress", methods=["GET"])
def get_progress():
    global _scan_thread
    # Dead thread detection: if thread was running but died unexpectedly, surface the error
    if (_scan_thread is not None
            and not _scan_thread.is_alive()
            and shared_state.get("status") in ("scanning", "loading_model")):
        with _scan_lock:
            shared_state["status"] = "error"
            if not shared_state.get("error_message"):
                shared_state["error_message"] = (
                    "Scanner stopped unexpectedly. Progress was saved. You can resume the scan."
                )

    with _scan_lock:
        state = dict(shared_state)
    return jsonify({
        "status": state.get("status", "idle"),
        "total": state.get("total", 0),
        "scanned": state.get("scanned", 0),
        "flagged_count": state.get("flagged_count", 0),
        "percent": state.get("percent", 0.0),
        "rate": state.get("rate", 0.0),
        "eta_seconds": state.get("eta_seconds", 0.0),
        "current_file": state.get("current_file", ""),
        "error_message": state.get("error_message"),
        "images_total": state.get("images_total", 0),
        "images_scanned": state.get("images_scanned", 0),
        "videos_total": state.get("videos_total", 0),
        "videos_scanned": state.get("videos_scanned", 0),
        "documents_total": state.get("documents_total", 0),
        "documents_scanned": state.get("documents_scanned", 0),
        "skipped_unchanged": state.get("skipped_unchanged", 0),
        "limit_reached": state.get("limit_reached", False),
    })


@app.route("/results", methods=["GET"])
def get_results():
    try:
        page = max(1, int(request.args.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        per_page = int(request.args.get("per_page", 50))
        per_page = max(1, min(200, per_page))
    except (TypeError, ValueError):
        per_page = 50

    sort_by = request.args.get("sort_by", "score")
    sort_order = request.args.get("sort_order", "desc")
    type_filter = request.args.get("type", "all")

    results = _get_results_list()

    # Apply type filter
    if type_filter in ("image", "video", "document"):
        results = [r for r in results if r.get("type") == type_filter]

    # Sort
    reverse = sort_order.lower() != "asc"
    if sort_by == "score":
        results.sort(key=lambda x: x.get("score", 0.0), reverse=reverse)
    elif sort_by == "filename":
        results.sort(key=lambda x: x.get("filename", "").lower(), reverse=reverse)

    total = len(results)
    pages = max(1, (total + per_page - 1) // per_page)
    page = min(page, pages)

    start = (page - 1) * per_page
    end = start + per_page
    page_items = results[start:end]

    items = []
    for idx, item in enumerate(page_items):
        items.append({
            "index": item.get("index", start + idx),
            "path": item.get("path", ""),
            "filename": item.get("filename", ""),
            "score": item.get("score", 0.0),
            "type": item.get("type", "image"),
            "doc_type": item.get("doc_type"),
        })

    return jsonify({
        "items": items,
        "total": total,
        "page": page,
        "pages": pages,
    })


@app.route("/thumb/<int:index>", methods=["GET"])
def get_thumb(index):
    # Check cache
    cache_key = f"thumb_{index}"
    if cache_key in _thumb_cache:
        return jsonify({"thumbnail": _thumb_cache[cache_key]})

    result = _get_result_by_index(index)
    if result is None:
        return jsonify({"error": "Index not found"}), 404

    # Use pre-generated thumbnail if available
    thumb_b64 = result.get("thumbnail_b64")
    if thumb_b64:
        _cache_thumbnail(cache_key, thumb_b64)
        return jsonify({"thumbnail": thumb_b64})

    # Generate thumbnail from file
    path = result.get("path", "")
    if not os.path.isfile(path):
        return jsonify({"error": "File not found"}), 404

    try:
        from PIL import Image, ImageOps
        img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
        img.thumbnail((300, 300))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        thumb_b64 = base64.b64encode(buf.getvalue()).decode()
        _cache_thumbnail(cache_key, thumb_b64)
        return jsonify({"thumbnail": thumb_b64})
    except Exception as e:
        log.warning(f"Failed to generate thumbnail for index {index}: {e}")
        return jsonify({"error": "Failed to generate thumbnail"}), 500


@app.route("/delete", methods=["POST"])
def delete_files():
    data = request.get_json(force=True, silent=True) or {}
    paths = data.get("paths", [])
    if not isinstance(paths, list):
        return jsonify({"error": "paths must be a list"}), 400

    deleted = 0
    failed = 0
    errors = []

    # Get the scanned folder for path traversal check
    with _scan_lock:
        scanned_folder = shared_state.get("scanned_folder", "")

    for path in paths:
        try:
            # Resolve and check path traversal
            resolved = os.path.realpath(path)
            if scanned_folder:
                scan_resolved = os.path.realpath(scanned_folder)
                if not resolved.startswith(scan_resolved):
                    errors.append({"path": path, "reason": "Path outside scanned folder"})
                    failed += 1
                    continue

            if not os.path.isfile(resolved):
                errors.append({"path": path, "reason": "File not found"})
                failed += 1
                continue

            os.remove(resolved)
            deleted += 1

            # Remove from results
            with _scan_lock:
                shared_state["results"] = [
                    r for r in shared_state["results"] if r.get("path") != path
                ]
                shared_state["flagged_count"] = len(shared_state["results"])

        except PermissionError:
            errors.append({"path": path, "reason": "Permission denied"})
            failed += 1
        except Exception as e:
            errors.append({"path": path, "reason": str(e)})
            failed += 1

    return jsonify({"deleted": deleted, "failed": failed, "errors": errors})


@app.route("/quarantine", methods=["POST"])
def quarantine_files():
    data = request.get_json(force=True, silent=True) or {}
    paths = data.get("paths", [])
    destination = data.get("destination", "")

    if not isinstance(paths, list):
        return jsonify({"error": "paths must be a list"}), 400

    # Determine destination
    with _scan_lock:
        scanned_folder = shared_state.get("scanned_folder", "")

    if not destination:
        if scanned_folder:
            folder_name = os.path.basename(os.path.normpath(scanned_folder))
            parent_dir = os.path.dirname(os.path.normpath(scanned_folder))
            destination = os.path.join(parent_dir, folder_name + "_cleansweep_quarantine")
        else:
            return jsonify({"error": "No destination specified"}), 400

    try:
        os.makedirs(destination, exist_ok=True)
    except Exception as e:
        return jsonify({"error": f"Cannot create quarantine folder: {e}"}), 500

    # Disk space check
    try:
        total_size = sum(os.path.getsize(p) for p in paths if os.path.exists(p))
        free_space = shutil.disk_usage(destination).free
        if free_space < total_size * 1.1:  # 10% buffer
            return jsonify({"error": f"Not enough disk space. Need {total_size // 1_000_000} MB, only {free_space // 1_000_000} MB available."}), 400
    except Exception as disk_err:
        log.warning(f"Disk space check failed: {disk_err}")

    moved = 0
    failed = 0
    errors = []

    for path in paths:
        try:
            resolved = os.path.realpath(path)
            if scanned_folder:
                scan_resolved = os.path.realpath(scanned_folder)
                if not resolved.startswith(scan_resolved):
                    errors.append({"path": path, "reason": "Path outside scanned folder"})
                    failed += 1
                    continue

            if not os.path.isfile(resolved):
                errors.append({"path": path, "reason": "File not found"})
                failed += 1
                continue

            dest_path = os.path.join(destination, os.path.basename(resolved))
            # Handle name collisions
            counter = 1
            base, ext = os.path.splitext(os.path.basename(resolved))
            while os.path.exists(dest_path):
                dest_path = os.path.join(destination, f"{base}_{counter}{ext}")
                counter += 1

            shutil.move(resolved, dest_path)
            moved += 1

            # Remove from results
            with _scan_lock:
                shared_state["results"] = [
                    r for r in shared_state["results"] if r.get("path") != path
                ]
                shared_state["flagged_count"] = len(shared_state["results"])

        except PermissionError:
            errors.append({"path": path, "reason": "Permission denied"})
            failed += 1
        except Exception as e:
            errors.append({"path": path, "reason": str(e)})
            failed += 1

    return jsonify({"moved": moved, "failed": failed, "errors": errors, "quarantine_path": destination})


@app.route("/stop", methods=["POST"])
def stop_scan():
    set_stop()
    with _scan_lock:
        folder = shared_state.get("scanned_folder", "")
        results = list(shared_state.get("results", []))
        scanned = shared_state.get("scanned", 0)
        total = shared_state.get("total", 0)
        threshold = shared_state.get("threshold", 0.5)
    if folder:
        save_progress(folder, scanned, total, threshold, [], results)
    return jsonify({"status": "stopped"})


@app.route("/capabilities", methods=["GET"])
def capabilities():
    return jsonify({
        "ffmpeg": FFMPEG_AVAILABLE,
        "video_scanning": FFMPEG_AVAILABLE,
        "gpu_available": GPU_AVAILABLE,
        "gpu_name": GPU_NAME,
    })


@app.route("/filmstrip/<int:index>", methods=["GET"])
def filmstrip(index):
    result = _get_result_by_index(index)
    if result is None:
        return jsonify({"error": "Index not found"}), 404

    if result.get("type") != "video":
        return jsonify({"error": "Not a video item"}), 400

    top_frames = result.get("top_frames", [])
    frames_out = []

    for frame in top_frames:
        timestamp = frame.get("timestamp", "0:00")
        score = frame.get("score", 0.0)
        # For filmstrip we'd need to regenerate thumbnails from temp frames
        # Since temp frames are cleaned up, return score info instead
        frames_out.append({
            "timestamp": timestamp,
            "score": score,
            "thumbnail": result.get("thumbnail_b64"),  # fallback to main thumbnail
        })

    return jsonify({"frames": frames_out})


@app.route("/doc-details/<int:index>", methods=["GET"])
def doc_details(index):
    result = _get_result_by_index(index)
    if result is None:
        return jsonify({"error": "Index not found"}), 404

    if result.get("type") != "document":
        return jsonify({"error": "Not a document item"}), 400

    flagged_images = result.get("flagged_images", [])
    # Add thumbnails (not stored, just return score info)
    flagged_out = []
    for fi in flagged_images:
        flagged_out.append({
            "page": fi.get("page"),
            "slide": fi.get("slide"),
            "sheet": fi.get("sheet"),
            "score": fi.get("score"),
            "thumbnail": None,
        })

    return jsonify({
        "doc_type": result.get("doc_type", ""),
        "total_images_extracted": result.get("total_images_extracted", 0),
        "flagged_images": flagged_out,
    })


# ── Model download endpoints ──────────────────────────────────────────────────

def _check_model_downloaded():
    """Check if the NSFW model weight files (.bin or .safetensors) are actually present."""
    try:
        models_dir = os.path.join(APP_DATA_DIR, "models")
        cache_dirs = [
            models_dir,
            os.path.join(os.path.expanduser("~"), ".cache", "huggingface", "hub"),
            os.environ.get("TRANSFORMERS_CACHE", ""),
            os.environ.get("HF_HOME", ""),
        ]
        weight_extensions = {".bin", ".safetensors"}
        for d in cache_dirs:
            if not d:
                continue
            for root, dirs, files in os.walk(d):
                root_lower = root.lower()
                is_model_dir = ("vit-base-nsfw" in root_lower or "adamcodd" in root_lower)
                for fname in files:
                    ext = os.path.splitext(fname)[1].lower()
                    if ext in weight_extensions and is_model_dir:
                        return True
        return False
    except Exception:
        return False


@app.route("/model-status", methods=["GET"])
def model_status():
    downloaded = _check_model_downloaded()
    return jsonify({
        "downloaded": downloaded,
        "download_size_mb": 350.0,
    })


@app.route("/download-model", methods=["POST"])
def download_model():
    def _download():
        global _model_download_state
        with _model_download_lock:
            _model_download_state["status"] = "downloading"
            _model_download_state["percent"] = 0.0
            _model_download_state["speed_mbps"] = 0.0

        try:
            models_dir = os.path.join(APP_DATA_DIR, "models")
            os.makedirs(models_dir, exist_ok=True)
            os.environ["TRANSFORMERS_CACHE"] = models_dir
            os.environ["HF_HOME"] = models_dir

            from transformers import pipeline
            import time as tmod
            start = tmod.time()

            with _model_download_lock:
                _model_download_state["percent"] = 10.0

            pipe = pipeline(
                "image-classification",
                model="AdamCodd/vit-base-nsfw-detector",
                device=-1,
            )

            elapsed = tmod.time() - start
            speed = 350.0 / elapsed if elapsed > 0 else 1.0

            with _model_download_lock:
                _model_download_state["status"] = "complete"
                _model_download_state["percent"] = 100.0
                _model_download_state["speed_mbps"] = round(speed, 2)

        except Exception as e:
            with _model_download_lock:
                _model_download_state["status"] = "error"
                _model_download_state["error"] = str(e)

    t = threading.Thread(target=_download, daemon=True)
    t.start()
    return jsonify({"status": "downloading"})


@app.route("/model-download-progress", methods=["GET"])
def model_download_progress():
    with _model_download_lock:
        state = dict(_model_download_state)
    return jsonify({
        "status": state.get("status", "idle"),
        "percent": state.get("percent", 0.0),
        "speed_mbps": state.get("speed_mbps", 0.0),
    })


# ── License endpoints ─────────────────────────────────────────────────────────

@app.route("/license", methods=["GET"])
def get_license():
    lic = load_license()
    return jsonify({
        "activated": lic.get("activated", False),
        "tier": lic.get("tier", "free"),
        "key": lic.get("key"),
    })


@app.route("/activate", methods=["POST"])
def activate():
    data = request.get_json(force=True, silent=True) or {}
    key = data.get("license_key", "").strip().upper()

    if not key:
        return jsonify({"valid": False, "error": "License key is required"})

    if not LICENSE_KEY_PATTERN.match(key):
        return jsonify({"valid": False, "error": "Invalid license key format"})

    # For v1: any key matching the format is valid
    lic_data = {
        "activated": True,
        "tier": "pro",
        "key": key,
    }
    save_license(lic_data)
    return jsonify({"valid": True, "tier": "pro"})


@app.route("/deactivate", methods=["POST"])
def deactivate():
    save_license({"activated": False, "tier": "free", "key": None})
    return jsonify({"status": "deactivated"})


# ── Export endpoint ───────────────────────────────────────────────────────────

@app.route("/export", methods=["GET"])
def export_results():
    fmt = request.args.get("format", "csv").lower()

    results = _get_results_list()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    if fmt == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Path", "Filename", "Type", "Score", "Status", "Timestamp"])
        for item in results:
            writer.writerow([
                item.get("path", ""),
                item.get("filename", ""),
                item.get("type", "image"),
                f"{item.get('score', 0.0):.4f}",
                "flagged",
                timestamp,
            ])
        csv_content = output.getvalue()
        return Response(
            csv_content,
            mimetype="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=cleansweep_report_{timestamp}.csv"
            },
        )

    return jsonify({"error": "Unsupported format"}), 400


# ── History endpoints ─────────────────────────────────────────────────────────

@app.route("/history", methods=["GET"])
def get_history():
    return jsonify(load_scan_history())


@app.route("/history/<entry_id>", methods=["DELETE"])
def delete_history(entry_id):
    try:
        for fname in os.listdir(HISTORY_DIR):
            if entry_id in fname and fname.endswith(".json"):
                os.remove(os.path.join(HISTORY_DIR, fname))
                return jsonify({"status": "deleted"})
        return jsonify({"error": "History entry not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Config endpoints ──────────────────────────────────────────────────────────

@app.route("/config", methods=["GET"])
def get_config():
    return jsonify(load_config())


@app.route("/config", methods=["POST"])
def update_config():
    data = request.get_json(force=True, silent=True) or {}
    cfg = save_config(data)
    return jsonify(cfg)


# ── Undo Delete (Staging) ────────────────────────────────────────────────────

# Staging store: {staging_id: {staged: [...], timestamp: float}}
_staging = {}

@app.route("/stage-delete", methods=["POST"])
def stage_delete():
    data = request.get_json(force=True, silent=True) or {}
    paths = data.get("paths", [])
    if not paths:
        return jsonify({"error": "No paths provided"}), 400

    staging_id = str(uuid.uuid4())
    staging_dir = os.path.join(APP_DATA_DIR, "staging", staging_id)
    os.makedirs(staging_dir, exist_ok=True)

    staged = []
    for src in paths:
        # Security: prevent path traversal
        src = os.path.normpath(src)
        if ".." in src:
            continue
        if not os.path.exists(src):
            continue
        dst = os.path.join(staging_dir, os.path.basename(src))
        # Handle filename collision
        if os.path.exists(dst):
            base, ext = os.path.splitext(os.path.basename(src))
            dst = os.path.join(staging_dir, f"{base}_{uuid.uuid4().hex[:6]}{ext}")
        try:
            shutil.move(src, dst)
            staged.append({"original": src, "staged": dst})
        except Exception as e:
            log.warning(f"Failed to stage {src}: {e}")

    _staging[staging_id] = {"staged": staged, "timestamp": time.time()}
    return jsonify({"staged": True, "staging_id": staging_id, "count": len(staged)})


@app.route("/confirm-delete", methods=["POST"])
def confirm_delete():
    data = request.get_json(force=True, silent=True) or {}
    staging_id = data.get("staging_id", "")
    entry = _staging.pop(staging_id, None)
    if not entry:
        return jsonify({"error": "Invalid or expired staging ID"}), 404

    deleted = 0
    for item in entry["staged"]:
        try:
            if os.path.exists(item["staged"]):
                os.remove(item["staged"])
                deleted += 1
        except Exception as e:
            log.warning(f"Failed to delete staged file {item['staged']}: {e}")

    # Clean up staging dir
    staging_dir = os.path.dirname(entry["staged"][0]["staged"]) if entry["staged"] else None
    if staging_dir and os.path.exists(staging_dir):
        try:
            shutil.rmtree(staging_dir, ignore_errors=True)
        except Exception:
            pass

    return jsonify({"deleted": deleted})


@app.route("/undo-delete", methods=["POST"])
def undo_delete():
    data = request.get_json(force=True, silent=True) or {}
    staging_id = data.get("staging_id", "")
    entry = _staging.pop(staging_id, None)
    if not entry:
        return jsonify({"error": "Invalid or expired staging ID"}), 404

    restored = 0
    for item in entry["staged"]:
        try:
            if os.path.exists(item["staged"]):
                # Re-create parent dir if needed
                os.makedirs(os.path.dirname(item["original"]), exist_ok=True)
                shutil.move(item["staged"], item["original"])
                restored += 1
        except Exception as e:
            log.warning(f"Failed to restore {item['staged']}: {e}")

    # Clean staging dir
    if entry["staged"]:
        staging_dir = os.path.dirname(entry["staged"][0]["staged"])
        shutil.rmtree(staging_dir, ignore_errors=True)

    return jsonify({"restored": restored})


# ── Graceful Shutdown ─────────────────────────────────────────────────────────

def _handle_shutdown(signum, frame):
    log.info("Backend shutting down gracefully.")
    sys.exit(0)

signal.signal(signal.SIGINT, _handle_shutdown)
signal.signal(signal.SIGTERM, _handle_shutdown)

# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    log.info("CleanSweep backend starting on port 8899...")
    app.run(host="127.0.0.1", port=8899, debug=False, threaded=True)

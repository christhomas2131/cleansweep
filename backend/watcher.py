"""
CleanSweep — Folder watcher.
Watches a single folder for newly-created image files (FSEvents on macOS,
inotify on Linux, ReadDirectoryChangesW on Windows via watchdog), scans
each one with the NSFW classifier, and records flagged hits so the
frontend can surface notifications.

Lifecycle is in-memory only — the watch resets on backend restart.
"""

import os
import io
import json
import time
import base64
import threading
import logging
from collections import deque

from PIL import Image, ImageOps

from paths import get_app_data_dir

_STATE_FILE = os.path.join(get_app_data_dir(), "watch.json")

log = logging.getLogger(__name__)

# Image-only for v1. Videos and documents would need much heavier scans
# per file and are a poor fit for the "instant notification" UX.
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".tif"}
MAX_RECENT_FLAGS = 50

_state_lock = threading.Lock()
_state = {
    "watching": False,
    "folder": None,
    "threshold": 0.5,
    "started_at": None,
    "total_scanned": 0,
    "recent_flags": [],   # bounded list of {id, path, filename, score, detected_at}
    "next_flag_id": 1,
    "last_event_time": 0,
    "error": None,
}

_observer = None
_event_queue = deque()
_event_cv = threading.Condition()
_worker_stop = threading.Event()
_worker_thread = None
_classifier = None
_classifier_lock = threading.Lock()


def _save_persistent_state():
    """Persist enabled folder + threshold so the watch can auto-resume on next launch."""
    try:
        with _state_lock:
            data = {
                "enabled": bool(_state["watching"]),
                "folder": _state["folder"],
                "threshold": _state["threshold"],
            }
        with open(_STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        log.warning(f"Watcher: failed to persist state: {e}")


def _load_persistent_state():
    """Read watch.json. Returns dict or None."""
    try:
        if not os.path.isfile(_STATE_FILE):
            return None
        with open(_STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        log.warning(f"Watcher: failed to read persistent state: {e}")
        return None


def try_resume_from_disk():
    """
    If a previous session left an enabled watch on a folder that still exists,
    restart it. Safe to call from any thread; safe if no prior state. Returns
    True if resumed, False otherwise.
    """
    data = _load_persistent_state()
    if not data or not data.get("enabled"):
        return False
    folder = data.get("folder")
    threshold = data.get("threshold", 0.5)
    if not folder or not os.path.isdir(folder):
        log.info(f"Watcher: not resuming — folder missing or invalid: {folder}")
        return False
    log.info(f"Watcher: auto-resuming watch on {folder}")
    ok, err = start_watch(folder, threshold)
    if not ok:
        log.warning(f"Watcher: auto-resume failed: {err}")
    return ok


def _load_classifier_once():
    """Lazy-load the NSFW classifier. Cached after first call."""
    global _classifier
    with _classifier_lock:
        if _classifier is not None:
            return _classifier
        try:
            from transformers import pipeline as hf_pipeline
            from paths import get_app_data_dir
            models_dir = os.path.join(get_app_data_dir(), "models")
            os.makedirs(models_dir, exist_ok=True)
            os.environ.setdefault("TRANSFORMERS_CACHE", models_dir)
            os.environ.setdefault("HF_HOME", models_dir)
            _classifier = hf_pipeline(
                "image-classification",
                model="AdamCodd/vit-base-nsfw-detector",
                device=-1,
            )
            log.info("Watcher classifier loaded")
            return _classifier
        except Exception as e:
            log.error(f"Watcher could not load classifier: {e}")
            return None


def _allowed(path):
    if not path:
        return False
    ext = os.path.splitext(path)[1].lower()
    return ext in IMAGE_EXTENSIONS


def _enqueue(path):
    if not _allowed(path):
        return
    with _event_cv:
        _event_queue.append(path)
        _event_cv.notify()


def _classify(path):
    """Score a single image, returning a float in [0.0, 1.0]. Returns None on failure."""
    classifier = _load_classifier_once()
    if classifier is None:
        return None
    img = None
    try:
        img = Image.open(path)
        img = ImageOps.exif_transpose(img)
        if img.mode != "RGB":
            img = img.convert("RGB")
        img.info.pop("icc_profile", None)
        img.thumbnail((512, 512))
        img.load()
        results = classifier(img)
        if not isinstance(results, list):
            results = [results]
        score = 0.0
        for r in results:
            label = (r.get("label", "") or "").lower()
            s = r.get("score", 0.0)
            if any(k in label for k in ("nsfw", "explicit", "porn", "hentai", "sexy")):
                score = max(score, s)
            elif label == "sfw":
                score = max(score, 1.0 - s)
        return score
    except Exception as e:
        log.warning(f"Watcher classify failed for {path}: {e}")
        return None
    finally:
        if img is not None:
            try: img.close()
            except Exception: pass


def _make_thumb_b64(path):
    try:
        img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
        img.thumbnail((300, 300))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        img.close()
        return base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return None


def _worker():
    """Pull paths off the queue and classify them one at a time."""
    while not _worker_stop.is_set():
        with _event_cv:
            while not _event_queue and not _worker_stop.is_set():
                _event_cv.wait(timeout=1.0)
            if _worker_stop.is_set():
                return
            path = _event_queue.popleft() if _event_queue else None
        if not path:
            continue

        # Brief settle so partially-written files have a chance to finish.
        time.sleep(0.6)
        if not os.path.isfile(path):
            continue

        score = _classify(path)
        with _state_lock:
            _state["total_scanned"] += 1
            _state["last_event_time"] = time.time()
            if score is None:
                continue
            if score >= _state["threshold"]:
                flag = {
                    "id": _state["next_flag_id"],
                    "path": path,
                    "filename": os.path.basename(path),
                    "score": round(score, 4),
                    "type": "image",
                    "detected_at": time.time(),
                    "thumbnail_b64": _make_thumb_b64(path),
                }
                _state["next_flag_id"] += 1
                _state["recent_flags"].append(flag)
                if len(_state["recent_flags"]) > MAX_RECENT_FLAGS:
                    _state["recent_flags"] = _state["recent_flags"][-MAX_RECENT_FLAGS:]


def start_watch(folder, threshold=0.5):
    """Begin watching the given folder. Returns (ok, error_or_none)."""
    global _observer, _worker_thread

    if not folder or not isinstance(folder, str):
        return False, "Folder is required"
    if not os.path.isdir(folder):
        return False, "Folder does not exist"

    with _state_lock:
        if _state["watching"]:
            return False, "Already watching a folder. Stop it first."

    try:
        from watchdog.observers import Observer
        from watchdog.events import FileSystemEventHandler
    except ImportError as e:
        return False, f"watchdog not installed: {e}"

    class _Handler(FileSystemEventHandler):
        def on_created(self, event):
            if event.is_directory:
                return
            _enqueue(event.src_path)
        def on_moved(self, event):
            if event.is_directory:
                return
            _enqueue(event.dest_path)

    try:
        _worker_stop.clear()
        _worker_thread = threading.Thread(target=_worker, name="cleansweep-watcher-worker", daemon=True)
        _worker_thread.start()

        _observer = Observer()
        _observer.schedule(_Handler(), folder, recursive=True)
        _observer.start()

        with _state_lock:
            _state["watching"] = True
            _state["folder"] = folder
            _state["threshold"] = float(threshold)
            _state["started_at"] = time.time()
            _state["error"] = None
            # Don't reset history on restart — let frontend dedupe by id.

        _save_persistent_state()
        log.info(f"Watching {folder} at threshold {threshold}")
        return True, None
    except Exception as e:
        _worker_stop.set()
        return False, f"Failed to start watcher: {e}"


def stop_watch(persist=True):
    """
    Stop the current watch. Idempotent.

    persist=True  → user explicitly turned watch off; write enabled:false to disk
                    so we don't auto-resume next launch.
    persist=False → process is shutting down (SIGTERM/SIGINT); leave the on-disk
                    state alone so the watch can auto-resume on the next launch.
    """
    global _observer, _worker_thread

    _worker_stop.set()
    with _event_cv:
        _event_cv.notify_all()

    if _observer is not None:
        try:
            _observer.stop()
            _observer.join(timeout=3)
        except Exception:
            pass
        _observer = None

    if _worker_thread is not None:
        try:
            _worker_thread.join(timeout=3)
        except Exception:
            pass
        _worker_thread = None

    with _state_lock:
        _state["watching"] = False
        _state["folder"] = None
        _state["started_at"] = None
        # Preserve recent_flags so the user can still see the last hits.

    if persist:
        _save_persistent_state()
    log.info(f"Watcher stopped (persist={persist})")
    return True


def get_status(since_id=0):
    """
    Snapshot of watch state. `since_id` filters recent_flags to only those
    with id > since_id (used by the frontend to fire notifications once).
    """
    with _state_lock:
        flags = [f for f in _state["recent_flags"] if f["id"] > since_id]
        return {
            "watching": _state["watching"],
            "folder": _state["folder"],
            "threshold": _state["threshold"],
            "started_at": _state["started_at"],
            "total_scanned": _state["total_scanned"],
            "recent_flags": flags,
            "max_flag_id": _state["next_flag_id"] - 1,
            "error": _state["error"],
        }

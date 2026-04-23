"""
CleanSweep — Progress save/resume management.
Saves progress to .cleansweep_progress.json and .cleansweep_results.json
in the scanned folder every 25 images. Hashes stored in .cleansweep_hashes.json.
"""

import json
import os
import hashlib
import logging

log = logging.getLogger(__name__)

PROGRESS_FILE = ".cleansweep_progress.json"
RESULTS_FILE = ".cleansweep_results.json"
HASHES_FILE = ".cleansweep_hashes.json"


def _progress_path(folder):
    return os.path.join(folder, PROGRESS_FILE)


def _results_path(folder):
    return os.path.join(folder, RESULTS_FILE)


def _hashes_path(folder):
    return os.path.join(folder, HASHES_FILE)


def load_progress(folder):
    """
    Load existing scan progress for the given folder.
    Returns a dict with keys: scanned_count, threshold, total, or None if not found.
    """
    ppath = _progress_path(folder)
    rpath = _results_path(folder)
    if not os.path.isfile(ppath):
        return None
    try:
        with open(ppath, "r", encoding="utf-8") as f:
            progress = json.load(f)
        results = []
        if os.path.isfile(rpath):
            with open(rpath, "r", encoding="utf-8") as f:
                results = json.load(f)
        progress["results"] = results
        return progress
    except Exception as e:
        log.warning(f"Failed to load progress: {e}")
        return None


def save_progress(folder, scanned_count, total, threshold, scanned_paths, results):
    """
    Save scan progress to disk.
    scanned_paths: list of file paths already scanned (including SFW)
    results: list of flagged result dicts
    """
    ppath = _progress_path(folder)
    rpath = _results_path(folder)
    try:
        progress = {
            "scanned_count": scanned_count,
            "total": total,
            "threshold": threshold,
            "scanned_paths": scanned_paths,
        }
        with open(ppath, "w", encoding="utf-8") as f:
            json.dump(progress, f)
        with open(rpath, "w", encoding="utf-8") as f:
            json.dump(results, f)
    except Exception as e:
        log.warning(f"Failed to save progress: {e}")


def clear_progress(folder):
    """Remove all progress files for the given folder."""
    for path in [_progress_path(folder), _results_path(folder), _hashes_path(folder)]:
        try:
            if os.path.isfile(path):
                os.remove(path)
        except Exception as e:
            log.warning(f"Failed to remove {path}: {e}")


def load_clean_hashes(folder):
    """Load the set of quick hashes for known-clean files."""
    hpath = _hashes_path(folder)
    if not os.path.isfile(hpath):
        return set()
    try:
        with open(hpath, "r", encoding="utf-8") as f:
            data = json.load(f)
        return set(data.get("clean_hashes", []))
    except Exception as e:
        log.warning(f"Failed to load hashes: {e}")
        return set()


def save_clean_hashes(folder, clean_hashes):
    """Save the set of quick hashes for known-clean files."""
    hpath = _hashes_path(folder)
    try:
        with open(hpath, "w", encoding="utf-8") as f:
            json.dump({"clean_hashes": list(clean_hashes)}, f)
    except Exception as e:
        log.warning(f"Failed to save hashes: {e}")


def compute_quick_hash(filepath):
    """
    Compute a fast hash from the first 64KB + file size.
    Returns a hex string. Fast (~0.1ms per file).
    """
    try:
        size = os.path.getsize(filepath)
        h = hashlib.md5()
        with open(filepath, "rb") as f:
            chunk = f.read(65536)
        h.update(chunk)
        h.update(str(size).encode())
        return h.hexdigest()
    except Exception:
        return None

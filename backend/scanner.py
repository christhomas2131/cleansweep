"""
CleanSweep — NSFW scanning engine.
Uses AdamCodd/vit-base-nsfw-detector for image classification.
Supports batch processing, smart skip (file hashing), GPU auto-detection,
and thread-pool pre-loading for performance.
Scans images first, then videos, then documents.
"""

import os
import io
import gc
import json
import time
import logging
import threading
import concurrent.futures

try:
    import psutil as _psutil
    _psutil_process = _psutil.Process(os.getpid())
    def _get_memory_mb():
        return _psutil_process.memory_info().rss / (1024 * 1024)
except ImportError:
    _psutil = None
    def _get_memory_mb():
        return 0.0

from PIL import Image

Image.MAX_IMAGE_PIXELS = 100_000_000  # 100MP safety limit

from progress import (
    save_progress, load_clean_hashes, save_clean_hashes, compute_quick_hash
)
from video_scanner import VIDEO_EXTENSIONS, scan_video, check_ffmpeg
from document_scanner import DOCUMENT_EXTENSIONS, scan_document

log = logging.getLogger(__name__)

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".tif"}

# Shared state dict — updated by scanning thread, read by Flask endpoints
shared_state = {
    "status": "idle",           # idle | scanning | complete | error | stopped
    "total": 0,
    "scanned": 0,
    "flagged_count": 0,
    "percent": 0.0,
    "rate": 0.0,
    "eta_seconds": 0.0,
    "current_file": "",
    "error_message": None,
    "results": [],              # list of flagged item dicts
    "scanned_folder": None,
    "threshold": 0.5,
    "images_total": 0,
    "images_scanned": 0,
    "videos_total": 0,
    "videos_scanned": 0,
    "documents_total": 0,
    "documents_scanned": 0,
    "skipped_unchanged": 0,
    "skipped_errors": 0,
    "limit_reached": False,
    "use_gpu": False,
    "batch_size": 4,
}

_stop_flag = threading.Event()
_pause_flag = threading.Event()
_scan_lock = threading.Lock()

_RESULTS_FILE = ".cleansweep_results.json"


def _save_results_to_disk(folder, results_list):
    """Save the full results list to disk for crash recovery and memory trimming."""
    try:
        rpath = os.path.join(folder, _RESULTS_FILE)
        with open(rpath, "w", encoding="utf-8") as f:
            json.dump(results_list, f)
    except Exception as e:
        log.warning(f"Failed to save results to disk: {e}")


def _load_results_from_disk(folder):
    """Load results from disk. Returns empty list on failure."""
    try:
        rpath = os.path.join(folder, _RESULTS_FILE)
        if os.path.isfile(rpath):
            with open(rpath, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception as e:
        log.warning(f"Failed to load results from disk: {e}")
    return []


def set_stop():
    _stop_flag.set()


def is_stopped():
    return _stop_flag.is_set()


def set_pause():
    _pause_flag.set()


def clear_pause():
    _pause_flag.clear()


def is_paused():
    return _pause_flag.is_set()


def _wait_if_paused():
    """Block while the pause flag is set, polling for stop."""
    while _pause_flag.is_set():
        if _stop_flag.is_set():
            return
        time.sleep(0.5)


def find_files(folder, scan_images=True, scan_videos=True, scan_documents=True):
    """Recursively find all files of the relevant types in the given folder."""
    images = []
    videos = []
    documents = []

    for root, dirs, files in os.walk(folder):
        # Skip hidden directories
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for fname in files:
            if fname.startswith("."):
                continue
            path = os.path.join(root, fname).replace("\\", "/")
            ext = os.path.splitext(fname)[1].lower()
            if scan_images and ext in IMAGE_EXTENSIONS:
                images.append(path)
            elif scan_videos and ext in VIDEO_EXTENSIONS:
                videos.append(path)
            elif scan_documents and ext in DOCUMENT_EXTENSIONS:
                documents.append(path)

    return images, videos, documents


def _get_nsfw_score(classifier_results):
    """Extract NSFW score from classifier output."""
    score = 0.0
    for r in classifier_results:
        label = r.get("label", "").lower()
        s = r.get("score", 0.0)
        if "nsfw" in label or "explicit" in label or "porn" in label or "hentai" in label or "sexy" in label:
            score = max(score, s)
        elif label == "sfw":
            score = max(score, 1.0 - s)
    return score


def _load_image(path):
    """Load a PIL Image from disk, return None on failure."""
    try:
        from PIL import ImageOps
        img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
        img.thumbnail((512, 512))
        img.load()  # Force load into memory
        return img
    except Image.DecompressionBombError as e:
        log.warning(f"Decompression bomb blocked for {path}: {e}")
        return None
    except (PermissionError, OSError) as e:
        log.debug(f"OS error loading image {path}: {e}")
        with _scan_lock:
            shared_state["skipped_errors"] = shared_state.get("skipped_errors", 0) + 1
        return None
    except Exception as e:
        log.debug(f"Failed to load image {path}: {e}")
        return None


def run_scan(folders=None, threshold=0.5, scan_images=True, scan_videos=True, scan_documents=True,
             use_gpu=False, batch_size=4, is_free_tier=False, file_limit=500,
             only_new_cutoff=None, folder=None):
    """
    Main scanning function — runs in a background thread.
    `folders` is a list of folder paths; `folder` kept for backward-compatibility.
    Updates shared_state throughout.
    """
    global shared_state
    _stop_flag.clear()
    _pause_flag.clear()

    # Backward compat: allow single `folder=` arg
    if folders is None:
        folders = [folder] if folder else []
    folders = [f for f in folders if f]
    if not folders:
        with _scan_lock:
            shared_state["status"] = "error"
            shared_state["error_message"] = "No folders specified"
        return

    anchor_folder = folders[0]  # progress/results persistence anchor

    with _scan_lock:
        shared_state.update({
            "status": "scanning",
            "total": 0,
            "scanned": 0,
            "flagged_count": 0,
            "percent": 0.0,
            "rate": 0.0,
            "eta_seconds": 0.0,
            "current_file": "",
            "current_folder": anchor_folder,
            "error_message": None,
            "results": [],
            "scanned_folder": anchor_folder,
            "scanned_folders": list(folders),
            "threshold": threshold,
            "images_total": 0,
            "images_scanned": 0,
            "videos_total": 0,
            "videos_scanned": 0,
            "documents_total": 0,
            "documents_scanned": 0,
            "skipped_unchanged": 0,
            "skipped_errors": 0,
            "limit_reached": False,
            "use_gpu": use_gpu,
            "batch_size": batch_size,
            "paused": False,
        })

    try:
        # Initialize classifier
        device = 0 if use_gpu else -1
        try:
            import torch
            if use_gpu and not torch.cuda.is_available():
                device = -1
        except ImportError:
            device = -1

        # Verify the model is downloaded before attempting to load it
        _local_app_data = os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
        _models_dir = os.path.join(_local_app_data, "CleanSweep", "models")
        os.makedirs(_models_dir, exist_ok=True)
        if "TRANSFORMERS_CACHE" not in os.environ:
            os.environ["TRANSFORMERS_CACHE"] = _models_dir
        if "HF_HOME" not in os.environ:
            os.environ["HF_HOME"] = _models_dir

        log.info(f"Model directory: {_models_dir}")

        def _is_model_present(models_dir):
            """Return True if actual NSFW model weight files (.bin/.safetensors) are present."""
            check_dirs = [
                models_dir,
                os.path.join(os.path.expanduser("~"), ".cache", "huggingface", "hub"),
            ]
            weight_extensions = {".bin", ".safetensors"}
            for d in check_dirs:
                if not d or not os.path.isdir(d):
                    continue
                for root, dirs, files in os.walk(d):
                    # Must be in an adamcodd/vit-base-nsfw related directory
                    root_lower = root.lower()
                    is_model_dir = ("vit-base-nsfw" in root_lower or "adamcodd" in root_lower)
                    for fname in files:
                        ext = os.path.splitext(fname)[1].lower()
                        if ext in weight_extensions and is_model_dir:
                            log.info(f"Found model weight file: {os.path.join(root, fname)}")
                            return True
            return False

        if not _is_model_present(_models_dir):
            log.error("NSFW model weight files not found. Cannot start scan.")
            with _scan_lock:
                shared_state["status"] = "error"
                shared_state["error_message"] = (
                    "AI model not found. Please return to setup to download it."
                )
            return

        def load_classifier(device, cache_dir):
            """Try ONNX first, fall back to PyTorch pipeline. Never crashes."""
            try:
                from optimum.onnxruntime import ORTModelForImageClassification
                from transformers import pipeline as hf_pipeline
                ort_model = ORTModelForImageClassification.from_pretrained(
                    "AdamCodd/vit-base-nsfw-detector",
                    cache_dir=cache_dir,
                    export=True,
                )
                from transformers import AutoFeatureExtractor
                extractor = AutoFeatureExtractor.from_pretrained(
                    "AdamCodd/vit-base-nsfw-detector", cache_dir=cache_dir
                )
                clf = hf_pipeline(
                    "image-classification",
                    model=ort_model,
                    feature_extractor=extractor,
                    device=-1,  # ONNX Runtime manages its own device
                )
                log.info("Loaded classifier via ONNX Runtime (optimum)")
                return clf
            except Exception as onnx_err:
                log.info(f"ONNX load failed ({onnx_err}), falling back to PyTorch pipeline")
            try:
                from transformers import pipeline as hf_pipeline
                clf = hf_pipeline(
                    "image-classification",
                    model="AdamCodd/vit-base-nsfw-detector",
                    device=device,
                )
                log.info("Loaded classifier via PyTorch transformers pipeline")
                return clf
            except Exception as pt_err:
                log.error(f"PyTorch pipeline fallback also failed: {pt_err}")
                return None

        classifier = None
        try:
            log.info("Loading NSFW classifier model...")
            with _scan_lock:
                shared_state["status"] = "loading_model"
            classifier = load_classifier(device, _models_dir)
            if classifier is None:
                raise RuntimeError("Both ONNX and PyTorch classifier loading failed.")
            log.info("NSFW classifier model loaded successfully.")
            with _scan_lock:
                shared_state["status"] = "scanning"
        except Exception as model_err:
            log.error(f"Failed to load NSFW model: {model_err}")
            with _scan_lock:
                shared_state["status"] = "error"
                shared_state["error_message"] = (
                    f"Failed to load NSFW detection model: {model_err}. "
                    "Try re-downloading the model from Settings."
                )
            return

        # Find files across all folders, skipping unreadable ones with a warning
        images, videos, documents = [], [], []
        skipped_folders = []
        for f in folders:
            try:
                fi, fv, fd = find_files(f, scan_images, scan_videos, scan_documents)
                images.extend(fi)
                videos.extend(fv)
                documents.extend(fd)
            except (PermissionError, OSError) as e:
                log.warning(f"Skipping folder {f}: {e}")
                skipped_folders.append({"folder": f, "reason": str(e)})
                continue

        # Apply only_new_cutoff: scan only files modified after the cutoff
        if only_new_cutoff:
            def _is_new(p):
                try:
                    return os.path.getmtime(p) > only_new_cutoff
                except OSError:
                    return False
            images = [p for p in images if _is_new(p)]
            videos = [p for p in videos if _is_new(p)]
            documents = [p for p in documents if _is_new(p)]

        # Free tier limits
        if is_free_tier:
            if scan_videos:
                videos = []
            if scan_documents:
                documents = []

        # Load clean hashes for smart skip — per folder, then merge for lookup
        folder_clean_hashes = {}
        folder_new_clean_hashes = {}
        for f in folders:
            folder_clean_hashes[f] = load_clean_hashes(f)
            folder_new_clean_hashes[f] = set(folder_clean_hashes[f])
        # Resolve which folder a path belongs to (longest prefix match wins)
        _sorted_folders = sorted(folders, key=len, reverse=True)
        def _owner_folder(path):
            norm = path.replace("\\", "/")
            for f in _sorted_folders:
                fnorm = f.replace("\\", "/").rstrip("/")
                if norm == fnorm or norm.startswith(fnorm + "/"):
                    return f
            return folders[0]
        def _path_is_clean(path):
            own = _owner_folder(path)
            h = compute_quick_hash(path)
            return h is not None and h in folder_clean_hashes.get(own, set())
        def _mark_clean(path):
            own = _owner_folder(path)
            h = compute_quick_hash(path)
            if h:
                folder_new_clean_hashes.setdefault(own, set()).add(h)

        total_files = len(images) + len(videos) + len(documents)

        # Free tier file limit
        if is_free_tier and total_files > file_limit:
            images = images[:file_limit]
            videos = []
            documents = []
            total_files = len(images)
            with _scan_lock:
                shared_state["limit_reached"] = True

        with _scan_lock:
            shared_state["total"] = total_files
            shared_state["images_total"] = len(images)
            shared_state["videos_total"] = len(videos)
            shared_state["documents_total"] = len(documents)

        results = []          # In-memory list, trimmed to ≤200 during scan
        total_flagged_count = 0  # True total, never trimmed
        scanned_count = 0
        skipped_count = 0
        start_time = time.time()

        def update_progress(current_file=""):
            nonlocal scanned_count
            elapsed = time.time() - start_time
            rate = scanned_count / elapsed if elapsed > 0 else 0.0
            remaining = total_files - scanned_count
            eta = remaining / rate if rate > 0 else 0.0
            percent = (scanned_count / total_files * 100) if total_files > 0 else 0.0

            with _scan_lock:
                shared_state["scanned"] = scanned_count
                shared_state["flagged_count"] = total_flagged_count
                shared_state["percent"] = percent
                shared_state["rate"] = rate
                shared_state["eta_seconds"] = eta
                shared_state["current_file"] = current_file
                shared_state["results"] = list(results)
                shared_state["skipped_unchanged"] = skipped_count

        # ── Scan images in batches ──────────────────────────────────────────
        current_batch_size = batch_size

        def process_image_batch(batch_paths):
            """Load and classify a batch of images."""
            nonlocal current_batch_size
            log.info(f"Processing batch of {len(batch_paths)} images")
            loaded = []
            for p in batch_paths:
                img = _load_image(p)
                loaded.append((p, img))

            valid = [(p, img) for p, img in loaded if img is not None]
            if not valid:
                return []

            imgs = [img for _, img in valid]
            paths_valid = [p for p, _ in valid]

            # Try batch classification with fallback
            try:
                batch_results = classifier(imgs, batch_size=current_batch_size)
                if not isinstance(batch_results[0], list):
                    batch_results = [[r] for r in batch_results]
            except RuntimeError as e:
                if "memory" in str(e).lower() or "oom" in str(e).lower():
                    # Reduce batch size
                    current_batch_size = max(1, current_batch_size // 2)
                    log.warning(f"OOM, reducing batch size to {current_batch_size}")
                    batch_results = []
                    for img in imgs:
                        try:
                            r = classifier(img)
                            batch_results.append(r)
                        except Exception:
                            batch_results.append([{"label": "sfw", "score": 1.0}])
                else:
                    raise

            flagged = []
            pil_map = dict(zip([p for p, _ in valid], [i for _, i in valid]))
            for path, img_results in zip(paths_valid, batch_results):
                score = _get_nsfw_score(img_results)
                if score >= threshold:
                    # Generate thumbnail
                    thumbnail_b64 = None
                    try:
                        pil = pil_map.get(path)
                        if pil:
                            thumb = pil.copy()
                            thumb.thumbnail((300, 300))
                            buf = io.BytesIO()
                            thumb.save(buf, format="JPEG", quality=85)
                            import base64
                            thumbnail_b64 = base64.b64encode(buf.getvalue()).decode()
                    except Exception:
                        pass

                    flagged.append({
                        "path": path,
                        "filename": os.path.basename(path),
                        "type": "image",
                        "score": score,
                        "thumbnail_b64": thumbnail_b64,
                        "file_hash": compute_quick_hash(path),
                    })
                else:
                    # Track as clean (per source folder)
                    _mark_clean(path)

            # Release PIL images from memory
            for _, img in valid:
                try:
                    img.close()
                except Exception:
                    pass
            del imgs, valid, loaded

            return flagged

        i = 0
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            # Pre-load next batch while classifying current
            batch_futures = {}

            def submit_batch(batch_paths):
                return executor.submit(lambda paths=batch_paths: [_load_image(p) for p in paths])

            while i < len(images):
                if is_stopped():
                    break
                _wait_if_paused()
                if is_stopped():
                    break

                # Check smart skip
                batch_paths = []
                j = i
                while j < len(images) and len(batch_paths) < current_batch_size:
                    path = images[j]
                    if _path_is_clean(path):
                        # Skip this file — already known clean at this threshold
                        scanned_count += 1
                        skipped_count += 1
                        with _scan_lock:
                            shared_state["images_scanned"] += 1
                        j += 1
                        continue
                    batch_paths.append(path)
                    j += 1

                if batch_paths:
                    with _scan_lock:
                        shared_state["current_file"] = f"Scanning image: {os.path.basename(batch_paths[0])}"
                        shared_state["current_folder"] = _owner_folder(batch_paths[0])

                    try:
                        flagged = process_image_batch(batch_paths)
                    except MemoryError:
                        log.error(f"OUT OF MEMORY processing batch starting at {batch_paths[0]}")
                        gc.collect()
                        try:
                            import torch
                            if torch.cuda.is_available():
                                torch.cuda.empty_cache()
                        except Exception:
                            pass
                        flagged = []
                        with _scan_lock:
                            shared_state["skipped_errors"] = shared_state.get("skipped_errors", 0) + len(batch_paths)

                    new_count = len(flagged)
                    results.extend(flagged)
                    total_flagged_count += new_count
                    scanned_count += len(batch_paths)

                    with _scan_lock:
                        shared_state["images_scanned"] += len(batch_paths)

                    update_progress(f"Scanning image: {os.path.basename(batch_paths[-1])}")

                    # Save results + hashes to disk every 25 images; trim in-memory list
                    if scanned_count % 25 == 0:
                        for _f, _h in folder_new_clean_hashes.items():
                            save_clean_hashes(_f, _h)
                        _save_results_to_disk(anchor_folder, results)
                        if len(results) > 200:
                            results = results[-200:]
                            log.debug(f"Trimmed in-memory results to 200 (total flagged: {total_flagged_count})")

                    # GC every 100 images
                    if scanned_count % 100 == 0:
                        gc.collect()
                        try:
                            import torch
                            if hasattr(torch, "cuda") and torch.cuda.is_available():
                                torch.cuda.empty_cache()
                        except Exception:
                            pass

                    # Memory monitoring every 200 images
                    if scanned_count % 200 == 0:
                        mem_mb = _get_memory_mb()
                        if mem_mb > 0:
                            log.info(f"Memory: {mem_mb:.0f} MB after {scanned_count} images")
                            if mem_mb > 1500:
                                gc.collect()
                                log.warning(f"HIGH MEMORY: {mem_mb:.0f} MB — forced GC")
                                mem_after = _get_memory_mb()
                                log.info(f"Memory after GC: {mem_after:.0f} MB")
                                if mem_after > 2000:
                                    log.error(f"CRITICAL: Memory at {mem_after:.0f} MB. Possible leak.")

                i = j

        # ── Scan videos ────────────────────────────────────────────────────
        for vidx, vpath in enumerate(videos):
            if is_stopped():
                break
            _wait_if_paused()
            if is_stopped():
                break

            def video_progress(frame_num, total_frames, fname=os.path.basename(vpath)):
                with _scan_lock:
                    shared_state["current_file"] = f"Scanning video: {fname} (frame {frame_num}/{total_frames})"

            with _scan_lock:
                shared_state["current_file"] = f"Scanning video: {os.path.basename(vpath)}"
                shared_state["current_folder"] = _owner_folder(vpath)

            result = scan_video(
                vpath, classifier, threshold,
                stop_flag=is_stopped,
                progress_callback=video_progress,
            )

            scanned_count += 1
            with _scan_lock:
                shared_state["videos_scanned"] += 1

            if result:
                # Record hash for dedup
                try:
                    result["file_hash"] = compute_quick_hash(vpath)
                except Exception:
                    pass
                results.append(result)
                total_flagged_count += 1

            update_progress(f"Scanning video: {os.path.basename(vpath)}")

        # ── Scan documents ─────────────────────────────────────────────────
        for didx, dpath in enumerate(documents):
            if is_stopped():
                break
            _wait_if_paused()
            if is_stopped():
                break

            ext = os.path.splitext(dpath)[1].lstrip(".")

            def doc_progress(img_num, total_imgs, fname=os.path.basename(dpath)):
                with _scan_lock:
                    shared_state["current_file"] = f"Scanning document: {fname} (image {img_num}/{total_imgs})"

            with _scan_lock:
                shared_state["current_file"] = f"Scanning document: {os.path.basename(dpath)}"
                shared_state["current_folder"] = _owner_folder(dpath)

            result = scan_document(
                dpath, classifier, threshold,
                stop_flag=is_stopped,
                progress_callback=doc_progress,
            )

            scanned_count += 1
            with _scan_lock:
                shared_state["documents_scanned"] += 1

            if result:
                try:
                    result["file_hash"] = compute_quick_hash(dpath)
                except Exception:
                    pass
                results.append(result)
                total_flagged_count += 1

            update_progress(f"Scanning document: {os.path.basename(dpath)}")

        for _f, _h in folder_new_clean_hashes.items():
            save_clean_hashes(_f, _h)

        # Final flush of results to disk, then load the complete list back
        _save_results_to_disk(anchor_folder, results)
        full_results = _load_results_from_disk(anchor_folder)
        if not full_results:
            full_results = results

        # Assign indices to final results
        for idx, r in enumerate(full_results):
            r["index"] = idx

        with _scan_lock:
            shared_state["results"] = full_results
            shared_state["flagged_count"] = total_flagged_count
            shared_state["scanned"] = scanned_count
            shared_state["percent"] = 100.0
            if is_stopped():
                shared_state["status"] = "stopped"
            else:
                shared_state["status"] = "complete"

    except Exception as e:
        log.exception(f"Scan failed: {e}")
        with _scan_lock:
            shared_state["status"] = "error"
            shared_state["error_message"] = str(e)

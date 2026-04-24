"""
CleanSweep — Video scanning engine.
Uses ffmpeg to extract frames from video files, then classifies each frame
using the NSFW classifier. A video is flagged if any frame scores above threshold.
"""

import os
import sys
import subprocess
import tempfile
import logging
import shutil
from pathlib import Path

log = logging.getLogger(__name__)

VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm", ".wmv", ".flv", ".m4v"}


def _get_ffmpeg_binary(name="ffmpeg"):
    """
    Resolve path to an ffmpeg-family binary (ffmpeg, ffprobe).
    Search order:
      1. CLEANSWEEP_FFMPEG_PATH env var (set by Electron to the bundled binary)
      2. electron/resources/ relative to this file (dev mode)
      3. System PATH fallback
    """
    ext = ".exe" if os.name == "nt" else ""

    # 1. Env var points to bundled ffmpeg.exe — look for sibling binaries there too
    env_path = os.environ.get("CLEANSWEEP_FFMPEG_PATH", "")
    if env_path and os.path.isfile(env_path):
        sibling = os.path.join(os.path.dirname(env_path), name + ext)
        if os.path.isfile(sibling):
            return sibling

    # 2. Dev mode: resources/ at project root relative to this backend file
    dev_resources = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "resources",
    )
    candidate = os.path.join(dev_resources, name + ext)
    if os.path.isfile(candidate):
        return candidate

    # 3. System PATH
    return name


def check_ffmpeg():
    """Check if ffmpeg is available (bundled or system). Returns True/False."""
    try:
        result = subprocess.run(
            [_get_ffmpeg_binary("ffmpeg"), "-version"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=5,
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return False


def get_video_duration(path):
    """
    Get video duration in seconds using ffprobe.
    Returns float seconds, or 0.0 on failure.
    """
    try:
        result = subprocess.run(
            [
                _get_ffmpeg_binary("ffprobe"),
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                path,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=15,
        )
        if result.returncode == 0:
            output = result.stdout.decode().strip()
            if output and output != "N/A":
                return float(output)
    except Exception as e:
        log.warning(f"ffprobe failed for {path}: {e}")
    return 0.0


def get_frame_timestamp(frame_index, interval):
    """Convert a frame index and sampling interval to a human-readable timestamp string."""
    total_seconds = int(frame_index * interval)
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60
    if hours > 0:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes}:{seconds:02d}"


def extract_frames(path, interval=10, max_frames=100, temp_dir=None):
    """
    Extract frames from a video file at the given interval (seconds).
    Returns list of dicts: [{frame_path, timestamp_str, frame_index}]
    Extracts to temp_dir (created if not provided).
    """
    if temp_dir is None:
        temp_dir = tempfile.mkdtemp(prefix="cleansweep_frames_")

    duration = get_video_duration(path)
    fps = 1.0 / interval if interval > 0 else 0.1

    # Cap frames
    if duration > 0:
        estimated_frames = int(duration / interval) + 1
        if estimated_frames > max_frames:
            fps = max_frames / duration if duration > 0 else 0.1

    output_pattern = os.path.join(temp_dir, "frame_%04d.jpg")

    try:
        result = subprocess.run(
            [
                _get_ffmpeg_binary("ffmpeg"),
                "-i", path,
                "-vf", f"fps={fps:.6f}",
                "-q:v", "2",
                "-frames:v", str(max_frames),
                output_pattern,
                "-y",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        log.warning(f"ffmpeg timed out extracting frames from {path}")
        return []
    except Exception as e:
        log.warning(f"ffmpeg failed for {path}: {e}")
        return []

    frames = []
    frame_files = sorted(Path(temp_dir).glob("frame_*.jpg"))
    for i, frame_path in enumerate(frame_files):
        if i >= max_frames:
            break
        frames.append({
            "frame_path": str(frame_path),
            "timestamp_str": get_frame_timestamp(i, interval),
            "frame_index": i,
        })

    return frames


def cleanup_temp_frames(temp_dir):
    """Remove the temporary directory and all frame files."""
    try:
        if temp_dir and os.path.isdir(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
    except Exception as e:
        log.warning(f"Failed to cleanup temp dir {temp_dir}: {e}")


def scan_video(path, classifier, threshold, stop_flag=None, progress_callback=None):
    """
    Scan a single video file.
    Returns a result dict if flagged, or None if below threshold.
    progress_callback(frame_num, total_frames) for progress reporting.
    """
    temp_dir = tempfile.mkdtemp(prefix="cleansweep_frames_")
    try:
        frames = extract_frames(path, interval=10, max_frames=100, temp_dir=temp_dir)
        if not frames:
            return None

        total_frames = len(frames)
        frame_scores = []
        highest_score = 0.0
        highest_frame_idx = 0
        highest_frame_path = frames[0]["frame_path"] if frames else None

        for i, frame_info in enumerate(frames):
            if stop_flag and stop_flag():
                break

            if progress_callback:
                progress_callback(i + 1, total_frames)

            frame_path = frame_info["frame_path"]
            img = None
            try:
                from PIL import Image
                img = Image.open(frame_path).convert("RGB")
                img.info.pop('icc_profile', None)
                results = classifier(img)
                # Get NSFW score
                score = 0.0
                for r in results:
                    label = r.get("label", "").lower()
                    if "nsfw" in label or "explicit" in label or "porn" in label or "sexy" in label or "hentai" in label:
                        score = max(score, r.get("score", 0.0))
                    elif label == "sfw":
                        score = max(score, 1.0 - r.get("score", 1.0))

                frame_scores.append({
                    "timestamp": frame_info["timestamp_str"],
                    "score": score,
                })

                if score > highest_score:
                    highest_score = score
                    highest_frame_idx = len(frame_scores) - 1  # index into frame_scores
                    highest_frame_path = frame_path

            except Exception as e:
                log.warning(f"Failed to classify frame {frame_path}: {e}")
                continue
            finally:
                if img is not None:
                    try:
                        img.close()
                    except Exception:
                        pass
                    del img

        if highest_score < threshold:
            return None

        # Get thumbnail from the highest-scoring frame
        thumbnail_b64 = None
        if highest_frame_path:
            thumb_img = None
            try:
                from PIL import Image
                import io
                import base64
                thumb_img = Image.open(highest_frame_path).convert("RGB")
                thumb_img.info.pop('icc_profile', None)
                thumb_img.thumbnail((300, 300))
                buf = io.BytesIO()
                thumb_img.save(buf, format="JPEG", quality=85)
                thumbnail_b64 = base64.b64encode(buf.getvalue()).decode()
            except Exception as e:
                log.warning(f"Failed to generate thumbnail for video {path}: {e}")
            finally:
                if thumb_img is not None:
                    try:
                        thumb_img.close()
                    except Exception:
                        pass

        # Top 3 frames for filmstrip
        top_frames = sorted(frame_scores, key=lambda x: x["score"], reverse=True)[:3]

        return {
            "path": path,
            "filename": os.path.basename(path),
            "type": "video",
            "score": highest_score,
            "flagged_frame_timestamp": frame_scores[highest_frame_idx]["timestamp"] if frame_scores else "0:00",
            "frame_scores": frame_scores,
            "top_frames": top_frames,
            "thumbnail_b64": thumbnail_b64,
        }

    finally:
        cleanup_temp_frames(temp_dir)

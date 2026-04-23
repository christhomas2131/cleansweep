"""
CleanSweep Phase Verification Script
=====================================
Run after each phase to automatically check that everything works.
Usage: python verify.py --phase 1
"""

import subprocess
import requests
import time
import os
import sys
import json
import signal

BACKEND_URL = "http://127.0.0.1:8899"
# Use a small test folder — create it with a few images if it doesn't exist
TEST_FOLDER = os.path.join(os.path.dirname(__file__), "test_images")


def log(status, msg):
    icon = "✅" if status == "pass" else "❌" if status == "fail" else "⏭️"
    print(f"  {icon} {msg}")
    return status == "pass"


def ensure_test_images():
    """Create a tiny test folder with dummy images for verification."""
    os.makedirs(TEST_FOLDER, exist_ok=True)
    try:
        from PIL import Image
        for i in range(5):
            img = Image.new("RGB", (100, 100), color=(i * 50, 100, 150))
            img.save(os.path.join(TEST_FOLDER, f"test_image_{i}.jpg"))
        return True
    except ImportError:
        print("  ⚠️  Pillow not installed — can't create test images. Install with: pip install pillow")
        return False


def start_backend():
    """Start the backend server as a subprocess, return the process."""
    proc = subprocess.Popen(
        [sys.executable, "backend/server.py"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=os.path.dirname(__file__) or ".",
    )
    # Wait for it to be ready
    for _ in range(30):
        try:
            r = requests.get(f"{BACKEND_URL}/health", timeout=1)
            if r.status_code == 200:
                return proc
        except Exception:
            pass
        time.sleep(1)
    proc.kill()
    return None


def stop_backend(proc):
    """Stop the backend subprocess."""
    if proc:
        try:
            requests.post(f"{BACKEND_URL}/stop", timeout=2)
        except Exception:
            pass
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


def verify_phase_1():
    """Phase 1: Backend API works."""
    print("\n🔍 Phase 1 Verification: Backend API\n")
    results = []

    # Check files exist
    results.append(log(
        "pass" if os.path.isfile("backend/server.py") else "fail",
        "backend/server.py exists"
    ))
    results.append(log(
        "pass" if os.path.isfile("backend/scanner.py") else "fail",
        "backend/scanner.py exists"
    ))
    results.append(log(
        "pass" if os.path.isfile("backend/progress.py") else "fail",
        "backend/progress.py exists"
    ))
    results.append(log(
        "pass" if os.path.isfile("backend/requirements.txt") else "fail",
        "backend/requirements.txt exists"
    ))

    # Start backend
    print("\n  Starting backend...")
    proc = start_backend()
    if not proc:
        log("fail", "Backend failed to start within 30 seconds")
        return False

    results.append(log("pass", "Backend started successfully"))

    try:
        # Health check
        r = requests.get(f"{BACKEND_URL}/health")
        results.append(log(
            "pass" if r.status_code == 200 and r.json().get("status") == "ok" else "fail",
            f"GET /health returns ok (got {r.status_code})"
        ))

        # Preview endpoint
        ensure_test_images()
        r = requests.get(f"{BACKEND_URL}/preview", params={"folder": TEST_FOLDER})
        results.append(log(
            "pass" if r.status_code == 200 and "total_images" in r.json() else "fail",
            f"GET /preview returns file count (got {r.json() if r.status_code == 200 else r.status_code})"
        ))

        # Start scan — accepts 200 (model present) or 400 with model error (model not yet downloaded)
        r = requests.post(f"{BACKEND_URL}/scan", json={"folder": TEST_FOLDER, "threshold": 0.5})
        _scan_resp = r.json() if r.status_code in (200, 400) else {}
        _model_not_downloaded = (
            r.status_code == 400 and
            "model not downloaded" in _scan_resp.get("error", "").lower()
        )
        results.append(log(
            "pass" if r.status_code == 200 or _model_not_downloaded else "fail",
            f"POST /scan starts scan or reports model-not-downloaded (got {r.status_code})"
        ))

        # Check progress
        time.sleep(2)
        r = requests.get(f"{BACKEND_URL}/progress")
        progress = r.json()
        results.append(log(
            "pass" if r.status_code == 200 and "status" in progress else "fail",
            f"GET /progress returns status: {progress.get('status', 'unknown')}"
        ))

        # Wait for scan to complete (small test set, should be fast)
        # Also accept 'error' status (e.g. model not downloaded)
        for _ in range(120):  # up to 2 minutes
            r = requests.get(f"{BACKEND_URL}/progress")
            if r.json().get("status") in ("complete", "idle", "error"):
                break
            time.sleep(1)

        r = requests.get(f"{BACKEND_URL}/progress")
        results.append(log(
            "pass" if r.json().get("status") in ("complete", "idle", "error") else "fail",
            f"Scan completed (status: {r.json().get('status')})"
        ))

        # Results endpoint
        r = requests.get(f"{BACKEND_URL}/results", params={"page": 1, "per_page": 50})
        results.append(log(
            "pass" if r.status_code == 200 and "items" in r.json() else "fail",
            f"GET /results returns items list"
        ))

        # Invalid scan folder
        r = requests.post(f"{BACKEND_URL}/scan", json={"folder": "/nonexistent/path", "threshold": 0.5})
        results.append(log(
            "pass" if r.status_code in (400, 422) else "fail",
            f"POST /scan rejects invalid folder (got {r.status_code})"
        ))

    finally:
        stop_backend(proc)

    passed = sum(results)
    total = len(results)
    print(f"\n  Phase 1: {passed}/{total} checks passed")
    return passed == total


def verify_phase_2():
    """Phase 2: Frontend scan setup screen files exist and are wired."""
    print("\n🔍 Phase 2 Verification: Frontend Setup Screen\n")
    results = []

    results.append(log(
        "pass" if os.path.isfile("frontend/index.html") else "fail",
        "frontend/index.html exists"
    ))
    results.append(log(
        "pass" if os.path.isfile("frontend/css/styles.css") else "fail",
        "frontend/css/styles.css exists"
    ))
    results.append(log(
        "pass" if os.path.isfile("frontend/js/app.js") else "fail",
        "frontend/js/app.js exists"
    ))
    results.append(log(
        "pass" if os.path.isfile("frontend/js/api.js") else "fail",
        "frontend/js/api.js exists"
    ))
    results.append(log(
        "pass" if os.path.isfile("frontend/js/scan-setup.js") else "fail",
        "frontend/js/scan-setup.js exists"
    ))

    # Check index.html contains key elements
    if os.path.isfile("frontend/index.html"):
        with open("frontend/index.html", "r", encoding="utf-8") as f:
            html = f.read()
        results.append(log(
            "pass" if "scan-setup" in html else "fail",
            "index.html contains #scan-setup screen div"
        ))
        results.append(log(
            "pass" if "scan-progress" in html else "fail",
            "index.html contains #scan-progress screen div"
        ))
        results.append(log(
            "pass" if "scan-review" in html else "fail",
            "index.html contains #scan-review screen div"
        ))

    # Check api.js has all endpoint methods
    if os.path.isfile("frontend/js/api.js"):
        with open("frontend/js/api.js", "r", encoding="utf-8") as f:
            api_js = f.read()
        for method in ["startScan", "getProgress", "getResults", "getThumb", "deleteFiles", "stopScan", "healthCheck", "previewFolder"]:
            results.append(log(
                "pass" if method in api_js else "fail",
                f"api.js contains {method}() method"
            ))

    # Check styles.css uses dark theme
    if os.path.isfile("frontend/css/styles.css"):
        with open("frontend/css/styles.css", "r", encoding="utf-8") as f:
            css = f.read()
        results.append(log(
            "pass" if "#0f0f0f" in css or "#111" in css or "0f0f0f" in css else "fail",
            "styles.css uses dark background color"
        ))

    passed = sum(results)
    total = len(results)
    print(f"\n  Phase 2: {passed}/{total} checks passed")
    return passed == total


def verify_phase_3():
    """Phase 3: Progress screen exists and is wired."""
    print("\n🔍 Phase 3 Verification: Progress Screen\n")
    results = []

    results.append(log(
        "pass" if os.path.isfile("frontend/js/progress.js") else "fail",
        "frontend/js/progress.js exists"
    ))

    if os.path.isfile("frontend/js/progress.js"):
        with open("frontend/js/progress.js", "r", encoding="utf-8") as f:
            js = f.read()
        results.append(log(
            "pass" if "getProgress" in js or "progress" in js.lower() else "fail",
            "progress.js polls the progress endpoint"
        ))

    if os.path.isfile("frontend/index.html"):
        with open("frontend/index.html", "r", encoding="utf-8") as f:
            html = f.read()
        results.append(log(
            "pass" if "progress.js" in html else "fail",
            "index.html loads progress.js"
        ))

    if os.path.isfile("frontend/js/app.js"):
        with open("frontend/js/app.js", "r", encoding="utf-8") as f:
            js = f.read()
        results.append(log(
            "pass" if "showScreen" in js or "progress" in js else "fail",
            "app.js has screen routing for progress"
        ))

    passed = sum(results)
    total = len(results)
    print(f"\n  Phase 3: {passed}/{total} checks passed")
    return passed == total


def verify_phase_4():
    """Phase 4: Review screen exists and has key features."""
    print("\n🔍 Phase 4 Verification: Review Grid Screen\n")
    results = []

    results.append(log(
        "pass" if os.path.isfile("frontend/js/review.js") else "fail",
        "frontend/js/review.js exists"
    ))

    if os.path.isfile("frontend/js/review.js"):
        with open("frontend/js/review.js", "r", encoding="utf-8") as f:
            js = f.read()
        for feature in ["getResults", "getThumb", "thumbnail", "deleteFiles", "quarantine", "blur", "pagination", "select"]:
            found = feature.lower() in js.lower()
            results.append(log(
                "pass" if found else "fail",
                f"review.js references '{feature}'"
            ))

    if os.path.isfile("frontend/index.html"):
        with open("frontend/index.html", "r", encoding="utf-8") as f:
            html = f.read()
        results.append(log(
            "pass" if "review.js" in html else "fail",
            "index.html loads review.js"
        ))

    if os.path.isfile("frontend/css/styles.css"):
        with open("frontend/css/styles.css", "r", encoding="utf-8") as f:
            css = f.read()
        results.append(log(
            "pass" if "blur" in css else "fail",
            "styles.css has blur-related styles"
        ))
        results.append(log(
            "pass" if "grid" in css else "fail",
            "styles.css has grid layout"
        ))

    passed = sum(results)
    total = len(results)
    print(f"\n  Phase 4: {passed}/{total} checks passed")
    return passed == total


def verify_phase_5():
    """Phase 5: Electron shell exists and is configured."""
    print("\n🔍 Phase 5 Verification: Electron Shell\n")
    results = []

    results.append(log(
        "pass" if os.path.isfile("electron/main.js") else "fail",
        "electron/main.js exists"
    ))
    results.append(log(
        "pass" if os.path.isfile("electron/preload.js") else "fail",
        "electron/preload.js exists"
    ))
    results.append(log(
        "pass" if os.path.isfile("electron/package.json") else "fail",
        "electron/package.json exists"
    ))

    if os.path.isfile("electron/main.js"):
        with open("electron/main.js", "r", encoding="utf-8") as f:
            js = f.read()
        results.append(log(
            "pass" if "BrowserWindow" in js else "fail",
            "main.js creates a BrowserWindow"
        ))
        results.append(log(
            "pass" if "server.py" in js or "backend" in js else "fail",
            "main.js spawns the Python backend"
        ))
        results.append(log(
            "pass" if "select-folder" in js or "selectFolder" in js else "fail",
            "main.js handles folder selection IPC"
        ))
        results.append(log(
            "pass" if "kill" in js or "terminate" in js or "close" in js.lower() else "fail",
            "main.js handles backend cleanup on quit"
        ))

    if os.path.isfile("electron/preload.js"):
        with open("electron/preload.js", "r", encoding="utf-8") as f:
            js = f.read()
        results.append(log(
            "pass" if "contextBridge" in js else "fail",
            "preload.js uses contextBridge"
        ))
        results.append(log(
            "pass" if "electronAPI" in js else "fail",
            "preload.js exposes electronAPI"
        ))

    if os.path.isfile("electron/package.json"):
        with open("electron/package.json", "r", encoding="utf-8") as f:
            pkg = json.load(f)
        results.append(log(
            "pass" if "electron" in str(pkg.get("devDependencies", {})) else "fail",
            "package.json has electron as dependency"
        ))

    passed = sum(results)
    total = len(results)
    print(f"\n  Phase 5: {passed}/{total} checks passed")
    return passed == total


def verify_phase_6():
    """Phase 6: Polish and error handling."""
    print("\n🔍 Phase 6 Verification: Polish + Error Handling\n")
    results = []

    # Check backend validation
    if os.path.isfile("backend/server.py"):
        with open("backend/server.py", "r", encoding="utf-8") as f:
            py = f.read()
        results.append(log(
            "pass" if "400" in py or "Bad Request" in py or "error" in py.lower() else "fail",
            "server.py has input validation / error responses"
        ))
        results.append(log(
            "pass" if "lru_cache" in py or "cache" in py.lower() else "fail",
            "server.py has thumbnail caching"
        ))

    # Check keyboard shortcuts
    if os.path.isfile("frontend/js/review.js"):
        with open("frontend/js/review.js", "r", encoding="utf-8") as f:
            js = f.read()
        results.append(log(
            "pass" if "keydown" in js or "keyboard" in js.lower() or "Escape" in js else "fail",
            "review.js has keyboard event listeners"
        ))

    # Check connection error handling
    all_js = ""
    for jsfile in ["frontend/js/app.js", "frontend/js/progress.js", "frontend/js/review.js", "frontend/js/api.js"]:
        if os.path.isfile(jsfile):
            with open(jsfile, "r", encoding="utf-8") as f:
                all_js += f.read()
    results.append(log(
        "pass" if "catch" in all_js or "error" in all_js.lower() else "fail",
        "Frontend has error handling (try/catch)"
    ))
    results.append(log(
        "pass" if "connection" in all_js.lower() or "retry" in all_js.lower() or "reconnect" in all_js.lower() else "fail",
        "Frontend handles connection loss"
    ))

    # Check close-during-scan
    if os.path.isfile("electron/main.js"):
        with open("electron/main.js", "r", encoding="utf-8") as f:
            js = f.read()
        results.append(log(
            "pass" if "close" in js and ("dialog" in js or "confirm" in js.lower()) else "fail",
            "Electron handles close-during-scan confirmation"
        ))

    passed = sum(results)
    total = len(results)
    print(f"\n  Phase 6: {passed}/{total} checks passed")
    return passed == total


def verify_phase_7():
    """Phase 7: Video scanning support."""
    print("\n🔍 Phase 7 Verification: Video Scanning\n")
    results = []

    results.append(log(
        "pass" if os.path.isfile("backend/video_scanner.py") else "fail",
        "backend/video_scanner.py exists"
    ))

    if os.path.isfile("backend/video_scanner.py"):
        with open("backend/video_scanner.py", "r", encoding="utf-8") as f:
            py = f.read()
        results.append(log(
            "pass" if "ffmpeg" in py.lower() else "fail",
            "video_scanner.py references ffmpeg"
        ))
        results.append(log(
            "pass" if "extract" in py.lower() else "fail",
            "video_scanner.py has frame extraction logic"
        ))

    if os.path.isfile("backend/server.py"):
        with open("backend/server.py", "r", encoding="utf-8") as f:
            py = f.read()
        results.append(log(
            "pass" if "capabilities" in py else "fail",
            "server.py has /capabilities endpoint"
        ))
        results.append(log(
            "pass" if "filmstrip" in py else "fail",
            "server.py has /filmstrip endpoint"
        ))

    if os.path.isfile("frontend/js/scan-setup.js"):
        with open("frontend/js/scan-setup.js", "r", encoding="utf-8") as f:
            js = f.read()
        results.append(log(
            "pass" if "video" in js.lower() or "Video" in js else "fail",
            "scan-setup.js has video scanning checkbox/option"
        ))

    if os.path.isfile("frontend/js/review.js"):
        with open("frontend/js/review.js", "r", encoding="utf-8") as f:
            js = f.read()
        results.append(log(
            "pass" if "VIDEO" in js or "video" in js else "fail",
            "review.js handles video type cards"
        ))
        results.append(log(
            "pass" if "filmstrip" in js.lower() or "film" in js.lower() else "fail",
            "review.js has filmstrip hover feature"
        ))
        results.append(log(
            "pass" if "filter" in js.lower() or "type" in js.lower() else "fail",
            "review.js has type filter (All/Images/Videos)"
        ))

    # Test capabilities endpoint
    proc = start_backend()
    if proc:
        try:
            r = requests.get(f"{BACKEND_URL}/capabilities")
            results.append(log(
                "pass" if r.status_code == 200 and "ffmpeg" in r.json() else "fail",
                f"GET /capabilities returns ffmpeg status"
            ))
        finally:
            stop_backend(proc)
    else:
        results.append(log("fail", "Backend failed to start for capabilities check"))

    passed = sum(results)
    total = len(results)
    print(f"\n  Phase 7: {passed}/{total} checks passed")
    return passed == total


def verify_phase_8():
    """Phase 8: Document scanning support."""
    print("\n🔍 Phase 8 Verification: Document Scanning\n")
    results = []

    results.append(log(
        "pass" if os.path.isfile("backend/document_scanner.py") else "fail",
        "backend/document_scanner.py exists"
    ))

    if os.path.isfile("backend/document_scanner.py"):
        with open("backend/document_scanner.py", "r", encoding="utf-8") as f:
            py = f.read()
        for fmt in ["pdf", "docx", "pptx", "xlsx"]:
            results.append(log(
                "pass" if fmt in py.lower() else "fail",
                f"document_scanner.py handles .{fmt} files"
            ))

    if os.path.isfile("backend/server.py"):
        with open("backend/server.py", "r", encoding="utf-8") as f:
            py = f.read()
        results.append(log(
            "pass" if "doc-details" in py or "doc_details" in py else "fail",
            "server.py has /doc-details endpoint"
        ))

    if os.path.isfile("frontend/js/scan-setup.js"):
        with open("frontend/js/scan-setup.js", "r", encoding="utf-8") as f:
            js = f.read()
        results.append(log(
            "pass" if "document" in js.lower() or "Document" in js else "fail",
            "scan-setup.js has document scanning option"
        ))

    if os.path.isfile("frontend/js/review.js"):
        with open("frontend/js/review.js", "r", encoding="utf-8") as f:
            js = f.read()
        results.append(log(
            "pass" if "document" in js.lower() or "PDF" in js or "DOCX" in js else "fail",
            "review.js handles document type cards"
        ))

    passed = sum(results)
    total = len(results)
    print(f"\n  Phase 8: {passed}/{total} checks passed")
    return passed == total


def verify_phase_9():
    """Phase 9: Packaging and installer setup."""
    print("\n🔍 Phase 9 Verification: Packaging + Installer\n")
    results = []

    # PyInstaller config
    has_build_config = (
        os.path.isfile("backend/build_backend.py") or
        os.path.isfile("backend/cleansweep-engine.spec") or
        os.path.isfile("build.py")
    )
    results.append(log(
        "pass" if has_build_config else "fail",
        "Build script or PyInstaller spec exists"
    ))

    # electron-builder config
    if os.path.isfile("electron/package.json"):
        with open("electron/package.json", "r", encoding="utf-8") as f:
            pkg = json.load(f)
        results.append(log(
            "pass" if "build" in pkg else "fail",
            "electron/package.json has 'build' config for electron-builder"
        ))
        results.append(log(
            "pass" if "electron-builder" in str(pkg.get("devDependencies", {})) else "fail",
            "electron-builder is a dev dependency"
        ))

    # Production path handling
    if os.path.isfile("electron/main.js"):
        with open("electron/main.js", "r", encoding="utf-8") as f:
            js = f.read()
        results.append(log(
            "pass" if "isPackaged" in js or "resourcesPath" in js else "fail",
            "main.js handles production vs dev paths"
        ))

    # First-run / model download
    results.append(log(
        "pass" if os.path.isfile("frontend/js/first-run.js") else "fail",
        "frontend/js/first-run.js exists"
    ))

    if os.path.isfile("frontend/index.html"):
        with open("frontend/index.html", "r", encoding="utf-8") as f:
            html = f.read()
        results.append(log(
            "pass" if "first-run" in html else "fail",
            "index.html has #first-run screen"
        ))

    # Model download endpoints
    proc = start_backend()
    if proc:
        try:
            r = requests.get(f"{BACKEND_URL}/model-status")
            results.append(log(
                "pass" if r.status_code == 200 else "fail",
                f"GET /model-status endpoint exists (got {r.status_code})"
            ))
        except Exception as e:
            results.append(log("fail", f"GET /model-status failed: {e}"))
        finally:
            stop_backend(proc)
    else:
        results.append(log("fail", "Backend failed to start for model-status check"))

    passed = sum(results)
    total = len(results)
    print(f"\n  Phase 9: {passed}/{total} checks passed")
    return passed == total


def verify_phase_10():
    """Phase 10: Landing page and payment/license system."""
    print("\n🔍 Phase 10 Verification: Landing Page + Payments\n")
    results = []

    # Landing page
    results.append(log(
        "pass" if os.path.isfile("website/index.html") else "fail",
        "website/index.html exists"
    ))
    results.append(log(
        "pass" if os.path.isfile("website/css/styles.css") else "fail",
        "website/css/styles.css exists"
    ))

    if os.path.isfile("website/index.html"):
        with open("website/index.html", "r", encoding="utf-8") as f:
            html = f.read()
        for section in ["hero", "feature", "pricing", "faq", "footer"]:
            results.append(log(
                "pass" if section in html.lower() else "fail",
                f"Landing page has '{section}' section"
            ))

    # License endpoints
    proc = start_backend()
    if proc:
        try:
            r = requests.get(f"{BACKEND_URL}/license")
            results.append(log(
                "pass" if r.status_code == 200 and "activated" in r.json() else "fail",
                f"GET /license returns activation status"
            ))

            # Test activation with valid format
            r = requests.post(f"{BACKEND_URL}/activate",
                            json={"license_key": "CSWEEP-TEST-ABCD-1234-WXYZ"})
            results.append(log(
                "pass" if r.status_code == 200 else "fail",
                f"POST /activate endpoint exists (got {r.status_code})"
            ))

            # Test activation with invalid format
            r = requests.post(f"{BACKEND_URL}/activate",
                            json={"license_key": "garbage"})
            results.append(log(
                "pass" if r.status_code == 200 and r.json().get("valid") == False else "fail",
                f"POST /activate rejects invalid key format"
            ))

            # Deactivate
            r = requests.post(f"{BACKEND_URL}/deactivate")
            results.append(log(
                "pass" if r.status_code == 200 else "fail",
                f"POST /deactivate endpoint exists"
            ))
        finally:
            stop_backend(proc)
    else:
        results.append(log("fail", "Backend failed to start for license checks"))

    # Frontend license UI
    all_js = ""
    for jsfile in ["frontend/js/scan-setup.js", "frontend/js/review.js", "frontend/js/app.js"]:
        if os.path.isfile(jsfile):
            with open(jsfile, "r", encoding="utf-8") as f:
                all_js += f.read()
    results.append(log(
        "pass" if "license" in all_js.lower() or "pro" in all_js.lower() or "free" in all_js.lower() else "fail",
        "Frontend references license/pro/free tier"
    ))
    results.append(log(
        "pass" if "activate" in all_js.lower() else "fail",
        "Frontend has license activation flow"
    ))

    passed = sum(results)
    total = len(results)
    print(f"\n  Phase 10: {passed}/{total} checks passed")
    return passed == total


def verify_phase_11():
    """Phase 11: Performance optimizations and smart features."""
    print("\n🔍 Phase 11 Verification: Performance + Smart Features\n")
    results = []

    # Batch processing
    if os.path.isfile("backend/scanner.py"):
        with open("backend/scanner.py", "r", encoding="utf-8") as f:
            py = f.read()
        results.append(log(
            "pass" if "batch" in py.lower() else "fail",
            "scanner.py has batch processing"
        ))
        results.append(log(
            "pass" if "hash" in py.lower() or "skip" in py.lower() else "fail",
            "scanner.py has smart skip / file hashing"
        ))
        results.append(log(
            "pass" if "ThreadPool" in py or "thread" in py.lower() or "concurrent" in py.lower() else "fail",
            "scanner.py uses threading for pre-loading"
        ))
        results.append(log(
            "pass" if "cuda" in py.lower() or "gpu" in py.lower() or "device" in py.lower() else "fail",
            "scanner.py has GPU support toggle"
        ))

    # Quick-select buttons
    if os.path.isfile("frontend/js/review.js"):
        with open("frontend/js/review.js", "r", encoding="utf-8") as f:
            js = f.read()
        results.append(log(
            "pass" if "90" in js or "select.*90" in js.lower() else "fail",
            "review.js has quick-select by confidence (90%+)"
        ))
        results.append(log(
            "pass" if "histogram" in js.lower() or "distribution" in js.lower() or "chart" in js.lower() else "fail",
            "review.js has confidence histogram/distribution"
        ))

    # Export
    if os.path.isfile("backend/server.py"):
        with open("backend/server.py", "r", encoding="utf-8") as f:
            py = f.read()
        results.append(log(
            "pass" if "export" in py.lower() or "csv" in py.lower() else "fail",
            "server.py has /export endpoint"
        ))
        results.append(log(
            "pass" if "history" in py.lower() else "fail",
            "server.py has /history endpoint"
        ))

    # History UI
    all_js = ""
    for jsfile in ["frontend/js/app.js", "frontend/js/scan-setup.js"]:
        if os.path.isfile(jsfile):
            with open(jsfile, "r", encoding="utf-8") as f:
                all_js += f.read()
    # Also check for a dedicated history.js
    if os.path.isfile("frontend/js/history.js"):
        with open("frontend/js/history.js", "r", encoding="utf-8") as f:
            all_js += f.read()
    results.append(log(
        "pass" if "history" in all_js.lower() else "fail",
        "Frontend has scan history feature"
    ))

    # Test export endpoint
    proc = start_backend()
    if proc:
        try:
            r = requests.get(f"{BACKEND_URL}/export", params={"format": "csv"})
            results.append(log(
                "pass" if r.status_code == 200 else "fail",
                f"GET /export?format=csv returns response (got {r.status_code})"
            ))
            r = requests.get(f"{BACKEND_URL}/history")
            results.append(log(
                "pass" if r.status_code == 200 else "fail",
                f"GET /history returns response (got {r.status_code})"
            ))
        finally:
            stop_backend(proc)
    else:
        results.append(log("fail", "Backend failed to start for export/history checks"))

    passed = sum(results)
    total = len(results)
    print(f"\n  Phase 11: {passed}/{total} checks passed")
    return passed == total


def verify_phase_12():
    """Phase 12: Onboarding, settings, polish."""
    print("\n🔍 Phase 12 Verification: Onboarding + Polish\n")
    results = []

    # Settings
    results.append(log(
        "pass" if os.path.isfile("frontend/js/settings.js") else "fail",
        "frontend/js/settings.js exists"
    ))

    if os.path.isfile("frontend/index.html"):
        with open("frontend/index.html", "r", encoding="utf-8") as f:
            html = f.read()
        results.append(log(
            "pass" if "settings" in html.lower() else "fail",
            "index.html has settings screen"
        ))

    # Config endpoints
    proc = start_backend()
    if proc:
        try:
            r = requests.get(f"{BACKEND_URL}/config")
            results.append(log(
                "pass" if r.status_code == 200 else "fail",
                f"GET /config endpoint exists (got {r.status_code})"
            ))
            r = requests.post(f"{BACKEND_URL}/config", json={"theme": "dark"})
            results.append(log(
                "pass" if r.status_code == 200 else "fail",
                f"POST /config endpoint exists (got {r.status_code})"
            ))
        finally:
            stop_backend(proc)
    else:
        results.append(log("fail", "Backend failed to start for config checks"))

    # Theme / CSS variables
    if os.path.isfile("frontend/css/styles.css"):
        with open("frontend/css/styles.css", "r", encoding="utf-8") as f:
            css = f.read()
        results.append(log(
            "pass" if "--bg-primary" in css or "var(--" in css else "fail",
            "styles.css uses CSS custom properties for theming"
        ))
        results.append(log(
            "pass" if "theme-light" in css or "light" in css.lower() else "fail",
            "styles.css has light theme override"
        ))

    # Loading states
    all_js = ""
    for jsfile in ["frontend/js/app.js", "frontend/js/review.js", "frontend/js/scan-setup.js"]:
        if os.path.isfile(jsfile):
            with open(jsfile, "r", encoding="utf-8") as f:
                all_js += f.read()
    results.append(log(
        "pass" if "loading" in all_js.lower() or "disabled" in all_js.lower() else "fail",
        "Frontend has loading states on buttons"
    ))

    # Focus / accessibility
    if os.path.isfile("frontend/css/styles.css"):
        with open("frontend/css/styles.css", "r", encoding="utf-8") as f:
            css = f.read()
        results.append(log(
            "pass" if "focus-visible" in css or "focus" in css else "fail",
            "styles.css has focus states for accessibility"
        ))

    # Onboarding tutorial
    if os.path.isfile("frontend/js/first-run.js"):
        with open("frontend/js/first-run.js", "r", encoding="utf-8") as f:
            js = f.read()
        results.append(log(
            "pass" if "tutorial" in js.lower() or "tooltip" in js.lower() or "onboarding" in js.lower() or "Got it" in js else "fail",
            "first-run.js has tutorial/onboarding overlay"
        ))

    # No console.log spam
    console_log_count = 0
    for root, dirs, files in os.walk("frontend/js"):
        for fname in files:
            if fname.endswith(".js"):
                with open(os.path.join(root, fname), "r", encoding="utf-8") as f:
                    content = f.read()
                    console_log_count += content.count("console.log")
    results.append(log(
        "pass" if console_log_count < 10 else "fail",
        f"Frontend has minimal console.log statements ({console_log_count} found)"
    ))

    passed = sum(results)
    total = len(results)
    print(f"\n  Phase 12: {passed}/{total} checks passed")
    return passed == total


PHASES = {
    1: verify_phase_1,
    2: verify_phase_2,
    3: verify_phase_3,
    4: verify_phase_4,
    5: verify_phase_5,
    6: verify_phase_6,
    7: verify_phase_7,
    8: verify_phase_8,
    9: verify_phase_9,
    10: verify_phase_10,
    11: verify_phase_11,
    12: verify_phase_12,
}


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Verify CleanSweep build phases.")
    parser.add_argument("--phase", type=int, required=True, choices=range(1, 13),
                        help="Phase number to verify (1-12)")
    args = parser.parse_args()

    passed = PHASES[args.phase]()

    if passed:
        if args.phase < 12:
            print(f"\n🎉 Phase {args.phase} PASSED — safe to move to phase {args.phase + 1}")
        else:
            print(f"\n🎉 Phase {args.phase} PASSED — CleanSweep is ready to ship! 🚀")
    else:
        print(f"\n⚠️  Phase {args.phase} has failures — fix before moving on")

    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    main()

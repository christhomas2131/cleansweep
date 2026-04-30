"""
CleanSweep — Backend Build Script (PyInstaller)
================================================
Compiles backend/server.py into a standalone executable for distribution.

Usage (from project root, using the venv interpreter):
    backend/.venv/bin/python backend/build_backend.py

Output: build/backend-dist/cleansweep-engine/
"""

import os
import sys
import platform
import subprocess

IS_MAC = platform.system() == "Darwin"
IS_WIN = platform.system() == "Windows"

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "build", "backend-dist")


def main():
    server_py = os.path.join(BACKEND_DIR, "server.py")
    if not os.path.isfile(server_py):
        print(f"ERROR: {server_py} not found")
        sys.exit(1)

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--name", "cleansweep-engine",
        "--distpath", OUTPUT_DIR,
        "--workpath", os.path.join(PROJECT_ROOT, "build", "pyinstaller-work"),
        "--specpath", os.path.join(PROJECT_ROOT, "build"),
        # Flask
        "--hidden-import=flask",
        "--hidden-import=flask_cors",
        # Pillow
        "--hidden-import=PIL._tkinter_finder",
        # Transformers / ViT model
        "--hidden-import=transformers.models.vit",
        "--hidden-import=transformers.models.vit.modeling_vit",
        "--hidden-import=transformers.models.vit.feature_extraction_vit",
        "--hidden-import=transformers.image_processing_utils",
        "--hidden-import=transformers.pipelines.image_classification",
        "--collect-all=transformers",
        "--collect-all=tokenizers",
        # PyTorch — collect-all is the only reliable way to bundle it
        "--hidden-import=torch",
        "--collect-all=torch",
        # Watchdog — filesystem events
        "--hidden-import=watchdog.observers",
        "--hidden-import=watchdog.events",
        "--collect-all=watchdog",
        # ONNX (optional accelerator path in transformers)
        "--hidden-import=optimum.onnxruntime",
        "--hidden-import=onnxruntime",
        "--collect-all=onnxruntime",
        # Trim fat
        "--exclude-module=tkinter",
        "--exclude-module=matplotlib",
        "--exclude-module=scipy",
        "--exclude-module=IPython",
        "--exclude-module=jupyter",
        server_py,
    ]

    # --noconsole on Windows hides the console window; on macOS it would create a
    # .app bundle instead of a plain binary — so we only use it on Windows.
    if IS_WIN:
        cmd.insert(3, "--noconsole")

    # macOS: FSEvents-based filesystem observer
    if IS_MAC:
        cmd += ["--hidden-import=watchdog.observers.fsevents"]

    print(f"Running PyInstaller on {platform.system()}...")
    print(" ".join(cmd))
    result = subprocess.run(cmd, cwd=PROJECT_ROOT)

    if result.returncode == 0:
        exe_name = "cleansweep-engine.exe" if IS_WIN else "cleansweep-engine"
        exe_path = os.path.join(OUTPUT_DIR, "cleansweep-engine", exe_name)
        print(f"\nBuild successful!")
        print(f"Executable: {exe_path}")
    else:
        print(f"\nBuild FAILED with exit code {result.returncode}")
        sys.exit(result.returncode)


if __name__ == "__main__":
    main()

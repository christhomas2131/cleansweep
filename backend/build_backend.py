"""
CleanSweep — Backend Build Script (PyInstaller)
================================================
Compiles backend/server.py into a standalone executable for distribution.

Usage:
    pip install pyinstaller
    python backend/build_backend.py

Output: build/backend-dist/cleansweep-engine/
"""

import os
import sys
import subprocess

# Project root (parent of this script's directory)
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
        "--noconsole",
        "--distpath", OUTPUT_DIR,
        "--workpath", os.path.join(PROJECT_ROOT, "build", "pyinstaller-work"),
        "--specpath", os.path.join(PROJECT_ROOT, "build"),
        "--hidden-import=transformers.models.vit",
        "--hidden-import=transformers.models.vit.modeling_vit",
        "--hidden-import=flask",
        "--hidden-import=flask_cors",
        "--hidden-import=PIL._tkinter_finder",
        "--hidden-import=optimum.onnxruntime",
        "--hidden-import=optimum.onnxruntime.modeling_ort",
        "--hidden-import=optimum.exporters",
        "--hidden-import=optimum.exporters.onnx",
        "--hidden-import=onnxruntime",
        "--hidden-import=onnxruntime.capi",
        "--exclude-module=tkinter",
        "--collect-all=transformers",
        "--collect-all=optimum",
        "--collect-all=onnxruntime",
        server_py,
    ]

    print("Running PyInstaller...")
    print(" ".join(cmd))
    result = subprocess.run(cmd, cwd=PROJECT_ROOT)

    if result.returncode == 0:
        exe_path = os.path.join(OUTPUT_DIR, "cleansweep-engine", "cleansweep-engine.exe")
        print(f"\nBuild successful!")
        print(f"Executable: {exe_path}")
    else:
        print(f"\nBuild FAILED with exit code {result.returncode}")
        sys.exit(result.returncode)


if __name__ == "__main__":
    main()

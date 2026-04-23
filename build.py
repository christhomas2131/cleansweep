"""
CleanSweep — Master Build Script
==================================
Runs all build steps to produce a Windows installer.

Steps:
  1. Install backend Python dependencies
  2. Build backend exe with PyInstaller
  3. Install Electron npm dependencies
  4. Build Electron installer with electron-builder

Usage:
    pip install pyinstaller
    python build.py

Note: This script is designed to be run on a Windows machine with:
  - Python 3.9+
  - Node.js 18+
  - npm
"""

import os
import sys
import subprocess


PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))


def run(cmd, cwd=None, check=True):
    """Run a shell command and print output."""
    print(f"\n{'='*60}")
    print(f"Running: {' '.join(cmd) if isinstance(cmd, list) else cmd}")
    print(f"{'='*60}")
    result = subprocess.run(cmd, cwd=cwd or PROJECT_ROOT, shell=isinstance(cmd, str))
    if check and result.returncode != 0:
        print(f"ERROR: Command failed with exit code {result.returncode}")
        sys.exit(result.returncode)
    return result


def step1_install_backend():
    print("\n[Step 1] Installing backend Python dependencies...")
    req_file = os.path.join(PROJECT_ROOT, "backend", "requirements.txt")
    run([sys.executable, "-m", "pip", "install", "-r", req_file])
    run([sys.executable, "-m", "pip", "install", "pyinstaller"])


def step2_build_backend():
    print("\n[Step 2] Building backend executable with PyInstaller...")
    build_script = os.path.join(PROJECT_ROOT, "backend", "build_backend.py")
    run([sys.executable, build_script])


def step3_install_electron():
    print("\n[Step 3] Installing Electron npm dependencies...")
    electron_dir = os.path.join(PROJECT_ROOT, "electron")
    run(["npm", "install"], cwd=electron_dir)


def step4_build_installer():
    print("\n[Step 4] Building Electron installer...")
    electron_dir = os.path.join(PROJECT_ROOT, "electron")
    run(["npm", "run", "build"], cwd=electron_dir)

    installer_dir = os.path.join(PROJECT_ROOT, "build", "installer")
    if os.path.isdir(installer_dir):
        files = os.listdir(installer_dir)
        for f in files:
            print(f"  Output: {os.path.join(installer_dir, f)}")
    else:
        print("  Installer directory not found — check electron-builder output above.")


def main():
    print("CleanSweep Master Build Script")
    print(f"Project root: {PROJECT_ROOT}")

    step1_install_backend()
    step2_build_backend()
    step3_install_electron()
    step4_build_installer()

    print("\n" + "="*60)
    print("BUILD COMPLETE!")
    print(f"Installer: {os.path.join(PROJECT_ROOT, 'build', 'installer')}/")
    print("="*60)


if __name__ == "__main__":
    main()

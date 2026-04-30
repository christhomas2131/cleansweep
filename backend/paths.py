"""
Cross-platform path helpers for CleanSweep.
Centralizes the location of the per-user app-data directory so server.py and
scanner.py agree on where to put models, license, config, logs, history.
"""

import os
import sys


APP_NAME = "CleanSweep"


def get_app_data_dir():
    """
    Return the per-user app-data directory for CleanSweep.
    Created if missing.

    - macOS:  ~/Library/Application Support/CleanSweep
    - Linux:  $XDG_DATA_HOME/CleanSweep  or  ~/.local/share/CleanSweep
    - Windows: %LOCALAPPDATA%/CleanSweep
    """
    if sys.platform == "darwin":
        base = os.path.expanduser("~/Library/Application Support")
    elif sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    else:
        base = os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")

    path = os.path.join(base, APP_NAME)
    os.makedirs(path, exist_ok=True)
    return path

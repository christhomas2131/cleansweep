"""
Wrapper to run verify.py with output captured to a file.
Usage: python run_verify.py <phase>
"""
import sys
import os
import subprocess

phase = sys.argv[1] if len(sys.argv) > 1 else "1"
outfile = f"verify_phase_{phase}.txt"

proj_dir = os.path.dirname(os.path.abspath(__file__))

result = subprocess.run(
    [sys.executable, "-X", "utf8", "verify.py", "--phase", phase],
    cwd=proj_dir,
    capture_output=True,
    text=True,
    encoding="utf-8",
    errors="replace",
)

combined = result.stdout + result.stderr

with open(os.path.join(proj_dir, outfile), "w", encoding="utf-8") as f:
    f.write(combined)

try:
    sys.stdout.buffer.write(combined.encode("utf-8", errors="replace"))
    sys.stdout.buffer.flush()
except Exception:
    pass
sys.exit(result.returncode)

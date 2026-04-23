# CleanSweep — Full 12-Phase Automated Build
# =============================================
# Feed THIS file to Claude Code. It will execute all 12 phases sequentially,
# running automated verification between each phase.
#
# Estimated time: ~3 hours
#
# Usage in Claude Code (with --dangerously-skip-permissions):
#   "Read cleansweep-phases/BUILD_ALL.md and execute it start to finish."

You are building a desktop app called CleanSweep. The build is split into 12 phases, each defined in its own file in the cleansweep-phases/ directory. There is also a verify.py script that runs automated checks after each phase.

RULES:
1. Execute every phase IN ORDER. Do not skip phases.
2. After each phase, run the verification script.
3. If verification fails, fix the issues and re-run verification until it passes.
4. Do not move to the next phase until the current phase passes verification.
5. If you get stuck on a verification failure after 3 attempts, note the failure and move on — the user will fix it manually.
6. Install dependencies as needed (pip install).

---

## PHASE 1 — Project Scaffold + Backend API

1. Read `cleansweep-phases/phase-1.md` and implement everything in it
2. Install dependencies: `pip install flask flask-cors transformers torch pillow`
3. Verify: `python cleansweep-phases/verify.py --phase 1`
4. Fix failures and re-verify until passing, then continue

---

## PHASE 2 — Frontend Scan Configuration Screen

1. Read `cleansweep-phases/phase-2.md` and implement everything in it
2. Verify: `python cleansweep-phases/verify.py --phase 2`
3. Fix failures and re-verify until passing, then continue

---

## PHASE 3 — Frontend Scan Progress Screen

1. Read `cleansweep-phases/phase-3.md` and implement everything in it
2. Verify: `python cleansweep-phases/verify.py --phase 3`
3. Fix failures and re-verify until passing, then continue

---

## PHASE 4 — Frontend Review Grid Screen

1. Read `cleansweep-phases/phase-4.md` and implement everything in it
2. Verify: `python cleansweep-phases/verify.py --phase 4`
3. Fix failures and re-verify until passing, then continue

---

## PHASE 5 — Electron Shell + Wiring

1. Read `cleansweep-phases/phase-5.md` and implement everything in it
2. Install Electron: `cd electron && npm install && cd ..`
3. Verify: `python cleansweep-phases/verify.py --phase 5`
4. Fix failures and re-verify until passing, then continue

---

## PHASE 6 — Polish + Error Handling

1. Read `cleansweep-phases/phase-6.md` and implement everything in it
2. Verify: `python cleansweep-phases/verify.py --phase 6`
3. Fix failures and re-verify until passing, then continue

---

## PHASE 7 — Video Scanning

1. Read `cleansweep-phases/phase-7.md` and implement everything in it
2. Verify: `python cleansweep-phases/verify.py --phase 7`
3. Fix failures and re-verify until passing, then continue

---

## PHASE 8 — Document Scanning

1. Read `cleansweep-phases/phase-8.md` and implement everything in it
2. Install dependencies: `pip install pymupdf python-docx python-pptx openpyxl`
3. Verify: `python cleansweep-phases/verify.py --phase 8`
4. Fix failures and re-verify until passing, then continue

---

## PHASE 9 — Packaging + Installer

1. Read `cleansweep-phases/phase-9.md` and implement everything in it
2. Install: `pip install pyinstaller`
3. Install: `cd electron && npm install electron-builder --save-dev && cd ..`
4. Verify: `python cleansweep-phases/verify.py --phase 9`
5. Fix failures and re-verify until passing, then continue

---

## PHASE 10 — Landing Page + Payments

1. Read `cleansweep-phases/phase-10.md` and implement everything in it
2. Verify: `python cleansweep-phases/verify.py --phase 10`
3. Fix failures and re-verify until passing, then continue

---

## PHASE 11 — Performance + Smart Features

1. Read `cleansweep-phases/phase-11.md` and implement everything in it
2. Verify: `python cleansweep-phases/verify.py --phase 11`
3. Fix failures and re-verify until passing, then continue

---

## PHASE 12 — Onboarding + Polish + Ship Prep

1. Read `cleansweep-phases/phase-12.md` and implement everything in it
2. Verify: `python cleansweep-phases/verify.py --phase 12`
3. Fix failures and re-verify until passing, then continue

---

## COMPLETION — Final Regression Check

After all 12 phases pass, run the full verification suite to check for regressions:

```
python cleansweep-phases/verify.py --phase 1
python cleansweep-phases/verify.py --phase 2
python cleansweep-phases/verify.py --phase 3
python cleansweep-phases/verify.py --phase 4
python cleansweep-phases/verify.py --phase 5
python cleansweep-phases/verify.py --phase 6
python cleansweep-phases/verify.py --phase 7
python cleansweep-phases/verify.py --phase 8
python cleansweep-phases/verify.py --phase 9
python cleansweep-phases/verify.py --phase 10
python cleansweep-phases/verify.py --phase 11
python cleansweep-phases/verify.py --phase 12
```

Then print a final summary:
1. List of all files created with a brief description of each
2. Any phases that had persistent failures
3. Features that require manual testing (Electron GUI, video scanning with real ffmpeg, etc.)
4. Recommended next steps for the developer

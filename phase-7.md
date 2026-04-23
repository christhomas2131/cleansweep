# Phase 7: Video Scanning
# Estimated time: ~25 minutes
# Prerequisite: Phases 1-6 passing all verification
# This is the #1 differentiator — no desktop competitor does this.

Add video scanning to CleanSweep. Extract frames from video files using ffmpeg, classify each frame, flag videos where any frame scores above threshold.

## Backend Changes:

### New file: backend/video_scanner.py

Video scanning engine:
- Supported formats: .mp4, .avi, .mov, .mkv, .webm, .wmv, .flv, .m4v
- Uses subprocess to call ffmpeg for frame extraction
- Frame sampling strategy:
  - Extract 1 frame every 10 seconds of video
  - Cap at 100 frames max per video (for very long videos)
  - Use ffmpeg command: `ffmpeg -i <input> -vf "fps=0.1" -q:v 2 <output_dir>/frame_%04d.jpg`
  - Extract to a temp directory (tempfile.mkdtemp), clean up after classification
- For each extracted frame, run through the same NSFW classifier used for images
- A video is flagged if ANY frame scores above the threshold
- Store results: {path, filename, score (highest frame score), flagged_frame_timestamp, frame_scores: [{timestamp, score}]}
- Keep the top 3 highest-scoring frames' data for the filmstrip preview
- Generate a thumbnail from the highest-scoring frame (300x300 JPEG, base64)

### Helper functions in video_scanner.py:
- get_video_duration(path) → float seconds, using ffprobe
- extract_frames(path, interval=10, max_frames=100) → list of temp frame paths
- get_frame_timestamp(frame_index, interval) → string like "2:34"
- cleanup_temp_frames(temp_dir) → removes temp directory

### ffmpeg detection:
- On backend startup (server.py), check if ffmpeg is available: subprocess.run(["ffmpeg", "-version"])
- Store result in a global: FFMPEG_AVAILABLE = True/False
- New endpoint: GET /capabilities → returns {ffmpeg: bool, video_scanning: bool}
- If ffmpeg is not available, video scanning is disabled gracefully (not a crash)

### Update scanner.py:
- File discovery now also finds video files (the extensions listed above)
- Scan order: all images first, then all videos
  - This way users see image results faster while videos process after
- Progress reporting now includes: {images_total, images_scanned, videos_total, videos_scanned}
- The "current_file" field should distinguish: "Scanning image: photo.jpg" vs "Scanning video: clip.mp4 (frame 12/30)"

### Update server.py:
- GET /progress now returns expanded fields:
  {status, total, scanned, flagged_count, percent, rate, eta_seconds, current_file,
   images_total, images_scanned, videos_total, videos_scanned}
- GET /results now includes a "type" field on each item: "image" or "video"
- GET /capabilities endpoint (new)
- GET /filmstrip/<int:index> — returns JSON {frames: [{timestamp: string, thumbnail: base64_string}]}
  - Returns up to 3 highest-scoring frames for a flagged video
  - Generate thumbnails on demand (300x300 JPEG each)

## Frontend Changes:

### Update scan-setup.js:
- On load, call GET /capabilities
- If ffmpeg is not available, show a subtle info banner on setup screen:
  "Video scanning unavailable — ffmpeg not found. Install ffmpeg to scan videos."
  Link text "How to install ffmpeg" (link to https://ffmpeg.org/download.html)
- Add file type checkboxes below the threshold slider:
  ☑ Images (.jpg, .png, .gif, etc.)
  ☑ Videos (.mp4, .mov, .avi, etc.) — grayed out and disabled if no ffmpeg
  ☐ Documents (.pdf, .docx, etc.) — grayed out, shows "Coming soon"
  Checkboxes styled to match dark theme.
- Update POST /scan to send: {folder, threshold, scan_images: bool, scan_videos: bool}

### Update server.py POST /scan:
- Accept new fields: scan_images (default true), scan_videos (default true)
- Pass to scanner so it knows what to scan

### Update progress.js:
- Stats row now shows: "Images: 12,450/50,000" and "Videos: 120/340" as separate stats
- If no videos are being scanned, hide the video stat
- ETA should account for both images and videos

### Update review.js:
- Video cards get a badge overlay in the top-left corner:
  - Small rounded pill: "▶ VIDEO" with a semi-transparent dark background
  - Position: absolute, top 8px, left 8px
- Video thumbnails show the highest-scoring frame (same as image thumbnails)
- On hover (when unblurred): if the item is a video, show a filmstrip overlay
  - Fetch GET /filmstrip/<index> on first hover, cache the result
  - Display: 3 small frames in a horizontal row overlaid on the card
  - Each frame shows its timestamp in small text below it
  - CSS: position absolute, bottom of the image area, semi-transparent dark bar background
- Add a filter dropdown or toggle on the review top bar:
  "Show: All | Images Only | Videos Only"
  - Filters the current results view
  - Update GET /results to accept a type filter param: ?type=image|video|all

### Update server.py GET /results:
- Accept optional query param: type (default "all", options: "image", "video", "all")
- Filter results accordingly before paginating

## New dependency:
- ffmpeg (external binary, not a pip package)
- ffprobe (comes with ffmpeg)

## Verification:
- [ ] GET /capabilities returns {ffmpeg: true/false}
- [ ] If ffmpeg not found, setup screen shows info banner (not a crash)
- [ ] Scan with videos enabled finds and processes video files
- [ ] Progress shows separate image/video counts
- [ ] Video results appear in review grid with "▶ VIDEO" badge
- [ ] GET /filmstrip/<index> returns frame thumbnails for a flagged video
- [ ] Filter dropdown on review screen filters by type
- [ ] Scan with videos disabled skips video files entirely

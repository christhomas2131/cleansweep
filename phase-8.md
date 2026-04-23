# Phase 8: Document Scanning
# Estimated time: ~25 minutes
# Prerequisite: Phase 7 passing verification
# This opens the corporate/legal market.

Add document scanning to CleanSweep. Extract embedded images from PDFs, Word docs, PowerPoints, and Excel files, then classify them.

## Backend Changes:

### New file: backend/document_scanner.py

Document scanning engine:
- Supported formats: .pdf, .docx, .pptx, .xlsx
- For each document type, extract all embedded images to temp files
- Run each extracted image through the NSFW classifier
- A document is flagged if ANY embedded image scores above threshold

### Extraction functions:

extract_images_from_pdf(path) → list of {image_bytes, page_number}
- Use PyMuPDF (fitz): iterate pages, extract images with page.get_images()
- For each image, get the pixmap and convert to PIL Image
- Track which page each image came from
- Handle encrypted/password-protected PDFs: skip with warning, don't crash

extract_images_from_docx(path) → list of {image_bytes, description}
- Use python-docx: iterate document.inline_shapes and document rels
- Extract embedded images from the docx zip structure
- Description: "Embedded image in document body"

extract_images_from_pptx(path) → list of {image_bytes, slide_number}
- Use python-pptx: iterate slides, then shapes on each slide
- Extract images from picture shapes
- Track which slide number each image came from

extract_images_from_xlsx(path) → list of {image_bytes, sheet_name}
- Use openpyxl: iterate worksheets, then worksheet._images
- Track which sheet each image came from

### For all extraction:
- Extract to temp PIL Image objects (don't write to disk unnecessarily)
- If a document has zero embedded images, skip it entirely (fast)
- If extraction fails (corrupt file, unsupported format), log warning and skip
- Limit: max 500 images per document (some PDFs are massive)

### Result storage for flagged documents:
{
  path: string,
  filename: string,
  type: "document",
  doc_type: "pdf" | "docx" | "pptx" | "xlsx",
  score: float (highest embedded image score),
  flagged_images: [
    {page: int or null, slide: int or null, sheet: string or null, score: float}
  ]
}

### Update scanner.py:
- File discovery now also finds document files (.pdf, .docx, .pptx, .xlsx)
- Scan order: images first → videos second → documents third
- Progress reporting adds: {documents_total, documents_scanned}
- Current file: "Scanning document: report.pdf (image 5/23)"

### Update server.py:
- GET /progress adds: documents_total, documents_scanned
- GET /results items now include type: "image" | "video" | "document"
- GET /results type filter now accepts: "document" in addition to "image" | "video" | "all"
- New endpoint: GET /doc-details/<int:index> → returns detailed info for a flagged document:
  {doc_type, total_images_extracted, flagged_images: [{page/slide/sheet, score, thumbnail: base64}]}
- GET /thumb/<int:index> for documents: returns thumbnail of the highest-scoring embedded image
- POST /scan now accepts: {folder, threshold, scan_images, scan_videos, scan_documents}

## Frontend Changes:

### Update scan-setup.js:
- The "Documents" checkbox is now enabled (remove "Coming soon"):
  ☑ Documents (.pdf, .docx, .pptx, .xlsx)
- Update POST /scan payload to include scan_documents: bool

### Update progress.js:
- Add documents stat: "Documents: 45/85"
- Show all three categories: Images, Videos, Documents

### Update review.js:
- Document cards get a badge overlay based on doc_type:
  - PDF: "📄 PDF"
  - DOCX: "📝 DOCX"
  - PPTX: "📊 PPTX"
  - XLSX: "📈 XLSX"
  Badge style: same as the video badge but different icon/text
- Thumbnail shows the highest-scoring embedded image
- Below thumbnail in the info bar: show context
  - PDF: "Page 47" | PPTX: "Slide 12" | XLSX: "Sheet: Revenue" | DOCX: just filename
- On click/expand (or hover when unblurred): show additional context
  - "3 flagged images found in this document"
  - Small list: "Page 12 (87%), Page 47 (92%), Page 103 (54%)"
  - Fetch from GET /doc-details/<index> on first interaction, cache result
- Filter dropdown update: "Show: All | Images | Videos | Documents"

### Update review.js delete/quarantine:
- When deleting/quarantining a document, the entire document file is affected
  (you can't delete just one page of a PDF)
- Make this clear in the confirmation dialog:
  "This will delete the entire document: quarterly_report.pdf (contains 3 flagged images)"

## New dependencies (add to requirements.txt):
- PyMuPDF (package name: pymupdf)
- python-docx
- python-pptx
- openpyxl

## Verification:
- [ ] pip install pymupdf python-docx python-pptx openpyxl succeeds
- [ ] Scanning a folder with PDFs extracts and classifies embedded images
- [ ] Scanning a folder with DOCX/PPTX/XLSX extracts embedded images
- [ ] Documents with zero embedded images are skipped quickly
- [ ] Flagged documents appear in review grid with correct badge
- [ ] GET /doc-details/<index> returns page/slide/sheet info
- [ ] Filter dropdown includes "Documents" option
- [ ] Progress shows separate document count
- [ ] Delete/quarantine for documents affects the whole file
- [ ] Corrupt/password-protected documents are skipped gracefully

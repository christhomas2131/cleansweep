"""
CleanSweep — Document scanning engine.
Extracts embedded images from PDF, DOCX, PPTX, XLSX files,
then classifies each embedded image using the NSFW classifier.
"""

import os
import io
import logging
import tempfile

log = logging.getLogger(__name__)

DOCUMENT_EXTENSIONS = {".pdf", ".docx", ".pptx", ".xlsx"}
MAX_IMAGES_PER_DOC = 500


def extract_images_from_pdf(path):
    """
    Extract all embedded images from a PDF file using PyMuPDF (fitz).
    Returns list of dicts: [{image_bytes: bytes, page_number: int}]
    """
    images = []
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(path)
        for page_num, page in enumerate(doc, start=1):
            try:
                image_list = page.get_images(full=True)
                for img_info in image_list:
                    if len(images) >= MAX_IMAGES_PER_DOC:
                        break
                    try:
                        xref = img_info[0]
                        base_image = doc.extract_image(xref)
                        image_bytes = base_image["image"]
                        images.append({
                            "image_bytes": image_bytes,
                            "page_number": page_num,
                            "slide_number": None,
                            "sheet_name": None,
                        })
                    except Exception as e:
                        log.debug(f"Failed to extract image from PDF page {page_num}: {e}")
            except Exception as e:
                log.debug(f"Failed to process PDF page {page_num}: {e}")
        doc.close()
    except ImportError:
        log.warning("PyMuPDF not installed. Cannot extract PDF images.")
    except Exception as e:
        log.warning(f"Failed to open PDF {path}: {e}")
    return images


def extract_images_from_docx(path):
    """
    Extract all embedded images from a DOCX file using python-docx.
    Returns list of dicts: [{image_bytes: bytes, description: str}]
    """
    images = []
    try:
        import zipfile
        # DOCX files are ZIP archives
        with zipfile.ZipFile(path, "r") as z:
            for name in z.namelist():
                if len(images) >= MAX_IMAGES_PER_DOC:
                    break
                lower = name.lower()
                if (name.startswith("word/media/") and
                        any(lower.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".webp"])):
                    try:
                        image_bytes = z.read(name)
                        images.append({
                            "image_bytes": image_bytes,
                            "page_number": None,
                            "slide_number": None,
                            "sheet_name": None,
                            "description": f"Embedded image: {os.path.basename(name)}",
                        })
                    except Exception as e:
                        log.debug(f"Failed to extract DOCX image {name}: {e}")
    except Exception as e:
        log.warning(f"Failed to open DOCX {path}: {e}")
    return images


def extract_images_from_pptx(path):
    """
    Extract all embedded images from a PPTX file using python-pptx.
    Returns list of dicts: [{image_bytes: bytes, slide_number: int}]
    """
    images = []
    try:
        import zipfile
        # PPTX files are ZIP archives
        with zipfile.ZipFile(path, "r") as z:
            slide_count = {}
            for name in z.namelist():
                if name.startswith("ppt/slides/slide") and name.endswith(".xml"):
                    # Extract slide number
                    basename = os.path.basename(name)
                    try:
                        slide_num = int(basename.replace("slide", "").replace(".xml", ""))
                    except ValueError:
                        slide_num = 1
                    slide_count[name] = slide_num

            # Get media files with slide context from rels
            slide_media = {}
            for name in z.namelist():
                if name.startswith("ppt/slides/_rels/slide") and name.endswith(".xml.rels"):
                    try:
                        basename = os.path.basename(name)
                        slide_num = int(basename.replace("slide", "").replace(".xml.rels", ""))
                        content = z.read(name).decode("utf-8", errors="ignore")
                        import re
                        for match in re.finditer(r'Target="([^"]+)"', content):
                            target = match.group(1)
                            if "../media/" in target:
                                media_name = "ppt/media/" + target.split("../media/")[-1]
                                slide_media[media_name] = slide_num
                    except Exception:
                        pass

            for name in z.namelist():
                if len(images) >= MAX_IMAGES_PER_DOC:
                    break
                lower = name.lower()
                if (name.startswith("ppt/media/") and
                        any(lower.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".webp"])):
                    try:
                        image_bytes = z.read(name)
                        slide_num = slide_media.get(name, None)
                        images.append({
                            "image_bytes": image_bytes,
                            "page_number": None,
                            "slide_number": slide_num,
                            "sheet_name": None,
                        })
                    except Exception as e:
                        log.debug(f"Failed to extract PPTX image {name}: {e}")
    except Exception as e:
        log.warning(f"Failed to open PPTX {path}: {e}")
    return images


def extract_images_from_xlsx(path):
    """
    Extract all embedded images from an XLSX file using openpyxl.
    Returns list of dicts: [{image_bytes: bytes, sheet_name: str}]
    """
    images = []
    try:
        import zipfile
        # XLSX files are ZIP archives
        with zipfile.ZipFile(path, "r") as z:
            for name in z.namelist():
                if len(images) >= MAX_IMAGES_PER_DOC:
                    break
                lower = name.lower()
                if (name.startswith("xl/media/") and
                        any(lower.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".webp"])):
                    try:
                        image_bytes = z.read(name)
                        images.append({
                            "image_bytes": image_bytes,
                            "page_number": None,
                            "slide_number": None,
                            "sheet_name": "Sheet",
                        })
                    except Exception as e:
                        log.debug(f"Failed to extract XLSX image {name}: {e}")
    except Exception as e:
        log.warning(f"Failed to open XLSX {path}: {e}")
    return images


def extract_images_from_document(path):
    """
    Extract all embedded images from a document based on its extension.
    Returns list of image dicts.
    """
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf":
        return extract_images_from_pdf(path)
    elif ext == ".docx":
        return extract_images_from_docx(path)
    elif ext == ".pptx":
        return extract_images_from_pptx(path)
    elif ext == ".xlsx":
        return extract_images_from_xlsx(path)
    return []


def scan_document(path, classifier, threshold, stop_flag=None, progress_callback=None):
    """
    Scan a single document file.
    Returns a result dict if flagged, or None if below threshold.
    progress_callback(image_num, total_images) for progress reporting.
    """
    ext = os.path.splitext(path)[1].lower()
    doc_type = ext.lstrip(".")

    try:
        image_infos = extract_images_from_document(path)
    except Exception as e:
        log.warning(f"Failed to extract images from {path}: {e}")
        return None

    if not image_infos:
        return None

    total_images = len(image_infos)
    flagged_images = []
    highest_score = 0.0
    highest_img_idx = 0

    for i, img_info in enumerate(image_infos):
        if stop_flag and stop_flag():
            break

        if progress_callback:
            progress_callback(i + 1, total_images)

        doc_img = None
        try:
            from PIL import Image
            doc_img = Image.open(io.BytesIO(img_info["image_bytes"])).convert("RGB")
            doc_img.info.pop('icc_profile', None)
            results = classifier(doc_img)

            score = 0.0
            for r in results:
                label = r.get("label", "").lower()
                if "nsfw" in label or "explicit" in label or "porn" in label or "sexy" in label or "hentai" in label:
                    score = max(score, r.get("score", 0.0))
                elif label == "sfw":
                    score = max(score, 1.0 - r.get("score", 1.0))

            if score >= threshold:
                flagged_img = {
                    "page": img_info.get("page_number"),
                    "slide": img_info.get("slide_number"),
                    "sheet": img_info.get("sheet_name"),
                    "score": score,
                    # Do NOT store image_bytes — keeps memory bounded
                }
                flagged_images.append(flagged_img)

            if score > highest_score:
                highest_score = score
                highest_img_idx = i

        except Exception as e:
            log.warning(f"Failed to classify image {i} from {path}: {e}")
            continue
        finally:
            if doc_img is not None:
                try:
                    doc_img.close()
                except Exception:
                    pass
                del doc_img

    if highest_score < threshold:
        return None

    # Generate thumbnail from highest-scoring image
    thumbnail_b64 = None
    if 0 <= highest_img_idx < len(image_infos):
        thumb_img = None
        try:
            from PIL import Image
            import base64
            thumb_img = Image.open(io.BytesIO(image_infos[highest_img_idx]["image_bytes"])).convert("RGB")
            thumb_img.info.pop('icc_profile', None)
            thumb_img.thumbnail((300, 300))
            buf = io.BytesIO()
            thumb_img.save(buf, format="JPEG", quality=85)
            thumbnail_b64 = base64.b64encode(buf.getvalue()).decode()
        except Exception as e:
            log.warning(f"Failed to generate thumbnail for document {path}: {e}")
        finally:
            if thumb_img is not None:
                try:
                    thumb_img.close()
                except Exception:
                    pass

    # Build flagged_images without raw bytes for storage
    flagged_images_clean = [
        {
            "page": fi.get("page"),
            "slide": fi.get("slide"),
            "sheet": fi.get("sheet"),
            "score": fi.get("score"),
        }
        for fi in flagged_images
    ]

    return {
        "path": path,
        "filename": os.path.basename(path),
        "type": "document",
        "doc_type": doc_type,
        "score": highest_score,
        "total_images_extracted": total_images,
        "flagged_images": flagged_images_clean,
        "thumbnail_b64": thumbnail_b64,
    }

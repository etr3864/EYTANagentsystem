"""Document text extraction for various file formats."""
import asyncio
from io import BytesIO

# Enough for one inbound turn. Keeps token cost bounded under parallel load.
MAX_EXTRACT_CHARS = 5000

_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation"

# WhatsApp often sends application/octet-stream — fall back to the filename.
_EXT_MIME = {
    "pdf": "application/pdf",
    "docx": _DOCX,
    "xlsx": _XLSX,
    "pptx": _PPTX,
    "txt": "text/plain",
    "csv": "text/csv",
}

_INBOUND_MIME = frozenset(_EXT_MIME.values())


def extract_text(content: bytes, mime_type: str) -> str:
    """Extract text from document based on MIME type.
    
    Returns extracted text (up to MAX_EXTRACT_CHARS) or empty string on failure.
    """
    mime = (mime_type or "").split(";")[0].strip().lower()
    extractors = {
        "application/pdf": _extract_pdf,
        "application/msword": _extract_doc_fallback,
        _DOCX: _extract_docx,
        "application/vnd.ms-excel": _extract_xlsx_fallback,
        _XLSX: _extract_xlsx,
        "application/vnd.ms-powerpoint": _extract_pptx_fallback,
        _PPTX: _extract_pptx,
        "text/plain": _extract_txt,
        "text/csv": _extract_txt,
    }
    
    extractor = extractors.get(mime)
    if not extractor:
        return ""
    
    try:
        text = extractor(content)
        return _clean_text(text)[:MAX_EXTRACT_CHARS]
    except Exception:
        return ""


def document_label(filename: str | None) -> str:
    name = (filename or "").strip()
    return f"[קובץ: {name}]" if name else "[קובץ]"


def _inbound_mime(mime: str | None, filename: str | None) -> str:
    clean = (mime or "").split(";")[0].strip().lower()
    if clean in _INBOUND_MIME:
        return clean
    if filename and "." in filename:
        ext = filename.rsplit(".", 1)[-1].lower()
        return _EXT_MIME.get(ext, "")
    return ""


def _inbound_body(filename: str | None, data: bytes | None, mime: str | None) -> str:
    """Label plus extracted text, or label only if unreadable."""
    label = document_label(filename)
    if not data:
        return label
    resolved = _inbound_mime(mime, filename)
    if not resolved:
        return label
    extracted = extract_text(data, resolved)
    if not extracted:
        return label
    return f"{label}:\n{extracted}"


async def inbound_text(filename: str | None, data: bytes | None, mime: str | None) -> str:
    """CPU-bound extract off the event loop so agents don't block each other."""
    return await asyncio.to_thread(_inbound_body, filename, data, mime)


def _clean_text(text: str) -> str:
    """Clean extracted text - remove excessive whitespace."""
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    return "\n".join(lines)


def _extract_pdf(content: bytes) -> str:
    """Extract text from PDF using PyMuPDF."""
    import pymupdf
    
    doc = pymupdf.open(stream=content, filetype="pdf")
    texts = []
    
    for page in doc:
        texts.append(page.get_text())
        if len("\n".join(texts)) > MAX_EXTRACT_CHARS:
            break
    
    doc.close()
    return "\n".join(texts)


def _extract_docx(content: bytes) -> str:
    """Extract text from DOCX using python-docx."""
    from docx import Document
    
    doc = Document(BytesIO(content))
    texts = []
    
    for para in doc.paragraphs:
        if para.text.strip():
            texts.append(para.text)
        if len("\n".join(texts)) > MAX_EXTRACT_CHARS:
            break
    
    return "\n".join(texts)


def _extract_xlsx(content: bytes) -> str:
    """Extract text from XLSX using openpyxl."""
    from openpyxl import load_workbook
    
    wb = load_workbook(BytesIO(content), read_only=True, data_only=True)
    texts = []
    
    for sheet in wb.sheetnames[:3]:  # Max 3 sheets
        ws = wb[sheet]
        texts.append(f"[{sheet}]")
        
        for row in ws.iter_rows(max_row=50, values_only=True):
            row_text = " | ".join(str(cell) for cell in row if cell is not None)
            if row_text:
                texts.append(row_text)
        
        if len("\n".join(texts)) > MAX_EXTRACT_CHARS:
            break
    
    wb.close()
    return "\n".join(texts)


def _extract_pptx(content: bytes) -> str:
    """Extract text from PPTX using python-pptx."""
    from pptx import Presentation
    
    prs = Presentation(BytesIO(content))
    texts = []
    
    for i, slide in enumerate(prs.slides[:20], 1):  # Max 20 slides
        slide_texts = []
        for shape in slide.shapes:
            if hasattr(shape, "text") and shape.text.strip():
                slide_texts.append(shape.text)
        
        if slide_texts:
            texts.append(f"[Slide {i}] " + " ".join(slide_texts))
        
        if len("\n".join(texts)) > MAX_EXTRACT_CHARS:
            break
    
    return "\n".join(texts)


def _extract_txt(content: bytes) -> str:
    """Extract text from plain text file."""
    for encoding in ["utf-8", "cp1255", "iso-8859-8", "latin-1"]:
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return ""


def _extract_doc_fallback(content: bytes) -> str:
    """Fallback for old .doc format - limited support."""
    # Old .doc format is binary, best effort extraction
    try:
        text = content.decode("utf-8", errors="ignore")
        # Filter printable characters
        return "".join(c for c in text if c.isprintable() or c in "\n\t")
    except Exception:
        return ""


def _extract_xlsx_fallback(content: bytes) -> str:
    """Fallback for old .xls format."""
    return ""  # Old Excel format requires xlrd, skip for now


def _extract_pptx_fallback(content: bytes) -> str:
    """Fallback for old .ppt format."""
    return ""  # Old PowerPoint format not supported

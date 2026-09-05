"""Unit tests for api/services/document_processor.py.

Tests verify that extract_text() correctly extracts content from each
supported file type and raises DocumentProcessingError appropriately.

PDF fixtures are generated with reportlab (a real PDF writer) so pypdf
can read actual page content — not a fake binary blob.
"""

import csv
import io
import tempfile
from pathlib import Path

import pytest

from api.services.document_processor import DocumentProcessingError, extract_text


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _write_temp_file(suffix: str, content: bytes, tmp_path: Path) -> Path:
    """Write content to a temp file and return its Path."""
    p = tmp_path / f"test_file{suffix}"
    p.write_bytes(content)
    return p


def _make_pdf_bytes(text_content: str) -> bytes:
    """Generate a minimal real PDF using reportlab containing text_content."""
    from reportlab.pdfgen import canvas  # type: ignore[import]

    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    # Write text line by line on the first page
    y = 750
    for line in text_content.splitlines():
        c.drawString(72, y, line)
        y -= 15
    c.save()
    return buf.getvalue()


def _make_docx_bytes(paragraphs: list[str]) -> bytes:
    """Generate a minimal DOCX using python-docx."""
    from docx import Document  # type: ignore[import]

    doc = Document()
    for para in paragraphs:
        doc.add_paragraph(para)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# TXT extraction
# ---------------------------------------------------------------------------

class TestExtractTxt:
    def test_basic_utf8_content(self, tmp_path):
        content = "Suspect Vikram Sharma alias Vicky was seen in Sector 18 Noida."
        p = _write_temp_file(".txt", content.encode("utf-8"), tmp_path)
        result = extract_text(str(p), "txt")
        assert "Vikram Sharma" in result
        assert "Sector 18 Noida" in result

    def test_multiline_utf8(self, tmp_path):
        content = "Line 1: Location sighted.\nLine 2: Suspect fled north."
        p = _write_temp_file(".txt", content.encode("utf-8"), tmp_path)
        result = extract_text(str(p), "txt")
        assert "Line 1" in result
        assert "Line 2" in result

    def test_latin1_fallback(self, tmp_path):
        # Write bytes that are valid Latin-1 but not UTF-8
        content = "Caf\xe9 near suspect location"
        p = _write_temp_file(".txt", content.encode("latin-1"), tmp_path)
        result = extract_text(str(p), "txt")
        # Should decode without raising; content present in some form
        assert len(result) > 0

    def test_file_type_with_leading_dot(self, tmp_path):
        content = b"Valid intelligence note"
        p = _write_temp_file(".txt", content, tmp_path)
        # Should handle ".txt" with leading dot gracefully
        result = extract_text(str(p), ".txt")
        assert "Valid intelligence note" in result


# ---------------------------------------------------------------------------
# CSV extraction
# ---------------------------------------------------------------------------

class TestExtractCsv:
    def test_basic_csv(self, tmp_path):
        rows = "caller,receiver,duration_sec\n+91-9876543210,+91-9123456789,120\n"
        p = _write_temp_file(".csv", rows.encode("utf-8"), tmp_path)
        result = extract_text(str(p), "csv")
        assert "caller" in result
        assert "+91-9876543210" in result
        assert "120" in result

    def test_csv_produces_tab_separated_rows(self, tmp_path):
        rows = "a,b,c\n1,2,3\n"
        p = _write_temp_file(".csv", rows.encode("utf-8"), tmp_path)
        result = extract_text(str(p), "csv")
        lines = result.splitlines()
        assert lines[0] == "a\tb\tc"
        assert lines[1] == "1\t2\t3"

    def test_single_column_csv(self, tmp_path):
        rows = "name\nVikram\nRajesh\n"
        p = _write_temp_file(".csv", rows.encode("utf-8"), tmp_path)
        result = extract_text(str(p), "csv")
        assert "Vikram" in result
        assert "Rajesh" in result


# ---------------------------------------------------------------------------
# PDF extraction (uses reportlab for fixture generation)
# ---------------------------------------------------------------------------

class TestExtractPdf:
    def test_pdf_extracts_text(self, tmp_path):
        expected = "Operation Blackout intelligence briefing page one."
        pdf_bytes = _make_pdf_bytes(expected)
        p = _write_temp_file(".pdf", pdf_bytes, tmp_path)
        result = extract_text(str(p), "pdf")
        # pypdf may reassemble words slightly differently; check key tokens
        assert "Blackout" in result or "Operation" in result

    def test_pdf_multiline_content(self, tmp_path):
        text = "Suspect: Vikram Sharma\nLocation: Sector 18\nDate: 2026-09-01"
        pdf_bytes = _make_pdf_bytes(text)
        p = _write_temp_file(".pdf", pdf_bytes, tmp_path)
        result = extract_text(str(p), "pdf")
        assert "Vikram" in result
        assert "Sector" in result

    def test_corrupt_pdf_raises(self, tmp_path):
        """A non-PDF binary blob should raise DocumentProcessingError."""
        p = _write_temp_file(".pdf", b"NOT A REAL PDF CONTENT XYZ", tmp_path)
        with pytest.raises(DocumentProcessingError):
            extract_text(str(p), "pdf")


# ---------------------------------------------------------------------------
# DOCX extraction (uses python-docx for fixture generation)
# ---------------------------------------------------------------------------

class TestExtractDocx:
    def test_docx_paragraphs(self, tmp_path):
        paragraphs = [
            "Witness statement from Rajesh Kumar.",
            "Incident occurred at Karol Bagh on 2026-08-15.",
        ]
        docx_bytes = _make_docx_bytes(paragraphs)
        p = _write_temp_file(".docx", docx_bytes, tmp_path)
        result = extract_text(str(p), "docx")
        assert "Rajesh Kumar" in result
        assert "Karol Bagh" in result

    def test_docx_multiline(self, tmp_path):
        paragraphs = ["Line one content.", "Line two content.", "Line three content."]
        docx_bytes = _make_docx_bytes(paragraphs)
        p = _write_temp_file(".docx", docx_bytes, tmp_path)
        result = extract_text(str(p), "docx")
        assert "Line one" in result
        assert "Line three" in result

    def test_corrupt_docx_raises(self, tmp_path):
        """Invalid bytes should raise DocumentProcessingError."""
        p = _write_temp_file(".docx", b"PK FAKE ZIP CONTENT XYZ", tmp_path)
        with pytest.raises(DocumentProcessingError):
            extract_text(str(p), "docx")


# ---------------------------------------------------------------------------
# Error cases
# ---------------------------------------------------------------------------

class TestExtractErrors:
    def test_missing_file_raises(self, tmp_path):
        non_existent = str(tmp_path / "does_not_exist.txt")
        with pytest.raises(DocumentProcessingError, match="File not found"):
            extract_text(non_existent, "txt")

    def test_unsupported_type_raises(self, tmp_path):
        p = _write_temp_file(".exe", b"binary data", tmp_path)
        with pytest.raises(DocumentProcessingError, match="Unsupported file type"):
            extract_text(str(p), "exe")

    def test_unsupported_type_with_dot_raises(self, tmp_path):
        p = _write_temp_file(".xlsx", b"binary data", tmp_path)
        with pytest.raises(DocumentProcessingError, match="Unsupported file type"):
            extract_text(str(p), ".xlsx")

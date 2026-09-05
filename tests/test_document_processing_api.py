"""Integration tests for the Document Processing API endpoint.

Tests:
    POST /investigations/{id}/documents/{doc_id}/process
    GET  /investigations/{id}/documents/{doc_id}

Uses an isolated in-memory SQLite database and a temporary upload directory.
PDF test fixtures are generated with reportlab so pypdf can read real content.
"""

import io
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from api import crud
from api.database import Base, get_db
from api.main import app
from api.services import document_storage


# ---------------------------------------------------------------------------
# Test database setup
# ---------------------------------------------------------------------------

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_test_environment(tmp_path, monkeypatch):
    """Isolated SQLite DB + temp upload directory per test."""
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    test_upload_dir = tmp_path / "uploads"
    monkeypatch.setattr(document_storage, "DEFAULT_UPLOAD_DIR", str(test_upload_dir))
    yield
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()


client = TestClient(app)


# ---------------------------------------------------------------------------
# Fixture helpers
# ---------------------------------------------------------------------------

def _create_investigation(case_number: str = "CAS-PROC-001") -> str:
    res = client.post("/investigations", json={
        "case_number": case_number,
        "title": "Processing Test Investigation",
        "description": "Integration test case",
        "status": "OPEN",
    })
    assert res.status_code == 201
    return res.json()["id"]


def _upload_file(inv_id: str, filename: str, content: bytes, mime: str) -> dict:
    res = client.post(
        f"/investigations/{inv_id}/documents/upload",
        files={"file": (filename, io.BytesIO(content), mime)},
    )
    assert res.status_code == 201
    return res.json()


def _make_pdf_bytes(text: str) -> bytes:
    """Generate a real PDF using reportlab."""
    from reportlab.pdfgen import canvas  # type: ignore[import]
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    y = 750
    for line in text.splitlines():
        c.drawString(72, y, line)
        y -= 15
    c.save()
    return buf.getvalue()


def _make_docx_bytes(paragraphs: list[str]) -> bytes:
    """Generate a real DOCX using python-docx."""
    from docx import Document  # type: ignore[import]
    doc = Document()
    for p in paragraphs:
        doc.add_paragraph(p)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Tests: GET single document
# ---------------------------------------------------------------------------

class TestGetSingleDocument:
    def test_get_existing_document(self):
        inv_id = _create_investigation("CAS-GET-DOC-001")
        doc = _upload_file(inv_id, "report.txt", b"Sample text content.", "text/plain")

        res = client.get(f"/investigations/{inv_id}/documents/{doc['id']}")
        assert res.status_code == 200
        data = res.json()
        assert data["id"] == doc["id"]
        assert data["original_filename"] == "report.txt"

    def test_get_nonexistent_document_returns_404(self):
        inv_id = _create_investigation("CAS-GET-DOC-404")
        res = client.get(f"/investigations/{inv_id}/documents/{uuid.uuid4()}")
        assert res.status_code == 404

    def test_get_document_wrong_investigation_returns_404(self):
        inv_id_a = _create_investigation("CAS-GET-DOC-WRONG-A")
        inv_id_b = _create_investigation("CAS-GET-DOC-WRONG-B")
        doc = _upload_file(inv_id_a, "notes.txt", b"Content.", "text/plain")

        res = client.get(f"/investigations/{inv_id_b}/documents/{doc['id']}")
        assert res.status_code == 404


# ---------------------------------------------------------------------------
# Tests: POST process — TXT
# ---------------------------------------------------------------------------

class TestProcessTxt:
    def test_process_txt_returns_completed(self):
        inv_id = _create_investigation("CAS-PROC-TXT-001")
        content = b"Suspect Vikram Sharma was observed in Sector 18 Noida."
        doc = _upload_file(inv_id, "field_notes.txt", content, "text/plain")

        res = client.post(f"/investigations/{inv_id}/documents/{doc['id']}/process")
        assert res.status_code == 200
        data = res.json()
        assert data["processing_status"] == "COMPLETED"
        assert data["extracted_text"] is not None
        assert "Vikram Sharma" in data["extracted_text"]
        assert data["processing_error"] is None

    def test_process_txt_stores_in_db(self):
        inv_id = _create_investigation("CAS-PROC-TXT-002")
        content = b"Intelligence briefing: suspect active in northern zone."
        doc = _upload_file(inv_id, "brief.txt", content, "text/plain")

        client.post(f"/investigations/{inv_id}/documents/{doc['id']}/process")

        # Verify stored in DB via GET
        get_res = client.get(f"/investigations/{inv_id}/documents/{doc['id']}")
        assert get_res.status_code == 200
        stored = get_res.json()
        assert stored["processing_status"] == "COMPLETED"
        assert stored["extracted_text"] is not None
        assert "northern zone" in stored["extracted_text"]


# ---------------------------------------------------------------------------
# Tests: POST process — CSV
# ---------------------------------------------------------------------------

class TestProcessCsv:
    def test_process_csv_returns_completed(self):
        inv_id = _create_investigation("CAS-PROC-CSV-001")
        content = b"caller,receiver,duration_sec\n+91-9876543210,+91-9123456789,120\n"
        doc = _upload_file(inv_id, "cdr.csv", content, "text/csv")

        res = client.post(f"/investigations/{inv_id}/documents/{doc['id']}/process")
        assert res.status_code == 200
        data = res.json()
        assert data["processing_status"] == "COMPLETED"
        assert "+91-9876543210" in data["extracted_text"]

    def test_process_csv_has_structured_content(self):
        inv_id = _create_investigation("CAS-PROC-CSV-002")
        content = b"col_a,col_b\nval1,val2\n"
        doc = _upload_file(inv_id, "data.csv", content, "text/csv")

        res = client.post(f"/investigations/{inv_id}/documents/{doc['id']}/process")
        assert res.status_code == 200
        text = res.json()["extracted_text"]
        assert "col_a" in text
        assert "val1" in text


# ---------------------------------------------------------------------------
# Tests: POST process — PDF
# ---------------------------------------------------------------------------

class TestProcessPdf:
    def test_process_valid_pdf_returns_completed(self):
        inv_id = _create_investigation("CAS-PROC-PDF-001")
        pdf_bytes = _make_pdf_bytes("Operation Blackout intel report page one.")
        doc = _upload_file(inv_id, "intel.pdf", pdf_bytes, "application/pdf")

        res = client.post(f"/investigations/{inv_id}/documents/{doc['id']}/process")
        assert res.status_code == 200
        data = res.json()
        assert data["processing_status"] == "COMPLETED"
        assert data["extracted_text"] is not None
        assert len(data["extracted_text"]) > 0

    def test_process_corrupt_pdf_returns_failed(self):
        inv_id = _create_investigation("CAS-PROC-PDF-FAIL")
        doc = _upload_file(inv_id, "bad.pdf", b"%PDF-1.4 GARBAGE DATA NOT A REAL PDF", "application/pdf")

        res = client.post(f"/investigations/{inv_id}/documents/{doc['id']}/process")
        assert res.status_code == 200
        data = res.json()
        assert data["processing_status"] == "FAILED"
        assert data["processing_error"] is not None
        assert data["extracted_text"] is None


# ---------------------------------------------------------------------------
# Tests: POST process — DOCX
# ---------------------------------------------------------------------------

class TestProcessDocx:
    def test_process_docx_returns_completed(self):
        inv_id = _create_investigation("CAS-PROC-DOCX-001")
        docx_bytes = _make_docx_bytes([
            "Witness statement from Rajesh Kumar.",
            "Incident at Karol Bagh on 2026-08-15.",
        ])
        doc = _upload_file(inv_id, "statement.docx", docx_bytes,
                           "application/vnd.openxmlformats-officedocument.wordprocessingml.document")

        res = client.post(f"/investigations/{inv_id}/documents/{doc['id']}/process")
        assert res.status_code == 200
        data = res.json()
        assert data["processing_status"] == "COMPLETED"
        assert "Rajesh Kumar" in data["extracted_text"]
        assert "Karol Bagh" in data["extracted_text"]


# ---------------------------------------------------------------------------
# Tests: Edge cases
# ---------------------------------------------------------------------------

class TestProcessEdgeCases:
    def test_process_idempotent_completed_not_reprocessed(self):
        inv_id = _create_investigation("CAS-PROC-IDEM-001")
        content = b"Idempotency check content for processing."
        doc = _upload_file(inv_id, "idempotent.txt", content, "text/plain")

        # First call
        res1 = client.post(f"/investigations/{inv_id}/documents/{doc['id']}/process")
        assert res1.status_code == 200
        assert res1.json()["processing_status"] == "COMPLETED"
        first_text = res1.json()["extracted_text"]

        # Second call should be idempotent (returns COMPLETED, same text)
        res2 = client.post(f"/investigations/{inv_id}/documents/{doc['id']}/process")
        assert res2.status_code == 200
        assert res2.json()["processing_status"] == "COMPLETED"
        assert res2.json()["extracted_text"] == first_text

    def test_process_nonexistent_document_returns_404(self):
        inv_id = _create_investigation("CAS-PROC-404")
        res = client.post(f"/investigations/{inv_id}/documents/{uuid.uuid4()}/process")
        assert res.status_code == 404

    def test_process_nonexistent_investigation_returns_404(self):
        res = client.post(f"/investigations/{uuid.uuid4()}/documents/{uuid.uuid4()}/process")
        assert res.status_code == 404

    def test_processed_document_appears_in_listing(self):
        inv_id = _create_investigation("CAS-PROC-LIST-001")
        content = b"Listed document processed content."
        doc = _upload_file(inv_id, "listed.txt", content, "text/plain")

        client.post(f"/investigations/{inv_id}/documents/{doc['id']}/process")

        list_res = client.get(f"/investigations/{inv_id}/documents")
        assert list_res.status_code == 200
        docs = list_res.json()
        matching = [d for d in docs if d["id"] == doc["id"]]
        assert len(matching) == 1
        assert matching[0]["processing_status"] == "COMPLETED"
        assert matching[0]["extracted_text"] is not None

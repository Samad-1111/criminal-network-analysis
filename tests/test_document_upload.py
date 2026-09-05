"""Unit and integration tests for Document Upload feature."""

import io
from pathlib import Path
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from api import crud
from api.database import Base, get_db
from api.main import app
from api.services import document_storage


# In-memory SQLite for isolated test database execution
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
    """Setup isolated SQLite DB fixture and isolated upload directory fixture."""
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db

    # Redirect upload folder to temporary directory
    test_upload_dir = tmp_path / "uploads"
    monkeypatch.setattr(document_storage, "DEFAULT_UPLOAD_DIR", str(test_upload_dir))

    yield

    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()


client = TestClient(app)


def create_test_investigation(case_number: str = "CAS-TEST-UPLOAD-001") -> str:
    """Helper to create an investigation and return its ID string."""
    res = client.post("/investigations", json={
        "case_number": case_number,
        "title": "Upload Test Investigation",
        "description": "Case for document upload testing",
        "status": "OPEN",
    })
    assert res.status_code == 201
    return res.json()["id"]


def test_upload_pdf_success():
    inv_id = create_test_investigation("CAS-PDF-001")
    file_content = b"%PDF-1.4 Mock PDF Content For Testing Intelligence Document Upload"
    
    response = client.post(
        f"/investigations/{inv_id}/documents/upload",
        files={"file": ("intelligence_report.pdf", io.BytesIO(file_content), "application/pdf")},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["original_filename"] == "intelligence_report.pdf"
    assert data["file_type"] == "pdf"
    assert data["document_type"] == "PDF"
    assert data["file_size"] == len(file_content)
    assert data["processing_status"] == "PENDING"
    assert Path(data["storage_path"]).exists()


def test_upload_docx_success():
    inv_id = create_test_investigation("CAS-DOCX-001")
    file_content = b"PK\x03\x04 Mock DOCX file content binary data"

    response = client.post(
        f"/investigations/{inv_id}/documents/upload",
        files={"file": ("statement_witness.docx", io.BytesIO(file_content), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["original_filename"] == "statement_witness.docx"
    assert data["file_type"] == "docx"
    assert data["document_type"] == "DOCX"
    assert Path(data["storage_path"]).exists()


def test_upload_txt_success():
    inv_id = create_test_investigation("CAS-TXT-001")
    file_content = b"Suspect Vikram Sharma was spotted near Sector 18 Noida on 2026-09-01."

    response = client.post(
        f"/investigations/{inv_id}/documents/upload",
        files={"file": ("field_notes.txt", io.BytesIO(file_content), "text/plain")},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["original_filename"] == "field_notes.txt"
    assert data["file_type"] == "txt"
    assert data["document_type"] == "TXT"
    assert Path(data["storage_path"]).exists()


def test_upload_csv_success():
    inv_id = create_test_investigation("CAS-CSV-001")
    file_content = b"caller,receiver,duration_sec,timestamp\n+91-9876543210,+91-9123456789,120,2026-09-01T10:00:00"

    response = client.post(
        f"/investigations/{inv_id}/documents/upload",
        files={"file": ("call_records.csv", io.BytesIO(file_content), "text/csv")},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["original_filename"] == "call_records.csv"
    assert data["file_type"] == "csv"
    assert data["document_type"] == "CSV"
    assert Path(data["storage_path"]).exists()


def test_reject_unsupported_file_type():
    inv_id = create_test_investigation("CAS-UNSUPPORTED-001")
    file_content = b"Binary executable payload"

    response = client.post(
        f"/investigations/{inv_id}/documents/upload",
        files={"file": ("malicious_payload.exe", io.BytesIO(file_content), "application/x-msdownload")},
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert "Unsupported file type" in detail or "Allowed file types" in detail


def test_reject_empty_file():
    inv_id = create_test_investigation("CAS-EMPTY-001")
    empty_content = b""

    response = client.post(
        f"/investigations/{inv_id}/documents/upload",
        files={"file": ("empty_notes.txt", io.BytesIO(empty_content), "text/plain")},
    )

    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()


def test_reject_upload_non_existent_investigation():
    random_inv_id = str(uuid.uuid4())
    file_content = b"Valid content for non-existent case"

    response = client.post(
        f"/investigations/{random_inv_id}/documents/upload",
        files={"file": ("report.pdf", io.BytesIO(file_content), "application/pdf")},
    )

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_document_appears_in_document_listing():
    inv_id = create_test_investigation("CAS-LISTING-001")

    # Upload two documents
    client.post(
        f"/investigations/{inv_id}/documents/upload",
        files={"file": ("report1.pdf", io.BytesIO(b"Report 1 content"), "application/pdf")},
    )
    client.post(
        f"/investigations/{inv_id}/documents/upload",
        files={"file": ("data2.csv", io.BytesIO(b"col1,col2\nval1,val2"), "text/csv")},
    )

    # Get documents listing
    list_res = client.get(f"/investigations/{inv_id}/documents")
    assert list_res.status_code == 200
    docs = list_res.json()
    assert len(docs) == 2
    filenames = {d["original_filename"] for d in docs}
    assert "report1.pdf" in filenames
    assert "data2.csv" in filenames


def test_download_uploaded_document():
    inv_id = create_test_investigation("CAS-DOWNLOAD-001")
    content = b"Confidential Intelligence Briefing Content for Case Download Verification"

    upload_res = client.post(
        f"/investigations/{inv_id}/documents/upload",
        files={"file": ("briefing.pdf", io.BytesIO(content), "application/pdf")},
    )
    assert upload_res.status_code == 201
    doc_id = upload_res.json()["id"]

    download_res = client.get(f"/investigations/{inv_id}/documents/{doc_id}/download")
    assert download_res.status_code == 200
    assert download_res.content == content


def test_download_non_existent_document():
    inv_id = create_test_investigation("CAS-DOWNLOAD-404")
    dummy_doc_id = str(uuid.uuid4())

    download_res = client.get(f"/investigations/{inv_id}/documents/{dummy_doc_id}/download")
    assert download_res.status_code == 404


def test_transaction_cleanup_on_db_failure(monkeypatch):
    inv_id = create_test_investigation("CAS-CLEANUP-001")
    content = b"Content that should be unlinked if DB insert fails"

    # Simulate database insertion failure
    def mock_create_document_failure(db, investigation_id, document):
        raise RuntimeError("Database connection lost during commit")

    monkeypatch.setattr(crud, "create_document", mock_create_document_failure)

    saved_paths = []

    # Intercept save_document_file to record saved path
    orig_save = document_storage.save_document_file
    def intercept_save(upload_file, investigation_id, base_upload_dir=None):
        res = orig_save(upload_file, investigation_id, base_upload_dir)
        saved_paths.append(res["storage_path"])
        return res

    monkeypatch.setattr(document_storage, "save_document_file", intercept_save)

    upload_res = client.post(
        f"/investigations/{inv_id}/documents/upload",
        files={"file": ("test_fail.pdf", io.BytesIO(content), "application/pdf")},
    )

    assert upload_res.status_code == 500
    assert len(saved_paths) == 1
    # Verify file was cleaned up and no longer exists on disk
    assert not Path(saved_paths[0]).exists()

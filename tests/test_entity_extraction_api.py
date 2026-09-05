"""Integration tests for the Entity Extraction API endpoint.

Tests:
    POST /investigations/{id}/documents/{doc_id}/extract-entities

Uses an isolated in-memory SQLite database and a temporary upload directory.
"""

import io
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

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

def _create_investigation(case_number: str = "CAS-EXT-001") -> str:
    res = client.post("/investigations", json={
        "case_number": case_number,
        "title": "Entity Extraction Test Investigation",
        "description": "Integration test case",
        "status": "OPEN",
    })
    assert res.status_code == 201
    return res.json()["id"]


def _upload_txt_file(inv_id: str, filename: str, text: str) -> dict:
    content = text.encode("utf-8")
    res = client.post(
        f"/investigations/{inv_id}/documents/upload",
        files={"file": (filename, io.BytesIO(content), "text/plain")},
    )
    assert res.status_code == 201
    return res.json()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

TEST_NARRATIVE = (
    "Suspect Vikram Sharma alias Vicky was seen with Rahul Verma at Sector 62 Noida. "
    "Vehicle DL-01-AB-1234 was parked nearby. Contact number +91 98765 43210. "
    "FIR-2026-0045 regarding Robbery."
)


def test_extract_entities_from_processed_txt():
    """Verify entity extraction extracts and normalizes entities from processed document text."""
    inv_id = _create_investigation("CAS-EXT-001")
    doc = _upload_txt_file(inv_id, "report.txt", TEST_NARRATIVE)
    doc_id = doc["id"]

    # 1. Process document
    proc_res = client.post(f"/investigations/{inv_id}/documents/{doc_id}/process")
    assert proc_res.status_code == 200
    assert proc_res.json()["processing_status"] == "COMPLETED"

    # 2. Extract entities
    ext_res = client.post(f"/investigations/{inv_id}/documents/{doc_id}/extract-entities")
    assert ext_res.status_code == 200
    data = ext_res.json()

    assert data["entities_saved"] > 0
    assert data["entities_total"] == data["entities_saved"]
    assert len(data["entities"]) > 0

    # Critical check: normalized_value is NEVER None or empty
    for entity in data["entities"]:
        assert entity["normalized_value"] is not None
        assert len(entity["normalized_value"].strip()) > 0

    # Verify specific entity type normalizations
    types = {e["entity_type"] for e in data["entities"]}
    assert "Person" in types
    assert "Phone" in types
    assert "Location" in types
    assert "Vehicle" in types
    assert "Event" in types

    vehicle_entity = next(e for e in data["entities"] if e["entity_type"] == "Vehicle")
    assert vehicle_entity["normalized_value"] == "DL-01-AB-1234"


def test_entities_persisted_in_db():
    """Verify entities are persisted and accessible via GET /investigations/{id}/entities."""
    inv_id = _create_investigation("CAS-EXT-002")
    doc = _upload_txt_file(inv_id, "report2.txt", TEST_NARRATIVE)
    doc_id = doc["id"]

    client.post(f"/investigations/{inv_id}/documents/{doc_id}/process")
    ext_res = client.post(f"/investigations/{inv_id}/documents/{doc_id}/extract-entities")
    saved_count = ext_res.json()["entities_saved"]

    # Retrieve entities via DB query endpoint
    get_res = client.get(f"/investigations/{inv_id}/entities")
    assert get_res.status_code == 200
    entities = get_res.json()
    assert len(entities) == saved_count


def test_extract_entities_idempotent():
    """Verify calling extract-entities multiple times creates no duplicates."""
    inv_id = _create_investigation("CAS-EXT-003")
    doc = _upload_txt_file(inv_id, "report3.txt", TEST_NARRATIVE)
    doc_id = doc["id"]

    client.post(f"/investigations/{inv_id}/documents/{doc_id}/process")

    # First call
    res1 = client.post(f"/investigations/{inv_id}/documents/{doc_id}/extract-entities")
    data1 = res1.json()
    saved1 = data1["entities_saved"]
    total1 = data1["entities_total"]
    assert saved1 > 0

    # Second call
    res2 = client.post(f"/investigations/{inv_id}/documents/{doc_id}/extract-entities")
    data2 = res2.json()
    saved2 = data2["entities_saved"]
    total2 = data2["entities_total"]

    assert saved2 == 0  # No new entities saved
    assert total2 == total1  # Total entity count unchanged

    # Database check
    get_res = client.get(f"/investigations/{inv_id}/entities")
    assert len(get_res.json()) == total1


def test_extract_entities_not_processed():
    """Verify 400 error when document has not been processed yet."""
    inv_id = _create_investigation("CAS-EXT-004")
    doc = _upload_txt_file(inv_id, "pending.txt", TEST_NARRATIVE)
    doc_id = doc["id"]

    res = client.post(f"/investigations/{inv_id}/documents/{doc_id}/extract-entities")
    assert res.status_code == 400
    assert "not been successfully processed" in res.json()["detail"]


def test_extract_entities_document_not_found():
    """Verify 404 error for non-existent document ID."""
    inv_id = _create_investigation("CAS-EXT-005")
    fake_doc_id = str(uuid.uuid4())
    res = client.post(f"/investigations/{inv_id}/documents/{fake_doc_id}/extract-entities")
    assert res.status_code == 404


def test_extract_entities_wrong_investigation():
    """Verify 404 error when document does not belong to the given investigation."""
    inv_id1 = _create_investigation("CAS-EXT-006A")
    inv_id2 = _create_investigation("CAS-EXT-006B")
    doc = _upload_txt_file(inv_id1, "report.txt", TEST_NARRATIVE)
    doc_id = doc["id"]

    client.post(f"/investigations/{inv_id1}/documents/{doc_id}/process")

    res = client.post(f"/investigations/{inv_id2}/documents/{doc_id}/extract-entities")
    assert res.status_code == 404


def test_extract_entities_empty_text():
    """Verify 400 error when extracted_text is empty."""
    inv_id = _create_investigation("CAS-EXT-007")
    doc = _upload_txt_file(inv_id, "empty.txt", "   ")
    doc_id = doc["id"]

    client.post(f"/investigations/{inv_id}/documents/{doc_id}/process")

    res = client.post(f"/investigations/{inv_id}/documents/{doc_id}/extract-entities")
    assert res.status_code == 400
    assert "no extracted text" in res.json()["detail"]

"""Integration tests for Relationship Extraction & Real Investigation Graph API endpoints.

Tests:
    POST /investigations/{id}/documents/{doc_id}/extract-relationships
    GET  /investigations/{id}/relationships
    GET  /investigations/{id}/graph

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

def _create_investigation(case_number: str = "CAS-REL-001") -> str:
    res = client.post("/investigations", json={
        "case_number": case_number,
        "title": "Relationship Extraction Test Investigation",
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


TEST_NARRATIVE = (
    "Suspect Vikram Sharma called Rajesh Kumar on the evening of June 12. "
    "Rajesh Kumar was driving vehicle DL-01-AB-1234 towards Sector 62 Noida. "
    "Vikram Sharma was spotted at Sector 62 Noida."
)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_extract_relationships_end_to_end():
    """Test full workflow: Process document -> Extract entities -> Extract relationships -> Get Graph."""
    inv_id = _create_investigation("CAS-REL-001")
    doc = _upload_txt_file(inv_id, "evidence.txt", TEST_NARRATIVE)
    doc_id = doc["id"]

    # 1. Process document
    proc_res = client.post(f"/investigations/{inv_id}/documents/{doc_id}/process")
    assert proc_res.status_code == 200

    # 2. Extract entities
    ent_res = client.post(f"/investigations/{inv_id}/documents/{doc_id}/extract-entities")
    assert ent_res.status_code == 200
    assert ent_res.json()["entities_saved"] > 0

    # 3. Extract relationships
    rel_res = client.post(f"/investigations/{inv_id}/documents/{doc_id}/extract-relationships")
    assert rel_res.status_code == 200
    rel_data = rel_res.json()

    assert rel_data["relationships_saved"] > 0
    assert rel_data["relationships_total"] == rel_data["relationships_saved"]
    assert len(rel_data["relationships"]) > 0

    # Traceability check: source_document_id is attached to extracted relationships
    for rel in rel_data["relationships"]:
        assert rel["source_document_id"] == doc_id
        assert rel["relationship_type"] in (
            "CALLED", "OPERATES", "LOCATED_AT", "ASSOCIATED_WITH", "MET_WITH"
        )


def test_get_relationships_list():
    """Verify GET /investigations/{id}/relationships returns persisted edges."""
    inv_id = _create_investigation("CAS-REL-002")
    doc = _upload_txt_file(inv_id, "evidence2.txt", TEST_NARRATIVE)
    doc_id = doc["id"]

    client.post(f"/investigations/{inv_id}/documents/{doc_id}/process")
    client.post(f"/investigations/{inv_id}/documents/{doc_id}/extract-entities")
    rel_res = client.post(f"/investigations/{inv_id}/documents/{doc_id}/extract-relationships")
    saved_count = rel_res.json()["relationships_saved"]

    # Retrieve relationships
    get_res = client.get(f"/investigations/{inv_id}/relationships")
    assert get_res.status_code == 200
    rels = get_res.json()
    assert len(rels) == saved_count


def test_relationship_extraction_idempotent():
    """Verify calling extract-relationships twice creates no duplicate relationship rows."""
    inv_id = _create_investigation("CAS-REL-003")
    doc = _upload_txt_file(inv_id, "evidence3.txt", TEST_NARRATIVE)
    doc_id = doc["id"]

    client.post(f"/investigations/{inv_id}/documents/{doc_id}/process")
    client.post(f"/investigations/{inv_id}/documents/{doc_id}/extract-entities")

    # First call
    res1 = client.post(f"/investigations/{inv_id}/documents/{doc_id}/extract-relationships")
    data1 = res1.json()
    saved1 = data1["relationships_saved"]
    total1 = data1["relationships_total"]
    assert saved1 > 0

    # Second call
    res2 = client.post(f"/investigations/{inv_id}/documents/{doc_id}/extract-relationships")
    data2 = res2.json()
    saved2 = data2["relationships_saved"]
    total2 = data2["relationships_total"]

    assert saved2 == 0  # No new relationships saved
    assert total2 == total1  # Total count remains unchanged


def test_relationship_extraction_fewer_than_two_entities():
    """Verify graceful handling when investigation has fewer than 2 entities."""
    inv_id = _create_investigation("CAS-REL-004")
    # Text with only 1 entity
    doc = _upload_txt_file(inv_id, "single_entity.txt", "Vikram Sharma was present.")
    doc_id = doc["id"]

    client.post(f"/investigations/{inv_id}/documents/{doc_id}/process")
    client.post(f"/investigations/{inv_id}/documents/{doc_id}/extract-entities")

    res = client.post(f"/investigations/{inv_id}/documents/{doc_id}/extract-relationships")
    assert res.status_code == 200
    data = res.json()
    assert data["relationships_saved"] == 0
    assert data["relationships"] == []


def test_relationship_extraction_unprocessed_document():
    """Verify 400 error when document processing status is not COMPLETED."""
    inv_id = _create_investigation("CAS-REL-005")
    doc = _upload_txt_file(inv_id, "pending.txt", TEST_NARRATIVE)
    doc_id = doc["id"]

    res = client.post(f"/investigations/{inv_id}/documents/{doc_id}/extract-relationships")
    assert res.status_code == 400
    assert "not been successfully processed" in res.json()["detail"]


def test_relationship_extraction_not_found():
    """Verify 404 error for non-existent document or investigation."""
    inv_id = _create_investigation("CAS-REL-006")
    fake_doc_id = str(uuid.uuid4())
    res = client.post(f"/investigations/{inv_id}/documents/{fake_doc_id}/extract-relationships")
    assert res.status_code == 404


def test_real_investigation_graph_endpoint():
    """Verify GET /investigations/{id}/graph returns real nodes, edges, and network metrics."""
    inv_id = _create_investigation("CAS-REL-007")
    doc = _upload_txt_file(inv_id, "evidence_graph.txt", TEST_NARRATIVE)
    doc_id = doc["id"]

    client.post(f"/investigations/{inv_id}/documents/{doc_id}/process")
    client.post(f"/investigations/{inv_id}/documents/{doc_id}/extract-entities")
    client.post(f"/investigations/{inv_id}/documents/{doc_id}/extract-relationships")

    # Retrieve real graph
    graph_res = client.get(f"/investigations/{inv_id}/graph")
    assert graph_res.status_code == 200
    graph_data = graph_res.json()

    assert graph_data["investigation_id"] == inv_id
    assert len(graph_data["nodes"]) > 0
    assert len(graph_data["edges"]) > 0
    assert "total_nodes" in graph_data["metrics"]
    assert "density" in graph_data["metrics"]

    # Verify node structure
    sample_node = graph_data["nodes"][0]
    assert "id" in sample_node
    assert "label" in sample_node
    assert "entity_type" in sample_node
    assert "degree_centrality" in sample_node

    # Verify edge structure
    sample_edge = graph_data["edges"][0]
    assert "id" in sample_edge
    assert "source" in sample_edge
    assert "target" in sample_edge
    assert "relationship_type" in sample_edge
    assert sample_edge["source_document_id"] == doc_id

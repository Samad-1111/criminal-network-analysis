"""Integration tests for Database REST API endpoints in api/main.py."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from api.database import Base, get_db
from api.main import app


# Set up in-memory SQLite database for isolated test execution
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
def setup_test_database():
    """Create fresh database tables before each test and drop them afterwards."""
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    yield
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()


client = TestClient(app)


def test_create_and_get_investigation():
    # 1. Create investigation
    payload = {
        "case_number": "CAS-2026-TEST1",
        "title": "Operation Syndicate",
        "description": "Testing syndicate tracking",
        "status": "OPEN",
    }
    response = client.post("/investigations", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["case_number"] == "CAS-2026-TEST1"
    assert data["title"] == "Operation Syndicate"
    assert "id" in data
    inv_id = data["id"]

    # 2. Get list of investigations
    list_res = client.get("/investigations")
    assert list_res.status_code == 200
    items = list_res.json()
    assert len(items) == 1
    assert items[0]["id"] == inv_id

    # 3. Get single investigation
    get_res = client.get(f"/investigations/{inv_id}")
    assert get_res.status_code == 200
    assert get_res.json()["case_number"] == "CAS-2026-TEST1"


def test_duplicate_case_number_rejected():
    payload = {
        "case_number": "CAS-DUP-001",
        "title": "Case 1",
        "status": "OPEN",
    }
    res1 = client.post("/investigations", json=payload)
    assert res1.status_code == 201

    # Attempt to create duplicate
    res2 = client.post("/investigations", json=payload)
    assert res2.status_code == 400
    assert "already exists" in res2.json()["detail"]


def test_investigation_documents_crud():
    inv_res = client.post("/investigations", json={
        "case_number": "CAS-DOC-001",
        "title": "Document Investigation",
    })
    inv_id = inv_res.json()["id"]

    # Add document
    doc_payload = {
        "document_type": "CDR",
        "original_filename": "call_logs_feb.csv",
        "file_type": "csv",
        "processing_status": "COMPLETED",
    }
    doc_res = client.post(f"/investigations/{inv_id}/documents", json=doc_payload)
    assert doc_res.status_code == 201
    doc_data = doc_res.json()
    assert doc_data["original_filename"] == "call_logs_feb.csv"
    assert doc_data["investigation_id"] == inv_id

    # List documents
    list_res = client.get(f"/investigations/{inv_id}/documents")
    assert list_res.status_code == 200
    assert len(list_res.json()) == 1


def test_investigation_entities_and_relationships_crud():
    inv_res = client.post("/investigations", json={
        "case_number": "CAS-REL-001",
        "title": "Network Investigation",
    })
    inv_id = inv_res.json()["id"]

    # Add Entity 1
    ent1_res = client.post(f"/investigations/{inv_id}/entities", json={
        "entity_type": "Person",
        "name": "Vikram Sharma",
        "confidence": 0.95,
    })
    assert ent1_res.status_code == 201
    ent1_id = ent1_res.json()["id"]

    # Add Entity 2
    ent2_res = client.post(f"/investigations/{inv_id}/entities", json={
        "entity_type": "Phone",
        "name": "+91-9876543210",
        "confidence": 1.0,
    })
    assert ent2_res.status_code == 201
    ent2_id = ent2_res.json()["id"]

    # Add Relationship between Entity 1 and Entity 2
    rel_res = client.post(f"/investigations/{inv_id}/relationships", json={
        "source_entity_id": ent1_id,
        "target_entity_id": ent2_id,
        "relationship_type": "OWNS_PHONE",
        "confidence": 0.9,
    })
    assert rel_res.status_code == 201
    rel_data = rel_res.json()
    assert rel_data["relationship_type"] == "OWNS_PHONE"
    assert rel_data["source_entity_id"] == ent1_id

    # List relationships
    rel_list_res = client.get(f"/investigations/{inv_id}/relationships")
    assert rel_list_res.status_code == 200
    assert len(rel_list_res.json()) == 1


def test_delete_investigation():
    inv_res = client.post("/investigations", json={
        "case_number": "CAS-DEL-001",
        "title": "Delete Case",
    })
    inv_id = inv_res.json()["id"]

    del_res = client.delete(f"/investigations/{inv_id}")
    assert del_res.status_code == 204

    # Verify not found after delete
    get_res = client.get(f"/investigations/{inv_id}")
    assert get_res.status_code == 404

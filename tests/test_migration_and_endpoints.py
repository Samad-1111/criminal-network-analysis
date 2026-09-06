"""Regression tests for Database Migrations, Investigation Graph, and Next-Best-Actions API Endpoints."""

import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from api.database import Base, get_db, run_migrations
from api.main import app
from api import crud

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
    Base.metadata.create_all(bind=engine)
    run_migrations()
    app.dependency_overrides[get_db] = override_get_db
    yield
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()


client = TestClient(app)


def test_migration_adds_missing_columns():
    """Verify run_migrations safely adds missing columns on existing tables."""
    # Ensure run_migrations does not raise errors on an existing database schema
    run_migrations()
    with engine.connect() as conn:
        res = conn.execute(text("PRAGMA table_info(relationships)")).fetchall()
        col_names = [r[1] for r in res]
        assert "evidence_snippet" in col_names
        assert "source_document_id" in col_names


def test_get_investigation_graph_empty_and_not_found():
    """Verify graph endpoint returns 404 for non-existent case and 200 empty graph for empty case."""
    random_id = str(uuid.uuid4())
    res = client.get(f"/investigations/{random_id}/graph")
    assert res.status_code == 404

    # Create an empty investigation
    inv_res = client.post("/investigations", json={"case_number": f"GRAPH-EMP-{uuid.uuid4().hex[:6]}", "title": "Empty Graph Test"})
    assert inv_res.status_code == 201
    inv_id = inv_res.json()["id"]

    res_empty = client.get(f"/investigations/{inv_id}/graph")
    assert res_empty.status_code == 200
    data = res_empty.json()
    assert data["investigation_id"] == inv_id
    assert data["nodes"] == []
    assert data["edges"] == []
    assert data["metrics"]["total_nodes"] == 0


def test_get_investigation_graph_entity_only():
    """Verify graph endpoint handles entity-only investigation (no relationships)."""
    inv_res = client.post("/investigations", json={"case_number": f"GRAPH-ENT-{uuid.uuid4().hex[:6]}", "title": "Entity Only Test"})
    inv_id = inv_res.json()["id"]

    db = TestingSessionLocal()
    try:
        crud.get_or_create_entity(db, uuid.UUID(inv_id), "Person", "Rajesh Kumar", "rajesh kumar", 1.0)
        crud.get_or_create_entity(db, uuid.UUID(inv_id), "Location", "Noida", "noida", 1.0)
    finally:
        db.close()

    res = client.get(f"/investigations/{inv_id}/graph")
    assert res.status_code == 200
    data = res.json()
    assert len(data["nodes"]) == 2
    assert len(data["edges"]) == 0


def test_get_investigation_graph_with_relationships_null_and_populated_snippets():
    """Verify graph endpoint handles relationships with null and populated evidence_snippet."""
    inv_res = client.post("/investigations", json={"case_number": f"GRAPH-REL-{uuid.uuid4().hex[:6]}", "title": "Relationships Test"})
    inv_id = inv_res.json()["id"]
    inv_uuid = uuid.UUID(inv_id)

    db = TestingSessionLocal()
    try:
        e1, _ = crud.get_or_create_entity(db, inv_uuid, "Person", "Rajesh Kumar", "rajesh kumar", 1.0)
        e2, _ = crud.get_or_create_entity(db, inv_uuid, "Vehicle", "DL-01-AB-1234", "DL-01-AB-1234", 1.0)
        e3, _ = crud.get_or_create_entity(db, inv_uuid, "Location", "Noida", "noida", 1.0)

        # Relationship 1: Null evidence_snippet
        crud.get_or_create_relationship(db, inv_uuid, e1.id, e2.id, "OPERATES", 0.95, evidence_snippet=None)
        # Relationship 2: Populated evidence_snippet
        crud.get_or_create_relationship(db, inv_uuid, e1.id, e3.id, "LOCATED_AT", 0.85, evidence_snippet="Rajesh Kumar was seen near Noida.")
    finally:
        db.close()

    res = client.get(f"/investigations/{inv_id}/graph")
    assert res.status_code == 200
    data = res.json()
    assert len(data["nodes"]) == 3
    assert len(data["edges"]) == 2
    snippets = [edge.get("evidence_snippet") for edge in data["edges"]]
    assert None in snippets
    assert "Rajesh Kumar was seen near Noida." in snippets


def test_get_investigation_next_best_actions_read_only_and_non_mutating():
    """Verify next-best-actions endpoint works without error and is strictly read-only."""
    inv_res = client.post("/investigations", json={"case_number": f"NBA-TEST-{uuid.uuid4().hex[:6]}", "title": "NBA Read-Only Test"})
    inv_id = inv_res.json()["id"]
    inv_uuid = uuid.UUID(inv_id)

    db = TestingSessionLocal()
    try:
        e1, _ = crud.get_or_create_entity(db, inv_uuid, "Person", "Rajesh Kumar", "rajesh kumar", 1.0)
        e2, _ = crud.get_or_create_entity(db, inv_uuid, "Vehicle", "DL-01-AB-1234", "DL-01-AB-1234", 1.0)
        crud.get_or_create_relationship(db, inv_uuid, e1.id, e2.id, "OPERATES", 0.95, evidence_snippet="Rajesh drove DL-01-AB-1234")
    finally:
        db.close()

    # Call endpoint multiple times
    res1 = client.get(f"/investigations/{inv_id}/next-best-actions")
    assert res1.status_code == 200

    res2 = client.get(f"/investigations/{inv_id}/next-best-actions")
    assert res2.status_code == 200

    # Check entities and relationships count remains unchanged
    db = TestingSessionLocal()
    try:
        entities = crud.get_entities(db, inv_uuid)
        relationships = crud.get_relationships(db, inv_uuid)
        assert len(entities) == 2
        assert len(relationships) == 1
    finally:
        db.close()


def test_cors_headers_present():
    """Verify CORS headers are present on API responses."""
    res = client.get("/", headers={"Origin": "http://localhost:5173"})
    assert res.status_code == 200
    assert "access-control-allow-origin" in res.headers

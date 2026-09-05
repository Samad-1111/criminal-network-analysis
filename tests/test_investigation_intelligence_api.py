"""Integration tests for GET /investigations/{id}/next-best-actions endpoint.

Tests:
    GET /investigations/{id}/next-best-actions
        - Real recommendations generated from database entities & relationships
        - 404 for non-existent investigation
        - Empty investigation returns graceful 0-recommendation response
        - Idempotency: repeated calls do not mutate database
        - max_recommendations query parameter is respected

Uses an isolated in-memory SQLite database and a temporary upload directory.
"""

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
# Helper utilities
# ---------------------------------------------------------------------------

def _create_investigation(case_number: str = None) -> dict:
    """Create a new investigation and return its JSON response."""
    case_number = case_number or f"INT-TEST-{uuid.uuid4().hex[:8].upper()}"
    payload = {
        "case_number": case_number,
        "title": "Test NBA Investigation",
        "description": "NBA integration test investigation",
        "status": "OPEN",
    }
    resp = client.post("/investigations", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_entity(inv_id: str, name: str, entity_type: str = "Person", confidence: float = 0.9) -> dict:
    """Add an entity directly to an investigation and return its JSON response."""
    payload = {
        "entity_type": entity_type,
        "name": name,
        "normalized_value": name.lower(),
        "confidence": confidence,
    }
    resp = client.post(f"/investigations/{inv_id}/entities", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_relationship(
    inv_id: str,
    src_id: str,
    tgt_id: str,
    rel_type: str = "ASSOCIATE_OF",
    confidence: float = 0.85,
) -> dict:
    """Add a relationship between two entities and return its JSON response."""
    payload = {
        "source_entity_id": src_id,
        "target_entity_id": tgt_id,
        "relationship_type": rel_type,
        "confidence": confidence,
    }
    resp = client.post(f"/investigations/{inv_id}/relationships", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _get_nba(inv_id: str, max_recommendations: int = 10):
    """GET next-best-actions for an investigation."""
    return client.get(
        f"/investigations/{inv_id}/next-best-actions",
        params={"max_recommendations": max_recommendations},
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestNBAEndpointNotFound:
    """404 behaviour when investigation does not exist."""

    def test_nonexistent_investigation_returns_404(self):
        fake_id = str(uuid.uuid4())
        resp = _get_nba(fake_id)
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()


class TestNBAEmptyInvestigation:
    """When an investigation has no entities, return empty recommendations gracefully."""

    def test_empty_investigation_returns_zero_recommendations(self):
        inv = _create_investigation()
        resp = _get_nba(inv["id"])
        assert resp.status_code == 200
        data = resp.json()
        assert data["investigation_id"] == inv["id"]
        assert data["recommendation_summary"]["total_recommendations"] == 0
        assert data["recommendations"] == []
        assert data["network_summary"]["total_nodes"] == 0
        assert data["network_summary"]["total_edges"] == 0

    def test_empty_investigation_response_shape(self):
        inv = _create_investigation()
        resp = _get_nba(inv["id"])
        data = resp.json()
        assert "investigation_id" in data
        assert "network_summary" in data
        assert "recommendation_summary" in data
        assert "recommendations" in data


class TestNBAWithRealEvidence:
    """Recommendations generated from actual entities and relationships."""

    def test_returns_recommendations_when_entities_and_relationships_exist(self):
        inv = _create_investigation()
        ent_a = _create_entity(inv["id"], "Vikram Sharma", "Person", confidence=0.9)
        ent_b = _create_entity(inv["id"], "Rajesh Kumar", "Person", confidence=0.85)
        _create_relationship(inv["id"], ent_a["id"], ent_b["id"], "ASSOCIATE_OF", confidence=0.85)

        resp = _get_nba(inv["id"])
        assert resp.status_code == 200
        data = resp.json()
        assert data["recommendation_summary"]["total_recommendations"] >= 1
        assert len(data["recommendations"]) >= 1

    def test_recommendation_structure_is_valid(self):
        inv = _create_investigation()
        ent_a = _create_entity(inv["id"], "Amit Verma", "Person", confidence=0.9)
        ent_b = _create_entity(inv["id"], "Sanjay Mishra", "Person", confidence=0.8)
        _create_relationship(inv["id"], ent_a["id"], ent_b["id"], "CALLED", confidence=0.75)

        resp = _get_nba(inv["id"])
        assert resp.status_code == 200
        recs = resp.json()["recommendations"]
        assert len(recs) >= 1

        rec = recs[0]
        assert "recommendation_id" in rec
        assert "priority_score" in rec
        assert "priority_level" in rec
        assert rec["priority_level"] in ("CRITICAL", "HIGH", "MEDIUM", "LOW")
        assert "title" in rec
        assert "reasons" in rec
        assert isinstance(rec["reasons"], list)
        assert "target_entities" in rec
        assert isinstance(rec["target_entities"], list)
        assert "supporting_evidence" in rec
        assert "score_breakdown" in rec

    def test_network_summary_reflects_real_entities(self):
        inv = _create_investigation()
        ent_a = _create_entity(inv["id"], "Person Alpha", "Person", 0.9)
        ent_b = _create_entity(inv["id"], "Person Beta", "Person", 0.85)
        ent_c = _create_entity(inv["id"], "Location Delta", "Location", 0.7)
        _create_relationship(inv["id"], ent_a["id"], ent_b["id"], "ASSOCIATE_OF", 0.8)

        resp = _get_nba(inv["id"])
        assert resp.status_code == 200
        summary = resp.json()["network_summary"]
        assert summary["total_nodes"] >= 3
        assert summary["total_edges"] >= 1

    def test_low_confidence_relationship_triggers_evidence_review_lead(self):
        inv = _create_investigation()
        ent_a = _create_entity(inv["id"], "Suspect One", "Person", 0.9)
        ent_b = _create_entity(inv["id"], "Suspect Two", "Person", 0.85)
        _create_relationship(inv["id"], ent_a["id"], ent_b["id"], "POSSIBLE_CONTACT", confidence=0.55)

        resp = _get_nba(inv["id"])
        assert resp.status_code == 200
        recs = resp.json()["recommendations"]
        action_types = [r["action_type"] for r in recs]
        assert "REVIEW_LOW_CONFIDENCE_EVIDENCE" in action_types

    def test_phone_entity_generates_recommendation(self):
        inv = _create_investigation()
        ent_person = _create_entity(inv["id"], "Caller Person", "Person", 0.9)
        ent_phone = _create_entity(inv["id"], "+91-9876543210", "Phone", 0.95)
        _create_relationship(inv["id"], ent_person["id"], ent_phone["id"], "CALLED", 0.9)

        resp = _get_nba(inv["id"])
        assert resp.status_code == 200
        data = resp.json()
        assert data["recommendation_summary"]["total_recommendations"] >= 1


class TestNBAMaxRecommendations:
    """max_recommendations query parameter is respected."""

    def test_max_recommendations_limit_is_respected(self):
        inv = _create_investigation()
        # Create 5 entities all connected to entity_a to ensure many candidates
        ent_a = _create_entity(inv["id"], "Hub Entity", "Person", 0.9)
        for i in range(5):
            ent_b = _create_entity(inv["id"], f"Person {i}", "Person", 0.8)
            _create_relationship(inv["id"], ent_a["id"], ent_b["id"], "ASSOCIATE_OF", 0.8)

        resp = client.get(
            f"/investigations/{inv['id']}/next-best-actions",
            params={"max_recommendations": 2},
        )
        assert resp.status_code == 200
        recs = resp.json()["recommendations"]
        assert len(recs) <= 2

    def test_default_max_is_ten(self):
        inv = _create_investigation()
        ent_a = _create_entity(inv["id"], "Central Figure", "Person", 0.9)
        for i in range(6):
            ent_b = _create_entity(inv["id"], f"Associate {i}", "Person", 0.8)
            _create_relationship(inv["id"], ent_a["id"], ent_b["id"], "ASSOCIATE_OF", 0.75)

        resp = client.get(f"/investigations/{inv['id']}/next-best-actions")
        assert resp.status_code == 200
        assert len(resp.json()["recommendations"]) <= 10


class TestNBAIdempotency:
    """Repeated calls must not mutate any database records."""

    def test_repeated_calls_do_not_change_entity_count(self):
        inv = _create_investigation()
        ent_a = _create_entity(inv["id"], "Idempotent Person A", "Person", 0.9)
        ent_b = _create_entity(inv["id"], "Idempotent Person B", "Person", 0.85)
        _create_relationship(inv["id"], ent_a["id"], ent_b["id"], "CALLED", 0.8)

        # Call NBA three times
        for _ in range(3):
            resp = _get_nba(inv["id"])
            assert resp.status_code == 200

        # Verify entity count is unchanged
        entities_resp = client.get(f"/investigations/{inv['id']}/entities")
        assert entities_resp.status_code == 200
        assert len(entities_resp.json()) == 2

    def test_repeated_calls_produce_same_recommendation_count(self):
        inv = _create_investigation()
        ent_a = _create_entity(inv["id"], "Stable Person A", "Person", 0.9)
        ent_b = _create_entity(inv["id"], "Stable Person B", "Person", 0.85)
        _create_relationship(inv["id"], ent_a["id"], ent_b["id"], "ASSOCIATE_OF", 0.9)

        first = _get_nba(inv["id"]).json()["recommendation_summary"]["total_recommendations"]
        second = _get_nba(inv["id"]).json()["recommendation_summary"]["total_recommendations"]
        assert first == second


class TestNBAInvestigationRanking:
    """Recommendations are ranked correctly with investigation_rank field."""

    def test_recommendations_have_sequential_investigation_rank(self):
        inv = _create_investigation()
        ent_a = _create_entity(inv["id"], "Rank Test Alpha", "Person", 0.9)
        ent_b = _create_entity(inv["id"], "Rank Test Beta", "Person", 0.85)
        _create_relationship(inv["id"], ent_a["id"], ent_b["id"], "CALLED", 0.9)

        resp = _get_nba(inv["id"])
        assert resp.status_code == 200
        recs = resp.json()["recommendations"]
        ranks = [r.get("investigation_rank") for r in recs]
        assert ranks == list(range(1, len(recs) + 1))

    def test_top_ranked_recommendation_is_rank_1(self):
        inv = _create_investigation()
        ent_a = _create_entity(inv["id"], "Top Ranked Person", "Person", 0.95)
        ent_b = _create_entity(inv["id"], "Secondary Person", "Person", 0.7)
        _create_relationship(inv["id"], ent_a["id"], ent_b["id"], "ASSOCIATE_OF", 0.9)

        resp = _get_nba(inv["id"])
        assert resp.status_code == 200
        recs = resp.json()["recommendations"]
        assert recs[0]["investigation_rank"] == 1
        assert recs[0]["recommendation_id"] == "NBA-001"

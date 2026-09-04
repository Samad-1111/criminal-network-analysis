"""API integration tests using FastAPI TestClient."""
import pytest
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)


def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert "entity_types_supported" in data
    assert "CONFIRMED" in data["identity_statuses"]


def test_get_synthetic_data():
    response = client.get("/data/synthetic")
    assert response.status_code == 200
    data = response.json()
    assert data["total_records"] > 0
    assert isinstance(data["records"], list)


def test_extract_entities_endpoint():
    payload = {
        "text": "Suspect Vikram Sharma alias Vicky was operating vehicle DL-01-AB-1234 and called +91-9876543210 in Sector 18 Noida."
    }
    response = client.post("/pipeline/extract-entities", json=payload)
    assert response.status_code == 200
    data = response.json()
    extracted = data["extracted_entities"]
    assert len(extracted["phones"]) >= 1
    assert len(extracted["vehicles"]) >= 1


def test_extract_entities_empty_text_error():
    response = client.post("/pipeline/extract-entities", json={"text": "   "})
    assert response.status_code == 400


def test_compare_identities_endpoint():
    payload = {
        "entity_a": {"entity_type": "Person", "name": "Vikram Sharma", "phone": "+91-9876543210"},
        "entity_b": {"entity_type": "Person", "name": "Vikram S.", "phone": "+91-9876543210"},
    }
    response = client.post("/pipeline/compare-identities", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "CONFIRMED"
    assert data["confidence"] == 1.0


def test_resolve_dataset_endpoint():
    payload = {
        "entities": [
            {"entity_type": "Person", "name": "Vikram Sharma", "phone": "+91-9876543210"},
            {"entity_type": "Person", "name": "Vikram S.", "phone": "+91-9876543210"},
            {"entity_type": "Person", "name": "Mohit Gupta", "phone": "+91-9833445566"},
        ],
        "min_threshold": 0.70,
    }
    response = client.post("/pipeline/resolve-dataset", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["matches_found"] >= 1


def test_build_graph_endpoint():
    response = client.post("/pipeline/build-graph", json={})
    assert response.status_code == 200
    data = response.json()
    assert "nodes" in data
    assert "edges" in data
    assert "metrics" in data

    # Ensure edge evidence metadata exists
    first_edge = data["edges"][0]
    assert "source_record_id" in first_edge
    assert "relationship_type" in first_edge
    assert "timestamp" in first_edge
    assert "confidence" in first_edge


def test_find_connection_endpoint():
    payload = {
        "source": "Vikram Sharma",
        "target": "Amit Verma",
    }
    response = client.post("/pipeline/find-connection", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["found"] is True
    assert len(data["evidence_chain"]) >= 1


def test_analyze_network_full_endpoint():
    response = client.post("/pipeline/analyze-network")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["total_records_processed"] > 0
    assert "network" in data
    assert "key_suspects_ranked" in data

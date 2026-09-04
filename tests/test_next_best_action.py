"""Unit and integration tests for Next-Best-Action Recommendation Engine and Relative Ranking."""
import pytest
from fastapi.testclient import TestClient

from api.main import app
from pipeline.next_best_action import (
    generate_next_best_actions,
    compute_priority_score,
    calculate_time_sensitivity,
    parse_timestamp_safe,
    _recommendation_sort_key,
    ACTION_INVESTIGATE_HIGH_VALUE_ENTITY,
    ACTION_REVIEW_NETWORK_CONNECTOR,
    ACTION_REVIEW_LOW_CONFIDENCE_EVIDENCE,
    ACTION_VERIFY_AMBIGUOUS_IDENTITY,
)

client = TestClient(app)


def test_empty_graph_returns_safely():
    """Empty graph input should return a valid empty recommendation structure."""
    result = generate_next_best_actions({})
    assert "summary" in result
    assert "recommendations" in result
    assert result["summary"]["total_recommendations"] == 0
    assert result["summary"]["top_recommendation_id"] is None
    assert result["recommendations"] == []

    result_none = generate_next_best_actions(None)
    assert result_none["summary"]["total_recommendations"] == 0
    assert result_none["summary"]["top_recommendation_id"] is None


def test_isolated_nodes_no_edges():
    """Graph with isolated nodes (0 connections) should return safely."""
    network = {
        "nodes": [
            {"id": "person:alice", "label": "Alice", "entity_type": "Person", "degree_centrality": 0.0, "betweenness_centrality": 0.0},
            {"id": "person:bob", "label": "Bob", "entity_type": "Person", "degree_centrality": 0.0, "betweenness_centrality": 0.0},
        ],
        "edges": [],
        "metrics": {"total_nodes": 2, "total_edges": 0, "total_components": 2},
    }
    result = generate_next_best_actions(network)
    assert result["summary"]["total_recommendations"] == 0
    assert len(result["recommendations"]) == 0


def test_small_network_relative_ranking():
    """Small network with low connection counts (e.g. 1 or 2 connections) should still rank recommendations."""
    network = {
        "nodes": [
            {"id": "person:a", "label": "Entity A", "entity_type": "Person", "degree_centrality": 0.67, "betweenness_centrality": 0.33},
            {"id": "person:b", "label": "Entity B", "entity_type": "Person", "degree_centrality": 0.67, "betweenness_centrality": 0.33},
            {"id": "person:c", "label": "Entity C", "entity_type": "Person", "degree_centrality": 0.33, "betweenness_centrality": 0.0},
            {"id": "person:d", "label": "Entity D", "entity_type": "Person", "degree_centrality": 0.33, "betweenness_centrality": 0.0},
        ],
        "edges": [
            {"source": "person:a", "target": "person:c", "confidence": 0.90, "relationship_type": "ASSOCIATED_WITH", "source_record_id": "REC-1"},
            {"source": "person:a", "target": "person:b", "confidence": 0.90, "relationship_type": "ASSOCIATED_WITH", "source_record_id": "REC-1"},
            {"source": "person:b", "target": "person:d", "confidence": 0.90, "relationship_type": "ASSOCIATED_WITH", "source_record_id": "REC-2"},
        ],
        "metrics": {"total_nodes": 4, "total_edges": 3},
    }
    result = generate_next_best_actions(network)
    recs = result["recommendations"]

    # All connected entities should be evaluated without arbitrary hard-coded exclusions
    assert len(recs) >= 3
    # Check investigation rank assignment
    for idx, r in enumerate(recs, start=1):
        assert r["investigation_rank"] == idx
        assert r["ranking_context"]["investigation_rank"] == idx
        assert 0.0 < r["relative_rank_percentile"] <= 1.0
        assert r["ranking_context"]["total_recommendations"] == len(recs)
        assert "Ranked #" in r["reasons"][0]

    assert recs[0]["investigation_rank"] == 1
    assert recs[0]["relative_rank_percentile"] == 1.0


def test_large_network_ranking():
    """In a larger network, high-connectivity and high-importance entities rank above weaker leads."""
    nodes = []
    edges = []
    # Hub node with 10 connections
    nodes.append({"id": "phone:master", "label": "+91-9999999999", "entity_type": "Phone", "degree_centrality": 0.90, "betweenness_centrality": 0.40})
    for i in range(1, 11):
        p_id = f"person:sub_{i}"
        nodes.append({"id": p_id, "label": f"Sub Person {i}", "entity_type": "Person", "degree_centrality": 0.10, "betweenness_centrality": 0.0})
        edges.append({
            "source": "phone:master",
            "target": p_id,
            "confidence": 0.95,
            "relationship_type": "CALLED",
            "source_record_id": f"REC-{i}",
            "timestamp": "2024-04-01T12:00:00Z",
        })

    network = {"nodes": nodes, "edges": edges, "metrics": {"total_nodes": 11, "total_edges": 10}}
    result = generate_next_best_actions(network, max_recommendations=5)
    recs = result["recommendations"]

    assert len(recs) == 5
    assert recs[0]["investigation_rank"] == 1
    assert recs[0]["target_entities"][0]["label"] == "+91-9999999999"
    assert recs[0]["priority_score"] > recs[1]["priority_score"]


def test_rank_order_consistency():
    """Verify investigation_rank 1 has priority_score >= rank 2 >= rank 3."""
    network = {
        "nodes": [
            {"id": "person:p1", "label": "Person 1", "entity_type": "Person", "degree_centrality": 0.8, "betweenness_centrality": 0.2},
            {"id": "person:p2", "label": "Person 2", "entity_type": "Person", "degree_centrality": 0.4, "betweenness_centrality": 0.1},
            {"id": "person:p3", "label": "Person 3", "entity_type": "Person", "degree_centrality": 0.2, "betweenness_centrality": 0.0},
        ],
        "edges": [
            {"source": "person:p1", "target": "person:p2", "confidence": 0.90, "relationship_type": "ASSOCIATED", "source_record_id": "R1"},
            {"source": "person:p1", "target": "person:p3", "confidence": 0.85, "relationship_type": "ASSOCIATED", "source_record_id": "R2"},
        ],
        "metrics": {"total_nodes": 3, "total_edges": 2},
    }
    result = generate_next_best_actions(network)
    recs = result["recommendations"]

    for i in range(len(recs) - 1):
        assert recs[i]["investigation_rank"] == i + 1
        assert recs[i]["priority_score"] >= recs[i + 1]["priority_score"]


def test_deterministic_tie_breaking():
    """Identical scores should resolve deterministically using network importance, evidence, and stable IDs."""
    network = {
        "nodes": [
            {"id": "person:beta", "label": "Beta", "entity_type": "Person", "degree_centrality": 0.5, "betweenness_centrality": 0.0},
            {"id": "person:alpha", "label": "Alpha", "entity_type": "Person", "degree_centrality": 0.5, "betweenness_centrality": 0.0},
        ],
        "edges": [
            {"source": "person:beta", "target": "person:other1", "confidence": 0.90, "relationship_type": "MET", "source_record_id": "R1"},
            {"source": "person:alpha", "target": "person:other2", "confidence": 0.90, "relationship_type": "MET", "source_record_id": "R1"},
        ],
        "metrics": {"total_nodes": 4, "total_edges": 2},
    }
    result1 = generate_next_best_actions(network)
    result2 = generate_next_best_actions(network)

    recs1 = result1["recommendations"]
    recs2 = result2["recommendations"]

    assert len(recs1) == len(recs2)
    # Order must be strictly identical across invocations
    for r1, r2 in zip(recs1, recs2):
        assert r1["recommendation_id"] == r2["recommendation_id"]
        assert r1["target_entities"][0]["id"] == r2["target_entities"][0]["id"]
        assert r1["investigation_rank"] == r2["investigation_rank"]


def test_identity_recommendation_ranking():
    """AMBIGUOUS and POSSIBLE identity matches generate VERIFY_AMBIGUOUS_IDENTITY and receive investigation ranks."""
    network = {"nodes": [], "edges": [], "metrics": {}}
    identity_candidates = [
        {
            "entity_a": {"entity_type": "Person", "name": "Vikram Sharma"},
            "entity_b": {"entity_type": "Person", "name": "V. Sharma"},
            "confidence": 0.78,
            "status": "AMBIGUOUS",
            "reasons": ["Moderate fuzzy similarity (78.0%)"],
        },
        {
            "entity_a": {"entity_type": "Person", "name": "Amit Verma"},
            "entity_b": {"entity_type": "Person", "name": "Amit V."},
            "confidence": 0.88,
            "status": "POSSIBLE",
            "reasons": ["High fuzzy similarity (88.0%)"],
        },
        {
            "entity_a": {"entity_type": "Person", "name": "Rahul Rao"},
            "entity_b": {"entity_type": "Person", "name": "Rahul Rao"},
            "confidence": 1.0,
            "status": "CONFIRMED",
            "reasons": ["Exact match"],
        },
    ]

    result = generate_next_best_actions(network, identity_results=identity_candidates)
    recs = result["recommendations"]

    assert len(recs) == 2
    for r in recs:
        assert r["action_type"] == ACTION_VERIFY_AMBIGUOUS_IDENTITY
        assert "investigation_rank" in r
        assert "relative_rank_percentile" in r
        assert r["ranking_context"]["category_candidate_count"] == 2


def test_low_confidence_evidence_recommendation_ranking():
    """Low-confidence edges receive ranks and proper context."""
    network = {
        "nodes": [
            {"id": "person:vikram", "label": "Vikram Sharma", "entity_type": "Person", "degree_centrality": 0.1, "betweenness_centrality": 0.0},
            {"id": "person:rajesh", "label": "Rajesh Kumar", "entity_type": "Person", "degree_centrality": 0.1, "betweenness_centrality": 0.0},
        ],
        "edges": [
            {
                "source": "person:vikram",
                "target": "person:rajesh",
                "confidence": 0.55,
                "relationship_type": "UNVERIFIED_ASSOCIATE",
                "source_record_id": "FIR-2024-55",
                "timestamp": "2024-01-10T12:00:00Z",
            }
        ],
        "metrics": {"total_nodes": 2, "total_edges": 1},
    }
    result = generate_next_best_actions(network)
    low_conf_recs = [r for r in result["recommendations"] if r["action_type"] == ACTION_REVIEW_LOW_CONFIDENCE_EVIDENCE]
    assert len(low_conf_recs) == 1
    rec = low_conf_recs[0]
    assert rec["investigation_rank"] >= 1
    assert rec["ranking_context"]["category_rank"] == 1
    assert rec["ranking_context"]["category_candidate_count"] == 1


def test_timestamp_safe_parsing_and_zero_sensitivity():
    """Unknown, null, or invalid timestamps should yield 0.0 time sensitivity."""
    assert parse_timestamp_safe(None) is None
    assert parse_timestamp_safe("UNKNOWN") is None
    assert parse_timestamp_safe("UNKNOWN_TIME") is None
    assert parse_timestamp_safe("") is None

    assert calculate_time_sensitivity(["UNKNOWN", None, ""]) == 0.0
    assert calculate_time_sensitivity(["2024-03-15T14:30:00Z"]) > 0.0


def test_fastapi_next_best_actions_endpoint():
    """Test POST /pipeline/next-best-actions returns ranking fields and summary metadata."""
    response = client.post("/pipeline/next-best-actions", json={})
    assert response.status_code == 200
    data = response.json()

    assert "network_summary" in data
    assert "recommendation_summary" in data
    assert "recommendations" in data

    assert data["network_summary"]["total_nodes"] > 0
    assert data["recommendation_summary"]["total_recommendations"] > 0
    assert "top_recommendation_id" in data["recommendation_summary"]

    for rec in data["recommendations"]:
        assert "investigation_rank" in rec
        assert "relative_rank_percentile" in rec
        assert "priority_score" in rec
        assert "priority_level" in rec
        assert "score_breakdown" in rec
        assert "ranking_context" in rec
        assert rec["investigation_rank"] >= 1
        assert 0.0 <= rec["relative_rank_percentile"] <= 1.0


def test_fastapi_next_best_actions_with_custom_records_and_identities():
    """Test POST /pipeline/next-best-actions with custom records and identity candidates."""
    payload = {
        "records": [
            {
                "record_id": "REC-01",
                "timestamp": "2024-02-10T10:00:00Z",
                "entities": [
                    {"entity_type": "Person", "name": "Deepak Kumar", "phone": "+91-9988776655"},
                    {"entity_type": "Person", "name": "Suraj Pal", "phone": "+91-9911223344"},
                ],
                "relationships": [
                    {
                        "source": "Deepak Kumar",
                        "target": "Suraj Pal",
                        "relationship_type": "SUSPECTED_ACCOMPLICE",
                        "confidence": 0.60,
                    }
                ],
            }
        ],
        "identity_results": [
            {
                "entity_a": {"entity_type": "Person", "name": "Deepak Kumar"},
                "entity_b": {"entity_type": "Person", "name": "Deepak K."},
                "confidence": 0.82,
                "status": "AMBIGUOUS",
                "reasons": ["Fuzzy similarity"],
            }
        ],
        "max_recommendations": 5,
    }
    response = client.post("/pipeline/next-best-actions", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert len(data["recommendations"]) <= 5
    assert data["recommendations"][0]["investigation_rank"] == 1
    action_types = [r["action_type"] for r in data["recommendations"]]
    assert ACTION_REVIEW_LOW_CONFIDENCE_EVIDENCE in action_types
    assert ACTION_VERIFY_AMBIGUOUS_IDENTITY in action_types

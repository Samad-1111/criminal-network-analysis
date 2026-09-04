"""Unit and integration tests for Next-Best-Action Recommendation Engine and Relative Ranking."""
import pytest
from fastapi.testclient import TestClient

from api.main import app
from pipeline.next_best_action import (
    generate_next_best_actions,
    calculate_network_importance,
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


def test_small_network_low_evidence_calibration():
    """Small network (2 nodes, 1 weak edge 0.45) must not inflate priority to HIGH/CRITICAL purely from topology."""
    network = {
        "nodes": [
            {"id": "person:ravi_kumar", "label": "Ravi Kumar", "entity_type": "Person", "degree_centrality": 1.0, "betweenness_centrality": 0.0},
            {"id": "person:unknown_associate", "label": "Unknown Associate", "entity_type": "Person", "degree_centrality": 1.0, "betweenness_centrality": 0.0},
        ],
        "edges": [
            {
                "source": "person:ravi_kumar",
                "target": "person:unknown_associate",
                "confidence": 0.45,
                "relationship_type": "SUSPECTED_CONTACT",
                "source_record_id": "REC-101",
            }
        ],
        "metrics": {"total_nodes": 2, "total_edges": 1},
    }
    result = generate_next_best_actions(network)
    recs = result["recommendations"]

    assert len(recs) >= 2
    # Verify relative ranking is preserved
    assert recs[0]["investigation_rank"] == 1
    assert recs[1]["investigation_rank"] == 2

    # Verify priority score is not inflated to HIGH or CRITICAL
    entity_recs = [r for r in recs if r["action_type"] in (ACTION_INVESTIGATE_HIGH_VALUE_ENTITY, ACTION_REVIEW_NETWORK_CONNECTOR)]
    for r in entity_recs:
        assert r["priority_level"] in ("LOW", "MEDIUM")
        assert r["priority_score"] < 75.0
        # Network importance breakdown must be present and reflect evidence adjustment
        assert "network_importance_breakdown" in r
        assert r["network_importance_breakdown"]["evidence_adjustment"] == 0.45
        assert r["network_importance_breakdown"]["absolute_connection_support"] <= 0.20

    # Low-confidence evidence review recommendation should be generated
    low_conf_recs = [r for r in recs if r["action_type"] == ACTION_REVIEW_LOW_CONFIDENCE_EVIDENCE]
    assert len(low_conf_recs) == 1


def test_small_network_with_medium_cooccurrence():
    """Small network with one co-occurrence link (0.75) preserves relative ranking without inflated network importance."""
    network = {
        "nodes": [
            {"id": "person:arjun_singh", "label": "Arjun Singh", "entity_type": "Person", "degree_centrality": 1.0, "betweenness_centrality": 0.0},
            {"id": "person:arjun_s", "label": "Arjun S.", "entity_type": "Person", "degree_centrality": 1.0, "betweenness_centrality": 0.0},
        ],
        "edges": [
            {
                "source": "person:arjun_singh",
                "target": "person:arjun_s",
                "confidence": 0.75,
                "relationship_type": "CO_OCCURRED_IN_RECORD",
                "source_record_id": "REC-202",
            }
        ],
        "metrics": {"total_nodes": 2, "total_edges": 1},
    }
    result = generate_next_best_actions(network)
    recs = result["recommendations"]

    assert len(recs) >= 2
    for r in recs:
        assert r["priority_score"] < 75.0  # Not inflated to HIGH
        assert "network_importance_breakdown" in r
        assert r["network_importance_breakdown"]["final_network_importance"] < 0.50


def test_connectivity_comparison_gradient():
    """Entities with more evidence connections rank above entities with fewer connections under equal evidence quality."""
    nodes = [
        {"id": "person:a", "label": "Entity A", "entity_type": "Person", "degree_centrality": 0.8, "betweenness_centrality": 0.0},
        {"id": "person:b", "label": "Entity B", "entity_type": "Person", "degree_centrality": 0.6, "betweenness_centrality": 0.0},
        {"id": "person:c", "label": "Entity C", "entity_type": "Person", "degree_centrality": 0.4, "betweenness_centrality": 0.0},
        {"id": "person:d", "label": "Entity D", "entity_type": "Person", "degree_centrality": 0.1, "betweenness_centrality": 0.0},
    ]
    edges = []
    # A has 8 connections
    for i in range(1, 9):
        tgt = f"person:tgt_a_{i}"
        nodes.append({"id": tgt, "label": f"Tgt A {i}", "entity_type": "Person", "degree_centrality": 0.1, "betweenness_centrality": 0.0})
        edges.append({"source": "person:a", "target": tgt, "confidence": 0.90, "relationship_type": "MET", "source_record_id": f"REC-A-{i}"})
    # B has 6 connections
    for i in range(1, 7):
        tgt = f"person:tgt_b_{i}"
        nodes.append({"id": tgt, "label": f"Tgt B {i}", "entity_type": "Person", "degree_centrality": 0.1, "betweenness_centrality": 0.0})
        edges.append({"source": "person:b", "target": tgt, "confidence": 0.90, "relationship_type": "MET", "source_record_id": f"REC-B-{i}"})
    # C has 4 connections
    for i in range(1, 5):
        tgt = f"person:tgt_c_{i}"
        nodes.append({"id": tgt, "label": f"Tgt C {i}", "entity_type": "Person", "degree_centrality": 0.1, "betweenness_centrality": 0.0})
        edges.append({"source": "person:c", "target": tgt, "confidence": 0.90, "relationship_type": "MET", "source_record_id": f"REC-C-{i}"})
    # D has 1 connection
    edges.append({"source": "person:d", "target": "person:tgt_a_1", "confidence": 0.90, "relationship_type": "MET", "source_record_id": "REC-D-1"})

    network = {"nodes": nodes, "edges": edges, "metrics": {"total_nodes": len(nodes), "total_edges": len(edges)}}
    result = generate_next_best_actions(network, max_recommendations=10)
    recs = result["recommendations"]

    rec_targets = {r["target_entities"][0]["id"]: r for r in recs if r["action_type"] in (ACTION_INVESTIGATE_HIGH_VALUE_ENTITY, ACTION_REVIEW_NETWORK_CONNECTOR)}
    
    assert rec_targets["person:a"]["investigation_rank"] < rec_targets["person:b"]["investigation_rank"]
    assert rec_targets["person:b"]["investigation_rank"] < rec_targets["person:c"]["investigation_rank"]
    assert rec_targets["person:c"]["investigation_rank"] < rec_targets["person:d"]["investigation_rank"]


def test_evidence_quality_adjustment():
    """High connection count with weak evidence should not automatically dominate lower connection count with high evidence."""
    nodes = [
        {"id": "person:weak_hub", "label": "Weak Hub", "entity_type": "Person", "degree_centrality": 0.8, "betweenness_centrality": 0.0},
        {"id": "person:solid_lead", "label": "Solid Lead", "entity_type": "Person", "degree_centrality": 0.5, "betweenness_centrality": 0.0},
    ]
    edges = []
    # Weak hub: 8 connections with low confidence 0.40
    for i in range(1, 9):
        tgt = f"person:tgt_w_{i}"
        nodes.append({"id": tgt, "label": f"Tgt W {i}", "entity_type": "Person", "degree_centrality": 0.1, "betweenness_centrality": 0.0})
        edges.append({"source": "person:weak_hub", "target": tgt, "confidence": 0.40, "relationship_type": "UNVERIFIED", "source_record_id": f"REC-W-{i}"})
    # Solid lead: 5 connections with high confidence 0.95
    for i in range(1, 6):
        tgt = f"person:tgt_s_{i}"
        nodes.append({"id": tgt, "label": f"Tgt S {i}", "entity_type": "Person", "degree_centrality": 0.1, "betweenness_centrality": 0.0})
        edges.append({"source": "person:solid_lead", "target": tgt, "confidence": 0.95, "relationship_type": "CONFIRMED_COMM", "source_record_id": f"REC-S-{i}"})

    network = {"nodes": nodes, "edges": edges, "metrics": {"total_nodes": len(nodes), "total_edges": len(edges)}}
    result = generate_next_best_actions(network, max_recommendations=10)
    recs = result["recommendations"]

    rec_targets = {r["target_entities"][0]["id"]: r for r in recs if r["action_type"] in (ACTION_INVESTIGATE_HIGH_VALUE_ENTITY, ACTION_REVIEW_NETWORK_CONNECTOR)}
    
    # Solid lead (0.95 confidence) must rank higher in priority score than weak hub (0.40 confidence)
    assert rec_targets["person:solid_lead"]["priority_score"] > rec_targets["person:weak_hub"]["priority_score"]
    assert rec_targets["person:solid_lead"]["investigation_rank"] < rec_targets["person:weak_hub"]["investigation_rank"]


def test_multi_record_support_boost():
    """Entity corroborated across multiple distinct records receives stronger support than single-record entity."""
    network = {
        "nodes": [
            {"id": "person:multi_rec", "label": "Multi Record Entity", "entity_type": "Person", "degree_centrality": 0.5, "betweenness_centrality": 0.0},
            {"id": "person:single_rec", "label": "Single Record Entity", "entity_type": "Person", "degree_centrality": 0.5, "betweenness_centrality": 0.0},
            {"id": "person:p1", "label": "P1", "entity_type": "Person", "degree_centrality": 0.1, "betweenness_centrality": 0.0},
            {"id": "person:p2", "label": "P2", "entity_type": "Person", "degree_centrality": 0.1, "betweenness_centrality": 0.0},
            {"id": "person:p3", "label": "P3", "entity_type": "Person", "degree_centrality": 0.1, "betweenness_centrality": 0.0},
            {"id": "person:p4", "label": "P4", "entity_type": "Person", "degree_centrality": 0.1, "betweenness_centrality": 0.0},
        ],
        "edges": [
            # Multi-record entity: 2 connections across 4 records (REC-1, REC-2, REC-3, REC-4)
            {"source": "person:multi_rec", "target": "person:p1", "confidence": 0.90, "relationship_type": "MET", "source_record_id": "REC-1"},
            {"source": "person:multi_rec", "target": "person:p2", "confidence": 0.90, "relationship_type": "MET", "source_record_id": "REC-2"},
            {"source": "person:multi_rec", "target": "person:p1", "confidence": 0.90, "relationship_type": "MET", "source_record_id": "REC-3"},
            {"source": "person:multi_rec", "target": "person:p2", "confidence": 0.90, "relationship_type": "MET", "source_record_id": "REC-4"},
            # Single-record entity: 4 connections all in single REC-1
            {"source": "person:single_rec", "target": "person:p1", "confidence": 0.90, "relationship_type": "MET", "source_record_id": "REC-1"},
            {"source": "person:single_rec", "target": "person:p2", "confidence": 0.90, "relationship_type": "MET", "source_record_id": "REC-1"},
            {"source": "person:single_rec", "target": "person:p3", "confidence": 0.90, "relationship_type": "MET", "source_record_id": "REC-1"},
            {"source": "person:single_rec", "target": "person:p4", "confidence": 0.90, "relationship_type": "MET", "source_record_id": "REC-1"},
        ],
        "metrics": {"total_nodes": 6, "total_edges": 8},
    }
    result = generate_next_best_actions(network)
    recs = result["recommendations"]

    rec_targets = {r["target_entities"][0]["id"]: r for r in recs if r["action_type"] in (ACTION_INVESTIGATE_HIGH_VALUE_ENTITY, ACTION_REVIEW_NETWORK_CONNECTOR)}
    
    # Multi-record support score should be higher for multi_rec
    assert rec_targets["person:multi_rec"]["network_importance_breakdown"]["multi_record_support"] == 1.0
    assert rec_targets["person:single_rec"]["network_importance_breakdown"]["multi_record_support"] == 0.25


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
        assert "network_importance_breakdown" in r
        assert r["ranking_context"]["category_candidate_count"] == 2


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
        assert "network_importance_breakdown" in rec
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

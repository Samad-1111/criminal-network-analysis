"""Unit tests for multi-entity NetworkX graph building and evidence metadata preservation."""
import pytest
from data import load_synthetic_records
from pipeline.graph_builder import (
    build_criminal_network,
    find_shortest_connection,
    generate_node_id,
)


def test_build_network_node_types():
    records = load_synthetic_records()
    network = build_criminal_network(records)
    nodes = network["nodes"]

    assert len(nodes) > 0
    entity_types_found = {node["entity_type"] for node in nodes}

    # Verify that multiple entity types are represented in nodes
    expected_types = {"Person", "Phone", "Location", "Vehicle", "Event"}
    for t in expected_types:
        assert t in entity_types_found, f"Expected entity type '{t}' in graph nodes."


def test_build_network_edge_evidence_metadata():
    records = load_synthetic_records()
    network = build_criminal_network(records)
    edges = network["edges"]

    assert len(edges) > 0
    for edge in edges:
        assert "source" in edge
        assert "target" in edge
        assert "source_record_id" in edge
        assert "relationship_type" in edge
        assert "timestamp" in edge
        assert "confidence" in edge
        # Check that evidence is valid
        assert edge["source_record_id"] != ""
        assert 0.0 <= edge["confidence"] <= 1.0


def test_graph_metrics_calculated():
    records = load_synthetic_records()
    network = build_criminal_network(records)
    metrics = network["metrics"]

    assert metrics["total_nodes"] > 0
    assert metrics["total_edges"] > 0
    assert metrics["total_components"] >= 1
    assert "density" in metrics

    # Verify nodes have centrality calculated
    for node in network["nodes"]:
        assert "degree_centrality" in node
        assert "betweenness_centrality" in node
        assert 0.0 <= node["degree_centrality"] <= 1.0
        assert 0.0 <= node["betweenness_centrality"] <= 1.0


def test_find_shortest_connection_path():
    records = load_synthetic_records()
    result = find_shortest_connection(records, "Vikram Sharma", "Amit Verma")
    assert result["found"] is True
    assert len(result["path_nodes"]) >= 2
    assert len(result["evidence_chain"]) >= 1

    # Check evidence metadata on chain
    first_link = result["evidence_chain"][0]
    assert "from" in first_link
    assert "to" in first_link
    assert "evidence" in first_link

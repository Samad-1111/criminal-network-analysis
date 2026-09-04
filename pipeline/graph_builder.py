"""Graph Builder Module.

Constructs multi-entity criminal network graphs using NetworkX.
Nodes represent typed entities (Person, Phone, Location, Vehicle, Event).
Edges preserve critical evidence metadata: source_record_id, relationship_type,
timestamp, and confidence. Computes key network centrality and intelligence metrics.
"""
from typing import Dict, List, Any, Optional
import networkx as nx


def generate_node_id(entity_type: str, identifier: str) -> str:
    """Generate a clean, consistent node ID based on entity type and value."""
    import re
    cleaned = re.sub(r"[^\w\-\.]", "_", identifier.strip().lower())
    return f"{entity_type.lower()}:{cleaned}"


def build_criminal_network(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Build a multi-entity criminal network graph from police/intelligence records.

    Args:
        records: List of record dictionaries containing record_id, timestamp, entities, and relationships.

    Returns:
        dict: JSON-serializable graph structure containing:
            - "nodes": list of node objects with entity_type and attributes
            - "edges": list of edge objects with evidence metadata
            - "metrics": centrality scores and network statistics
    """
    G = nx.MultiGraph()

    # Track node labels to node IDs for linking
    label_to_id: Dict[str, str] = {}

    for record in records:
        record_id = record.get("record_id", "UNKNOWN_RECORD")
        rec_timestamp = record.get("timestamp", "UNKNOWN_TIME")
        entities = record.get("entities", [])
        relationships = record.get("relationships", [])

        # 1. Add typed nodes to graph
        record_node_ids = []
        for entity in entities:
            entity_type = entity.get("entity_type", "Person")

            # Determine entity display name / identifier
            if entity_type == "Person":
                val = entity.get("name", "Unknown Person")
            elif entity_type == "Phone":
                val = entity.get("number", "Unknown Phone")
            elif entity_type == "Location":
                val = entity.get("name", "Unknown Location")
            elif entity_type == "Vehicle":
                val = entity.get("registration_number", "Unknown Vehicle")
            elif entity_type == "Event":
                val = entity.get("title", entity.get("incident_type", "Unknown Event"))
            else:
                val = entity.get("name", "Unknown Entity")

            node_id = generate_node_id(entity_type, val)
            label_to_id[val.lower()] = node_id
            record_node_ids.append(node_id)

            if not G.has_node(node_id):
                G.add_node(
                    node_id,
                    id=node_id,
                    label=val,
                    entity_type=entity_type,
                    first_seen_record=record_id,
                    attributes={k: v for k, v in entity.items() if k not in ("entity_type",)},
                )

        # 2. Add explicit relationships as edges with evidence metadata
        if relationships:
            for rel in relationships:
                src_val = rel.get("source", "")
                tgt_val = rel.get("target", "")
                rel_type = rel.get("relationship_type", "ASSOCIATED_WITH")
                confidence = float(rel.get("confidence", 0.90))

                src_id = label_to_id.get(src_val.lower(), generate_node_id("entity", src_val))
                tgt_id = label_to_id.get(tgt_val.lower(), generate_node_id("entity", tgt_val))

                # Ensure source and target nodes exist in graph
                if not G.has_node(src_id):
                    G.add_node(src_id, id=src_id, label=src_val, entity_type="Person", attributes={})
                if not G.has_node(tgt_id):
                    G.add_node(tgt_id, id=tgt_id, label=tgt_val, entity_type="Entity", attributes={})

                G.add_edge(
                    src_id,
                    tgt_id,
                    source_record_id=record_id,
                    relationship_type=rel_type,
                    timestamp=rec_timestamp,
                    confidence=confidence,
                )
        else:
            # If no explicit relationships were provided, link co-occurring entities in the same record
            for i in range(len(record_node_ids)):
                for j in range(i + 1, len(record_node_ids)):
                    src_id = record_node_ids[i]
                    tgt_id = record_node_ids[j]
                    G.add_edge(
                        src_id,
                        tgt_id,
                        source_record_id=record_id,
                        relationship_type="CO_OCCURRED_IN_RECORD",
                        timestamp=rec_timestamp,
                        confidence=0.75,
                    )

    # 3. Compute Network Intelligence Metrics
    # Convert to simple graph for standard centrality calculations
    simple_g = nx.Graph(G)
    
    degree_centrality = (
        nx.degree_centrality(simple_g) if len(simple_g) > 0 else {}
    )
    betweenness_centrality = (
        nx.betweenness_centrality(simple_g) if len(simple_g) > 0 else {}
    )

    # Serialize Nodes
    nodes_list: List[Dict[str, Any]] = []
    for node_id, data in G.nodes(data=True):
        nodes_list.append({
            "id": node_id,
            "label": data.get("label", node_id),
            "entity_type": data.get("entity_type", "Entity"),
            "attributes": data.get("attributes", {}),
            "degree_centrality": round(degree_centrality.get(node_id, 0.0), 3),
            "betweenness_centrality": round(betweenness_centrality.get(node_id, 0.0), 3),
        })

    # Serialize Edges with complete evidence metadata
    edges_list: List[Dict[str, Any]] = []
    for u, v, k, data in G.edges(keys=True, data=True):
        edges_list.append({
            "source": u,
            "target": v,
            "source_record_id": data.get("source_record_id", "UNKNOWN"),
            "relationship_type": data.get("relationship_type", "ASSOCIATED_WITH"),
            "timestamp": data.get("timestamp", "UNKNOWN"),
            "confidence": data.get("confidence", 1.0),
        })

    # Connected Components (subgroups)
    components = []
    if len(simple_g) > 0:
        for comp in nx.connected_components(simple_g):
            components.append(list(comp))

    metrics = {
        "total_nodes": G.number_of_nodes(),
        "total_edges": G.number_of_edges(),
        "total_components": len(components),
        "density": round(nx.density(simple_g), 4) if len(simple_g) > 1 else 0.0,
        "components": components,
    }

    return {
        "nodes": nodes_list,
        "edges": edges_list,
        "metrics": metrics,
    }


def find_shortest_connection(
    records: List[Dict[str, Any]], source_label: str, target_label: str
) -> Dict[str, Any]:
    """Find the shortest connection path and evidence chain between two entities."""
    network = build_criminal_network(records)
    G = nx.Graph()

    for edge in network["edges"]:
        G.add_edge(
            edge["source"],
            edge["target"],
            relationship_type=edge["relationship_type"],
            source_record_id=edge["source_record_id"],
            confidence=edge["confidence"],
        )

    # Find matching node IDs
    src_id = None
    tgt_id = None
    for node in network["nodes"]:
        if node["label"].lower() == source_label.lower() or source_label.lower() in node["id"]:
            src_id = node["id"]
        if node["label"].lower() == target_label.lower() or target_label.lower() in node["id"]:
            tgt_id = node["id"]

    if not src_id or not tgt_id:
        return {
            "found": False,
            "message": f"Could not find entities '{source_label}' and/or '{target_label}' in network.",
            "path": [],
        }

    if not nx.has_path(G, src_id, tgt_id):
        return {
            "found": False,
            "message": f"No connection found between {source_label} and {target_label}.",
            "path": [],
        }

    path_nodes = nx.shortest_path(G, src_id, tgt_id)
    path_edges = []
    for i in range(len(path_nodes) - 1):
        u, v = path_nodes[i], path_nodes[i + 1]
        edge_data = G.get_edge_data(u, v)
        path_edges.append({
            "from": u,
            "to": v,
            "evidence": edge_data,
        })

    return {
        "found": True,
        "path_length": len(path_nodes) - 1,
        "path_nodes": path_nodes,
        "evidence_chain": path_edges,
    }

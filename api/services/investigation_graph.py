"""Investigation Graph Service Adapter.

Connects PostgreSQL Entity and Relationship records with pipeline.graph_builder
to generate real evidence-based criminal network graphs with network metrics.
"""
from typing import Dict, List, Any
import uuid
from sqlalchemy.orm import Session

from api import crud
from pipeline.graph_builder import build_criminal_network


def get_investigation_graph(
    db: Session, investigation_id: uuid.UUID
) -> Dict[str, Any]:
    """Load investigation entities and relationships from PostgreSQL and construct network graph.

    Args:
        db: SQLAlchemy DB Session
        investigation_id: Investigation UUID

    Returns:
        dict: JSON graph structure containing:
            - "investigation_id": str
            - "nodes": list of graph node objects with entity metadata and centrality metrics
            - "edges": list of relationship edge objects with evidence metadata
            - "metrics": network intelligence statistics (total_nodes, total_edges, density, etc.)
    """
    db_entities = crud.get_entities(db, investigation_id)
    db_relationships = crud.get_relationships(db, investigation_id)

    if not db_entities:
        return {
            "investigation_id": str(investigation_id),
            "nodes": [],
            "edges": [],
            "metrics": {
                "total_nodes": 0,
                "total_edges": 0,
                "total_components": 0,
                "density": 0.0,
                "components": [],
            },
        }

    # Map entity UUID -> entity record
    entity_map = {e.id: e for e in db_entities}

    # Build input record structure for pipeline.graph_builder
    entities_payload = []
    for e in db_entities:
        entities_payload.append({
            "id": str(e.id),
            "name": e.name,
            "entity_type": e.entity_type,
            "normalized_value": e.normalized_value or e.name,
            "confidence": e.confidence,
        })

    relationships_payload = []
    for r in db_relationships:
        if r.source_entity_id in entity_map and r.target_entity_id in entity_map:
            src_entity = entity_map[r.source_entity_id]
            tgt_entity = entity_map[r.target_entity_id]
            relationships_payload.append({
                "id": str(r.id),
                "source": src_entity.name,
                "target": tgt_entity.name,
                "relationship_type": r.relationship_type,
                "confidence": r.confidence,
                "source_document_id": str(r.source_document_id) if r.source_document_id else None,
            })

    record_data = {
        "record_id": str(investigation_id),
        "timestamp": "N/A",
        "entities": entities_payload,
        "relationships": relationships_payload,
    }

    # Execute graph calculation using existing pipeline/graph_builder.py
    raw_graph = build_criminal_network([record_data])

    # Map calculated graph metrics back to database Entity IDs for exact UI resolution
    # Create label -> entity map
    label_to_entity = {e.name.lower(): e for e in db_entities}

    nodes_by_entity_id: Dict[str, Dict[str, Any]] = {}
    for node in raw_graph.get("nodes", []):
        lbl = node.get("label", "").lower()
        matched_ent = label_to_entity.get(lbl)
        if matched_ent:
            ent_id_str = str(matched_ent.id)
            nodes_by_entity_id[ent_id_str] = {
                "id": ent_id_str,
                "label": matched_ent.name,
                "entity_type": matched_ent.entity_type,
                "confidence": matched_ent.confidence,
                "normalized_value": matched_ent.normalized_value,
                "degree_centrality": node.get("degree_centrality", 0.0),
                "betweenness_centrality": node.get("betweenness_centrality", 0.0),
            }

    # Ensure all DB entities are in the nodes list (even isolated ones)
    final_nodes: List[Dict[str, Any]] = []
    for e in db_entities:
        ent_id_str = str(e.id)
        if ent_id_str in nodes_by_entity_id:
            final_nodes.append(nodes_by_entity_id[ent_id_str])
        else:
            final_nodes.append({
                "id": ent_id_str,
                "label": e.name,
                "entity_type": e.entity_type,
                "confidence": e.confidence,
                "normalized_value": e.normalized_value,
                "degree_centrality": 0.0,
                "betweenness_centrality": 0.0,
            })

    # Format edges with exact database UUIDs
    final_edges: List[Dict[str, Any]] = []
    for r in db_relationships:
        if r.source_entity_id in entity_map and r.target_entity_id in entity_map:
            final_edges.append({
                "id": str(r.id),
                "source": str(r.source_entity_id),
                "target": str(r.target_entity_id),
                "relationship_type": r.relationship_type,
                "confidence": r.confidence,
                "source_document_id": str(r.source_document_id) if getattr(r, "source_document_id", None) else None,
                "evidence_snippet": getattr(r, "evidence_snippet", None),
            })

    return {
        "investigation_id": str(investigation_id),
        "nodes": final_nodes,
        "edges": final_edges,
        "metrics": raw_graph.get("metrics", {}),
    }

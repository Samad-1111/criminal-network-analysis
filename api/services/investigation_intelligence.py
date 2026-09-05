"""Investigation Intelligence Service — Next-Best-Action Adapter.

Bridges real investigation data stored in Neon PostgreSQL with the existing
pipeline.next_best_action recommendation engine.

Design principles:
- No fabricated evidence: all recommendations derive strictly from real
  database entities, relationships, and computed network metrics.
- Graceful degradation: returns an empty response rather than an error
  when an investigation contains no evidence yet.
- Non-mutating: this adapter only reads from the database; it never
  writes or modifies any records.
"""
from typing import Any, Dict, List
import uuid

from sqlalchemy.orm import Session

from api.services.investigation_graph import get_investigation_graph
from pipeline.next_best_action import generate_next_best_actions
from pipeline.identity_resolution import resolve_dataset_identities


def _build_identity_candidates(db_entities) -> List[Dict[str, Any]]:
    """Build identity resolution input from real DB entities.

    Converts SQLAlchemy Entity records into the dict shape expected by
    pipeline.identity_resolution.resolve_dataset_identities so Person
    entities can surface AMBIGUOUS/POSSIBLE identity matches as NBA leads.

    Only Person entities are passed because identity resolution is
    name/alias-based; other types (Phone, Vehicle, etc.) are normalised
    by exact value rather than fuzzy matching.
    """
    person_dicts: List[Dict[str, Any]] = []
    for e in db_entities:
        if e.entity_type.lower() != "person":
            continue
        person_dicts.append({
            "entity_type": e.entity_type,
            "name": e.name,
            # normalized_value is guaranteed non-null by the entity_extractor
            # service; fall back to name just in case of direct DB insertion
            "aliases": (
                [e.normalized_value]
                if e.normalized_value and e.normalized_value.lower() != e.name.lower()
                else []
            ),
        })
    return person_dicts


def _build_nba_graph(investigation_graph: Dict[str, Any]) -> Dict[str, Any]:
    """Remap investigation graph edges to include source_record_id field.

    pipeline.next_best_action uses ``source_record_id`` on edges to surface
    corroborating record counts per entity.  The investigation graph returns
    ``source_document_id`` instead — this function adds the alias so the
    engine reads the right field without requiring changes to the engine.
    """
    edges = investigation_graph.get("edges", [])
    remapped_edges = []
    for edge in edges:
        remapped = dict(edge)
        # Provide source_record_id alias expected by next_best_action engine
        if "source_record_id" not in remapped:
            remapped["source_record_id"] = remapped.get("source_document_id")
        remapped_edges.append(remapped)

    return {
        "nodes": investigation_graph.get("nodes", []),
        "edges": remapped_edges,
        "metrics": investigation_graph.get("metrics", {}),
    }


def get_investigation_next_best_actions(
    db: Session,
    investigation_id: uuid.UUID,
    max_recommendations: int = 10,
) -> Dict[str, Any]:
    """Generate Next-Best-Action recommendations for a real investigation.

    Workflow:
    1. Load investigation graph (entities + relationships + network metrics)
       via get_investigation_graph().
    2. If no entities exist, return a graceful empty response.
    3. Run identity resolution on Person entities to supply disambiguation
       candidates to the recommendation engine.
    4. Call generate_next_best_actions() with real network data.
    5. Return structured payload with investigation_id, network_summary,
       recommendation_summary, and recommendations.

    Args:
        db: SQLAlchemy database session.
        investigation_id: UUID of the investigation.
        max_recommendations: Maximum number of recommendations to return.

    Returns:
        dict with keys:
            - investigation_id (str)
            - network_summary (dict)
            - recommendation_summary (dict)
            - recommendations (list)
    """
    # 1. Load real investigation graph
    investigation_graph = get_investigation_graph(db, investigation_id)

    nodes = investigation_graph.get("nodes", [])
    edges = investigation_graph.get("edges", [])
    metrics = investigation_graph.get("metrics", {})

    # 2. Graceful empty response when no evidence exists yet
    if not nodes:
        return {
            "investigation_id": str(investigation_id),
            "network_summary": {
                "total_nodes": 0,
                "total_edges": 0,
                "total_components": 0,
                "density": 0.0,
            },
            "recommendation_summary": {
                "total_recommendations": 0,
                "critical": 0,
                "high": 0,
                "medium": 0,
                "low": 0,
                "top_recommendation_id": None,
            },
            "recommendations": [],
        }

    # 3. Identity resolution on Person entities for disambiguation leads
    from api import crud  # noqa: PLC0415 (local import avoids circular at module load)

    db_entities = crud.get_entities(db, investigation_id)
    person_dicts = _build_identity_candidates(db_entities)

    identity_results: List[Dict[str, Any]] = []
    if len(person_dicts) > 1:
        identity_results = resolve_dataset_identities(
            person_dicts, min_threshold=0.70
        )

    # 4. Remap graph so next_best_action engine finds source_record_id field
    nba_graph = _build_nba_graph(investigation_graph)

    nba_result = generate_next_best_actions(
        network=nba_graph,
        identity_results=identity_results if identity_results else None,
        max_recommendations=max_recommendations,
    )

    # 5. Build structured response
    network_summary = {
        "total_nodes": metrics.get("total_nodes", len(nodes)),
        "total_edges": metrics.get("total_edges", len(edges)),
        "total_components": metrics.get("total_components", 0),
        "density": metrics.get("density", 0.0),
    }

    return {
        "investigation_id": str(investigation_id),
        "network_summary": network_summary,
        "recommendation_summary": nba_result["summary"],
        "recommendations": nba_result["recommendations"],
    }

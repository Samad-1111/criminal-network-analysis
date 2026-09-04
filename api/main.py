"""FastAPI Application for Criminal Network Analysis.

Provides REST API endpoints for:
- Entity extraction from narrative crime records (Person, Phone, Location, Vehicle, Event)
- Identity resolution with confidence scores and status flags (CONFIRMED, POSSIBLE, AMBIGUOUS, UNKNOWN)
- Network graph generation with typed nodes and evidence-preserving edges
- Shortest path / evidence chain tracing between suspects
- Synthetic dataset inspection and end-to-end analysis
"""
from typing import Dict, List, Any, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from data import load_synthetic_records
from pipeline.entity_extraction import extract_entities_from_text
from pipeline.identity_resolution import (
    compare_entities,
    resolve_dataset_identities,
    MatchStatus,
)
from pipeline.graph_builder import (
    build_criminal_network,
    find_shortest_connection,
)
from pipeline.next_best_action import generate_next_best_actions
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Criminal Network Analysis API",
    description=(
        "Lightweight, evidence-preserving intelligence analysis pipeline. "
        "Extracts entities, resolves identities with status flags, and builds multi-entity graph networks."
    ),
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Request & Response Models ---

class EntityExtractRequest(BaseModel):
    text: str = Field(
        ...,
        description="Raw narrative text or crime report to extract entities from",
        examples=[
            "Suspect Vikram Sharma alias Vicky was seen in Sector 18 Noida with Rajesh Kumar. "
            "They were driving car DL-01-AB-1234 and Vicky called +91-9876543210."
        ],
    )


class EntityRecord(BaseModel):
    entity_type: str = Field("Person", description="Entity type: Person, Phone, Location, Vehicle, Event")
    name: Optional[str] = Field(None, description="Name or identifier of the entity")
    aliases: Optional[List[str]] = Field(default_factory=list, description="Known aliases")
    phone: Optional[str] = Field(None, description="Phone number if applicable")
    registration_number: Optional[str] = Field(None, description="Vehicle plate number if applicable")
    title: Optional[str] = Field(None, description="Event or crime title if applicable")


class EntityCompareRequest(BaseModel):
    entity_a: Dict[str, Any] = Field(
        ...,
        examples=[{"entity_type": "Person", "name": "Vikram Sharma", "aliases": ["Vicky"], "phone": "+91-9876543210"}],
    )
    entity_b: Dict[str, Any] = Field(
        ...,
        examples=[{"entity_type": "Person", "name": "Vikram S.", "aliases": ["Vicky"], "phone": "+91-9876543210"}],
    )


class DatasetResolveRequest(BaseModel):
    entities: List[Dict[str, Any]] = Field(
        ...,
        description="List of raw entity dictionaries to compare across the dataset",
    )
    min_threshold: float = Field(
        0.70,
        ge=0.0,
        le=1.0,
        description="Minimum confidence score threshold to include in resolution results",
    )


class GraphBuildRequest(BaseModel):
    records: Optional[List[Dict[str, Any]]] = Field(
        None,
        description="List of intelligence records. If omitted or empty, default synthetic records are used.",
    )


class PathSearchRequest(BaseModel):
    source: str = Field(..., examples=["Vikram Sharma"], description="Source entity name or ID")
    target: str = Field(..., examples=["Amit Verma"], description="Target entity name or ID")
    records: Optional[List[Dict[str, Any]]] = Field(
        None,
        description="Optional custom records. If omitted, default synthetic dataset is used.",
    )


class NextBestActionRequest(BaseModel):
    records: Optional[List[Dict[str, Any]]] = Field(
        None,
        description="List of intelligence records. If omitted or empty, default synthetic records are used.",
    )
    identity_results: Optional[List[Dict[str, Any]]] = Field(
        None,
        description="Optional list of identity comparison results for disambiguation recommendations.",
    )
    max_recommendations: int = Field(
        10,
        ge=1,
        le=50,
        description="Maximum number of recommendations to return.",
    )



# --- Endpoints ---

@app.get("/", tags=["General"])
def root():
    """API health check and general metadata."""
    return {
        "status": "online",
        "service": "Criminal Network Analysis API",
        "version": "1.0.0",
        "entity_types_supported": ["Person", "Phone", "Location", "Vehicle", "Event"],
        "identity_statuses": ["CONFIRMED", "POSSIBLE", "AMBIGUOUS", "UNKNOWN"],
        "docs_url": "/docs",
    }


@app.get("/data/synthetic", tags=["Data"])
def get_synthetic_dataset():
    """Retrieve sample synthetic police/FIR intelligence records."""
    records = load_synthetic_records()
    return {
        "total_records": len(records),
        "records": records,
    }


@app.post("/pipeline/extract-entities", tags=["Pipeline"])
def extract_entities_endpoint(request: EntityExtractRequest):
    """Extract Person, Phone, Location, Vehicle, and Event entities from input text."""
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Input text cannot be empty.")

    extracted = extract_entities_from_text(request.text)
    return {
        "input_text": request.text,
        "extracted_entities": extracted,
    }


@app.post("/pipeline/compare-identities", tags=["Pipeline"])
def compare_identities_endpoint(request: EntityCompareRequest):
    """Compare two entity mentions.

    Returns similarity score, reasons, and one of 4 status flags:
    - CONFIRMED
    - POSSIBLE
    - AMBIGUOUS
    - UNKNOWN
    """
    result = compare_entities(request.entity_a, request.entity_b)
    return result


@app.post("/pipeline/resolve-dataset", tags=["Pipeline"])
def resolve_dataset_endpoint(request: DatasetResolveRequest):
    """Evaluate pairwise entity comparisons across a list of entity mentions."""
    if not request.entities:
        raise HTTPException(status_code=400, detail="Entities list cannot be empty.")

    matches = resolve_dataset_identities(request.entities, min_threshold=request.min_threshold)
    return {
        "total_comparisons_analyzed": (len(request.entities) * (len(request.entities) - 1)) // 2,
        "matches_found": len(matches),
        "results": matches,
    }


@app.post("/pipeline/build-graph", tags=["Pipeline"])
def build_graph_endpoint(request: GraphBuildRequest):
    """Build a multi-entity network graph with evidence-preserving edges and centrality metrics.

    If no records are supplied, synthetic crime records are used.
    """
    records = request.records if request.records is not None else load_synthetic_records()
    if not records:
        raise HTTPException(status_code=400, detail="No records available to build network.")

    graph_data = build_criminal_network(records)
    return graph_data


@app.post("/pipeline/find-connection", tags=["Pipeline"])
def find_connection_endpoint(request: PathSearchRequest):
    """Find the shortest connection path and evidence chain linking two suspects or entities."""
    records = request.records if request.records is not None else load_synthetic_records()
    result = find_shortest_connection(records, request.source, request.target)
    return result


@app.post("/pipeline/analyze-network", tags=["Pipeline"])
def analyze_network_full():
    """Run end-to-end analysis on the synthetic intelligence dataset.

    Returns:
    - Summary of synthetic records
    - Identified potential alias/identity matches
    - Full multi-entity network graph with evidence metadata on edges
    - Centrality rankings of key suspects
    """
    records = load_synthetic_records()

    # Collect all entities from records
    all_persons = []
    for rec in records:
        for ent in rec.get("entities", []):
            if ent.get("entity_type") == "Person":
                all_persons.append(ent)

    # Resolve identities across dataset
    identity_matches = resolve_dataset_identities(all_persons, min_threshold=0.70)

    # Build network graph
    network = build_criminal_network(records)

    # Top central persons (by degree and betweenness)
    ranked_nodes = sorted(
        network["nodes"],
        key=lambda n: (n.get("betweenness_centrality", 0), n.get("degree_centrality", 0)),
        reverse=True,
    )

    return {
        "status": "success",
        "total_records_processed": len(records),
        "identity_resolution_matches": identity_matches,
        "network": network,
        "key_suspects_ranked": ranked_nodes[:5],
    }


@app.post("/pipeline/next-best-actions", tags=["Pipeline"])
def next_best_actions_endpoint(request: NextBestActionRequest):
    """Generate explainable Next-Best-Action investigative recommendations.

    Leverages network topology, edge confidence scores, and optional identity
    resolution candidates to prioritize evidence verification and intelligence follow-ups.
    """
    records = request.records if request.records is not None else load_synthetic_records()
    if not records:
        raise HTTPException(status_code=400, detail="No records available to generate recommendations.")

    network = build_criminal_network(records)
    nba_result = generate_next_best_actions(
        network=network,
        identity_results=request.identity_results,
        max_recommendations=request.max_recommendations,
    )

    return {
        "network_summary": {
            "total_nodes": network.get("metrics", {}).get("total_nodes", len(network.get("nodes", []))),
            "total_edges": network.get("metrics", {}).get("total_edges", len(network.get("edges", []))),
            "total_components": network.get("metrics", {}).get("total_components", 0),
        },
        "recommendation_summary": nba_result["summary"],
        "recommendations": nba_result["recommendations"],
    }


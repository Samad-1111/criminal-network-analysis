"""Next-Best-Action Recommendation Engine.

Provides deterministic, explainable decision-support recommendations for
criminal network investigations based on network topology, evidence confidence,
and optional identity resolution candidates.

Implements an Absolute + Relative Evidence-Aware Network Importance Model
combined with an Adaptive Relative Investigation Ranking System. Orders
investigative leads (Rank 1, 2, 3...) relative to available evidence in the
specific case while preventing small-network topology artifacts from artificially
inflating absolute priority.

Adheres strictly to decision-support principles: does not make autonomous
enforcement decisions, does not predict crimes, and does not assert guilt.
"""
from datetime import datetime, timezone
import re
from typing import Dict, List, Any, Optional, Tuple, Set

# --- Configurable Overall Scoring Component Weights (Must sum to 100.0) ---
NETWORK_IMPORTANCE_WEIGHT: float = 35.0
EVIDENCE_STRENGTH_WEIGHT: float = 25.0
INFORMATION_GAIN_WEIGHT: float = 20.0
TIME_SENSITIVITY_WEIGHT: float = 15.0
ENTITY_VALUE_WEIGHT: float = 5.0

# --- Network Importance Sub-Component Weights (Must sum to 1.0) ---
NET_IMP_RELATIVE_CONNECTIVITY_WEIGHT: float = 0.30
NET_IMP_ABSOLUTE_CONNECTION_WEIGHT: float = 0.30
NET_IMP_MULTI_RECORD_WEIGHT: float = 0.20
NET_IMP_BRIDGE_WEIGHT: float = 0.20

# --- Saturation & Scaling Constants ---
ABSOLUTE_CONNECTION_SATURATION: int = 8      # 8+ connections = 1.0 absolute connection support
MULTI_RECORD_SATURATION: int = 4             # 4+ distinct records = 1.0 multi-record support
BRIDGE_NETWORK_SIZE_NORMALIZER: float = 6.0  # Scales bridge importance smoothly by network size

# --- Configurable Thresholds ---
LOW_CONFIDENCE_THRESHOLD: float = 0.80

# --- Priority Level Boundaries ---
PRIORITY_CRITICAL_MIN: float = 90.0
PRIORITY_HIGH_MIN: float = 75.0
PRIORITY_MEDIUM_MIN: float = 50.0

# --- Entity Type Investigative Relevance Weights (0.0 to 1.0) ---
ENTITY_TYPE_WEIGHTS: Dict[str, float] = {
    "person": 0.90,
    "phone": 0.85,
    "vehicle": 0.80,
    "location": 0.65,
    "event": 0.60,
    "entity": 0.50,
}

# --- Action Type Constants ---
ACTION_INVESTIGATE_HIGH_VALUE_ENTITY: str = "INVESTIGATE_HIGH_VALUE_ENTITY"
ACTION_REVIEW_NETWORK_CONNECTOR: str = "REVIEW_NETWORK_CONNECTOR"
ACTION_REVIEW_LOW_CONFIDENCE_EVIDENCE: str = "REVIEW_LOW_CONFIDENCE_EVIDENCE"
ACTION_VERIFY_AMBIGUOUS_IDENTITY: str = "VERIFY_AMBIGUOUS_IDENTITY"


def _entity_type_label(entity_type: str) -> str:
    """Return a human-readable noun phrase for an entity type used in recommendation wording."""
    _map: Dict[str, str] = {
        "person": "person",
        "phone": "phone number",
        "vehicle": "vehicle",
        "location": "location",
        "event": "event",
        "entity": "entity",
    }
    return _map.get(entity_type.lower(), "entity")


def _build_entity_recommendation_title(
    entity_type: str, label: str, is_connector: bool
) -> str:
    """Build an entity-type-specific recommendation title.

    Returns wording appropriate to the entity type so that Locations, Phones,
    and Vehicles receive meaningful intelligence-specific action phrasing rather
    than the generic 'Review highly connected entity' template.
    """
    et = entity_type.lower()

    if is_connector:
        if et == "person":
            return f"Review network connector: {label}"
        elif et == "phone":
            return f"Review communication hub associated with phone: {label}"
        elif et == "vehicle":
            return f"Review vehicle as network connector: {label}"
        elif et == "location":
            return f"Review location as network connector: {label}"
        else:
            return f"Review network connector: {label}"
    else:
        if et == "person":
            return f"Review highly connected person: {label}"
        elif et == "phone":
            return f"Review communication intelligence associated with phone: {label}"
        elif et == "vehicle":
            return f"Review vehicle intelligence associated with: {label}"
        elif et == "location":
            return f"Review location intelligence and connected evidence: {label}"
        elif et == "event":
            return f"Review event intelligence and associated network: {label}"
        else:
            return f"Review highly connected entity: {label}"


def _build_entity_connector_reason(
    entity_type: str, label: str, bet_c: float, connection_count: int,
    valid_records: List[str], avg_confidence: float
) -> str:
    """Build the primary reason string for a network-connector recommendation."""
    et = entity_type.lower()
    if et == "person":
        return (
            f"Person '{label}' exhibits notable betweenness centrality ({bet_c:.2f}), "
            "serving as a structural connector between distinct segments of the evidence network."
        )
    elif et == "phone":
        return (
            f"Phone '{label}' is a communication hub with betweenness centrality {bet_c:.2f}, "
            "bridging distinct call clusters in the evidence network."
        )
    elif et == "vehicle":
        return (
            f"Vehicle '{label}' links distinct sub-groups in the network "
            f"(betweenness centrality: {bet_c:.2f}). Reviewing surveillance and movement records is advised."
        )
    elif et == "location":
        return (
            f"Location '{label}' is a structural bridge between separate network segments "
            f"(betweenness centrality: {bet_c:.2f}). Reviewing associated evidence at this site is advised."
        )
    else:
        return (
            f"Entity '{label}' exhibits notable betweenness centrality ({bet_c:.2f}), "
            "serving as a structural connector between distinct segments of the evidence network."
        )


def _build_entity_high_value_reason(
    entity_type: str, label: str, connection_count: int, deg_c: float
) -> str:
    """Build the primary reason string for a high-value entity recommendation."""
    et = entity_type.lower()
    if et == "person":
        return (
            f"Review person '{label}' because of network connectivity "
            f"({connection_count} direct connection(s), degree centrality: {deg_c:.2f})."
        )
    elif et == "phone":
        return (
            f"Review communication intelligence for phone '{label}' — linked to "
            f"{connection_count} direct evidence relationship(s) "
            f"(degree centrality: {deg_c:.2f}). Call record analysis recommended."
        )
    elif et == "vehicle":
        return (
            f"Review vehicle intelligence for '{label}' — associated with "
            f"{connection_count} evidence relationship(s) "
            f"(degree centrality: {deg_c:.2f}). Registration and movement history advised."
        )
    elif et == "location":
        return (
            f"Review location intelligence for '{label}' — connected to "
            f"{connection_count} evidence relationship(s) "
            f"(degree centrality: {deg_c:.2f}). Site analysis and linked evidence review advised."
        )
    elif et == "event":
        return (
            f"Review event '{label}' — associated with {connection_count} evidence relationship(s) "
            f"(degree centrality: {deg_c:.2f})."
        )
    else:
        return (
            f"Review entity '{label}' because of its network connectivity "
            f"({connection_count} direct connection(s), degree centrality: {deg_c:.2f})."
        )


def parse_timestamp_safe(ts_str: Any) -> Optional[datetime]:
    """Parse a timestamp string safely if valid, returning None if unknown or missing.

    Recognizes standard ISO formats, YYYY-MM-DD, and rejects placeholders like
    UNKNOWN, UNKNOWN_TIME, null, empty strings.
    """
    if not ts_str or not isinstance(ts_str, str):
        return None
    cleaned = ts_str.strip().upper()
    if cleaned in ("UNKNOWN", "UNKNOWN_TIME", "NONE", "NULL", ""):
        return None

    # Remove trailing Z for standard ISO parsing
    iso_candidate = ts_str.strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(iso_candidate)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        pass

    # Try simple date match YYYY-MM-DD
    match = re.match(r"^(\d{4})-(\d{2})-(\d{2})", ts_str.strip())
    if match:
        try:
            return datetime(
                year=int(match.group(1)),
                month=int(match.group(2)),
                day=int(match.group(3)),
                tzinfo=timezone.utc,
            )
        except Exception:
            return None

    return None


def calculate_time_sensitivity(timestamps: List[Any]) -> float:
    """Calculate normalized time sensitivity score (0.0 to 1.0) from a list of timestamps.

    If timestamps are missing, UNKNOWN, or invalid, returns 0.0.
    For valid timestamps, computes recency score.
    """
    valid_dts: List[datetime] = []
    for ts in timestamps:
        parsed = parse_timestamp_safe(ts)
        if parsed:
            valid_dts.append(parsed)

    if not valid_dts:
        return 0.0

    newest_dt = max(valid_dts)
    now = datetime.now(timezone.utc)
    if newest_dt > now:
        return 1.0

    days_ago = (now - newest_dt).total_seconds() / 86400.0
    if days_ago < 0:
        days_ago = 0.0

    # Exponential decay over a 365-day window: recent events (0-30 days) score 0.8-1.0
    if days_ago <= 30:
        return round(1.0 - (days_ago / 150.0), 2)
    elif days_ago <= 365:
        return round(max(0.2, 0.8 - ((days_ago - 30) / 400.0)), 2)
    else:
        return 0.1


def calculate_network_importance(
    connection_count: int,
    max_network_connections: int,
    distinct_records_count: int,
    betweenness_centrality: float,
    total_nodes: int,
    average_confidence: float,
) -> Tuple[float, Dict[str, float]]:
    """Compute an explainable, evidence-aware network importance score (0.0 to 1.0).

    Blends:
    - Relative connectivity within the current investigation
    - Absolute connection volume support
    - Multi-record evidence corroboration
    - Bridge / connector significance scaled by network structure
    - Evidence quality adjustment (prevents weak evidence from yielding inflated topology score)

    Returns:
        (final_network_importance, network_importance_breakdown)
    """
    # 1. Relative Connectivity in this investigation (0.0 to 1.0)
    rel_conn = connection_count / max(1, max_network_connections)
    rel_conn = max(0.0, min(1.0, rel_conn))

    # 2. Absolute Connection Support (0.0 to 1.0)
    # Smooth saturation: 1 conn -> 0.125, 2 conn -> 0.25, 4 conn -> 0.50, 8+ conn -> 1.0
    abs_conn = max(0.0, min(1.0, connection_count / max(1, ABSOLUTE_CONNECTION_SATURATION)))

    # 3. Multi-Record Evidence Support (0.0 to 1.0)
    # Smooth saturation: 1 record -> 0.25, 2 records -> 0.50, 4+ records -> 1.0
    multi_rec = max(0.0, min(1.0, distinct_records_count / max(1, MULTI_RECORD_SATURATION)))

    # 4. Bridge / Connector Significance (0.0 to 1.0)
    # Scale betweenness by network size and actual connection volume so tiny 2-node graphs don't inflate
    size_factor = (
        min(1.0, max(0.0, (total_nodes - 2) / max(1.0, BRIDGE_NETWORK_SIZE_NORMALIZER - 2)))
        if total_nodes > 2
        else 0.0
    )
    conn_factor = min(1.0, connection_count / 2.0)
    bridge_val = max(0.0, min(1.0, betweenness_centrality * size_factor * conn_factor * 1.5))

    # Raw composite topology importance before evidence quality scaling
    raw_topo_importance = (
        rel_conn * NET_IMP_RELATIVE_CONNECTIVITY_WEIGHT
        + abs_conn * NET_IMP_ABSOLUTE_CONNECTION_WEIGHT
        + multi_rec * NET_IMP_MULTI_RECORD_WEIGHT
        + bridge_val * NET_IMP_BRIDGE_WEIGHT
    )

    # 5. Evidence-Quality Adjustment (0.20 to 1.0)
    # Scales topology importance by evidence confidence: weak evidence directly downscales topology
    evidence_adj = max(0.20, min(1.0, average_confidence))

    final_net_imp = round(max(0.0, min(1.0, raw_topo_importance * evidence_adj)), 2)

    breakdown = {
        "relative_connectivity": round(rel_conn, 2),
        "absolute_connection_support": round(abs_conn, 2),
        "multi_record_support": round(multi_rec, 2),
        "bridge_importance": round(bridge_val, 2),
        "evidence_adjustment": round(evidence_adj, 2),
        "final_network_importance": final_net_imp,
    }

    return final_net_imp, breakdown


def compute_priority_score(
    network_importance: float,
    evidence_strength: float,
    information_gain: float,
    time_sensitivity: float,
    entity_value: float,
) -> Tuple[float, str, Dict[str, float]]:
    """Compute deterministic priority score (0.0 - 100.0) with explainable score breakdown.

    All input components are normalized between 0.0 and 1.0 before weighting.
    """
    ni = max(0.0, min(1.0, float(network_importance)))
    es = max(0.0, min(1.0, float(evidence_strength)))
    ig = max(0.0, min(1.0, float(information_gain)))
    ts = max(0.0, min(1.0, float(time_sensitivity)))
    ev = max(0.0, min(1.0, float(entity_value)))

    raw_score = (
        ni * NETWORK_IMPORTANCE_WEIGHT
        + es * EVIDENCE_STRENGTH_WEIGHT
        + ig * INFORMATION_GAIN_WEIGHT
        + ts * TIME_SENSITIVITY_WEIGHT
        + ev * ENTITY_VALUE_WEIGHT
    )
    final_score = round(max(0.0, min(100.0, raw_score)), 1)

    if final_score >= PRIORITY_CRITICAL_MIN:
        priority_level = "CRITICAL"
    elif final_score >= PRIORITY_HIGH_MIN:
        priority_level = "HIGH"
    elif final_score >= PRIORITY_MEDIUM_MIN:
        priority_level = "MEDIUM"
    else:
        priority_level = "LOW"

    score_breakdown = {
        "network_importance": round(ni, 2),
        "evidence_strength": round(es, 2),
        "information_gain": round(ig, 2),
        "time_sensitivity": round(ts, 2),
        "entity_value": round(ev, 2),
    }

    return final_score, priority_level, score_breakdown


def _recommendation_sort_key(rec: Dict[str, Any]) -> Tuple[float, float, float, float, int, str]:
    """Deterministic tie-breaking sort key for ranking recommendations.

    Orders primarily by priority_score (descending), then network importance (descending),
    then information gain (descending), then evidence strength (descending),
    then connection count (descending), and finally alphabetical target entity ID (ascending).
    """
    target_id = ""
    if rec.get("target_entities") and len(rec["target_entities"]) > 0:
        target_id = rec["target_entities"][0].get("id", "")

    return (
        -float(rec.get("priority_score", 0.0)),
        -float(rec.get("score_breakdown", {}).get("network_importance", 0.0)),
        -float(rec.get("score_breakdown", {}).get("information_gain", 0.0)),
        -float(rec.get("score_breakdown", {}).get("evidence_strength", 0.0)),
        -int(rec.get("supporting_evidence", {}).get("connection_count", 0)),
        str(target_id),
    )


def generate_next_best_actions(
    network: Optional[Dict[str, Any]],
    identity_results: Optional[List[Dict[str, Any]]] = None,
    max_recommendations: int = 10,
) -> Dict[str, Any]:
    """Generate explainable Next-Best-Action recommendations from criminal network data.

    Applies an Absolute + Relative Evidence-Aware Network Importance Model combined
    with an adaptive relative investigation ranking system that orders investigative
    leads (Rank 1, 2, 3...) without allowing small-network centrality artifacts to inflate
    absolute priority.

    Args:
        network: Output dictionary from graph_builder with "nodes", "edges", "metrics".
        identity_results: Optional list of identity resolution comparison candidates.
        max_recommendations: Maximum number of recommendations to return (default: 10).

    Returns:
        dict: JSON-serializable recommendation payload with summary and ranked recommendations.
    """
    if not network or not isinstance(network, dict):
        network = {"nodes": [], "edges": [], "metrics": {}}

    nodes = network.get("nodes", [])
    edges = network.get("edges", [])
    total_nodes = len(nodes)
    
    # Map node id to node data
    node_map: Dict[str, Dict[str, Any]] = {n.get("id", ""): n for n in nodes if "id" in n}

    # Pre-index incident edges and records per node
    node_incident_edges: Dict[str, List[Dict[str, Any]]] = {n_id: [] for n_id in node_map}
    for edge in edges:
        src = edge.get("source", "")
        tgt = edge.get("target", "")
        if src in node_incident_edges:
            node_incident_edges[src].append(edge)
        if tgt in node_incident_edges:
            node_incident_edges[tgt].append(edge)

    # Calculate max connections across nodes in this network for adaptive relative scaling
    max_node_connections = max([len(node_incident_edges[n_id]) for n_id in node_map] or [1])

    raw_recommendations: List[Dict[str, Any]] = []

    # -------------------------------------------------------------
    # 1. Entity-Level Recommendations (High Connectivity & Connectors)
    # -------------------------------------------------------------
    for node_id, node in node_map.items():
        deg_c = float(node.get("degree_centrality", 0.0))
        bet_c = float(node.get("betweenness_centrality", 0.0))
        entity_type = node.get("entity_type", "Entity")
        label = node.get("label", node_id)
        
        inc_edges = node_incident_edges.get(node_id, [])
        connection_count = len(inc_edges)

        # Skip completely isolated nodes with no connections and no centrality
        if deg_c == 0.0 and bet_c == 0.0 and connection_count == 0:
            continue

        # Collect edge evidence
        valid_records = sorted(list({
            str(e.get("source_record_id"))
            for e in inc_edges
            if e.get("source_record_id") and str(e.get("source_record_id")).upper() not in ("UNKNOWN", "NONE", "")
        }))
        rel_types = sorted(list({e.get("relationship_type") for e in inc_edges if e.get("relationship_type")}))
        confidences = [float(e.get("confidence", 0.75)) for e in inc_edges if e.get("confidence") is not None]
        avg_confidence = round(sum(confidences) / len(confidences), 2) if confidences else 0.75
        timestamps = [e.get("timestamp") for e in inc_edges if e.get("timestamp")]

        entity_val = ENTITY_TYPE_WEIGHTS.get(entity_type.lower(), 0.50)
        time_sens = calculate_time_sensitivity(timestamps)

        # Compute Absolute + Relative Evidence-Aware Network Importance
        net_importance, net_breakdown = calculate_network_importance(
            connection_count=connection_count,
            max_network_connections=max_node_connections,
            distinct_records_count=len(valid_records),
            betweenness_centrality=bet_c,
            total_nodes=total_nodes,
            average_confidence=avg_confidence,
        )

        # Differentiate between Network Connector and High Value Entity
        # Meaningful bridge requires genuine structural separation and multiple connections
        is_connector = (
            bet_c > 0.0
            and total_nodes > 3
            and connection_count >= 2
            and (bet_c >= deg_c or bet_c >= 0.08)
        )

        base_reasons: List[str] = []

        if is_connector:
            action_type = ACTION_REVIEW_NETWORK_CONNECTOR
            title = _build_entity_recommendation_title(entity_type, label, is_connector=True)
            base_reasons.append(
                _build_entity_connector_reason(
                    entity_type, label, bet_c, connection_count, valid_records, avg_confidence
                )
            )
            if connection_count > 0:
                base_reasons.append(
                    f"Connected across {connection_count} evidence relationship(s) in {len(valid_records)} distinct source record(s)."
                )
            info_gain = 0.85
        else:
            action_type = ACTION_INVESTIGATE_HIGH_VALUE_ENTITY
            title = _build_entity_recommendation_title(entity_type, label, is_connector=False)
            base_reasons.append(
                _build_entity_high_value_reason(entity_type, label, connection_count, deg_c)
            )
            if bet_c > 0.0 and total_nodes > 3:
                base_reasons.append(
                    f"Also provides structural connectivity across the graph (betweenness centrality: {bet_c:.2f})."
                )
            if valid_records:
                base_reasons.append(
                    f"Corroborated across {len(valid_records)} distinct source record(s) with average confidence {avg_confidence:.2f}."
                )
            info_gain = 0.75

        score, level, breakdown = compute_priority_score(
            network_importance=net_importance,
            evidence_strength=avg_confidence,
            information_gain=info_gain,
            time_sensitivity=time_sens,
            entity_value=entity_val,
        )

        raw_recommendations.append({
            "action_type": action_type,
            "priority_score": score,
            "priority_level": level,
            "title": title,
            "target_entities": [
                {
                    "id": node_id,
                    "label": label,
                    "entity_type": entity_type,
                }
            ],
            "reasons": base_reasons,
            "supporting_evidence": {
                "record_ids": valid_records,
                "relationship_types": rel_types,
                "average_confidence": avg_confidence,
                "connection_count": connection_count,
            },
            "score_breakdown": breakdown,
            "network_importance_breakdown": net_breakdown,
            "_dedup_key": f"node:{node_id}",
        })

    # -------------------------------------------------------------
    # 2. Low-Confidence Evidence Recommendations
    # -------------------------------------------------------------
    seen_edge_pairs: Set[str] = set()
    for edge in edges:
        confidence = float(edge.get("confidence", 1.0))
        if confidence >= LOW_CONFIDENCE_THRESHOLD:
            continue

        src_id = edge.get("source", "")
        tgt_id = edge.get("target", "")
        pair_key = tuple(sorted([src_id, tgt_id]))
        str_pair_key = f"edge:{pair_key[0]}--{pair_key[1]}"

        if str_pair_key in seen_edge_pairs:
            continue
        seen_edge_pairs.add(str_pair_key)

        src_node = node_map.get(src_id, {"id": src_id, "label": src_id, "entity_type": "Entity"})
        tgt_node = node_map.get(tgt_id, {"id": tgt_id, "label": tgt_id, "entity_type": "Entity"})
        src_label = src_node.get("label", src_id)
        tgt_label = tgt_node.get("label", tgt_id)

        rec_id = edge.get("source_record_id", "UNKNOWN")
        valid_rec_ids = [rec_id] if rec_id and str(rec_id).upper() not in ("UNKNOWN", "NONE", "") else []
        rel_type = edge.get("relationship_type", "ASSOCIATED_WITH")
        timestamp = edge.get("timestamp")

        # Network importance for edge review reflects endpoint connectivity without inflating
        src_conns = len(node_incident_edges.get(src_id, []))
        tgt_conns = len(node_incident_edges.get(tgt_id, []))
        avg_conns = (src_conns + tgt_conns) / 2.0
        
        net_importance, net_breakdown = calculate_network_importance(
            connection_count=int(avg_conns),
            max_network_connections=max_node_connections,
            distinct_records_count=len(valid_rec_ids),
            betweenness_centrality=0.0,
            total_nodes=total_nodes,
            average_confidence=confidence,
        )

        info_gain = round(1.0 - confidence, 2)
        time_sens = calculate_time_sensitivity([timestamp] if timestamp else [])
        ent_val = max(
            ENTITY_TYPE_WEIGHTS.get(src_node.get("entity_type", "").lower(), 0.5),
            ENTITY_TYPE_WEIGHTS.get(tgt_node.get("entity_type", "").lower(), 0.5),
        )

        score, level, breakdown = compute_priority_score(
            network_importance=net_importance,
            evidence_strength=confidence,
            information_gain=info_gain,
            time_sensitivity=time_sens,
            entity_value=ent_val,
        )

        base_reasons = [
            f"Review evidence relationship between '{src_label}' and '{tgt_label}' because the current evidence confidence is {confidence:.2f}.",
            f"Recorded as '{rel_type}' in record {rec_id}.",
        ]

        raw_recommendations.append({
            "action_type": ACTION_REVIEW_LOW_CONFIDENCE_EVIDENCE,
            "priority_score": score,
            "priority_level": level,
            "title": f"Verify low-confidence relationship between {src_label} and {tgt_label}",
            "target_entities": [
                {
                    "id": src_id,
                    "label": src_label,
                    "entity_type": src_node.get("entity_type", "Entity"),
                },
                {
                    "id": tgt_id,
                    "label": tgt_label,
                    "entity_type": tgt_node.get("entity_type", "Entity"),
                },
            ],
            "reasons": base_reasons,
            "supporting_evidence": {
                "record_ids": valid_rec_ids,
                "relationship_types": [rel_type],
                "average_confidence": round(confidence, 2),
                "connection_count": 1,
            },
            "score_breakdown": breakdown,
            "network_importance_breakdown": net_breakdown,
            "_dedup_key": str_pair_key,
        })

    # -------------------------------------------------------------
    # 3. Ambiguous / Possible Identity Resolution Recommendations
    # -------------------------------------------------------------
    if identity_results and isinstance(identity_results, list):
        seen_identity_pairs: Set[str] = set()
        for match in identity_results:
            status = str(match.get("status", "")).upper()
            if status not in ("AMBIGUOUS", "POSSIBLE"):
                continue

            ent_a = match.get("entity_a", {})
            ent_b = match.get("entity_b", {})
            name_a = ent_a.get("name") or ent_a.get("number") or ent_a.get("registration_number") or "Entity A"
            name_b = ent_b.get("name") or ent_b.get("number") or ent_b.get("registration_number") or "Entity B"
            type_a = ent_a.get("entity_type", "Person")
            type_b = ent_b.get("entity_type", "Person")

            pair_key = tuple(sorted([str(name_a).lower(), str(name_b).lower()]))
            ident_key = f"ident:{pair_key[0]}--{pair_key[1]}"
            if ident_key in seen_identity_pairs:
                continue
            seen_identity_pairs.add(ident_key)

            confidence = float(match.get("confidence", 0.75))
            match_reasons = match.get("reasons", [])

            # Check if either entity is represented in graph to gauge evidence-aware network importance
            matched_conns = []
            for n_id, n_data in node_map.items():
                if n_data.get("label", "").lower() in (str(name_a).lower(), str(name_b).lower()):
                    matched_conns.append(len(node_incident_edges.get(n_id, [])))
            ent_conn_cnt = max(matched_conns) if matched_conns else 1

            net_importance, net_breakdown = calculate_network_importance(
                connection_count=ent_conn_cnt,
                max_network_connections=max_node_connections,
                distinct_records_count=1,
                betweenness_centrality=0.0,
                total_nodes=total_nodes,
                average_confidence=confidence,
            )

            info_gain = 0.90 if status == "AMBIGUOUS" else 0.80
            ent_val = max(
                ENTITY_TYPE_WEIGHTS.get(type_a.lower(), 0.5),
                ENTITY_TYPE_WEIGHTS.get(type_b.lower(), 0.5),
            )

            score, level, breakdown = compute_priority_score(
                network_importance=net_importance,
                evidence_strength=confidence,
                information_gain=info_gain,
                time_sensitivity=0.0,
                entity_value=ent_val,
            )

            base_reasons = [
                f"Verify potential identity link between '{name_a}' and '{name_b}' classified as {status} (confidence: {confidence:.2f})."
            ]
            for r in match_reasons:
                if r not in base_reasons:
                    base_reasons.append(r)

            raw_recommendations.append({
                "action_type": ACTION_VERIFY_AMBIGUOUS_IDENTITY,
                "priority_score": score,
                "priority_level": level,
                "title": f"Verify {status.lower()} identity match: {name_a} & {name_b}",
                "target_entities": [
                    {
                        "id": f"{type_a.lower()}:{name_a.lower().replace(' ', '_')}",
                        "label": name_a,
                        "entity_type": type_a,
                    },
                    {
                        "id": f"{type_b.lower()}:{name_b.lower().replace(' ', '_')}",
                        "label": name_b,
                        "entity_type": type_b,
                    },
                ],
                "reasons": base_reasons,
                "supporting_evidence": {
                    "record_ids": [],
                    "relationship_types": ["IDENTITY_CANDIDATE"],
                    "average_confidence": round(confidence, 2),
                    "connection_count": 1,
                },
                "score_breakdown": breakdown,
                "network_importance_breakdown": net_breakdown,
                "_dedup_key": ident_key,
            })

    # -------------------------------------------------------------
    # 4. Adaptive Relative Ranking & Category Ranking
    # -------------------------------------------------------------
    # Deterministic sort across all candidates
    sorted_all = sorted(raw_recommendations, key=_recommendation_sort_key)
    total_candidates = len(sorted_all)

    # Precalculate category candidate counts
    category_counts: Dict[str, int] = {}
    for r in sorted_all:
        cat = r["action_type"]
        category_counts[cat] = category_counts.get(cat, 0) + 1

    category_cur_rank: Dict[str, int] = {cat: 0 for cat in category_counts}

    limit = max(1, max_recommendations) if max_recommendations else 10
    final_recs: List[Dict[str, Any]] = []

    for rank, item in enumerate(sorted_all[:limit], start=1):
        action_type = item["action_type"]
        category_cur_rank[action_type] += 1
        cat_rank = category_cur_rank[action_type]
        cat_total = category_counts[action_type]

        # Calculate mathematically explainable relative rank percentile (1.0 for top rank)
        if total_candidates <= 1:
            rel_percentile = 1.0
        else:
            rel_percentile = round((total_candidates - rank + 1) / total_candidates, 2)

        # Build ranking context
        records_inv = len(item.get("supporting_evidence", {}).get("record_ids", []))
        conn_cnt = item.get("supporting_evidence", {}).get("connection_count", 0)

        ranking_context = {
            "investigation_rank": rank,
            "total_recommendations": total_candidates,
            "relative_rank_percentile": rel_percentile,
            "category_rank": cat_rank,
            "category_candidate_count": cat_total,
            "connection_count": conn_cnt,
            "records_involved": records_inv,
        }

        # Format explainable rank reason
        if rank == 1:
            rank_reason = (
                f"Ranked #1 of {total_candidates} active investigative recommendations based on "
                "combined network importance, evidence strength, information gain, time sensitivity, and entity value."
            )
        else:
            rank_reason = (
                f"Ranked #{rank} of {total_candidates} active investigative recommendations. "
                "This lead remains a relevant action item with relative priority in the current case context."
            )

        updated_reasons = [rank_reason] + item.get("reasons", [])

        item_copy = {
            "recommendation_id": f"NBA-{rank:03d}",
            "investigation_rank": rank,
            "relative_rank_percentile": rel_percentile,
            "action_type": action_type,
            "priority_score": item["priority_score"],
            "priority_level": item["priority_level"],
            "title": item["title"],
            "target_entities": item["target_entities"],
            "reasons": updated_reasons,
            "supporting_evidence": item["supporting_evidence"],
            "score_breakdown": item["score_breakdown"],
            "network_importance_breakdown": item.get("network_importance_breakdown", {}),
            "ranking_context": ranking_context,
        }
        final_recs.append(item_copy)

    summary = {
        "total_recommendations": len(final_recs),
        "critical": sum(1 for r in final_recs if r["priority_level"] == "CRITICAL"),
        "high": sum(1 for r in final_recs if r["priority_level"] == "HIGH"),
        "medium": sum(1 for r in final_recs if r["priority_level"] == "MEDIUM"),
        "low": sum(1 for r in final_recs if r["priority_level"] == "LOW"),
        "top_recommendation_id": final_recs[0]["recommendation_id"] if final_recs else None,
    }

    return {
        "summary": summary,
        "recommendations": final_recs,
    }

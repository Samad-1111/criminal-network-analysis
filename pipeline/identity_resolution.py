"""Identity Resolution Module.

Performs fuzzy entity comparison and entity resolution using RapidFuzz.
Does NOT blindly merge entities; instead, evaluates similarity and returns
confidence scores along with explicit statuses: CONFIRMED, POSSIBLE, AMBIGUOUS, or UNKNOWN.
"""
from enum import Enum
from typing import Dict, List, Any, Optional
from rapidfuzz import fuzz


class MatchStatus(str, Enum):
    CONFIRMED = "CONFIRMED"    # Exact primary identifier match (e.g., matching phone or 100% exact name)
    POSSIBLE = "POSSIBLE"      # High fuzzy similarity (e.g., 85% - 99% match on name or alias)
    AMBIGUOUS = "AMBIGUOUS"    # Moderate similarity (e.g., 70% - 84% match)
    UNKNOWN = "UNKNOWN"        # Low similarity (< 70%) or insufficient shared evidence


def normalize_phone(phone_str: Optional[str]) -> str:
    """Strip spaces, dashes, and country prefixes for clean phone matching."""
    if not phone_str:
        return ""
    import re
    cleaned = re.sub(r"[^\d]", "", str(phone_str))
    # If starts with 91 and has 12 digits, strip country code for comparison
    if len(cleaned) == 12 and cleaned.startswith("91"):
        return cleaned[2:]
    return cleaned


def compare_entities(entity_a: Dict[str, Any], entity_b: Dict[str, Any]) -> Dict[str, Any]:
    """Compare two entity records and determine similarity score and match status.

    Args:
        entity_a: Dictionary with entity details (name, aliases, phone, entity_type).
        entity_b: Dictionary with entity details (name, aliases, phone, entity_type).

    Returns:
        dict: {
            "entity_a": entity_a,
            "entity_b": entity_b,
            "confidence": float (0.0 to 1.0),
            "status": MatchStatus ("CONFIRMED", "POSSIBLE", "AMBIGUOUS", "UNKNOWN"),
            "reasons": list of str explaining the determination
        }
    """
    reasons: List[str] = []
    confidence = 0.0
    status = MatchStatus.UNKNOWN

    type_a = entity_a.get("entity_type", "Person")
    type_b = entity_b.get("entity_type", "Person")

    # If entity types differ (e.g., Person vs Vehicle), they are not the same identity
    if type_a != type_b:
        return {
            "entity_a": entity_a,
            "entity_b": entity_b,
            "confidence": 0.0,
            "status": MatchStatus.UNKNOWN,
            "reasons": [f"Different entity types: {type_a} vs {type_b}"],
        }

    # 1. Direct Strong Identifier Matching (e.g. Phone Number or Vehicle Plate)
    phone_a = normalize_phone(entity_a.get("phone"))
    phone_b = normalize_phone(entity_b.get("phone"))

    if phone_a and phone_b and phone_a == phone_b:
        confidence = 1.0
        status = MatchStatus.CONFIRMED
        reasons.append(f"Exact phone number match: {entity_a.get('phone')}")
        return {
            "entity_a": entity_a,
            "entity_b": entity_b,
            "confidence": confidence,
            "status": status,
            "reasons": reasons,
        }

    plate_a = entity_a.get("registration_number", "").strip().upper()
    plate_b = entity_b.get("registration_number", "").strip().upper()
    if plate_a and plate_b:
        if plate_a == plate_b:
            confidence = 1.0
            status = MatchStatus.CONFIRMED
            reasons.append(f"Exact vehicle registration match: {plate_a}")
            return {
                "entity_a": entity_a,
                "entity_b": entity_b,
                "confidence": confidence,
                "status": status,
                "reasons": reasons,
            }

    # 2. Name and Alias Matching using RapidFuzz
    name_a = entity_a.get("name", "").strip()
    name_b = entity_b.get("name", "").strip()

    if not name_a or not name_b:
        return {
            "entity_a": entity_a,
            "entity_b": entity_b,
            "confidence": 0.0,
            "status": MatchStatus.UNKNOWN,
            "reasons": ["Missing name field on one or both entities"],
        }

    # Exact name match
    if name_a.lower() == name_b.lower():
        confidence = 1.0
        status = MatchStatus.CONFIRMED
        reasons.append(f"Exact name match: '{name_a}'")
        return {
            "entity_a": entity_a,
            "entity_b": entity_b,
            "confidence": confidence,
            "status": status,
            "reasons": reasons,
        }

    # Collect all name variations (full name + aliases)
    names_a = [name_a] + entity_a.get("aliases", [])
    names_b = [name_b] + entity_b.get("aliases", [])

    best_score = 0.0
    best_pair = ("", "")

    for n_a in names_a:
        for n_b in names_b:
            # Calculate token sort ratio (resilient to word order like 'Sharma Vikram' vs 'Vikram Sharma')
            score_sort = fuzz.token_sort_ratio(n_a.lower(), n_b.lower())
            score_set = fuzz.token_set_ratio(n_a.lower(), n_b.lower())
            pair_score = max(score_sort, score_set)

            if pair_score > best_score:
                best_score = pair_score
                best_pair = (n_a, n_b)

    # Convert best score (0-100) to normalized confidence (0.0-1.0)
    normalized_score = round(best_score / 100.0, 3)

    if normalized_score >= 0.85:
        confidence = normalized_score
        status = MatchStatus.POSSIBLE
        reasons.append(
            f"High fuzzy similarity ({normalized_score * 100:.1f}%) between '{best_pair[0]}' and '{best_pair[1]}'"
        )
    elif normalized_score >= 0.70:
        confidence = normalized_score
        status = MatchStatus.AMBIGUOUS
        reasons.append(
            f"Moderate fuzzy similarity ({normalized_score * 100:.1f}%) between '{best_pair[0]}' and '{best_pair[1]}'"
        )
    else:
        confidence = normalized_score
        status = MatchStatus.UNKNOWN
        reasons.append(
            f"Low fuzzy similarity ({normalized_score * 100:.1f}%) between '{best_pair[0]}' and '{best_pair[1]}'"
        )

    return {
        "entity_a": entity_a,
        "entity_b": entity_b,
        "confidence": confidence,
        "status": status,
        "reasons": reasons,
    }


def resolve_dataset_identities(
    entities: List[Dict[str, Any]], min_threshold: float = 0.70
) -> List[Dict[str, Any]]:
    """Compare all entity pairs in a list and find potential matches without destructive merging.

    Args:
        entities: List of entity dictionaries.
        min_threshold: Minimum confidence score to include in the output (default 0.70).

    Returns:
        List of match candidate comparisons with status, score, and reasons.
    """
    results: List[Dict[str, Any]] = []
    n = len(entities)

    for i in range(n):
        for j in range(i + 1, n):
            comp = compare_entities(entities[i], entities[j])
            if comp["confidence"] >= min_threshold or comp["status"] in (
                MatchStatus.CONFIRMED,
                MatchStatus.POSSIBLE,
                MatchStatus.AMBIGUOUS,
            ):
                results.append(comp)

    return results

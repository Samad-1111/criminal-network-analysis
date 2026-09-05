"""Relationship Extractor Service.

Analyzes processed document text and extracted entities to discover evidence-based,
linguistically grounded relationships between entities.
"""
from typing import Dict, List, Any, Optional, Tuple
import re
import uuid


# Controlled relationship vocabulary and matching patterns
RELATIONSHIP_PATTERNS: List[Tuple[str, re.Pattern, float]] = [
    (
        "CALLED",
        re.compile(
            r"\b(?:called|dialed|phoned|spoke with|spoke to|incoming call|outgoing call|contacted via phone)\b",
            re.IGNORECASE,
        ),
        0.95,
    ),
    (
        "CONTACTED",
        re.compile(
            r"\b(?:contacted|communicated with|sent message|messaged|texted)\b",
            re.IGNORECASE,
        ),
        0.90,
    ),
    (
        "MET_WITH",
        re.compile(
            r"\b(?:met with|encountered|seen with|spotted with|conferred with|meeting with| rendezvous)\b",
            re.IGNORECASE,
        ),
        0.90,
    ),
    (
        "TRANSFERRED_MONEY_TO",
        re.compile(
            r"\b(?:transferred|paid|sent money|wired|remitted|bribed|paid sum)\b",
            re.IGNORECASE,
        ),
        0.95,
    ),
    (
        "OWNS",
        re.compile(
            r"\b(?:owns|owner of|registered owner|proprietor of)\b",
            re.IGNORECASE,
        ),
        0.90,
    ),
    (
        "OPERATES",
        re.compile(
            r"\b(?:drove|driving|travelling in|traveling in|seen driving|fled in|operating)\b",
            re.IGNORECASE,
        ),
        0.88,
    ),
    (
        "TRAVELLED_TO",
        re.compile(
            r"\b(?:travelled to|traveled to|fled to|went to|headed towards|escaped to)\b",
            re.IGNORECASE,
        ),
        0.85,
    ),
    (
        "PARTICIPATED_IN",
        re.compile(
            r"\b(?:involved in|participated in|perpetrated|executed|charged in|registered case|accused in)\b",
            re.IGNORECASE,
        ),
        0.88,
    ),
    (
        "RELATED_TO",
        re.compile(
            r"\b(?:brother of|father of|son of|wife of|husband of|relative of|sister of|mother of)\b",
            re.IGNORECASE,
        ),
        0.95,
    ),
    (
        "LOCATED_AT",
        re.compile(
            r"\b(?:located at|residing at|hiding at|spotted at|found at|seen at|at|in)\b",
            re.IGNORECASE,
        ),
        0.85,
    ),
    (
        "ASSOCIATED_WITH",
        re.compile(
            r"\b(?:associate of|accomplice of|working with|gang member|along with|together with|co-accused)\b",
            re.IGNORECASE,
        ),
        0.85,
    ),
]


def _split_into_sentences(text: str) -> List[str]:
    """Split raw narrative text into sentence units."""
    if not text:
        return []
    # Split by newline or standard sentence terminators (. ! ?)
    raw_sentences = re.split(r"(?<=[.!?])\s+|\n+", text)
    return [s.strip() for s in raw_sentences if s and len(s.strip()) > 3]


def extract_relationships_from_document_text(
    text: str,
    entities: List[Dict[str, Any]],
    source_document_id: Optional[uuid.UUID] = None,
) -> List[Dict[str, Any]]:
    """Discover evidence-based relationships between entities in document text.

    Args:
        text: Plaintext content of the processed document.
        entities: List of entity dictionaries with keys:
                  'id' (UUID or str), 'name', 'entity_type', 'normalized_value'.
        source_document_id: Supporting document UUID for evidence traceability.

    Returns:
        List of relationship candidates: [
            {
                "source_entity_id": UUID/str,
                "target_entity_id": UUID/str,
                "relationship_type": str,
                "confidence": float,
                "source_document_id": UUID/str or None
            }, ...
        ]
    """
    if not text or not text.strip() or len(entities) < 2:
        return []

    sentences = _split_into_sentences(text)
    discovered_key_map: Dict[Tuple[Any, Any, str], Dict[str, Any]] = {}

    for sentence in sentences:
        sent_lower = sentence.lower()

        # Find which entities are mentioned in this sentence
        present_entities = []
        for ent in entities:
            ent_name = ent.get("name", "").strip().lower()
            ent_norm = ent.get("normalized_value", "").strip().lower()
            
            # Check if name or normalized value appears in sentence
            if (ent_name and ent_name in sent_lower) or (ent_norm and ent_norm in sent_lower):
                present_entities.append(ent)

        if len(present_entities) < 2:
            continue

        # Evaluate pairs of present entities
        n = len(present_entities)
        for i in range(n):
            for j in range(i + 1, n):
                e1 = present_entities[i]
                e2 = present_entities[j]

                # Prevent self-relationships
                e1_id = str(e1.get("id"))
                e2_id = str(e2.get("id"))
                if e1_id == e2_id:
                    continue

                type1 = e1.get("entity_type", "Person")
                type2 = e2.get("entity_type", "Person")

                # Determine relationship type based on evidence patterns and entity types
                rel_type, confidence = _determine_relationship_type(
                    sentence, e1, e2, type1, type2
                )

                if not rel_type:
                    continue

                # Normalise edge direction for asymmetric pairs (Person -> Non-Person)
                source_id, target_id = _orient_edge(e1_id, e2_id, type1, type2)

                rel_key = (source_id, target_id, rel_type)
                existing = discovered_key_map.get(rel_key)

                if not existing or confidence > existing["confidence"]:
                    discovered_key_map[rel_key] = {
                        "source_entity_id": source_id,
                        "target_entity_id": target_id,
                        "relationship_type": rel_type,
                        "confidence": round(confidence, 2),
                        "source_document_id": str(source_document_id) if source_document_id else None,
                    }

    return list(discovered_key_map.values())


def _orient_edge(
    e1_id: str, e2_id: str, type1: str, type2: str
) -> Tuple[str, str]:
    """Orient directed edges logically (e.g. Person -> Phone, Person -> Vehicle, Person -> Location)."""
    # If one entity is Person and the other is not, Person is the source
    if type1 == "Person" and type2 != "Person":
        return e1_id, e2_id
    if type2 == "Person" and type1 != "Person":
        return e2_id, e1_id
    # Default order
    return e1_id, e2_id


def _determine_relationship_type(
    sentence: str,
    e1: Dict[str, Any],
    e2: Dict[str, Any],
    type1: str,
    type2: str,
) -> Tuple[Optional[str], float]:
    """Inspect sentence evidence for specific relationship pattern or fallback rules."""
    sent_lower = sentence.lower()

    # 1. Person <-> Phone
    if (type1 == "Person" and type2 == "Phone") or (type2 == "Person" and type1 == "Phone"):
        # Check explicit calls/messages
        for rel_type, pat, conf in RELATIONSHIP_PATTERNS:
            if pat.search(sentence) and rel_type in ("CALLED", "CONTACTED"):
                return rel_type, conf
        return "USED_PHONE", 0.90

    # 2. Person <-> Vehicle
    if (type1 == "Person" and type2 == "Vehicle") or (type2 == "Person" and type1 == "Vehicle"):
        for rel_type, pat, conf in RELATIONSHIP_PATTERNS:
            if pat.search(sentence) and rel_type in ("OPERATES", "OWNS"):
                return rel_type, conf
        return "ASSOCIATED_WITH", 0.85

    # 3. Person <-> Location
    if (type1 == "Person" and type2 == "Location") or (type2 == "Person" and type1 == "Location"):
        for rel_type, pat, conf in RELATIONSHIP_PATTERNS:
            if pat.search(sentence) and rel_type in ("TRAVELLED_TO", "LOCATED_AT"):
                return rel_type, conf
        return "LOCATED_AT", 0.85

    # 4. Person <-> Event
    if (type1 == "Person" and type2 == "Event") or (type2 == "Person" and type1 == "Event"):
        return "PARTICIPATED_IN", 0.88

    # 5. Person <-> Person (Explicit pattern search)
    for rel_type, pat, conf in RELATIONSHIP_PATTERNS:
        if pat.search(sentence):
            return rel_type, conf

    # Fallback for Person <-> Person co-occurring in the same sentence
    if type1 == "Person" and type2 == "Person":
        return "ASSOCIATED_WITH", 0.75

    return None, 0.0

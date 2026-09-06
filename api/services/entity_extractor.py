"""Entity Extractor Service Adapter.

Connects the raw pipeline/entity_extraction.py module with the backend API service layer,
normalizing and validating all extracted entity types into uniform dictionary payloads ready for database persistence.
"""
from typing import Dict, List, Any
import re
from pipeline.entity_extraction import extract_entities_from_text

# Trailing contextual prepositions, verbs, or connectors accidentally captured at the end of person names
TRAILING_CONTEXT_PATTERN = re.compile(
    r"\s+\b(?:near|at|from|in|with|on|to|by|was|seen|spotted|located|driving|travelling|traveling|alias|aka|met|called|drove)\b.*$",
    re.IGNORECASE,
)

# Leading title or context words that should be stripped from person names
LEADING_CONTEXT_PATTERN = re.compile(
    r"^(?:suspect|accused|individual|person|mr\.|mr|shri|dr\.|dr|mrs\.|mrs|ms\.|ms)\s+",
    re.IGNORECASE,
)

# Leading prepositions accidentally captured in location names
LEADING_LOCATION_PREP = re.compile(
    r"^(?:near|at|in|from|to|around|towards|located at|located in)\s+",
    re.IGNORECASE,
)


def _clean_str(val: Any) -> str:
    """Safely convert value to non-empty string or return empty string."""
    if val is None:
        return ""
    return str(val).strip()


def clean_person_name(name: str) -> str:
    """Clean person name by removing trailing contextual prepositions/verbs and leading titles."""
    if not name:
        return ""

    cleaned = name.strip(" '\".,;:!?()[]{}")
    cleaned = LEADING_CONTEXT_PATTERN.sub("", cleaned).strip()
    cleaned = TRAILING_CONTEXT_PATTERN.sub("", cleaned).strip()
    cleaned = cleaned.strip(" '\".,;:!?()[]{}")
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned


def clean_location_name(name: str) -> str:
    """Clean location name by stripping leading prepositions and collapsing whitespace."""
    if not name:
        return ""

    cleaned = name.strip(" '\".,;:!?()[]{}")
    cleaned = LEADING_LOCATION_PREP.sub("", cleaned).strip()
    cleaned = cleaned.strip(" '\".,;:!?()[]{}")
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned


def is_valid_person_name(name: str) -> bool:
    """Validate person name candidate."""
    if not name or len(name) < 2:
        return False
    if not any(c.isalpha() for c in name):
        return False
    stopwords = {"near", "at", "from", "in", "with", "the", "and", "or", "accused", "suspect", "person"}
    if name.lower() in stopwords:
        return False
    return True


def is_valid_location_name(name: str) -> bool:
    """Validate location name candidate."""
    if not name or len(name) < 2:
        return False
    if not any(c.isalpha() for c in name):
        return False
    stopwords = {"near", "at", "from", "in", "with", "the", "and", "or"}
    if name.lower() in stopwords:
        return False
    return True


def extract_entities_from_document_text(text: str) -> List[Dict[str, Any]]:
    """Extract entities from document text and convert them into uniform database-ready records.

    Rules for normalized_value (guaranteed non-null and non-empty for all entities):
      - Person: clean_person_name(name).strip().lower()
      - Phone: digits-only normalized number string
      - Vehicle: upper-case registration number
      - Location: clean_location_name(location).strip().lower()
      - Event: event title.strip().lower()

    Returns:
        List of dicts: [
            {
                "entity_type": "Person" | "Phone" | "Location" | "Vehicle" | "Event",
                "name": str,
                "normalized_value": str,
                "confidence": float
            },
            ...
        ]
    """
    if not text or not text.strip():
        return []

    raw_results = extract_entities_from_text(text)
    normalized_entities: List[Dict[str, Any]] = []
    seen_keys = set()

    # 1. Process Persons
    for p in raw_results.get("persons", []):
        raw_name = _clean_str(p.get("name"))
        name = clean_person_name(raw_name)
        if not is_valid_person_name(name):
            continue
        norm = re.sub(r"\s+", " ", name).lower()
        key = ("Person", norm)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        normalized_entities.append({
            "entity_type": "Person",
            "name": name,
            "normalized_value": norm,
            "confidence": float(p.get("confidence", 0.90)),
        })

    # 2. Process Phones
    for ph in raw_results.get("phones", []):
        raw_num = _clean_str(ph.get("number"))
        if not raw_num:
            continue
        norm = _clean_str(ph.get("normalized"))
        if not norm:
            norm = re.sub(r"[^\d+]", "", raw_num)
        if not norm or len(norm) < 7:
            continue
        key = ("Phone", norm)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        normalized_entities.append({
            "entity_type": "Phone",
            "name": raw_num,
            "normalized_value": norm,
            "confidence": float(ph.get("confidence", 0.99)),
        })

    # 3. Process Locations
    for loc in raw_results.get("locations", []):
        raw_name = _clean_str(loc.get("name"))
        name = clean_location_name(raw_name)
        if not is_valid_location_name(name):
            continue
        norm = re.sub(r"\s+", " ", name).lower()
        key = ("Location", norm)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        normalized_entities.append({
            "entity_type": "Location",
            "name": name,
            "normalized_value": norm,
            "confidence": float(loc.get("confidence", 0.88)),
        })

    # 4. Process Vehicles
    for v in raw_results.get("vehicles", []):
        reg = _clean_str(v.get("registration_number")).upper()
        reg = re.sub(r"\s+", " ", reg)
        if not reg or len(reg) < 4:
            continue
        norm = reg  # Upper-case normalized plate
        key = ("Vehicle", norm)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        normalized_entities.append({
            "entity_type": "Vehicle",
            "name": reg,
            "normalized_value": norm,
            "confidence": float(v.get("confidence", 0.92)),
        })

    # 5. Process Events
    for ev in raw_results.get("events", []):
        raw_title = _clean_str(ev.get("title"))
        title = re.sub(r"\s+", " ", raw_title).strip(" '\".,;:")
        if not title or len(title) < 2:
            continue
        norm = title.lower()
        key = ("Event", norm)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        normalized_entities.append({
            "entity_type": "Event",
            "name": title,
            "normalized_value": norm,
            "confidence": float(ev.get("confidence", 0.90)),
        })

    return normalized_entities

"""Entity Extractor Service Adapter.

Connects the raw pipeline/entity_extraction.py module with the backend API service layer,
normalizing all extracted entity types into uniform dictionary payloads ready for database persistence.
"""
from typing import Dict, List, Any
import re
from pipeline.entity_extraction import extract_entities_from_text


def _clean_str(val: Any) -> str:
    """Safely convert value to non-empty string or return empty string."""
    if val is None:
        return ""
    return str(val).strip()


def extract_entities_from_document_text(text: str) -> List[Dict[str, Any]]:
    """Extract entities from document text and convert them into uniform database-ready records.

    Rules for normalized_value (guaranteed non-null and non-empty for all entities):
      - Person: name.strip().lower()
      - Phone: digits-only normalized number string
      - Vehicle: upper-case registration number
      - Location: location name.strip().lower()
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

    # 1. Process Persons
    for p in raw_results.get("persons", []):
        name = _clean_str(p.get("name"))
        if not name:
            continue
        norm = name.lower()
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
        # Use existing normalized phone digits from pipeline or fallback to cleaning
        norm = _clean_str(ph.get("normalized"))
        if not norm:
            norm = re.sub(r"[^\d+]", "", raw_num)
        if not norm:
            continue
        normalized_entities.append({
            "entity_type": "Phone",
            "name": raw_num,
            "normalized_value": norm,
            "confidence": float(ph.get("confidence", 0.99)),
        })

    # 3. Process Locations
    for loc in raw_results.get("locations", []):
        name = _clean_str(loc.get("name"))
        if not name:
            continue
        norm = name.lower()
        normalized_entities.append({
            "entity_type": "Location",
            "name": name,
            "normalized_value": norm,
            "confidence": float(loc.get("confidence", 0.88)),
        })

    # 4. Process Vehicles
    for v in raw_results.get("vehicles", []):
        reg = _clean_str(v.get("registration_number")).upper()
        if not reg:
            continue
        norm = reg  # Upper-case normalized plate
        normalized_entities.append({
            "entity_type": "Vehicle",
            "name": reg,
            "normalized_value": norm,
            "confidence": float(v.get("confidence", 0.92)),
        })

    # 5. Process Events
    for ev in raw_results.get("events", []):
        title = _clean_str(ev.get("title"))
        if not title:
            continue
        norm = title.lower()
        normalized_entities.append({
            "entity_type": "Event",
            "name": title,
            "normalized_value": norm,
            "confidence": float(ev.get("confidence", 0.90)),
        })

    return normalized_entities

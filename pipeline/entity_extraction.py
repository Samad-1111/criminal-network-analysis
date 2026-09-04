"""Entity Extraction Module.

Extracts multiple entity types (Person, Phone, Location, Vehicle, Event)
from unstructured narrative texts using spaCy NLP and regex patterns.
"""
from typing import Dict, List, Any
import re
import spacy

# Compile regex patterns for specialized entity types
PHONE_PATTERN = re.compile(
    r"(?:\+91[\-\s]?)?[6-9]\d{9}|\b(?:\+91[\-\s]?)?\d{5}[\-\s]?\d{5}\b"
)

VEHICLE_PLATE_PATTERN = re.compile(
    r"\b[A-Z]{2}[-\s]?[0-9]{1,2}[-\s]?[A-Z]{1,3}[-\s]?[0-9]{4}\b",
    re.IGNORECASE,
)

ALIAS_PATTERN = re.compile(
    r"([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:alias|aka|@)\s+([A-Z][a-z]+)",
    re.IGNORECASE,
)

FIR_EVENT_PATTERN = re.compile(
    r"\b(?:FIR|LOG|CASE)[-\s]?\d{4}[-\s]?\d+\b",
    re.IGNORECASE,
)

# Common crime/event keyword indicators
CRIME_KEYWORDS = [
    "Armed Robbery",
    "Robbery",
    "Extortion",
    "Extortion Threat",
    "Vehicle Theft",
    "Theft",
    "Surveillance Log",
    "Assault",
    "Drug Trafficking",
    "Smuggling",
    "Murder",
    "Kidnapping",
]


def load_spacy_model():
    """Load spaCy model en_core_web_sm, falling back to blank English tokenizer if not installed."""
    try:
        return spacy.load("en_core_web_sm")
    except Exception:
        # Fallback to a blank English model if the full model is not downloaded yet
        return spacy.blank("en")


_nlp = None


def get_nlp():
    """Lazy loader for spaCy NLP instance."""
    global _nlp
    if _nlp is None:
        _nlp = load_spacy_model()
    return _nlp


def extract_entities_from_text(text: str) -> Dict[str, List[Dict[str, Any]]]:
    """Extract multi-type entities (Person, Phone, Location, Vehicle, Event) from narrative text.

    Args:
        text (str): Raw unstructured text (police report / FIR / narrative).

    Returns:
        dict: Grouped lists of extracted entities by type:
              - 'persons': list of dicts with name, aliases, confidence
              - 'phones': list of dicts with number, confidence
              - 'locations': list of dicts with name, confidence
              - 'vehicles': list of dicts with registration_number, confidence
              - 'events': list of dicts with title, incident_type, confidence
    """
    nlp = get_nlp()
    doc = nlp(text)

    persons: List[Dict[str, Any]] = []
    phones: List[Dict[str, Any]] = []
    locations: List[Dict[str, Any]] = []
    vehicles: List[Dict[str, Any]] = []
    events: List[Dict[str, Any]] = []

    seen_persons = set()
    seen_phones = set()
    seen_locations = set()
    seen_vehicles = set()
    seen_events = set()

    # 1. Extract Person and Location using spaCy NER (if model has NER pipeline)
    if "ner" in nlp.pipe_names:
        for ent in doc.ents:
            cleaned_text = ent.text.strip()
            if not cleaned_text:
                continue

            if ent.label_ == "PERSON":
                # Filter out obvious false positives
                if len(cleaned_text) > 2 and cleaned_text.lower() not in seen_persons:
                    seen_persons.add(cleaned_text.lower())
                    persons.append({
                        "entity_type": "Person",
                        "name": cleaned_text,
                        "aliases": [],
                        "confidence": 0.90,
                    })

            elif ent.label_ in ("GPE", "LOC", "FAC"):
                if len(cleaned_text) > 2 and cleaned_text.lower() not in seen_locations:
                    seen_locations.add(cleaned_text.lower())
                    locations.append({
                        "entity_type": "Location",
                        "name": cleaned_text,
                        "confidence": 0.88,
                    })

            elif ent.label_ == "EVENT":
                if cleaned_text.lower() not in seen_events:
                    seen_events.add(cleaned_text.lower())
                    events.append({
                        "entity_type": "Event",
                        "title": cleaned_text,
                        "incident_type": "General Incident",
                        "confidence": 0.85,
                    })

    # 2. Extract Alias pairs (e.g. 'Vikram Sharma alias Vicky')
    for match in ALIAS_PATTERN.finditer(text):
        full_name = match.group(1).strip()
        alias_name = match.group(2).strip()

        # Update existing person or add new
        matched_existing = False
        for p in persons:
            if p["name"].lower() == full_name.lower():
                if alias_name not in p["aliases"]:
                    p["aliases"].append(alias_name)
                matched_existing = True
                break

        if not matched_existing:
            seen_persons.add(full_name.lower())
            persons.append({
                "entity_type": "Person",
                "name": full_name,
                "aliases": [alias_name],
                "confidence": 0.95,
            })

    # 3. Extract Phone numbers using regex
    for match in PHONE_PATTERN.finditer(text):
        raw_num = match.group(0).strip()
        # Clean up punctuation formatting
        normalized = re.sub(r"[^\d+]", "", raw_num)
        if normalized not in seen_phones and len(normalized) >= 10:
            seen_phones.add(normalized)
            phones.append({
                "entity_type": "Phone",
                "number": raw_num,
                "normalized": normalized,
                "confidence": 0.99,
            })

    # 4. Extract Vehicles (License plates)
    for match in VEHICLE_PLATE_PATTERN.finditer(text):
        plate = match.group(0).strip().upper()
        if plate not in seen_vehicles:
            seen_vehicles.add(plate)
            vehicles.append({
                "entity_type": "Vehicle",
                "registration_number": plate,
                "confidence": 0.92,
            })

    # 5. Extract Events / Crimes / FIR IDs
    for match in FIR_EVENT_PATTERN.finditer(text):
        fir_id = match.group(0).strip().upper()
        if fir_id.lower() not in seen_events:
            seen_events.add(fir_id.lower())
            events.append({
                "entity_type": "Event",
                "title": fir_id,
                "incident_type": "Case Record",
                "confidence": 0.95,
            })

    for keyword in CRIME_KEYWORDS:
        if re.search(r"\b" + re.escape(keyword) + r"\b", text, re.IGNORECASE):
            if keyword.lower() not in seen_events:
                seen_events.add(keyword.lower())
                events.append({
                    "entity_type": "Event",
                    "title": keyword,
                    "incident_type": keyword,
                    "confidence": 0.90,
                })

    return {
        "persons": persons,
        "phones": phones,
        "locations": locations,
        "vehicles": vehicles,
        "events": events,
    }

"""Tests for Entity Extraction Quality Cleanup & Normalization."""
import pytest
from api.services.entity_extractor import (
    clean_person_name,
    clean_location_name,
    is_valid_person_name,
    is_valid_location_name,
    extract_entities_from_document_text,
)


def test_clean_person_name_trailing_context():
    """Verify trailing prepositions/verbs are cleaned from person names."""
    assert clean_person_name("Rajesh Kumar near") == "Rajesh Kumar"
    assert clean_person_name("Rajesh Kumar was seen near") == "Rajesh Kumar"
    assert clean_person_name("Rajesh Kumar at") == "Rajesh Kumar"
    assert clean_person_name("Rajesh Kumar with") == "Rajesh Kumar"
    assert clean_person_name("Rajesh Kumar driving") == "Rajesh Kumar"


def test_clean_person_name_whitespace_and_titles():
    """Verify whitespace collapsing and leading title removal."""
    assert clean_person_name("  Rajesh   Kumar  ") == "Rajesh Kumar"
    assert clean_person_name("accused Rajesh Kumar") == "Rajesh Kumar"
    assert clean_person_name("suspect Vikram Sharma") == "Vikram Sharma"
    assert clean_person_name("Mr. Rajesh Kumar") == "Rajesh Kumar"


def test_clean_location_name_leading_prepositions():
    """Verify leading prepositions are stripped from location names."""
    assert clean_location_name("near Noida") == "Noida"
    assert clean_location_name("located in Delhi") == "Delhi"
    assert clean_location_name("  at Sector 18 Noida  ") == "Sector 18 Noida"


def test_valid_name_predicates():
    """Verify validity checks on person and location candidates."""
    assert is_valid_person_name("Rajesh Kumar") is True
    assert is_valid_person_name("Vicky") is True
    assert is_valid_person_name("A") is False  # too short
    assert is_valid_person_name("12345") is False  # no letters
    assert is_valid_person_name("near") is False  # stopword

    assert is_valid_location_name("Noida") is True
    assert is_valid_location_name("Sector 62") is True
    assert is_valid_location_name("in") is False


def test_extract_entities_from_document_text_quality():
    """Verify end-to-end entity extraction quality on sample narrative."""
    text = "Accused Rajesh Kumar was seen near Noida driving vehicle DL-01-AB-1234 with Vikram Sharma."
    entities = extract_entities_from_document_text(text)

    # Person names must be clean
    person_names = [e["name"] for e in entities if e["entity_type"] == "Person"]
    assert "Rajesh Kumar" in person_names
    assert "Vikram Sharma" in person_names
    assert "Rajesh Kumar near" not in person_names
    assert "Rajesh Kumar was seen near" not in person_names

    # Location must be clean
    locations = [e["name"] for e in entities if e["entity_type"] == "Location"]
    assert "Noida" in locations
    assert "near Noida" not in locations

    # Vehicle must be present
    vehicles = [e["name"] for e in entities if e["entity_type"] == "Vehicle"]
    assert "DL-01-AB-1234" in vehicles


def test_entity_deduplication_normalization():
    """Verify normalized_value consistency across case and whitespace variations."""
    text = "Suspect Rajesh Kumar was seen with accused RAJESH KUMAR in Noida."
    entities = extract_entities_from_document_text(text)

    person_entities = [e for e in entities if e["entity_type"] == "Person"]
    # Both variations should resolve to one deduplicated record with normalized_value 'rajesh kumar'
    assert len(person_entities) == 1
    assert person_entities[0]["normalized_value"] == "rajesh kumar"

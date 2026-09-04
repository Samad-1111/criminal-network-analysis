"""Unit tests for multi-entity extraction."""
import pytest
from pipeline.entity_extraction import extract_entities_from_text


def test_extract_phone_numbers():
    text = "Suspect called +91-9876543210 and also sent SMS to 9811223344."
    extracted = extract_entities_from_text(text)
    phones = [p["number"] for p in extracted["phones"]]
    assert len(phones) == 2
    assert "+91-9876543210" in phones
    assert "9811223344" in phones
    for p in extracted["phones"]:
        assert p["entity_type"] == "Phone"
        assert p["confidence"] > 0.9


def test_extract_vehicles():
    text = "Getaway vehicle was a black sedan with plate DL-01-AB-1234, followed by UP-16-XY-9876."
    extracted = extract_entities_from_text(text)
    plates = [v["registration_number"] for v in extracted["vehicles"]]
    assert "DL-01-AB-1234" in plates
    assert "UP-16-XY-9876" in plates
    for v in extracted["vehicles"]:
        assert v["entity_type"] == "Vehicle"


def test_extract_person_alias():
    text = "Vikram Sharma alias Vicky was seen meeting Rajesh Kumar."
    extracted = extract_entities_from_text(text)
    persons = extracted["persons"]
    assert len(persons) >= 1
    # Check that the person entity with alias is extracted
    vicky_entity = next((p for p in persons if "vikram" in p["name"].lower()), None)
    assert vicky_entity is not None
    assert "Vicky" in vicky_entity["aliases"]


def test_extract_events_and_crimes():
    text = "Under FIR-2024-101, an Armed Robbery was reported in Connaught Place."
    extracted = extract_entities_from_text(text)
    events = [e["title"].lower() for e in extracted["events"]]
    assert any("fir-2024-101" in e for e in events)
    assert any("armed robbery" in e for e in events)


def test_extract_all_entity_types_combined():
    text = (
        "In FIR-2024-101 for Armed Robbery, suspect Vikram Sharma alias Vicky was operating "
        "car DL-01-AB-1234 near Sector 18 Noida and calling +91-9876543210."
    )
    extracted = extract_entities_from_text(text)
    assert "persons" in extracted
    assert "phones" in extracted
    assert "locations" in extracted
    assert "vehicles" in extracted
    assert "events" in extracted

    assert len(extracted["phones"]) >= 1
    assert len(extracted["vehicles"]) >= 1
    assert len(extracted["events"]) >= 1

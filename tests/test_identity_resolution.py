"""Unit tests for identity resolution with confidence scores and status flags."""
import pytest
from pipeline.identity_resolution import (
    compare_entities,
    resolve_dataset_identities,
    MatchStatus,
)


def test_confirmed_match_by_phone():
    entity_a = {
        "entity_type": "Person",
        "name": "Vikram Sharma",
        "aliases": ["Vicky"],
        "phone": "+91-9876543210",
    }
    entity_b = {
        "entity_type": "Person",
        "name": "Unknown Caller",
        "aliases": [],
        "phone": "9876543210",
    }
    result = compare_entities(entity_a, entity_b)
    assert result["status"] == MatchStatus.CONFIRMED
    assert result["confidence"] == 1.0
    assert any("phone" in r.lower() for r in result["reasons"])


def test_confirmed_match_by_exact_name():
    entity_a = {"entity_type": "Person", "name": "Rajesh Kumar", "aliases": ["Raju"]}
    entity_b = {"entity_type": "Person", "name": "Rajesh Kumar", "aliases": []}
    result = compare_entities(entity_a, entity_b)
    assert result["status"] == MatchStatus.CONFIRMED
    assert result["confidence"] == 1.0


def test_possible_match_high_similarity():
    entity_a = {"entity_type": "Person", "name": "Vikram Sharma", "aliases": []}
    entity_b = {"entity_type": "Person", "name": "Vikram S.", "aliases": ["Vicky"]}
    result = compare_entities(entity_a, entity_b)
    assert result["status"] in (MatchStatus.POSSIBLE, MatchStatus.AMBIGUOUS)
    assert 0.70 <= result["confidence"] <= 1.0


def test_possible_match_alias_overlap():
    entity_a = {"entity_type": "Person", "name": "Vicky", "aliases": []}
    entity_b = {"entity_type": "Person", "name": "Vikram Sharma", "aliases": ["Vicky"]}
    result = compare_entities(entity_a, entity_b)
    assert result["status"] in (MatchStatus.CONFIRMED, MatchStatus.POSSIBLE)
    assert result["confidence"] >= 0.85


def test_ambiguous_or_unknown_low_similarity():
    entity_a = {"entity_type": "Person", "name": "Vikram Sharma"}
    entity_b = {"entity_type": "Person", "name": "Mohit Gupta"}
    result = compare_entities(entity_a, entity_b)
    assert result["status"] == MatchStatus.UNKNOWN
    assert result["confidence"] < 0.70


def test_different_entity_types_yield_unknown():
    entity_a = {"entity_type": "Person", "name": "Vikram Sharma"}
    entity_b = {"entity_type": "Vehicle", "registration_number": "DL-01-AB-1234"}
    result = compare_entities(entity_a, entity_b)
    assert result["status"] == MatchStatus.UNKNOWN
    assert result["confidence"] == 0.0


def test_resolve_dataset_identities():
    dataset = [
        {"entity_type": "Person", "name": "Vikram Sharma", "aliases": ["Vicky"], "phone": "+91-9876543210"},
        {"entity_type": "Person", "name": "Vikram S.", "aliases": ["Vicky"], "phone": "+91-9876543210"},
        {"entity_type": "Person", "name": "Rajesh Kumar", "phone": "+91-9811223344"},
    ]
    matches = resolve_dataset_identities(dataset, min_threshold=0.70)
    assert len(matches) >= 1
    top_match = matches[0]
    assert top_match["status"] == MatchStatus.CONFIRMED
    assert top_match["confidence"] == 1.0

"""Unit tests for the Relationship Extraction service.

Tests:
    - Explicit CALLED pattern
    - USED_PHONE relationship
    - MET_WITH relationship
    - ASSOCIATED_WITH vehicle pattern
    - LOCATED_AT location pattern
    - Edge cases (no evidence, < 2 entities, duplicate candidates)
"""

import uuid
from api.services.relationship_extractor import extract_relationships_from_document_text


def test_extract_called_relationship():
    """Verify CALLED relationship discovery when explicit phone call language is present."""
    text = "Vikram Sharma called Rajesh Kumar on the evening of June 12."
    e1_id = uuid.uuid4()
    e2_id = uuid.uuid4()
    entities = [
        {"id": e1_id, "name": "Vikram Sharma", "entity_type": "Person", "normalized_value": "vikram sharma"},
        {"id": e2_id, "name": "Rajesh Kumar", "entity_type": "Person", "normalized_value": "rajesh kumar"},
    ]

    rels = extract_relationships_from_document_text(text, entities)
    assert len(rels) == 1
    rel = rels[0]
    assert rel["relationship_type"] == "CALLED"
    assert rel["confidence"] >= 0.90
    assert {str(rel["source_entity_id"]), str(rel["target_entity_id"])} == {str(e1_id), str(e2_id)}


def test_extract_used_phone_relationship():
    """Verify Person to Phone maps to USED_PHONE."""
    text = "Rahul Verma was using phone number +919876543210 during the incident."
    e1_id = uuid.uuid4()
    e2_id = uuid.uuid4()
    entities = [
        {"id": e1_id, "name": "Rahul Verma", "entity_type": "Person", "normalized_value": "rahul verma"},
        {"id": e2_id, "name": "+919876543210", "entity_type": "Phone", "normalized_value": "919876543210"},
    ]

    rels = extract_relationships_from_document_text(text, entities)
    assert len(rels) == 1
    rel = rels[0]
    assert rel["relationship_type"] == "USED_PHONE"
    # Person should be source
    assert str(rel["source_entity_id"]) == str(e1_id)
    assert str(rel["target_entity_id"]) == str(e2_id)


def test_extract_met_with_relationship():
    """Verify MET_WITH pattern detection."""
    text = "Suspect Vicky met with Rajesh Kumar near the restaurant."
    e1_id = uuid.uuid4()
    e2_id = uuid.uuid4()
    entities = [
        {"id": e1_id, "name": "Vicky", "entity_type": "Person", "normalized_value": "vicky"},
        {"id": e2_id, "name": "Rajesh Kumar", "entity_type": "Person", "normalized_value": "rajesh kumar"},
    ]

    rels = extract_relationships_from_document_text(text, entities)
    assert len(rels) == 1
    assert rels[0]["relationship_type"] == "MET_WITH"


def test_extract_vehicle_relationship():
    """Verify vehicle association pattern."""
    text = "Rajesh Kumar was driving vehicle DL-01-AB-1234."
    e1_id = uuid.uuid4()
    e2_id = uuid.uuid4()
    entities = [
        {"id": e1_id, "name": "Rajesh Kumar", "entity_type": "Person", "normalized_value": "rajesh kumar"},
        {"id": e2_id, "name": "DL-01-AB-1234", "entity_type": "Vehicle", "normalized_value": "DL-01-AB-1234"},
    ]

    rels = extract_relationships_from_document_text(text, entities)
    assert len(rels) == 1
    assert rels[0]["relationship_type"] == "OPERATES"
    assert str(rels[0]["source_entity_id"]) == str(e1_id)


def test_extract_location_relationship():
    """Verify location pattern detection."""
    text = "Vikram Sharma was spotted at Sector 62 Noida."
    e1_id = uuid.uuid4()
    e2_id = uuid.uuid4()
    entities = [
        {"id": e1_id, "name": "Vikram Sharma", "entity_type": "Person", "normalized_value": "vikram sharma"},
        {"id": e2_id, "name": "Sector 62 Noida", "entity_type": "Location", "normalized_value": "sector 62 noida"},
    ]

    rels = extract_relationships_from_document_text(text, entities)
    assert len(rels) == 1
    assert rels[0]["relationship_type"] == "LOCATED_AT"
    assert str(rels[0]["source_entity_id"]) == str(e1_id)


def test_no_relationship_when_entities_in_different_sentences():
    """Verify entities in unrelated sentences produce no relationship."""
    text = "Vikram Sharma was born in Delhi. Meanwhile in Mumbai, a robbery occurred."
    e1_id = uuid.uuid4()
    e2_id = uuid.uuid4()
    entities = [
        {"id": e1_id, "name": "Vikram Sharma", "entity_type": "Person", "normalized_value": "vikram sharma"},
        {"id": e2_id, "name": "Mumbai", "entity_type": "Location", "normalized_value": "mumbai"},
    ]

    rels = extract_relationships_from_document_text(text, entities)
    assert len(rels) == 0


def test_graceful_on_fewer_than_two_entities():
    """Verify graceful empty response when fewer than 2 entities are passed."""
    text = "Vikram Sharma called."
    entities = [
        {"id": uuid.uuid4(), "name": "Vikram Sharma", "entity_type": "Person", "normalized_value": "vikram sharma"}
    ]
    rels = extract_relationships_from_document_text(text, entities)
    assert len(rels) == 0

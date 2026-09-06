"""Tests for Evidence-Based Relationship Extraction Quality & Evidence Snippets."""
import pytest
import uuid
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from api.database import Base
from api.services.relationship_extractor import extract_relationships_from_document_text
from api.services.investigation_graph import get_investigation_graph
from api import crud

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def test_person_operates_vehicle_relationship():
    """Verify Person -> Vehicle OPERATES relationship extraction."""
    text = "Rajesh Kumar was driving vehicle DL-01-AB-1234 near Noida."
    entities = [
        {"id": "ent-1", "name": "Rajesh Kumar", "entity_type": "Person", "normalized_value": "rajesh kumar"},
        {"id": "ent-2", "name": "DL-01-AB-1234", "entity_type": "Vehicle", "normalized_value": "DL-01-AB-1234"},
    ]

    rels = extract_relationships_from_document_text(text, entities)
    assert len(rels) == 1
    rel = rels[0]
    assert rel["source_entity_id"] == "ent-1"
    assert rel["target_entity_id"] == "ent-2"
    assert rel["relationship_type"] == "OPERATES"
    assert rel["evidence_snippet"] == text


def test_person_owns_vehicle_relationship():
    """Verify Person -> Vehicle OWNS relationship extraction."""
    text = "Rajesh Kumar is the registered owner of DL-01-AB-1234."
    entities = [
        {"id": "ent-1", "name": "Rajesh Kumar", "entity_type": "Person", "normalized_value": "rajesh kumar"},
        {"id": "ent-2", "name": "DL-01-AB-1234", "entity_type": "Vehicle", "normalized_value": "DL-01-AB-1234"},
    ]

    rels = extract_relationships_from_document_text(text, entities)
    assert len(rels) == 1
    assert rels[0]["relationship_type"] == "OWNS"


def test_person_uses_phone_relationship():
    """Verify Person -> Phone USED_PHONE relationship extraction."""
    text = "Rajesh Kumar used 9876543210 to communicate."
    entities = [
        {"id": "ent-1", "name": "Rajesh Kumar", "entity_type": "Person", "normalized_value": "rajesh kumar"},
        {"id": "ent-2", "name": "9876543210", "entity_type": "Phone", "normalized_value": "9876543210"},
    ]

    rels = extract_relationships_from_document_text(text, entities)
    assert len(rels) == 1
    assert rels[0]["relationship_type"] == "USED_PHONE"


def test_person_met_with_person_relationship():
    """Verify Person -> Person MET_WITH relationship extraction."""
    text = "Rajesh Kumar met with Vikram Sharma at the hotel."
    entities = [
        {"id": "ent-1", "name": "Rajesh Kumar", "entity_type": "Person", "normalized_value": "rajesh kumar"},
        {"id": "ent-2", "name": "Vikram Sharma", "entity_type": "Person", "normalized_value": "vikram sharma"},
    ]

    rels = extract_relationships_from_document_text(text, entities)
    assert len(rels) == 1
    assert rels[0]["relationship_type"] == "MET_WITH"


def test_person_transferred_money_relationship():
    """Verify Person -> Person TRANSFERRED_MONEY_TO relationship extraction."""
    text = "Rajesh Kumar transferred Rs 50,000 to Vikram Sharma."
    entities = [
        {"id": "ent-1", "name": "Rajesh Kumar", "entity_type": "Person", "normalized_value": "rajesh kumar"},
        {"id": "ent-2", "name": "Vikram Sharma", "entity_type": "Person", "normalized_value": "vikram sharma"},
    ]

    rels = extract_relationships_from_document_text(text, entities)
    assert len(rels) == 1
    assert rels[0]["relationship_type"] == "TRANSFERRED_MONEY_TO"


def test_no_relationship_without_textual_evidence():
    """Verify no relationship is generated when entities appear in different sentences without evidence."""
    text = "Rajesh Kumar was in Delhi. DL-01-AB-1234 was found parked elsewhere."
    entities = [
        {"id": "ent-1", "name": "Rajesh Kumar", "entity_type": "Person", "normalized_value": "rajesh kumar"},
        {"id": "ent-2", "name": "DL-01-AB-1234", "entity_type": "Vehicle", "normalized_value": "DL-01-AB-1234"},
    ]

    rels = extract_relationships_from_document_text(text, entities)
    assert len(rels) == 0


def test_isolated_entities_preserved_in_graph():
    """Verify isolated entities without relationships remain in the graph as unconnected nodes."""
    db = TestingSessionLocal()
    try:
        inv = crud.create_investigation(
            db,
            type("InvCreate", (), {"case_number": f"TEST-ISO-{uuid.uuid4().hex[:6]}", "title": "Isolated Test", "description": None, "status": "OPEN"})()
        )

        ent1, _ = crud.get_or_create_entity(db, inv.id, "Person", "Rajesh Kumar", "rajesh kumar", 1.0)
        ent2, _ = crud.get_or_create_entity(db, inv.id, "Vehicle", "DL-01-AB-1234", "DL-01-AB-1234", 1.0)

        # Do not create any relationship between ent1 and ent2
        graph = get_investigation_graph(db, inv.id)

        assert len(graph["nodes"]) == 2
        assert len(graph["edges"]) == 0
    finally:
        db.close()

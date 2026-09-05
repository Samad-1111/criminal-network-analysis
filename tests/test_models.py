"""Unit tests for database models and Pydantic schemas."""

import uuid
from datetime import datetime, timezone

from api.models import Investigation, Document, Entity, Relationship
from api.schemas import (
    InvestigationCreate,
    InvestigationRead,
    DocumentRead,
    EntityRead,
    RelationshipRead,
)


def test_investigation_model_and_schema():
    investigation_id = uuid.uuid4()
    now = datetime.now(timezone.utc)

    inv = Investigation(
        id=investigation_id,
        case_number="CAS-TEST-001",
        title="Test Investigation",
        description="Test case description",
        status="OPEN",
        created_at=now,
        updated_at=now,
    )

    schema_read = InvestigationRead.model_validate(inv)
    assert schema_read.id == investigation_id
    assert schema_read.case_number == "CAS-TEST-001"
    assert schema_read.title == "Test Investigation"
    assert schema_read.status == "OPEN"


def test_document_model_and_schema():
    doc_id = uuid.uuid4()
    inv_id = uuid.uuid4()
    now = datetime.now(timezone.utc)

    doc = Document(
        id=doc_id,
        investigation_id=inv_id,
        document_type="CDR",
        original_filename="call_records.csv",
        file_type="csv",
        storage_path="/storage/call_records.csv",
        processing_status="COMPLETED",
        uploaded_at=now,
    )

    schema_read = DocumentRead.model_validate(doc)
    assert schema_read.id == doc_id
    assert schema_read.investigation_id == inv_id
    assert schema_read.document_type == "CDR"
    assert schema_read.processing_status == "COMPLETED"


def test_entity_model_and_schema():
    entity_id = uuid.uuid4()
    inv_id = uuid.uuid4()
    now = datetime.now(timezone.utc)

    entity = Entity(
        id=entity_id,
        investigation_id=inv_id,
        entity_type="Person",
        name="Vikram Sharma",
        normalized_value="vikram sharma",
        confidence=0.95,
        created_at=now,
    )

    schema_read = EntityRead.model_validate(entity)
    assert schema_read.id == entity_id
    assert schema_read.entity_type == "Person"
    assert schema_read.name == "Vikram Sharma"
    assert schema_read.confidence == 0.95


def test_relationship_model_and_schema():
    rel_id = uuid.uuid4()
    inv_id = uuid.uuid4()
    src_id = uuid.uuid4()
    tgt_id = uuid.uuid4()
    doc_id = uuid.uuid4()
    now = datetime.now(timezone.utc)

    rel = Relationship(
        id=rel_id,
        investigation_id=inv_id,
        source_entity_id=src_id,
        target_entity_id=tgt_id,
        relationship_type="CALLED",
        confidence=0.9,
        source_document_id=doc_id,
        created_at=now,
    )

    schema_read = RelationshipRead.model_validate(rel)
    assert schema_read.id == rel_id
    assert schema_read.source_entity_id == src_id
    assert schema_read.target_entity_id == tgt_id
    assert schema_read.relationship_type == "CALLED"
    assert schema_read.source_document_id == doc_id

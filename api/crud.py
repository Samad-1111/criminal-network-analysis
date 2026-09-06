"""CRUD (Create, Read, Update, Delete) database operations for Criminal Network Analysis."""

from typing import List, Optional
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from api.models import Investigation, Document, Entity, Relationship
from api.schemas import (
    InvestigationCreate,
    DocumentCreate,
    EntityCreate,
    RelationshipCreate,
)


# --- Investigation CRUD ---

def create_investigation(db: Session, investigation: InvestigationCreate) -> Investigation:
    """Create a new investigation record."""
    db_obj = Investigation(
        case_number=investigation.case_number,
        title=investigation.title,
        description=investigation.description,
        status=investigation.status,
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def get_investigations(
    db: Session, skip: int = 0, limit: int = 100
) -> List[Investigation]:
    """Retrieve list of investigations with pagination."""
    stmt = select(Investigation).offset(skip).limit(limit)
    return list(db.scalars(stmt).all())


def get_investigation(
    db: Session, investigation_id: uuid.UUID
) -> Optional[Investigation]:
    """Retrieve a single investigation by UUID primary key."""
    stmt = select(Investigation).where(Investigation.id == investigation_id)
    return db.scalars(stmt).first()


def get_investigation_by_case_number(
    db: Session, case_number: str
) -> Optional[Investigation]:
    """Retrieve an investigation by unique case number."""
    stmt = select(Investigation).where(Investigation.case_number == case_number)
    return db.scalars(stmt).first()


def delete_investigation(db: Session, investigation_id: uuid.UUID) -> bool:
    """Delete an investigation by UUID. Cascades delete to documents, entities, relationships."""
    db_obj = get_investigation(db, investigation_id)
    if not db_obj:
        return False
    db.delete(db_obj)
    db.commit()
    return True


# --- Document CRUD ---

def create_document(
    db: Session, investigation_id: uuid.UUID, document: DocumentCreate
) -> Document:
    """Create a document record linked to an investigation."""
    db_obj = Document(
        investigation_id=investigation_id,
        document_type=document.document_type,
        original_filename=document.original_filename,
        stored_filename=document.stored_filename,
        file_type=document.file_type,
        file_size=document.file_size,
        content_type=document.content_type,
        storage_path=document.storage_path,
        processing_status=document.processing_status,
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def get_documents(
    db: Session, investigation_id: uuid.UUID
) -> List[Document]:
    """Retrieve all documents associated with an investigation."""
    stmt = select(Document).where(Document.investigation_id == investigation_id)
    return list(db.scalars(stmt).all())


def get_document(
    db: Session, investigation_id: uuid.UUID, document_id: uuid.UUID
) -> Optional[Document]:
    """Retrieve a single document by ID within an investigation."""
    stmt = select(Document).where(
        Document.id == document_id,
        Document.investigation_id == investigation_id,
    )
    return db.scalars(stmt).first()


def update_document_processing_result(
    db: Session,
    document: Document,
    *,
    status: str,
    extracted_text: Optional[str] = None,
    error: Optional[str] = None,
) -> Document:
    """Update a document's processing status, extracted text, and error message.

    Args:
        db: Active database session.
        document: SQLAlchemy Document ORM instance to update.
        status: New processing_status value (PROCESSING, COMPLETED, FAILED).
        extracted_text: Full extracted plain text on success; None otherwise.
        error: Error description string on failure; None otherwise.

    Returns:
        Refreshed Document ORM instance with updated fields.
    """
    document.processing_status = status
    document.extracted_text = extracted_text
    document.processing_error = error
    db.commit()
    db.refresh(document)
    return document



def create_entity(
    db: Session, investigation_id: uuid.UUID, entity: EntityCreate
) -> Entity:
    """Create an entity record linked to an investigation."""
    normalized = entity.normalized_value or entity.name.strip().lower()
    db_obj = Entity(
        investigation_id=investigation_id,
        entity_type=entity.entity_type,
        name=entity.name,
        normalized_value=normalized,
        confidence=entity.confidence,
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def get_entities(
    db: Session, investigation_id: uuid.UUID
) -> List[Entity]:
    """Retrieve all entities associated with an investigation."""
    stmt = select(Entity).where(Entity.investigation_id == investigation_id)
    return list(db.scalars(stmt).all())


def get_entity_by_normalized(
    db: Session, investigation_id: uuid.UUID, entity_type: str, normalized_value: str
) -> Optional[Entity]:
    """Lookup entity by idempotency key (investigation_id, entity_type, normalized_value)."""
    stmt = select(Entity).where(
        Entity.investigation_id == investigation_id,
        Entity.entity_type == entity_type,
        Entity.normalized_value == normalized_value,
    )
    return db.scalars(stmt).first()


def get_or_create_entity(
    db: Session,
    investigation_id: uuid.UUID,
    entity_type: str,
    name: str,
    normalized_value: str,
    confidence: float,
) -> tuple[Entity, bool]:
    """Return existing entity or create new one. Returns (entity, was_created)."""
    existing = get_entity_by_normalized(db, investigation_id, entity_type, normalized_value)
    if existing:
        return existing, False
    db_obj = Entity(
        investigation_id=investigation_id,
        entity_type=entity_type,
        name=name,
        normalized_value=normalized_value,
        confidence=confidence,
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj, True


# --- Relationship CRUD ---

def create_relationship(
    db: Session, investigation_id: uuid.UUID, relationship: RelationshipCreate
) -> Relationship:
    """Create a relationship edge between two entities linked to an investigation."""
    db_obj = Relationship(
        investigation_id=investigation_id,
        source_entity_id=relationship.source_entity_id,
        target_entity_id=relationship.target_entity_id,
        relationship_type=relationship.relationship_type,
        confidence=relationship.confidence,
        source_document_id=relationship.source_document_id,
        evidence_snippet=relationship.evidence_snippet,
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def get_relationships(
    db: Session, investigation_id: uuid.UUID
) -> List[Relationship]:
    """Retrieve all relationships associated with an investigation."""
    stmt = select(Relationship).where(Relationship.investigation_id == investigation_id)
    return list(db.scalars(stmt).all())


def get_relationship_by_unique_key(
    db: Session,
    investigation_id: uuid.UUID,
    source_entity_id: uuid.UUID,
    target_entity_id: uuid.UUID,
    relationship_type: str,
) -> Optional[Relationship]:
    """Lookup relationship by idempotency key (investigation_id, source_entity_id, target_entity_id, relationship_type)."""
    stmt = select(Relationship).where(
        Relationship.investigation_id == investigation_id,
        Relationship.source_entity_id == source_entity_id,
        Relationship.target_entity_id == target_entity_id,
        Relationship.relationship_type == relationship_type,
    )
    return db.scalars(stmt).first()


def get_or_create_relationship(
    db: Session,
    investigation_id: uuid.UUID,
    source_entity_id: uuid.UUID,
    target_entity_id: uuid.UUID,
    relationship_type: str,
    confidence: float,
    source_document_id: Optional[uuid.UUID] = None,
    evidence_snippet: Optional[str] = None,
) -> tuple[Relationship, bool]:
    """Return existing relationship or create a new one. Returns (relationship, was_created)."""
    existing = get_relationship_by_unique_key(
        db, investigation_id, source_entity_id, target_entity_id, relationship_type
    )
    if existing:
        return existing, False
    db_obj = Relationship(
        investigation_id=investigation_id,
        source_entity_id=source_entity_id,
        target_entity_id=target_entity_id,
        relationship_type=relationship_type,
        confidence=confidence,
        source_document_id=source_document_id,
        evidence_snippet=evidence_snippet,
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj, True

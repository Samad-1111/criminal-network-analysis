"""SQLAlchemy 2.x Database Models for Criminal Network Analysis."""

from datetime import datetime, timezone
import uuid
from typing import List, Optional

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.database import Base


def utc_now() -> datetime:
    """Return current timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)


class Investigation(Base):
    """Investigation case container for documents, entities, and relationships."""

    __tablename__ = "investigations"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    case_number: Mapped[str] = mapped_column(
        String(100), unique=True, index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), default="OPEN", index=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    # Relationships
    documents: Mapped[List["Document"]] = relationship(
        "Document",
        back_populates="investigation",
        cascade="all, delete-orphan",
    )
    entities: Mapped[List["Entity"]] = relationship(
        "Entity",
        back_populates="investigation",
        cascade="all, delete-orphan",
    )
    relationships: Mapped[List["Relationship"]] = relationship(
        "Relationship",
        back_populates="investigation",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Investigation(id={self.id}, case_number='{self.case_number}', title='{self.title}')>"


class Document(Base):
    """Uploaded or ingested intelligence document record.

    Extensible support for document types:
    PDF, DOCX, CSV, TXT, CDR, Financial records, Surveillance reports, etc.
    """

    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    investigation_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("investigations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    document_type: Mapped[str] = mapped_column(
        String(50), default="OTHER", index=True, nullable=False
    )
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_filename: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    file_type: Mapped[str] = mapped_column(String(50), nullable=False)
    file_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    content_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    storage_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    processing_status: Mapped[str] = mapped_column(
        String(50), default="PENDING", index=True, nullable=False
    )
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    # Relationships
    investigation: Mapped["Investigation"] = relationship(
        "Investigation", back_populates="documents"
    )
    source_relationships: Mapped[List["Relationship"]] = relationship(
        "Relationship", back_populates="source_document"
    )

    def __repr__(self) -> str:
        return f"<Document(id={self.id}, original_filename='{self.original_filename}', document_type='{self.document_type}')>"


class Entity(Base):
    """Extracted intelligence entity record (Person, Phone, Location, Vehicle, Event, BankAccount, etc.)."""

    __tablename__ = "entities"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    investigation_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("investigations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    entity_type: Mapped[str] = mapped_column(
        String(50), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    normalized_value: Mapped[Optional[str]] = mapped_column(
        String(255), index=True, nullable=True
    )
    confidence: Mapped[float] = mapped_column(
        Float, default=1.0, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    # Relationships
    investigation: Mapped["Investigation"] = relationship(
        "Investigation", back_populates="entities"
    )
    source_relationships: Mapped[List["Relationship"]] = relationship(
        "Relationship",
        foreign_keys="[Relationship.source_entity_id]",
        back_populates="source_entity",
        cascade="all, delete-orphan",
    )
    target_relationships: Mapped[List["Relationship"]] = relationship(
        "Relationship",
        foreign_keys="[Relationship.target_entity_id]",
        back_populates="target_entity",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("idx_entity_investigation_type", "investigation_id", "entity_type"),
    )

    def __repr__(self) -> str:
        return f"<Entity(id={self.id}, entity_type='{self.entity_type}', name='{self.name}')>"


class Relationship(Base):
    """Directed connection edge between two entities with optional supporting document evidence."""

    __tablename__ = "relationships"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    investigation_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("investigations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    source_entity_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("entities.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    target_entity_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("entities.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    relationship_type: Mapped[str] = mapped_column(
        String(100), index=True, nullable=False
    )
    confidence: Mapped[float] = mapped_column(
        Float, default=1.0, nullable=False
    )
    source_document_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("documents.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    # Relationships
    investigation: Mapped["Investigation"] = relationship(
        "Investigation", back_populates="relationships"
    )
    source_entity: Mapped["Entity"] = relationship(
        "Entity",
        foreign_keys=[source_entity_id],
        back_populates="source_relationships",
    )
    target_entity: Mapped["Entity"] = relationship(
        "Entity",
        foreign_keys=[target_entity_id],
        back_populates="target_relationships",
    )
    source_document: Mapped[Optional["Document"]] = relationship(
        "Document", back_populates="source_relationships"
    )

    __table_args__ = (
        Index("idx_rel_investigation_type", "investigation_id", "relationship_type"),
        Index("idx_rel_source_target", "source_entity_id", "target_entity_id"),
    )

    def __repr__(self) -> str:
        return f"<Relationship(id={self.id}, type='{self.relationship_type}', source={self.source_entity_id}, target={self.target_entity_id})>"

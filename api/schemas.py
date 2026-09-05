"""Pydantic v2 Schemas for Criminal Network Analysis Database Models."""

from datetime import datetime
import uuid
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


# --- Investigation Schemas ---

class InvestigationBase(BaseModel):
    case_number: str = Field(..., description="Unique case reference number", examples=["CAS-2026-001"])
    title: str = Field(..., description="Title of the investigation", examples=["Operation Blackout"])
    description: Optional[str] = Field(None, description="Detailed description or context of the investigation")
    status: str = Field("OPEN", description="Investigation status (OPEN, CLOSED, IN_PROGRESS, ARCHIVED)")


class InvestigationCreate(InvestigationBase):
    pass


class InvestigationRead(InvestigationBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime


# --- Document Schemas ---

class DocumentBase(BaseModel):
    document_type: str = Field(
        "OTHER",
        description="Type of document (PDF, DOCX, CSV, TXT, CDR, FINANCIAL, SURVEILLANCE, INTEL_REPORT, OTHER)"
    )
    original_filename: str = Field(..., description="Original filename of uploaded file")
    stored_filename: Optional[str] = Field(None, description="Collision-free stored filename")
    file_type: str = Field(..., description="File extension or MIME type (e.g. pdf, docx, csv, txt)")
    file_size: Optional[int] = Field(None, description="Size of file in bytes")
    content_type: Optional[str] = Field(None, description="MIME content type")
    storage_path: Optional[str] = Field(None, description="Storage location path")
    processing_status: str = Field("PENDING", description="Document processing status (PENDING, PROCESSING, COMPLETED, FAILED)")
    extracted_text: Optional[str] = Field(None, description="Extracted plain-text content from the document")
    processing_error: Optional[str] = Field(None, description="Error message if processing failed")


class DocumentCreate(DocumentBase):
    pass


class DocumentRead(DocumentBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    investigation_id: uuid.UUID
    uploaded_at: datetime


# --- Entity Schemas ---

class EntityBase(BaseModel):
    entity_type: str = Field(..., description="Entity type (Person, Phone, Location, Vehicle, Event, BankAccount, etc.)")
    name: str = Field(..., description="Name or main identifier of the entity")
    normalized_value: Optional[str] = Field(None, description="Normalized value for identity resolution")
    confidence: float = Field(1.0, ge=0.0, le=1.0, description="Confidence score of extracted entity")


class EntityCreate(EntityBase):
    pass


class EntityRead(EntityBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    investigation_id: uuid.UUID
    created_at: datetime


class EntityExtractionResponse(BaseModel):
    entities_saved: int
    entities_total: int
    identity_matches: list[dict] = Field(default_factory=list)
    entities: list[EntityRead]


# --- Relationship Schemas ---

class RelationshipBase(BaseModel):
    relationship_type: str = Field(..., description="Type of connection (ASSOCIATE_OF, CALLED, OWNS_VEHICLE, LOCATED_AT, etc.)")
    confidence: float = Field(1.0, ge=0.0, le=1.0, description="Confidence score of relationship edge")


class RelationshipCreate(RelationshipBase):
    source_entity_id: uuid.UUID = Field(..., description="UUID of source entity")
    target_entity_id: uuid.UUID = Field(..., description="UUID of target entity")
    source_document_id: Optional[uuid.UUID] = Field(None, description="Optional supporting document UUID")


class RelationshipRead(RelationshipBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    investigation_id: uuid.UUID
    source_entity_id: uuid.UUID
    target_entity_id: uuid.UUID
    source_document_id: Optional[uuid.UUID] = None
    created_at: datetime


class RelationshipExtractionResponse(BaseModel):
    relationships_saved: int
    relationships_total: int
    relationships: list[RelationshipRead]


class GraphNode(BaseModel):
    id: str
    label: str
    entity_type: str
    confidence: float = 1.0
    normalized_value: Optional[str] = None
    degree_centrality: float = 0.0
    betweenness_centrality: float = 0.0


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    relationship_type: str
    confidence: float = 1.0
    source_document_id: Optional[str] = None


class InvestigationGraphResponse(BaseModel):
    investigation_id: str
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    metrics: dict = Field(default_factory=dict)



"""Document storage service for file validation, safe local saving, and cleanup handling."""

import os
from pathlib import Path
import re
import uuid
from typing import Dict, Set

from fastapi import HTTPException, UploadFile, status

ALLOWED_EXTENSIONS: Set[str] = {".pdf", ".docx", ".txt", ".csv"}
DEFAULT_MAX_FILE_SIZE_BYTES: int = 50 * 1024 * 1024  # 50 MB
DEFAULT_UPLOAD_DIR: str = "uploads"


def get_file_extension(filename: str) -> str:
    """Extract lowercase file extension from filename."""
    if not filename:
        return ""
    ext = Path(filename).suffix.lower()
    return ext


def get_document_type(extension: str) -> str:
    """Map file extension to standard document_type string."""
    ext = extension.lstrip(".").upper()
    if ext in ("PDF", "DOCX", "TXT", "CSV"):
        return ext
    return "OTHER"


def sanitize_filename(filename: str) -> str:
    """Sanitize original filename to avoid directory traversal or unsafe characters."""
    filename = os.path.basename(filename)
    # Remove characters that aren't alphanumeric, dots, dashes, or underscores
    sanitized = re.sub(r"[^\w\.-]", "_", filename)
    return sanitized or "file"


def validate_upload_file(
    file: UploadFile,
    max_size_bytes: int = DEFAULT_MAX_FILE_SIZE_BYTES,
) -> str:
    """Validate uploaded file type, name, and size.

    Returns the validated file extension.
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename cannot be empty.",
        )

    ext = get_file_extension(file.filename)
    if ext not in ALLOWED_EXTENSIONS:
        allowed_str = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{ext}'. Allowed file types: {allowed_str}",
        )

    # Check size if available on UploadFile header
    if file.size is not None:
        if file.size == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty (0 bytes).",
            )
        if file.size > max_size_bytes:
            max_mb = max_size_bytes // (1024 * 1024)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File size exceeds maximum limit of {max_mb} MB.",
            )

    return ext


def save_document_file(
    upload_file: UploadFile,
    investigation_id: uuid.UUID,
    base_upload_dir: str = None,
) -> Dict[str, str | int]:
    """Save an UploadFile to disk in a structured investigation directory.

    Directory format: base_upload_dir/investigations/{investigation_id}/{stored_filename}

    Returns metadata dictionary for database insertion.
    """
    ext = validate_upload_file(upload_file)
    upload_dir = base_upload_dir or DEFAULT_UPLOAD_DIR

    # Construct directory path
    target_dir = Path(upload_dir) / "investigations" / str(investigation_id)
    target_dir.mkdir(parents=True, exist_ok=True)

    # Generate unique collision-free filename
    unique_prefix = uuid.uuid4().hex[:12]
    clean_orig_name = sanitize_filename(upload_file.filename or "uploaded_file")
    stored_filename = f"{unique_prefix}_{clean_orig_name}"
    file_path = target_dir / stored_filename

    # Read and write content to verify size & store file safely
    bytes_written = 0
    upload_file.file.seek(0)
    
    with open(file_path, "wb") as buffer:
        while chunk := upload_file.file.read(1024 * 1024):  # 1MB chunks
            buffer.write(chunk)
            bytes_written += len(chunk)

    if bytes_written == 0:
        # Remove empty file created
        delete_stored_file(str(file_path))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty (0 bytes).",
        )

    if bytes_written > DEFAULT_MAX_FILE_SIZE_BYTES:
        delete_stored_file(str(file_path))
        max_mb = DEFAULT_MAX_FILE_SIZE_BYTES // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds maximum limit of {max_mb} MB.",
        )

    return {
        "original_filename": upload_file.filename or "uploaded_file",
        "stored_filename": stored_filename,
        "file_type": ext.lstrip("."),
        "document_type": get_document_type(ext),
        "file_size": bytes_written,
        "content_type": upload_file.content_type or "application/octet-stream",
        "storage_path": str(file_path.as_posix()),
    }


def delete_stored_file(file_path: str) -> bool:
    """Safely delete a physical file if it exists."""
    if not file_path:
        return False
    path = Path(file_path)
    if path.exists() and path.is_file():
        try:
            path.unlink()
            return True
        except OSError:
            return False
    return False

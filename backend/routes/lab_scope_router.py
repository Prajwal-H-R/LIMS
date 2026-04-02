# backend/routes/lab_scope_router.py

from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, Response
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from typing import List, Optional

from backend.schemas.lab_scope_schemas import (
    LabScopeResponse,
)
from backend.models.lab_scope import LabScope
from backend.db import get_db
from backend.auth import get_current_user
from backend.schemas.user_schemas import UserResponse

router = APIRouter(
    prefix="/lab-scope",
    tags=["Laboratory Scope"],
)

MAX_DOCUMENT_SIZE = 25 * 1024 * 1024  # 25 MB
ALLOWED_DOCUMENT_MIME_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def _to_response(record: LabScope) -> LabScopeResponse:
    return LabScopeResponse(
        id=record.id,
        laboratory_name=record.laboratory_name,
        accreditation_standard=record.accreditation_standard,
        lab_unique_number=record.lab_unique_number,
        valid_from=record.valid_from,
        valid_upto=record.valid_upto,
        is_active=record.is_active,
        document_filename=record.document_filename,
        has_document=bool(record.document_data),
        updated_by=record.updated_by,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def _parse_optional_date(value: Optional[str], field_name: str) -> Optional[date]:
    if value is None or value == "":
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid date for {field_name}. Expected YYYY-MM-DD.") from exc


def _parse_optional_bool(value: Optional[str], field_name: str) -> Optional[bool]:
    if value is None or value == "":
        return None
    lowered = value.strip().lower()
    if lowered in {"true", "1", "yes", "y"}:
        return True
    if lowered in {"false", "0", "no", "n"}:
        return False
    raise HTTPException(status_code=422, detail=f"Invalid boolean for {field_name}.")


async def _read_validated_document(document: UploadFile) -> tuple[bytes, str, str]:
    content_type = (document.content_type or "").strip().lower()
    if content_type and content_type not in ALLOWED_DOCUMENT_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported document type. Allowed: PDF, DOC, DOCX, XLS, XLSX.")

    payload = await document.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Uploaded document is empty.")
    if len(payload) > MAX_DOCUMENT_SIZE:
        raise HTTPException(status_code=400, detail="Document exceeds maximum size of 25 MB.")

    filename = (document.filename or "document").strip() or "document"
    return payload, filename[:255], content_type[:128]


@router.get("/", response_model=List[LabScopeResponse])
def get_lab_scopes(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: Optional[int] = Query(None, ge=1),
    is_active: Optional[bool] = Query(None),
):
    """Retrieve list of Laboratory Scope records."""
    try:
        query = db.query(LabScope)
        if is_active is not None:
            query = query.filter(LabScope.is_active == is_active)
        query = query.order_by(LabScope.id.desc())
        records = query.offset(skip).limit(limit or 1000).all()
        return [_to_response(r) for r in records]
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/active")
def get_active_lab_scope(db: Session = Depends(get_db)):
    """Get the active Lab Scope for certificate display (lab_unique_number)."""
    record = db.query(LabScope).filter(LabScope.is_active == True).first()
    if not record:
        return {"lab_unique_number": ""}
    return {"lab_unique_number": record.lab_unique_number or ""}


@router.get("/{record_id}", response_model=LabScopeResponse)
def get_lab_scope(record_id: int, db: Session = Depends(get_db)):
    """Retrieve a single Lab Scope by ID."""
    record = db.query(LabScope).filter(LabScope.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Laboratory Scope not found")
    return _to_response(record)


@router.post("/", response_model=LabScopeResponse, status_code=201)
async def create_lab_scope(
    laboratory_name: str = Form(...),
    accreditation_standard: Optional[str] = Form(None),
    lab_unique_number: Optional[str] = Form(None),
    valid_from: Optional[str] = Form(None),
    valid_upto: Optional[str] = Form(None),
    is_active: Optional[str] = Form("false"),
    document: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Create a new Laboratory Scope record."""
    try:
        parsed_is_active = _parse_optional_bool(is_active, "is_active")
        if parsed_is_active is None:
            parsed_is_active = False
        parsed_valid_from = _parse_optional_date(valid_from, "valid_from")
        parsed_valid_upto = _parse_optional_date(valid_upto, "valid_upto")
        if parsed_valid_from and parsed_valid_upto and parsed_valid_upto < parsed_valid_from:
            raise HTTPException(status_code=400, detail="valid_upto cannot be earlier than valid_from.")

        if parsed_is_active:
            db.query(LabScope).filter(LabScope.is_active == True).update({"is_active": False})
        new_record = LabScope(
            laboratory_name=laboratory_name.strip(),
            accreditation_standard=(accreditation_standard or "").strip() or None,
            lab_unique_number=(lab_unique_number or "").strip() or None,
            valid_from=parsed_valid_from,
            valid_upto=parsed_valid_upto,
            is_active=parsed_is_active,
            updated_by=current_user.user_id,
        )

        if document is not None:
            payload, filename, content_type = await _read_validated_document(document)
            new_record.document_data = payload
            new_record.document_filename = filename
            new_record.document_content_type = content_type or None

        db.add(new_record)
        db.commit()
        db.refresh(new_record)
        return _to_response(new_record)
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.put("/{record_id}", response_model=LabScopeResponse)
async def update_lab_scope(
    record_id: int,
    laboratory_name: Optional[str] = Form(None),
    accreditation_standard: Optional[str] = Form(None),
    lab_unique_number: Optional[str] = Form(None),
    valid_from: Optional[str] = Form(None),
    valid_upto: Optional[str] = Form(None),
    is_active: Optional[str] = Form(None),
    clear_document: Optional[str] = Form(None),
    document: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Update a Laboratory Scope record."""
    record = db.query(LabScope).filter(LabScope.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Laboratory Scope not found")
    try:
        parsed_valid_from = _parse_optional_date(valid_from, "valid_from") if valid_from is not None else record.valid_from
        parsed_valid_upto = _parse_optional_date(valid_upto, "valid_upto") if valid_upto is not None else record.valid_upto
        if parsed_valid_from and parsed_valid_upto and parsed_valid_upto < parsed_valid_from:
            raise HTTPException(status_code=400, detail="valid_upto cannot be earlier than valid_from.")

        parsed_is_active = _parse_optional_bool(is_active, "is_active")
        should_clear_document = _parse_optional_bool(clear_document, "clear_document") is True

        if parsed_is_active is True:
            db.query(LabScope).filter(LabScope.id != record_id, LabScope.is_active == True).update({"is_active": False})

        if laboratory_name is not None:
            stripped_name = laboratory_name.strip()
            if not stripped_name:
                raise HTTPException(status_code=400, detail="Laboratory name cannot be empty.")
            record.laboratory_name = stripped_name
        if accreditation_standard is not None:
            record.accreditation_standard = accreditation_standard.strip() or None
        if lab_unique_number is not None:
            record.lab_unique_number = lab_unique_number.strip() or None
        if valid_from is not None:
            record.valid_from = parsed_valid_from
        if valid_upto is not None:
            record.valid_upto = parsed_valid_upto
        if parsed_is_active is not None:
            record.is_active = parsed_is_active

        if should_clear_document:
            record.document_data = None
            record.document_filename = None
            record.document_content_type = None

        if document is not None:
            payload, filename, content_type = await _read_validated_document(document)
            record.document_data = payload
            record.document_filename = filename
            record.document_content_type = content_type or None

        record.updated_by = current_user.user_id
        db.commit()
        db.refresh(record)
        return _to_response(record)
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.patch("/{record_id}/status", response_model=LabScopeResponse)
def set_active_status(
    record_id: int,
    is_active: bool = Query(...),
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Set the active Lab Scope (only one can be active at a time)."""
    record = db.query(LabScope).filter(LabScope.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Laboratory Scope not found")
    try:
        if is_active:
            db.query(LabScope).filter(LabScope.id != record_id).update({"is_active": False})
        record.is_active = is_active
        record.updated_by = current_user.user_id
        db.commit()
        db.refresh(record)
        return _to_response(record)
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.delete("/{record_id}", status_code=204)
def delete_lab_scope(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Delete a Laboratory Scope record."""
    record = db.query(LabScope).filter(LabScope.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Laboratory Scope not found")
    try:
        db.delete(record)
        db.commit()
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/{record_id}/document")
def download_lab_scope_document(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    record = db.query(LabScope).filter(LabScope.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Laboratory Scope not found")
    if not record.document_data:
        raise HTTPException(status_code=404, detail="No document attached for this record")

    filename = record.document_filename or f"lab-scope-{record_id}-document"
    content_type = record.document_content_type or "application/octet-stream"
    return Response(
        content=record.document_data,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

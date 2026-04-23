from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import List, Optional

from backend.db import get_db
from backend.schemas.htw.htw_standard_uncertainty_reference_schemas import (
    HTWStandardUncertaintyReferenceCreate,
    HTWStandardUncertaintyReferenceResponse,
    HTWStandardUncertaintyReferenceUpdate,
)
from backend.services.htw.htw_standard_uncertainty_reference_service import (
    build_template_file,
    create_reference,
    delete_reference,
    get_reference_by_id,
    get_references,
    import_references_from_upload,
    update_reference,
)

router = APIRouter(
    prefix="/htw-standard-uncertainty",
    tags=["HTW Standard Uncertainty Reference"],
)


# ---------------------------------------------------------------------------
# TEMPLATE DOWNLOAD
# ---------------------------------------------------------------------------
@router.get("/template")
def download_template(
    file_format: str = Query("xlsx", pattern="^(xlsx|csv)$"),
):
    content, media_type, filename = build_template_file(file_format)
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# BULK IMPORT
# ---------------------------------------------------------------------------
@router.post("/import")
async def import_htw_standard_uncertainty_reference(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    return await import_references_from_upload(db=db, file=file)


# ---------------------------------------------------------------------------
# POST
# ---------------------------------------------------------------------------
@router.post(
    "",
    response_model=HTWStandardUncertaintyReferenceResponse,
    status_code=201,
)
def create_htw_standard_uncertainty_reference(
    payload: HTWStandardUncertaintyReferenceCreate,
    db: Session = Depends(get_db),
):
    return create_reference(db, payload)


# ---------------------------------------------------------------------------
# GET (ALL)
# ---------------------------------------------------------------------------
@router.get(
    "",
    response_model=List[HTWStandardUncertaintyReferenceResponse],
    status_code=200,
)
def get_htw_standard_uncertainty_references(
    is_active: Optional[bool] = Query(None),
    torque_nm: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    return get_references(
        db=db,
        is_active=is_active,
        torque_nm=torque_nm,
    )


# ---------------------------------------------------------------------------
# GET (BY ID)
# ---------------------------------------------------------------------------
@router.get(
    "/{reference_id}",
    response_model=HTWStandardUncertaintyReferenceResponse,
    status_code=200,
)
def get_htw_standard_uncertainty_reference_by_id(
    reference_id: int,
    db: Session = Depends(get_db),
):
    record = get_reference_by_id(db, reference_id)
    if not record:
        raise HTTPException(status_code=404, detail="Reference not found")
    return record


# ---------------------------------------------------------------------------
# UPDATE (PUT)
# ---------------------------------------------------------------------------
@router.put(
    "/{reference_id}",
    response_model=HTWStandardUncertaintyReferenceResponse,
    status_code=200,
)
def update_htw_standard_uncertainty_reference(
    reference_id: int,
    payload: HTWStandardUncertaintyReferenceUpdate,
    db: Session = Depends(get_db),
):
    updated_record = update_reference(db, reference_id, payload)
    if not updated_record:
        raise HTTPException(status_code=404, detail="Reference not found")
    return updated_record


# ---------------------------------------------------------------------------
# DELETE
# ---------------------------------------------------------------------------
@router.delete(
    "/{reference_id}",
    status_code=204,
)
def delete_htw_standard_uncertainty_reference(
    reference_id: int,
    db: Session = Depends(get_db),
):
    success = delete_reference(db, reference_id)
    if not success:
        raise HTTPException(status_code=404, detail="Reference not found")
    return Response(status_code=204)

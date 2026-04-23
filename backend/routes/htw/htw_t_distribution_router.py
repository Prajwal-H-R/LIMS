from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.orm import Session
from typing import List, Optional

from backend.db import get_db
from backend.auth import get_current_user
from backend.schemas.user_schemas import UserResponse
from backend.schemas.htw.htw_t_distribution_schema import (
    HTWTDistributionCreate,
    HTWTDistributionUpdate,
    HTWTDistributionResponse,
)
from backend.services.htw.htw_t_distribution_service import (
    create_t_distribution,
    download_t_distribution_template,
    get_t_distribution_by_id,
    import_t_distribution,
    list_t_distributions,
    soft_delete_t_distribution,
    update_t_distribution,
)

router = APIRouter(
    prefix="/admin/t-distribution",
    tags=["HTW Master student T table or T Distribution"],
)


# =====================================================================
# GET: Download fixed template for bulk import
# =====================================================================
@router.get("/template")
def download_t_distribution_template_route(
    file_format: str = Query("xlsx"),
    current_user: UserResponse = Depends(get_current_user),
):
    return download_t_distribution_template(file_format=file_format)


# =====================================================================
# POST: Bulk import records from template
# =====================================================================
@router.post("/import")
async def import_t_distribution_route(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    file_bytes = await file.read()
    return await import_t_distribution(
        db=db,
        filename=file.filename or "",
        file_bytes=file_bytes,
    )


# =====================================================================
# POST: Create HTW T Distribution
# =====================================================================
@router.post("", response_model=HTWTDistributionResponse)
def create_record(
    payload: HTWTDistributionCreate,
    db: Session = Depends(get_db),
):
    return create_t_distribution(db, payload)


# =====================================================================
# GET: All HTW T Distribution records
# =====================================================================
@router.get("", response_model=List[HTWTDistributionResponse])
def list_records(
    active_only: bool = True,
    db: Session = Depends(get_db),
):
    return list_t_distributions(db, active_only)


# =====================================================================
# GET: Single HTW T Distribution by ID
# =====================================================================
@router.get("/{record_id}", response_model=HTWTDistributionResponse)
def get_record(
    record_id: int,
    db: Session = Depends(get_db),
):
    return get_t_distribution_by_id(db, record_id)


# =====================================================================
# PUT: Update HTW T Distribution
# =====================================================================
@router.put("/{record_id}", response_model=HTWTDistributionResponse)
def update_record(
    record_id: int,
    payload: HTWTDistributionUpdate,
    db: Session = Depends(get_db),
):
    return update_t_distribution(db, record_id, payload)


# =====================================================================
# DELETE: Soft delete HTW T Distribution
# =====================================================================
@router.delete("/{record_id}")
def delete_record(
    record_id: int,
    db: Session = Depends(get_db),
):
    soft_delete_t_distribution(db, record_id)
    return {"status": "success"}
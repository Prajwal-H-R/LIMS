from typing import List, Optional

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.orm import Session

from backend.auth import get_current_user
from backend.db import get_db
from backend.schemas.htw.htw_manufacturer_spec_schemas import (
    HTWManufacturerSpecCreate,
    HTWManufacturerSpecResponse,
    HTWManufacturerSpecUpdate,
)
from backend.schemas.user_schemas import UserResponse
from backend.services.htw.htw_manufacturer_spec_service import (
    create_htw_manufacturer_spec as create_spec_service,
    delete_htw_manufacturer_spec as delete_spec_service,
    download_htw_manufacturer_spec_template as download_template_service,
    get_htw_manufacturer_spec as get_spec_service,
    get_htw_manufacturer_specs as list_specs_service,
    import_htw_manufacturer_specs as import_specs_service,
    update_htw_manufacturer_spec as update_spec_service,
    update_htw_manufacturer_spec_status as update_status_service,
)

router = APIRouter(
    prefix="/htw-manufacturer-specs",
    tags=["HTW Manufacturer Specifications"],
)


@router.get("/", response_model=List[HTWManufacturerSpecResponse])
def get_htw_manufacturer_specs(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: Optional[int] = Query(None, ge=1),
    is_active: Optional[bool] = Query(None),
):
    return list_specs_service(db=db, skip=skip, limit=limit, is_active=is_active)


@router.get("/template")
def download_htw_manufacturer_spec_template(
    file_format: str = Query("xlsx", pattern="^(xlsx|csv)$"),
    current_user: UserResponse = Depends(get_current_user),
):
    return download_template_service(file_format=file_format)


@router.post("/import")
async def import_htw_manufacturer_specs(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    file_bytes = await file.read()
    return await import_specs_service(
        db=db,
        filename=file.filename or "",
        file_bytes=file_bytes,
    )


@router.get("/{spec_id}", response_model=HTWManufacturerSpecResponse)
def get_htw_manufacturer_spec(
    spec_id: int,
    db: Session = Depends(get_db),
):
    return get_spec_service(db=db, spec_id=spec_id)


@router.post("/", response_model=HTWManufacturerSpecResponse, status_code=201)
def create_htw_manufacturer_spec(
    spec_data: HTWManufacturerSpecCreate,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    return create_spec_service(db=db, spec_data=spec_data)


@router.put("/{spec_id}", response_model=HTWManufacturerSpecResponse)
def update_htw_manufacturer_spec(
    spec_id: int,
    spec_data: HTWManufacturerSpecUpdate,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    return update_spec_service(db=db, spec_id=spec_id, spec_data=spec_data)


@router.patch("/{spec_id}/status", response_model=HTWManufacturerSpecResponse)
def update_htw_manufacturer_spec_status(
    spec_id: int,
    is_active: bool = Query(...),
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    return update_status_service(db=db, spec_id=spec_id, is_active=is_active)


@router.delete("/{spec_id}", status_code=204)
def delete_htw_manufacturer_spec(
    spec_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    return delete_spec_service(db=db, spec_id=spec_id)
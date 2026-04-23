from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional

from backend.db import get_db
from backend.schemas.htw.htw_pressure_gauge_resolution import (
    HTWPressureGaugeResolutionResponse,
    HTWPressureGaugeResolutionCreate,
)
from backend.services.htw.htw_pressure_gauge_res_service import (
    build_template_file,
    create_resolution,
    delete_resolution,
    get_resolution_by_id,
    get_resolutions,
    get_unique_units,
    import_resolutions_from_upload,
    update_resolution,
    update_resolution_status,
)

router = APIRouter(
    prefix="/htw-pressure-gauge-resolutions",
    tags=["HTW Pressure Gauge Resolution"],
)


# =====================================================================
# TEMPLATE / IMPORT
# =====================================================================
@router.get("/template")
def download_template(file_format: str = Query("xlsx", pattern="^(xlsx|csv)$")):
    content, media_type, filename = build_template_file(file_format=file_format)
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}

    if file_format == "csv":
        return Response(content=content, media_type=media_type, headers=headers)

    return StreamingResponse(
        iter([content]),
        media_type=media_type,
        headers=headers,
    )


@router.post("/import")
async def import_pressure_gauge_resolutions(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    return await import_resolutions_from_upload(db=db, file=file)


# =====================================================================
# GET: Active Pressure Gauge Resolutions
# =====================================================================
@router.get("/", response_model=List[HTWPressureGaugeResolutionResponse])
def get_pressure_gauge_resolutions(
    db: Session = Depends(get_db),
    unit: Optional[str] = Query(None, description="Filter by unit"),
):
    """
    Retrieves all pressure gauge resolutions.
    Optionally filters by unit if provided.
    """
    try:
        return get_resolutions(db=db, unit=unit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An internal server error occurred: {str(e)}")


# =====================================================================
# GET: Unique Units
# =====================================================================
@router.get("/units", response_model=List[str])
def get_unique_units_route(db: Session = Depends(get_db)):
    try:
        return get_unique_units(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


# =====================================================================
# GET: Single Pressure Gauge Resolution
# =====================================================================
@router.get("/{resolution_id}", response_model=HTWPressureGaugeResolutionResponse)
def get_pressure_gauge_resolution(
    resolution_id: int,
    db: Session = Depends(get_db),
):
    record = get_resolution_by_id(db, resolution_id)
    if not record:
        raise HTTPException(status_code=404, detail="Resolution not found")
    return record


# =====================================================================
# POST: Create Pressure Gauge Resolution
# =====================================================================
@router.post("/", response_model=HTWPressureGaugeResolutionResponse, status_code=status.HTTP_201_CREATED)
def create_pressure_gauge_resolution(
    resolution_data: HTWPressureGaugeResolutionCreate,
    db: Session = Depends(get_db),
):
    try:
        return create_resolution(db=db, data=resolution_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


# =====================================================================
# PUT: Update Pressure Gauge Resolution
# =====================================================================
@router.put("/{resolution_id}", response_model=HTWPressureGaugeResolutionResponse)
def update_pressure_gauge_resolution(
    resolution_id: int,
    resolution_data: HTWPressureGaugeResolutionCreate,
    db: Session = Depends(get_db),
):
    try:
        record = update_resolution(db=db, resolution_id=resolution_id, data=resolution_data)
        if not record:
            raise HTTPException(status_code=404, detail="Resolution not found")
        return record
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


# =====================================================================
# PATCH: Update Status (Active/Inactive)
# =====================================================================
@router.patch("/{resolution_id}/status", response_model=HTWPressureGaugeResolutionResponse)
def update_resolution_status_route(
    resolution_id: int,
    is_active: bool = Query(..., description="New active status"),
    db: Session = Depends(get_db),
):
    try:
        record = update_resolution_status(db=db, resolution_id=resolution_id, is_active=is_active)
        if not record:
            raise HTTPException(status_code=404, detail="Resolution not found")
        return record
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


# =====================================================================
# DELETE: Delete Pressure Gauge Resolution
# =====================================================================
@router.delete("/{resolution_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pressure_gauge_resolution(
    resolution_id: int,
    db: Session = Depends(get_db),
):
    try:
        success = delete_resolution(db=db, resolution_id=resolution_id)
        if not success:
            raise HTTPException(status_code=404, detail="Resolution not found")
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

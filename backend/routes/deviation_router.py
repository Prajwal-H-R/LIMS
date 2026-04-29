from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from backend.auth import check_staff_role
from backend.db import get_db
from backend.schemas.deviation_schemas import (
    CustomerDeviationItem,
    DeviationDetailOut,
    EngineerRemarksUpdate,
    ManualDeviationCreate,
)
from backend.schemas.user_schemas import UserResponse
from backend.services import deviation_service as svc

router = APIRouter(prefix="/deviations", tags=["Deviations"])


@router.get("/manual", response_model=List[CustomerDeviationItem])
def list_manual_deviations(
    db: Session = Depends(get_db),
    _current_user: UserResponse = Depends(check_staff_role),
):
    return svc.list_manual_deviations_for_staff(db)


@router.post("/manual", response_model=DeviationDetailOut)
def create_manual_deviation(
    body: ManualDeviationCreate,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(check_staff_role),
):
    created = svc.create_manual_deviation(db, body, current_user.user_id)
    if not created:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Equipment/inward mapping not found for manual deviation.",
        )
    return created

@router.get("/all-staff", response_model=List[CustomerDeviationItem])
def list_all_deviations_for_staff(
    db: Session = Depends(get_db),
    _current_user: UserResponse = Depends(check_staff_role),
):
    """
    Returns a unified list of all OOT and MANUAL deviations from all sources
    for the staff deviation page.
    """
    return svc.list_all_deviations_for_staff(db)
@router.post("/{deviation_id}/attachments", response_model=DeviationDetailOut)
async def upload_deviation_attachments(
    deviation_id: int,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(check_staff_role),
):
    file_payloads = []
    for f in files:
        content = await f.read()
        file_payloads.append((f.filename, f.content_type, content))
    updated = svc.add_deviation_attachments(db, deviation_id, file_payloads, current_user.user_id)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deviation not found")
    return updated


@router.get("/{deviation_id}", response_model=DeviationDetailOut)
def get_deviation_detail(
    deviation_id: int,
    db: Session = Depends(get_db),
    _current_user: UserResponse = Depends(check_staff_role),
):
    detail = svc.get_deviation_detail_for_staff(db, deviation_id)
    if not detail:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deviation not found")
    return detail


@router.patch("/{deviation_id}/engineer-remarks", response_model=DeviationDetailOut)
def update_deviation_engineer_remarks(
    deviation_id: int,
    body: EngineerRemarksUpdate,
    db: Session = Depends(get_db),
    _current_user: UserResponse = Depends(check_staff_role),
):
    updated = svc.update_engineer_remarks(db, deviation_id, body.engineer_remarks)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deviation not found")
    return updated


@router.patch("/{deviation_id}/close", response_model=DeviationDetailOut)
def close_deviation_record(
    deviation_id: int,
    db: Session = Depends(get_db),
    _current_user: UserResponse = Depends(check_staff_role),
):
    updated = svc.close_deviation(db, deviation_id)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deviation not found")
    return updated


@router.patch("/{deviation_id}/terminate-job", response_model=DeviationDetailOut)
def terminate_deviation_job(
    deviation_id: int,
    db: Session = Depends(get_db),
    _current_user: UserResponse = Depends(check_staff_role),
):
    updated = svc.terminate_deviation_job(db, deviation_id)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deviation not found")
    return updated

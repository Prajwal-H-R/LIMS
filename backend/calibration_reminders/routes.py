from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from .database import get_db
from .schemas import CalibrationDueSummary, CalibrationSendRequest, CalibrationSendResult
from .service import (
    dispatch_due_calibration_reminders,
    get_customer_due_summary,
    get_engineer_due_summary,
)

router = APIRouter(prefix="/calibration-reminders", tags=["Calibration Reminders"])

SortBy = Literal["due_date", "certificate_no", "nepl_id", "serial_no", "srf_no"]
SortOrder = Literal["asc", "desc"]


@router.get("/engineer", response_model=CalibrationDueSummary)
def engineer_due_calibrations(
    days_ahead: int = Query(7, ge=1, le=365),
    customer_id: Optional[int] = Query(None, ge=1),
    search: Optional[str] = Query(None, max_length=100),
    lot: Optional[str] = Query(None, max_length=100),
    sort_by: SortBy = Query("due_date"),
    sort_order: SortOrder = Query("asc"),
    db: Session = Depends(get_db),
):
    return get_engineer_due_summary(
        db=db,
        days_ahead=days_ahead,
        customer_id=customer_id,
        search=search,
        lot=lot,
        sort_by=sort_by,
        sort_order=sort_order,
    )


@router.get("/customer/{customer_id}", response_model=CalibrationDueSummary)
def customer_due_calibrations(
    customer_id: int,
    days_ahead: int = Query(7, ge=1, le=365),
    search: Optional[str] = Query(None, max_length=100),
    lot: Optional[str] = Query(None, max_length=100),
    sort_by: SortBy = Query("due_date"),
    sort_order: SortOrder = Query("asc"),
    db: Session = Depends(get_db),
):
    return get_customer_due_summary(
        db=db,
        customer_id=customer_id,
        days_ahead=days_ahead,
        search=search,
        lot=lot,
        sort_by=sort_by,
        sort_order=sort_order,
    )


@router.post("/send", response_model=CalibrationSendResult)
def send_due_calibration_reminders(
    payload: CalibrationSendRequest,
    db: Session = Depends(get_db),
):
    return dispatch_due_calibration_reminders(
        db=db,
        days_ahead=payload.days_ahead,
        dry_run=payload.dry_run,
    )


@router.get("/health")
def health():
    return {"status": "ok"}
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from .database import get_db
from .schemas import (
    CalibrationDueSummary,
    CalibrationSendRequest,
    CalibrationSendResult,
    ManualCustomerEmailRequest,
    ManualCustomerEmailResponse,
)
from .service import (
    dispatch_due_calibration_reminders,
    get_customer_due_summary,
    get_engineer_due_summary,
    send_manual_customer_reminder,
)

router = APIRouter(prefix="/calibration-reminders", tags=["Calibration Reminders"])

SortBy = Literal["due_date", "certificate_no", "nepl_id", "serial_no", "srf_no"]
SortOrder = Literal["asc", "desc"]
SourceFilter = Literal["ALL", "INTERNAL", "EXTERNAL"]


@router.get("/engineer", response_model=CalibrationDueSummary)
@router.get("/admin", response_model=CalibrationDueSummary)
def engineer_or_admin_due_calibrations(
    days_ahead: int = Query(7, ge=1, le=365),
    days_back: int = Query(0, ge=0, le=365),
    customer_id: Optional[int] = Query(None, ge=1),
    search: Optional[str] = Query(None, max_length=100),
    lot: Optional[str] = Query(None, max_length=100),
    source_filter: SourceFilter = Query("ALL"),
    sort_by: SortBy = Query("due_date"),
    sort_order: SortOrder = Query("asc"),
    db: Session = Depends(get_db),
):
    return get_engineer_due_summary(
        db=db,
        days_ahead=days_ahead,
        days_back=days_back,
        customer_id=customer_id,
        search=search,
        lot=lot,
        source_filter=source_filter,
        sort_by=sort_by,
        sort_order=sort_order,
    )


@router.get("/customer/{customer_id}", response_model=CalibrationDueSummary)
def customer_due_calibrations(
    customer_id: int,
    days_ahead: int = Query(7, ge=1, le=365),
    days_back: int = Query(0, ge=0, le=365),
    search: Optional[str] = Query(None, max_length=100),
    lot: Optional[str] = Query(None, max_length=100),
    source_filter: SourceFilter = Query("ALL"),
    sort_by: SortBy = Query("due_date"),
    sort_order: SortOrder = Query("asc"),
    db: Session = Depends(get_db),
):
    return get_customer_due_summary(
        db=db,
        customer_id=customer_id,
        days_ahead=days_ahead,
        days_back=days_back,
        search=search,
        lot=lot,
        source_filter=source_filter,
        sort_by=sort_by,
        sort_order=sort_order,
    )


@router.post(
    "/customer/{customer_id}/send-email",
    response_model=ManualCustomerEmailResponse,
)
def send_customer_calibration_email(
    customer_id: int,
    payload: ManualCustomerEmailRequest,
    db: Session = Depends(get_db),
):
    return send_manual_customer_reminder(
        db=db,
        customer_id=customer_id,
        to_emails=payload.to_emails,
        cc_emails=payload.cc_emails,
        certificate_ids=payload.certificate_ids,
        days_ahead=payload.days_ahead,
        days_back=payload.days_back,
        custom_subject=payload.custom_subject,
        custom_note=payload.custom_note,
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
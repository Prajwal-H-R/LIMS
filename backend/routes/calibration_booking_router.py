from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from backend.auth import get_current_user, check_staff_role
from backend.db import get_db
from backend.schemas.user_schemas import UserResponse
from backend.schemas.calibration_booking_schemas import (
    UploadBookingResponse,
    CalibrationBookingUpload,
    BookingHistoryResponse,
    PendingBookingListResponse,
    AllBookingListResponse,
    AcceptBookingResponse,
    ResendResponse,
)
from backend.services.calibration_booking_service import CalibrationBookingService

router = APIRouter(prefix="/calibration-booking", tags=["Calibration Booking"])


def _get_customer_id(current_user: UserResponse) -> int:
    if not current_user.customer_id:
        raise HTTPException(status_code=403, detail="Customer profile required")
    return current_user.customer_id


@router.post("/upload", response_model=UploadBookingResponse, status_code=status.HTTP_201_CREATED)
async def upload_calibration_booking(
    booking_id: Optional[int] = Form(None),
    equipment_count: int = Form(...),
    remarks: Optional[str] = Form(None),
    files: list[UploadFile] = File(default_factory=list),
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    customer_id = _get_customer_id(current_user)
    service = CalibrationBookingService(db)
    payload = CalibrationBookingUpload(booking_id=booking_id, equipment_count=equipment_count, remarks=remarks)
    created = await service.upload_booking(customer_id, payload, files)
    return UploadBookingResponse(
        message="Booking submitted successfully",
        booking_id=created.booking_id,
    )


@router.get("/history", response_model=BookingHistoryResponse)
def list_booking_history(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    customer_id = _get_customer_id(current_user)
    service = CalibrationBookingService(db)
    bookings = service.get_history_for_customer(customer_id)
    return BookingHistoryResponse(bookings=bookings)


@router.get("/pending/{engineer_id}", response_model=PendingBookingListResponse)
def list_pending_bookings(
    engineer_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(check_staff_role),
):
    service = CalibrationBookingService(db)
    bookings = service.get_pending_for_engineer()
    return PendingBookingListResponse(bookings=bookings)


@router.get("/all", response_model=AllBookingListResponse)
def list_all_bookings(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(check_staff_role),
):
    service = CalibrationBookingService(db)
    bookings = service.get_all_bookings()
    return AllBookingListResponse(bookings=bookings)


@router.post("/{booking_id}/accept", response_model=AcceptBookingResponse)
def accept_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(check_staff_role),
):
    service = CalibrationBookingService(db)
    service.accept_booking(booking_id)
    return AcceptBookingResponse(
        message="Booking accepted successfully",
        booking_id=booking_id,
    )


@router.post("/{booking_id}/resend", response_model=ResendResponse)
def request_resend(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(check_staff_role),
):
    service = CalibrationBookingService(db)
    service.request_resend(booking_id)
    return ResendResponse(
        message="Resend requested for booking",
        booking_id=booking_id,
    )

import io
import os
import uuid
from pathlib import Path

from fastapi import UploadFile, HTTPException, status
from PIL import Image
from sqlalchemy.orm import Session

from backend.models.calibration_booking import CalibrationBooking
from backend.models.customers import Customer
from backend.schemas.calibration_booking_schemas import (
    MAX_FILE_SIZE,
    BookingFileItem,
    BookingHistoryItem,
    PendingBookingGroup,
    AllBookingItem,
    CalibrationBookingUpload,
)

BASE_DIR = Path(__file__).resolve().parents[1]
UPLOAD_DIR = BASE_DIR / "uploads" / "calibration_bookings"

ALLOWED_MIMES = {"application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain"}
IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp"}
REJECTED_MIMES = {"image/gif", "application/zip", "application/x-zip-compressed"}


def _sniff_mime(data: bytes) -> str | None:
    if data.startswith(b"%PDF"):
        return "application/pdf"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
        return "image/gif"
    if data.startswith(b"RIFF") and len(data) > 12 and data[8:12] == b"WEBP":
        return "image/webp"
    if data.startswith(b"PK\x03\x04"):
        return "application/zip"
    try:
        data.decode("utf-8")
        return "text/plain"
    except UnicodeDecodeError:
        return None


def _validate_file(data: bytes, filename: str) -> str:
    mime = _sniff_mime(data)
    if mime is None:
        raise HTTPException(
            status_code=400,
            detail=f"Could not determine file type for '{filename}'. The file may be corrupted or its format is unsupported.",
        )
    if mime in REJECTED_MIMES:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{mime}' is explicitly not allowed for '{filename}'.",
        )
    if mime not in ALLOWED_MIMES:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{mime}' is not allowed for '{filename}'. Allowed: {', '.join(sorted(ALLOWED_MIMES))}.",
        )
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File '{filename}' exceeds the maximum size of {MAX_FILE_SIZE // (1024*1024)} MB.",
        )
    return mime


def _save_file(data: bytes, original_filename: str, mime: str) -> tuple[str, str, str]:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = os.path.splitext(original_filename or "file")[1] or ""
    unique_name = f"{uuid.uuid4().hex}{ext}"
    dest = UPLOAD_DIR / unique_name

    if mime in IMAGE_MIMES:
        img = Image.open(io.BytesIO(data))
        img = img.convert("RGB") if mime == "image/jpeg" else img
        save_kwargs = {"format": img.format}
        if img.format == "JPEG":
            save_kwargs["quality"] = 95
        img.save(dest, **save_kwargs)
    else:
        with open(dest, "wb") as f:
            f.write(data)

    file_url = f"/api/uploads/calibration_bookings/{unique_name}"
    return file_url, original_filename or "file", mime


class CalibrationBookingService:
    def __init__(self, db: Session):
        self.db = db

    async def upload_booking(
        self,
        customer_id: int,
        payload: CalibrationBookingUpload,
        files: list[UploadFile],
    ) -> CalibrationBooking:
        customer = self.db.query(Customer).filter(Customer.customer_id == customer_id).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")

        if not files:
            raise HTTPException(status_code=400, detail="At least one file must be uploaded.")

        file_items: list[dict] = []
        for f in files:
            data = await f.read()
            mime = _validate_file(data, f.filename or "unknown")
            file_url, file_name, file_type = _save_file(data, f.filename or "unknown", mime)
            file_items.append({
                "file_name": file_name,
                "file_url": file_url,
                "file_type": file_type,
            })

        # If booking_id provided and row exists, append files to existing array
        if payload.booking_id is not None:
            booking = (
                self.db.query(CalibrationBooking)
                .filter(CalibrationBooking.booking_id == payload.booking_id)
                .first()
            )
            if booking:
                existing = booking.files or []
                existing.extend(file_items)
                booking.files = existing
                self.db.commit()
                self.db.refresh(booking)
                return booking

        # Create new row
        booking = CalibrationBooking(
            customer_id=customer_id,
            equipment_count=payload.equipment_count,
            remarks=payload.remarks,
            status="pending",
            files=file_items,
        )
        self.db.add(booking)
        self.db.commit()
        self.db.refresh(booking)
        return booking

    def get_history_for_customer(self, customer_id: int) -> list[BookingHistoryItem]:
        rows = (
            self.db.query(CalibrationBooking)
            .filter(CalibrationBooking.customer_id == customer_id)
            .order_by(CalibrationBooking.created_at.desc())
            .all()
        )
        return [
            BookingHistoryItem(
                booking_id=r.booking_id,
                status=r.status,
                created_at=r.created_at,
                equipment_count=r.equipment_count,
                remarks=r.remarks,
                files=[BookingFileItem(**f) for f in (r.files or [])],
            )
            for r in rows
        ]

    def get_pending_for_engineer(self) -> list[PendingBookingGroup]:
        rows = (
            self.db.query(CalibrationBooking)
            .filter(CalibrationBooking.status == "pending")
            .order_by(CalibrationBooking.created_at.desc())
            .all()
        )
        result: list[PendingBookingGroup] = []
        for r in rows:
            customer_name = None
            if r.customer_id:
                cust = self.db.query(Customer).filter(Customer.customer_id == r.customer_id).first()
                if cust:
                    customer_name = cust.customer_details
            files_list = [BookingFileItem(**f) for f in (r.files or [])]
            result.append(
                PendingBookingGroup(
                    booking_id=r.booking_id,
                    equipment_count=r.equipment_count,
                    file_count=len(files_list),
                    customer_name=customer_name,
                    created_at=r.created_at,
                    remarks=r.remarks,
                    files=files_list,
                )
            )
        return result

    def get_all_bookings(self) -> list[AllBookingItem]:
        rows = (
            self.db.query(CalibrationBooking)
            .order_by(CalibrationBooking.created_at.desc())
            .all()
        )
        result: list[AllBookingItem] = []
        for r in rows:
            customer_name = None
            if r.customer_id:
                cust = self.db.query(Customer).filter(Customer.customer_id == r.customer_id).first()
                if cust:
                    customer_name = cust.customer_details
            files_list = [BookingFileItem(**f) for f in (r.files or [])]
            result.append(
                AllBookingItem(
                    booking_id=r.booking_id,
                    customer_name=customer_name,
                    equipment_count=r.equipment_count,
                    remarks=r.remarks,
                    status=r.status,
                    file_count=len(files_list),
                    created_at=r.created_at,
                    files=files_list,
                )
            )
        return result

    def accept_booking(self, booking_id: int) -> None:
        booking = (
            self.db.query(CalibrationBooking)
            .filter(
                CalibrationBooking.booking_id == booking_id,
                CalibrationBooking.status == "pending",
            )
            .first()
        )
        if not booking:
            raise HTTPException(
                status_code=404,
                detail=f"No pending booking found with booking_id {booking_id}",
            )
        booking.status = "accepted"
        self.db.commit()

    def request_resend(self, booking_id: int) -> None:
        booking = (
            self.db.query(CalibrationBooking)
            .filter(
                CalibrationBooking.booking_id == booking_id,
                CalibrationBooking.status == "pending",
            )
            .first()
        )
        if not booking:
            raise HTTPException(
                status_code=404,
                detail=f"No pending booking found with booking_id {booking_id}",
            )
        booking.status = "resend_requested"
        self.db.commit()

from datetime import datetime
from typing import Optional
from pydantic import BaseModel


MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB


class CalibrationBookingUpload(BaseModel):
    booking_id: Optional[int] = None
    equipment_count: int
    remarks: Optional[str] = None


class UploadBookingResponse(BaseModel):
    message: str
    booking_id: int


class BookingFileItem(BaseModel):
    file_name: Optional[str] = None
    file_url: Optional[str] = None
    file_type: Optional[str] = None


class BookingHistoryItem(BaseModel):
    booking_id: int
    status: str
    created_at: Optional[datetime] = None
    equipment_count: Optional[int] = None
    remarks: Optional[str] = None
    files: list[BookingFileItem]


class BookingHistoryResponse(BaseModel):
    bookings: list[BookingHistoryItem]


class PendingBookingGroup(BaseModel):
    booking_id: int
    equipment_count: Optional[int] = None
    file_count: int
    customer_name: Optional[str] = None
    created_at: Optional[datetime] = None
    remarks: Optional[str] = None
    files: list[BookingFileItem] = []


class PendingBookingListResponse(BaseModel):
    bookings: list[PendingBookingGroup]


class AcceptBookingResponse(BaseModel):
    message: str
    booking_id: int


class ResendResponse(BaseModel):
    message: str
    booking_id: int


class AllBookingItem(BaseModel):
    booking_id: int
    customer_name: Optional[str] = None
    equipment_count: Optional[int] = None
    remarks: Optional[str] = None
    status: str
    file_count: int
    created_at: Optional[datetime] = None
    files: list[BookingFileItem]


class AllBookingListResponse(BaseModel):
    bookings: list[AllBookingItem]

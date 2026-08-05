from datetime import datetime
from typing import Optional
from sqlalchemy import Integer, String, Text, TIMESTAMP, ForeignKey, JSON, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.db import Base


class CalibrationBooking(Base):
    __tablename__ = "calibration_bookings"

    booking_id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.customer_id"), nullable=False)
    equipment_count: Mapped[Optional[int]] = mapped_column(Integer)
    remarks: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    files: Mapped[Optional[dict]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

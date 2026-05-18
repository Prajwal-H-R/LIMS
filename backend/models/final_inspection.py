from datetime import datetime
from typing import List, Any, Optional
from sqlalchemy import String, Text, DateTime, Boolean, TIMESTAMP, func, Integer
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from backend.db import Base
from sqlalchemy import ForeignKey
from sqlalchemy.orm import relationship

class FinalInspection(Base):
    __tablename__ = "final_inspections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    inward_id: Mapped[int] = mapped_column(Integer, nullable=False, unique=True)
    customer_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("customers.customer_id"),
        nullable=False
    )

    srf_no: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    customer_dc_no: Mapped[Optional[str]] = mapped_column(String(255))
    receiver: Mapped[Optional[str]] = mapped_column(String(255))
    customer_name: Mapped[str] = mapped_column(Text, nullable=False)
    customer_email: Mapped[Optional[str]] = mapped_column(String(320))

    # NEW COLUMNS
    customer_decision: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True
    )  # APPROVED / REJECTED

    customer_remarks: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True
    )

    # JSONB columns
    equipments: Mapped[List[Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=list
    )

    sent_emails: Mapped[List[Any]] = mapped_column(
        JSONB,
        default=list
    )

    report_sent: Mapped[bool] = mapped_column(Boolean, default=False)

    report_sent_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True)
    )

    status: Mapped[str] = mapped_column(
        String(50),
        default="PENDING"
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now()
    )

    updated_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True),
        onupdate=func.now()
    )

    customer = relationship(
        "Customer",
        back_populates="final_inspections"
    )

    def __repr__(self):
        return f"<FinalInspection(srf_no={self.srf_no}, inward_id={self.inward_id})>"
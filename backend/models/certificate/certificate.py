# backend/models/htw_certificate.py

from datetime import date, datetime
from typing import Optional, List

from sqlalchemy import (
    Integer, String, Date, TIMESTAMP, Text,
    ForeignKey, func
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db import Base


class HTWCertificate(Base):
    __tablename__ = "certificate"

    certificate_id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )

    job_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("htw_job.job_id", ondelete="CASCADE"),
        nullable=False
    )

    inward_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("inward.inward_id", ondelete="CASCADE"),
        nullable=True
    )

    inward_eqp_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("inward_equipments.inward_eqp_id", ondelete="CASCADE"),
        nullable=True
    )

    certificate_no: Mapped[str] = mapped_column(String(255), nullable=False)

    date_of_calibration: Mapped[date] = mapped_column(Date, nullable=False)

    ulr_no: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    field_of_parameter: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    recommended_cal_due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    item_status: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        default="Satisfactory"
    )

    authorised_signatory: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="DRAFT"
    )

    admin_rework_comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # JSONB arrays (3 rows each)
    permissible_deviation_iso_6789: Mapped[Optional[List]] = mapped_column(
        JSONB,
        nullable=True
    )

    iso_6789_results: Mapped[Optional[List]] = mapped_column(
        JSONB,
        nullable=True
    )

    created_by: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now()
    )

    approved_by: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True
    )

    approved_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=True
    )

    issued_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=True
    )

    qr_token: Mapped[Optional[str]] = mapped_column(
        String(128),
        nullable=True,
        unique=True,
        index=True
    )

    qr_image_base64: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True
    )

    qr_generated_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=True
    )

    job_rel: Mapped["HTWJob"] = relationship(
        "HTWJob",
        backref="certificates"
    )
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
    ForeignKey,
    Integer,
    String,
    Text,
    TIMESTAMP,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db import Base


class Deviation(Base):
    __tablename__ = "deviation"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    inward_eqp_id: Mapped[int] = mapped_column(
        ForeignKey("inward_equipments.inward_eqp_id", ondelete="CASCADE"),
        nullable=False,
    )

    certificate_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("certificate.certificate_id", ondelete="SET NULL"),
        nullable=True,
    )

    job_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("htw_job.job_id", ondelete="CASCADE"),
        nullable=True,
    )

    created_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        server_default="OPEN",
    )

    calibration_status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        server_default="not calibrated",
    )

    hide_customer_visibility: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default="false",
    )

    engineer_remarks: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    customer_decision: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    report: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    attachments = relationship(
        "DeviationAttachment",
        back_populates="deviation",
        cascade="all, delete-orphan",
    )
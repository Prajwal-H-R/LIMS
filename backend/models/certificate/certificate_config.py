"""SQLAlchemy model for generic certificate details."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Base class for SQLAlchemy declarative models."""


class CertificateDetails(Base):
    """Stores certificate-template text that is shared by certificate types.

    ``statement_below_signature`` is stored as a JSON array of objects:

    [
        {"order": 1, "text": "..."},
        {"order": 2, "text": "..."}
    ]

    The order is part of the persisted template data so rendering code can
    reproduce the certificate exactly as configured.
    """

    __tablename__ = "certificate_details"

    certificate_details_id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
    )

    calibration_procedure: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    statement_below_signature: Mapped[list[dict[str, Any]] | None] = mapped_column(
        JSONB,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.current_timestamp(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )

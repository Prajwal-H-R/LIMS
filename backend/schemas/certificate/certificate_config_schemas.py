"""Pydantic schemas for CertificateDetails API."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StatementItem(BaseModel):
    """One ordered line rendered below the certificate signature."""

    model_config = ConfigDict(extra="forbid")

    order: int = Field(..., ge=1, description="1-based display order")
    text: str = Field(..., min_length=1, description="Statement text")

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Statement text cannot be blank")
        return value


class CertificateDetailsBase(BaseModel):
    """Shared input fields."""

    model_config = ConfigDict(extra="forbid")

    calibration_procedure: str | None = None
    statement_below_signature: list[StatementItem] | None = None

    @field_validator("calibration_procedure")
    @classmethod
    def validate_calibration_procedure(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @field_validator("statement_below_signature")
    @classmethod
    def validate_statement_order(
        cls,
        value: list[StatementItem] | None,
    ) -> list[StatementItem] | None:
        if value is None:
            return None

        orders = [item.order for item in value]
        if len(orders) != len(set(orders)):
            raise ValueError("statement order values must be unique")

        # Keep API/database payload canonical and predictable for rendering.
        return sorted(value, key=lambda item: item.order)


class CertificateDetailsCreate(CertificateDetailsBase):
    """Request body for creating a certificate-details record."""


class CertificateDetailsUpdate(BaseModel):
    """Request body for partial updates."""

    model_config = ConfigDict(extra="forbid")

    calibration_procedure: str | None = None
    statement_below_signature: list[StatementItem] | None = None

    @field_validator("calibration_procedure")
    @classmethod
    def validate_calibration_procedure(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @field_validator("statement_below_signature")
    @classmethod
    def validate_statement_order(
        cls,
        value: list[StatementItem] | None,
    ) -> list[StatementItem] | None:
        if value is None:
            return None

        orders = [item.order for item in value]
        if len(orders) != len(set(orders)):
            raise ValueError("statement order values must be unique")

        return sorted(value, key=lambda item: item.order)


class CertificateDetailsRead(CertificateDetailsBase):
    """Response schema."""

    model_config = ConfigDict(from_attributes=True)

    certificate_details_id: int
    created_at: datetime
    updated_at: datetime

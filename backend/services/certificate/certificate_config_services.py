"""Business/service layer for CertificateDetails."""

from __future__ import annotations

from collections.abc import Sequence

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models.certificate.certificate_config import CertificateDetails
from backend.schemas.certificate.certificate_config_schemas import (
    CertificateDetailsCreate,
    CertificateDetailsUpdate,
)


def _statements_to_db(value):
    """Convert Pydantic models to plain JSON-serializable dictionaries."""
    if value is None:
        return None

    return [item.model_dump() for item in value]


def create_certificate_details(
    db: Session,
    payload: CertificateDetailsCreate,
) -> CertificateDetails:
    """Create certificate details."""

    obj = CertificateDetails(
        calibration_procedure=payload.calibration_procedure,
        statement_below_signature=_statements_to_db(
            payload.statement_below_signature
        ),
    )

    db.add(obj)
    db.commit()
    db.refresh(obj)

    return obj


def get_certificate_details(
    db: Session,
    certificate_details_id: int,
) -> CertificateDetails:
    """Get certificate details by ID."""

    stmt = select(CertificateDetails).where(
        CertificateDetails.certificate_details_id == certificate_details_id
    )

    result = db.execute(stmt)
    obj = result.scalar_one_or_none()

    if obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Certificate details {certificate_details_id} not found",
        )

    return obj


def list_certificate_details(
    db: Session,
    *,
    skip: int = 0,
    limit: int = 100,
) -> Sequence[CertificateDetails]:
    """List certificate details."""

    stmt = (
        select(CertificateDetails)
        .order_by(CertificateDetails.certificate_details_id)
        .offset(skip)
        .limit(limit)
    )

    result = db.execute(stmt)

    return result.scalars().all()


def update_certificate_details(
    db: Session,
    certificate_details_id: int,
    payload: CertificateDetailsUpdate,
) -> CertificateDetails:
    """Update certificate details."""

    obj = get_certificate_details(
        db,
        certificate_details_id,
    )

    update_data = payload.model_dump(exclude_unset=True)

    if "calibration_procedure" in update_data:
        obj.calibration_procedure = update_data["calibration_procedure"]

    if "statement_below_signature" in update_data:
        obj.statement_below_signature = _statements_to_db(
            payload.statement_below_signature
        )

    db.commit()
    db.refresh(obj)

    return obj


def delete_certificate_details(
    db: Session,
    certificate_details_id: int,
) -> None:
    """Delete certificate details."""

    obj = get_certificate_details(
        db,
        certificate_details_id,
    )

    db.delete(obj)
    db.commit()

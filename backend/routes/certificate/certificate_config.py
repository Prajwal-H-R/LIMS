"""FastAPI router for generic certificate-details template content."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from backend.schemas.certificate.certificate_config_schemas import (
    CertificateDetailsCreate,
    CertificateDetailsRead,
    CertificateDetailsUpdate,
)
from backend.services.certificate.certificate_config_services import (
    create_certificate_details,
    delete_certificate_details,
    get_certificate_details,
    list_certificate_details,
    update_certificate_details,
)
from backend.db import get_db


router = APIRouter(
    prefix="/certificate-details",
    tags=["Certificate Details"],
)


@router.post(
    "",
    response_model=CertificateDetailsRead,
    status_code=status.HTTP_201_CREATED,
)
def create_certificate_details_endpoint(
    payload: CertificateDetailsCreate,
    db: Session = Depends(get_db),
) -> CertificateDetailsRead:
    row = create_certificate_details(db, payload)
    return CertificateDetailsRead.model_validate(row)


@router.get(
    "",
    response_model=list[CertificateDetailsRead],
)
def list_certificate_details_endpoint(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[CertificateDetailsRead]:
    rows = list_certificate_details(
        db,
        skip=skip,
        limit=limit,
    )

    return [
        CertificateDetailsRead.model_validate(row)
        for row in rows
    ]


@router.get(
    "/{certificate_details_id}",
    response_model=CertificateDetailsRead,
)
def get_certificate_details_endpoint(
    certificate_details_id: int,
    db: Session = Depends(get_db),
) -> CertificateDetailsRead:
    row = get_certificate_details(
        db,
        certificate_details_id,
    )

    return CertificateDetailsRead.model_validate(row)


@router.patch(
    "/{certificate_details_id}",
    response_model=CertificateDetailsRead,
)
def update_certificate_details_endpoint(
    certificate_details_id: int,
    payload: CertificateDetailsUpdate,
    db: Session = Depends(get_db),
) -> CertificateDetailsRead:
    row = update_certificate_details(
        db,
        certificate_details_id,
        payload,
    )

    return CertificateDetailsRead.model_validate(row)


@router.delete(
    "/{certificate_details_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_certificate_details_endpoint(
    certificate_details_id: int,
    db: Session = Depends(get_db),
) -> None:
    delete_certificate_details(
        db,
        certificate_details_id,
    )

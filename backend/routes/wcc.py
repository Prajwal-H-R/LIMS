"""FastAPI routes for Work Completion Certificates (WCC)."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.schemas.wcc import WCCCreate, WCCResponse, WCCUpdate
from backend.services.wcc import (
    create_wcc,
    delete_wcc,
    get_wcc,
    get_wcc_by_inward_id,
    list_wccs,
    update_wcc,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/work-completion-certificates",
    tags=["Work Completion Certificates"],
)


def _raise_database_http_error(db: Session, exc: SQLAlchemyError) -> None:
    """Log database details server-side while returning a safe client message."""
    db.rollback()
    logger.exception("WCC database operation failed", exc_info=exc)

    if isinstance(exc, IntegrityError):
        # Keep the detailed driver error in backend logs; don't expose SQL/secrets.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "The WCC conflicts with an existing record. Verify that this inward "
                "does not already have a WCC and that the WCC No is unique. "
                "For an existing inward record, update its saved WCC instead of creating another."
            ),
        ) from exc

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="A database error occurred while processing the certificate. Check the backend logs.",
    ) from exc


@router.post(
    "/",
    response_model=WCCResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a work completion certificate",
)
def create_work_completion_certificate(
    payload: WCCCreate,
    db: Session = Depends(get_db),
) -> WCCResponse:
    try:
        return create_wcc(db, payload)
    except SQLAlchemyError as exc:
        _raise_database_http_error(db, exc)


@router.get(
    "/",
    response_model=list[WCCResponse],
    summary="List work completion certificates",
)
def read_work_completion_certificates(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[WCCResponse]:
    try:
        return list_wccs(db, skip=skip, limit=limit)
    except SQLAlchemyError as exc:
        _raise_database_http_error(db, exc)


@router.get(
    "/by-inward/{inward_id}",
    response_model=WCCResponse,
    summary="Get the WCC for a Final Inspection inward record",
)
def read_wcc_by_inward_id(
    inward_id: int,
    db: Session = Depends(get_db),
) -> WCCResponse:
    try:
        record = get_wcc_by_inward_id(db, inward_id)
    except SQLAlchemyError as exc:
        _raise_database_http_error(db, exc)

    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No WCC exists for inward record {inward_id}.",
        )
    return record


@router.get(
    "/{wcc_id}",
    response_model=WCCResponse,
    summary="Get a work completion certificate by ID",
)
def read_work_completion_certificate(
    wcc_id: int,
    db: Session = Depends(get_db),
) -> WCCResponse:
    try:
        record = get_wcc(db, wcc_id)
    except SQLAlchemyError as exc:
        _raise_database_http_error(db, exc)

    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Work completion certificate {wcc_id} was not found.",
        )
    return record


@router.patch(
    "/{wcc_id}",
    response_model=WCCResponse,
    summary="Partially update a work completion certificate",
)
@router.put(
    "/{wcc_id}",
    response_model=WCCResponse,
    summary="Update a work completion certificate",
    description="Accepts fields to change; omitted fields remain unchanged.",
    include_in_schema=False,
)
def update_work_completion_certificate(
    wcc_id: int,
    payload: WCCUpdate,
    db: Session = Depends(get_db),
) -> WCCResponse:
    try:
        record = update_wcc(db, wcc_id, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except SQLAlchemyError as exc:
        _raise_database_http_error(db, exc)

    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Work completion certificate {wcc_id} was not found.",
        )
    return record


@router.delete(
    "/{wcc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Delete a work completion certificate",
)
def remove_work_completion_certificate(
    wcc_id: int,
    db: Session = Depends(get_db),
) -> Response:
    try:
        deleted = delete_wcc(db, wcc_id)
    except SQLAlchemyError as exc:
        _raise_database_http_error(db, exc)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Work completion certificate {wcc_id} was not found.",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)

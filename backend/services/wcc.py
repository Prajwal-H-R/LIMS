"""Service layer for Work Completion Certificates (WCC)."""

import logging
from typing import Any

from sqlalchemy import MetaData, Table, desc, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.models.wcc import WorkCompletionCertificate
from backend.schemas.wcc import WCCCreate, WCCResponse, WCCUpdate

logger = logging.getLogger(__name__)


def _payload_values(payload: WCCCreate | WCCUpdate) -> dict[str, Any]:
    """Dump explicitly supplied fields and normalize nested JSONB values."""
    values = payload.model_dump(exclude_unset=True)

    if "details_table" in payload.model_fields_set:
        values["details_table"] = [item.model_dump() for item in payload.details_table]

    if "signature_details" in payload.model_fields_set:
        # Only the two editable representative/seal keys are defined in the schema.
        values["signature_details"] = payload.signature_details.model_dump()

    return values


def _get_inward_summary(db: Session, inward_id: int) -> dict[str, Any] | None:
    """Fetch SRF/DC values from public.inward using its actual primary-key column.

    This deliberately reflects the table instead of assuming its PK is named `id`.
    If response enrichment fails, the WCC itself remains saved and the response can
    still be returned with null SRF/DC values; the real exception is logged.
    """
    try:
        bind = db.get_bind()
        inward_table = Table(
            "inward",
            MetaData(),
            schema="public",
            autoload_with=bind,
        )

        required_columns = {"srf_no", "customer_dc_no"}
        missing = required_columns.difference(inward_table.c.keys())
        if missing:
            logger.error(
                "Cannot enrich WCC response: public.inward is missing columns %s",
                sorted(missing),
            )
            return None

        primary_key_columns = list(inward_table.primary_key.columns)
        if len(primary_key_columns) == 1:
            inward_pk = primary_key_columns[0]
        else:
            # Fallback only if reflection reports no single-column primary key.
            candidate = next(
                (name for name in ("inward_id", "id") if name in inward_table.c),
                None,
            )
            if candidate is None:
                logger.error(
                    "Cannot enrich WCC response: could not determine a single primary key "
                    "for public.inward (reported PK columns: %s)",
                    [column.name for column in primary_key_columns],
                )
                return None
            inward_pk = inward_table.c[candidate]

        statement = (
            select(
                inward_table.c.srf_no,
                inward_table.c.customer_dc_no,
            )
            .where(inward_pk == inward_id)
            .limit(1)
        )
        row = db.execute(statement).mappings().first()
        return dict(row) if row is not None else None

    except Exception:
        # Avoid turning a committed INSERT/UPDATE into an apparent HTTP 500 solely
        # because optional response enrichment failed. Log the full traceback.
        db.rollback()
        logger.exception(
            "Failed to fetch public.inward summary for inward_id=%s",
            inward_id,
        )
        return None


def _response_for_record(
    db: Session, record: WorkCompletionCertificate
) -> WCCResponse:
    """Build a WCC response and enrich it with values from the linked inward row."""
    response_data = WCCResponse.model_validate(record).model_dump()

    inward_summary = (
        _get_inward_summary(db, record.inward_id)
        if record.inward_id is not None
        else None
    )
    response_data["srf_no"] = inward_summary.get("srf_no") if inward_summary else None
    response_data["customer_dc_no"] = (
        inward_summary.get("customer_dc_no") if inward_summary else None
    )
    return WCCResponse.model_validate(response_data)


def create_wcc(db: Session, payload: WCCCreate) -> WCCResponse:
    """Insert one WCC record, then build its API response."""
    values = _payload_values(payload)
    record = WorkCompletionCertificate(**values)
    db.add(record)

    try:
        db.commit()
        db.refresh(record)
    except SQLAlchemyError:
        db.rollback()
        logger.exception(
            "Failed to insert WCC (inward_id=%s, wcc_no=%s)",
            values.get("inward_id"),
            values.get("wcc_no"),
        )
        raise

    # Keep response enrichment outside the write transaction/commit try block.
    return _response_for_record(db, record)


def get_wcc(db: Session, wcc_id: int) -> WCCResponse | None:
    """Get one certificate by its primary key."""
    record = (
        db.query(WorkCompletionCertificate)
        .filter(WorkCompletionCertificate.id == wcc_id)
        .first()
    )
    return _response_for_record(db, record) if record is not None else None


def get_wcc_by_inward_id(db: Session, inward_id: int) -> WCCResponse | None:
    """Get the single certificate associated with an inward record."""
    record = (
        db.query(WorkCompletionCertificate)
        .filter(WorkCompletionCertificate.inward_id == inward_id)
        .first()
    )
    return _response_for_record(db, record) if record is not None else None


def list_wccs(
    db: Session, *, skip: int = 0, limit: int = 100
) -> list[WCCResponse]:
    """Return certificates newest first, including linked inward SRF/DC values."""
    records = (
        db.query(WorkCompletionCertificate)
        .order_by(
            desc(WorkCompletionCertificate.created_at),
            desc(WorkCompletionCertificate.id),
        )
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [_response_for_record(db, record) for record in records]


def update_wcc(
    db: Session, wcc_id: int, payload: WCCUpdate
) -> WCCResponse | None:
    """Patch an existing WCC; omitted fields remain unchanged."""
    record = (
        db.query(WorkCompletionCertificate)
        .filter(WorkCompletionCertificate.id == wcc_id)
        .first()
    )
    if record is None:
        return None

    changes = _payload_values(payload)
    if not changes:
        return _response_for_record(db, record)

    # A WCC remains tied to its original inward record. Prevent moving it to a
    # different inward id, which could create a misleading duplicate association.
    if "inward_id" in changes and changes["inward_id"] != record.inward_id:
        raise ValueError("inward_id cannot be changed after a WCC is created")

    effective_start = changes.get("work_start_date", record.work_start_date)
    effective_completion = changes.get(
        "work_completion_date", record.work_completion_date
    )
    if (
        effective_start is not None
        and effective_completion is not None
        and effective_completion < effective_start
    ):
        raise ValueError("work_completion_date cannot be before work_start_date")

    for field, value in changes.items():
        setattr(record, field, value)

    try:
        db.commit()
        db.refresh(record)
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Failed to update WCC id=%s", wcc_id)
        raise

    return _response_for_record(db, record)


def delete_wcc(db: Session, wcc_id: int) -> bool:
    """Delete a certificate; return False if it does not exist."""
    record = (
        db.query(WorkCompletionCertificate)
        .filter(WorkCompletionCertificate.id == wcc_id)
        .first()
    )
    if record is None:
        return False

    try:
        db.delete(record)
        db.commit()
        return True
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Failed to delete WCC id=%s", wcc_id)
        raise

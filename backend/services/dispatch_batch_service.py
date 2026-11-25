"""Service layer for multi-customer split dispatch batches."""

import logging
from typing import Dict, List, Optional, Sequence, Set, Tuple, Union

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from backend.models import Customer, InwardEquipment
from backend.models.dispatch_batch import DispatchBatch, DispatchBatchItem
from backend.models.equipment_flow_config import EquipmentFlowConfig
from backend.models.external_upload import ExternalUpload
from backend.models.final_inspection import FinalInspection
from backend.models.htw.htw_job import HTWJob
from backend.models.inward import Inward
from backend.models.wcc import WorkCompletionCertificate
from backend.schemas.dispatch_batch import (
    AvailableEquipmentItem,
    DispatchBatchCreate,
    DispatchBatchItemResponse,
    DispatchBatchResponse,
    DispatchBatchUpdate,
    DispatchDestinationCustomer,
    InwardDispatchOverviewResponse,
)

logger = logging.getLogger(__name__)


class DispatchBatchConflictError(ValueError):
    """Raised when an equipment is already assigned to another active batch."""


class DispatchBatchStateError(ValueError):
    """Raised when an operation is invalid for the batch's current lifecycle state."""


class DispatchBatchNotFoundError(LookupError):
    """Raised when a referenced inward, customer, or dispatch batch does not exist."""


def get_company_customer_ids(db: Session, customer_id: int) -> List[int]:
    """
    Resolve all Customer (branch) IDs belonging to the same company
    as the given customer_id using normalized Customer.customer_details.
    Fails closed to [customer_id] if company details are missing.
    """
    company_name = db.scalar(
        select(Customer.customer_details).where(Customer.customer_id == customer_id)
    )
    if not company_name or not company_name.strip():
        return [customer_id]

    normalized_name = company_name.strip().lower()
    branch_ids = db.scalars(
        select(Customer.customer_id).where(
            func.lower(func.trim(Customer.customer_details)) == normalized_name
        )
    ).all()

    return list(branch_ids) if branch_ids else [customer_id]


def _resolve_customer_scope(
    db: Session,
    customer_id_filter: Optional[Union[int, Sequence[int]]],
) -> Optional[List[int]]:
    """
    Resolve customer scope to company-level branch IDs.
    - None -> unrestricted (staff)
    - int -> expand to all branch customer_ids under the same company
    - Sequence[int] -> deduplicated list of branch customer_ids
    """
    if customer_id_filter is None:
        return None
    if isinstance(customer_id_filter, int):
        return get_company_customer_ids(db, customer_id_filter)
    return list(dict.fromkeys(customer_id_filter))


def _dedupe_eqp_ids(eqp_ids: Sequence[int]) -> List[int]:
    """Preserve order while removing duplicate equipment IDs."""
    return list(dict.fromkeys(eqp_ids))


def _compute_equipment_status_maps(
    db: Session, inward_id: int, inward_eqp_ids: List[int]
) -> Tuple[Set[str], Dict[int, str], Dict[int, ExternalUpload]]:
    """Load active flow config, internal HTW jobs, and external uploads in bulk."""
    flow_configs = (
        db.query(EquipmentFlowConfig)
        .filter(EquipmentFlowConfig.is_active.is_(True))
        .all()
    )
    system_driven_types = {cfg.equipment_type for cfg in flow_configs}

    jobs = db.query(HTWJob).filter(HTWJob.inward_id == inward_id).all()
    job_map = {j.inward_eqp_id: str(j.job_status or "PENDING") for j in jobs}

    upload_map: Dict[int, ExternalUpload] = {}
    if inward_eqp_ids:
        uploads = (
            db.query(ExternalUpload)
            .filter(ExternalUpload.inward_eqp_id.in_(inward_eqp_ids))
            .all()
        )
        upload_map = {u.inward_eqp_id: u for u in uploads}

    return system_driven_types, job_map, upload_map


def _resolve_equipment_status(
    eq: InwardEquipment,
    system_driven_types: Set[str],
    job_map: Dict[int, str],
    upload_map: Dict[int, ExternalUpload],
) -> Tuple[str, str]:
    """Return (job_status, flow_type) matching existing FinalInspection logic."""
    is_system_driven = eq.material_description in system_driven_types
    if is_system_driven:
        raw_status = job_map.get(eq.inward_eqp_id, "PENDING")
        return raw_status, "INTERNAL"

    upload_record = upload_map.get(eq.inward_eqp_id)
    has_cert = bool(
        upload_record is not None
        and getattr(upload_record, "certificate_file_url", None)
        and str(upload_record.certificate_file_url).strip()
    )
    return ("COMPLETED" if has_cert else "PENDING"), "EXTERNAL"


def _serialize_equipment_base(
    eq: InwardEquipment,
    system_driven_types: Set[str],
    job_map: Dict[int, str],
    upload_map: Dict[int, ExternalUpload],
) -> dict:
    raw_status, flow_type = _resolve_equipment_status(
        eq, system_driven_types, job_map, upload_map
    )
    return {
        "inward_eqp_id": eq.inward_eqp_id,
        "nepl_id": str(eq.nepl_id or ""),
        "material_description": str(eq.material_description or ""),
        "serial_no": str(eq.serial_no or ""),
        "quantity": int(getattr(eq, "quantity", 1) or 1),
        "make": str(eq.make or ""),
        "model": str(eq.model or ""),
        "range": str(eq.range or ""),
        "unit": str(getattr(eq, "unit", "") or ""),
        "visual_inspection_notes": str(eq.visual_inspection_notes or ""),
        "accessories_included": str(eq.accessories_included or ""),
        "engineer_remarks": str(eq.engineer_remarks or ""),
        "customer_remarks": str(eq.customer_remarks or ""),
        "job_status": raw_status,
        "flow_type": flow_type,
    }


def _build_batch_responses(
    db: Session,
    inward_id: int,
    batches: List[DispatchBatch],
) -> List[DispatchBatchResponse]:
    """Serialize a list of DispatchBatch rows with bulk-loaded items, WCCs, and FIRs."""
    if not batches:
        return []

    dispatch_ids = [b.dispatch_id for b in batches]
    customer_ids = list({b.dispatched_to_customer_id for b in batches})

    customers = (
        db.query(Customer).filter(Customer.customer_id.in_(customer_ids)).all()
    )
    customer_map = {c.customer_id: c for c in customers}

    all_items = (
        db.query(DispatchBatchItem)
        .filter(DispatchBatchItem.dispatch_id.in_(dispatch_ids))
        .order_by(DispatchBatchItem.id.asc())
        .all()
    )

    eqp_ids = list({item.inward_eqp_id for item in all_items})
    eqp_map: Dict[int, InwardEquipment] = {}
    if eqp_ids:
        equipments = (
            db.query(InwardEquipment)
            .filter(InwardEquipment.inward_eqp_id.in_(eqp_ids))
            .all()
        )
        eqp_map = {e.inward_eqp_id: e for e in equipments}

    system_driven_types, job_map, upload_map = _compute_equipment_status_maps(
        db, inward_id, eqp_ids
    )

    items_by_dispatch: Dict[int, List[DispatchBatchItem]] = {
        did: [] for did in dispatch_ids
    }
    for item in all_items:
        items_by_dispatch.setdefault(item.dispatch_id, []).append(item)

    wccs = (
        db.query(WorkCompletionCertificate)
        .filter(WorkCompletionCertificate.dispatch_id.in_(dispatch_ids))
        .order_by(WorkCompletionCertificate.id.asc())
        .all()
    )
    wcc_by_dispatch = {w.dispatch_id: w for w in wccs}

    inspections = (
        db.query(FinalInspection)
        .filter(FinalInspection.dispatch_id.in_(dispatch_ids))
        .order_by(FinalInspection.id.asc())
        .all()
    )
    fi_by_dispatch: Dict[int, FinalInspection] = {}
    for fi in inspections:
        existing = fi_by_dispatch.get(fi.dispatch_id)
        if existing is None or bool(getattr(fi, "is_active", True)):
            fi_by_dispatch[fi.dispatch_id] = fi

    results: List[DispatchBatchResponse] = []
    for batch in batches:
        dest_cust = customer_map.get(batch.dispatched_to_customer_id)
        batch_items = items_by_dispatch.get(batch.dispatch_id, [])

        # For non-cancelled batches, show active items; for cancelled batches, show historical items
        visible_items = (
            [i for i in batch_items if i.is_active]
            if batch.status != "CANCELLED"
            else batch_items
        )

        serialized_items: List[DispatchBatchItemResponse] = []
        for item in visible_items:
            eq = eqp_map.get(item.inward_eqp_id)
            if eq is None:
                continue
            base_data = _serialize_equipment_base(
                eq, system_driven_types, job_map, upload_map
            )
            serialized_items.append(
                DispatchBatchItemResponse(
                    id=item.id,
                    is_active=item.is_active,
                    **base_data,
                )
            )

        wcc = wcc_by_dispatch.get(batch.dispatch_id)
        fi = fi_by_dispatch.get(batch.dispatch_id)

        results.append(
            DispatchBatchResponse(
                dispatch_id=batch.dispatch_id,
                inward_id=batch.inward_id,
                batch_no=batch.batch_no,
                dispatched_to_customer_id=batch.dispatched_to_customer_id,
                dispatch_dc_no=batch.dispatch_dc_no,
                status=batch.status,
                remarks=batch.remarks,
                created_by=batch.created_by,
                dispatched_at=batch.dispatched_at,
                created_at=batch.created_at,
                updated_at=batch.updated_at,
                destination_customer=(
                    DispatchDestinationCustomer.model_validate(dest_cust)
                    if dest_cust is not None
                    else None
                ),
                equipment_count=len(serialized_items),
                inward_eqp_ids=[item.inward_eqp_id for item in serialized_items],
                items=serialized_items,
                wcc_id=wcc.id if wcc is not None else None,
                wcc_no=wcc.wcc_no if wcc is not None else None,
                final_inspection_id=fi.id if fi is not None else None,
                final_inspection_status=fi.status if fi is not None else None,
                report_sent=bool(fi.report_sent) if fi is not None else False,
                customer_decision=fi.customer_decision if fi is not None else None,
                customer_remarks=fi.customer_remarks if fi is not None else None,
            )
        )

    return results


class DispatchBatchService:
    @staticmethod
    def list_destination_customers(
        db: Session, search: Optional[str] = None
    ) -> List[DispatchDestinationCustomer]:
        """Return active customer/branch accounts for the 'Dispatch To' selector."""
        query = db.query(Customer).filter(
            (Customer.is_active.is_(True)) | (Customer.is_active.is_(None))
        )
        if search and search.strip():
            term = f"%{search.strip()}%"
            query = query.filter(
                (Customer.customer_details.ilike(term))
                | (Customer.location_name.ilike(term))
                | (Customer.contact_person.ilike(term))
                | (Customer.email.ilike(term))
            )
        customers = query.order_by(Customer.customer_details.asc()).all()
        return [DispatchDestinationCustomer.model_validate(c) for c in customers]

    @staticmethod
    def get_inward_dispatch_progress(
        db: Session, inward_id: int
    ) -> Dict[str, Union[int, str]]:
        """
        Compute derived dispatch progress from DispatchBatch & DispatchBatchItem.
        Does NOT mutate Inward.status.
        """
        total_eqps = (
            db.query(func.count(InwardEquipment.inward_eqp_id))
            .filter(InwardEquipment.inward_id == inward_id)
            .scalar()
            or 0
        )

        assigned_eqps = (
            db.query(func.count(DispatchBatchItem.id))
            .join(
                DispatchBatch,
                DispatchBatch.dispatch_id == DispatchBatchItem.dispatch_id,
            )
            .filter(
                DispatchBatch.inward_id == inward_id,
                DispatchBatch.status != "CANCELLED",
                DispatchBatchItem.is_active.is_(True),
            )
            .scalar()
            or 0
        )

        dispatched_eqps = (
            db.query(func.count(DispatchBatchItem.id))
            .join(
                DispatchBatch,
                DispatchBatch.dispatch_id == DispatchBatchItem.dispatch_id,
            )
            .filter(
                DispatchBatch.inward_id == inward_id,
                DispatchBatch.status == "DISPATCHED",
                DispatchBatchItem.is_active.is_(True),
            )
            .scalar()
            or 0
        )

        if total_eqps > 0 and dispatched_eqps >= total_eqps:
            dispatch_status = "DISPATCHED"
        elif dispatched_eqps > 0:
            dispatch_status = "PARTIALLY_DISPATCHED"
        else:
            dispatch_status = "NOT_DISPATCHED"

        return {
            "inward_id": inward_id,
            "total_equipments": total_eqps,
            "assigned_equipments": assigned_eqps,
            "dispatched_equipments": dispatched_eqps,
            "remaining_equipments": max(total_eqps - assigned_eqps, 0),
            "dispatch_status": dispatch_status,
        }

    @staticmethod
    def get_inward_overview(
        db: Session, inward_id: int
    ) -> InwardDispatchOverviewResponse:
        """Return remaining undispatched equipments and all batches for an inward (Staff)."""
        inward = db.query(Inward).filter(Inward.inward_id == inward_id).first()
        if inward is None:
            raise DispatchBatchNotFoundError(f"Inward {inward_id} not found.")

        all_equipments = (
            db.query(InwardEquipment)
            .filter(InwardEquipment.inward_id == inward_id)
            .order_by(InwardEquipment.inward_eqp_id.asc())
            .all()
        )
        all_eqp_ids = [eq.inward_eqp_id for eq in all_equipments]

        batches = (
            db.query(DispatchBatch)
            .filter(DispatchBatch.inward_id == inward_id)
            .order_by(DispatchBatch.batch_no.asc())
            .all()
        )

        active_assigned_rows = (
            db.query(DispatchBatchItem.inward_eqp_id)
            .join(
                DispatchBatch,
                DispatchBatch.dispatch_id == DispatchBatchItem.dispatch_id,
            )
            .filter(
                DispatchBatch.inward_id == inward_id,
                DispatchBatch.status != "CANCELLED",
                DispatchBatchItem.is_active.is_(True),
            )
            .all()
        )
        assigned_eqp_ids = {row[0] for row in active_assigned_rows}

        available_eqps = [
            eq for eq in all_equipments if eq.inward_eqp_id not in assigned_eqp_ids
        ]

        system_driven_types, job_map, upload_map = _compute_equipment_status_maps(
            db, inward_id, [eq.inward_eqp_id for eq in available_eqps]
        )

        serialized_available = [
            AvailableEquipmentItem(
                **_serialize_equipment_base(
                    eq, system_driven_types, job_map, upload_map
                )
            )
            for eq in available_eqps
        ]

        serialized_batches = _build_batch_responses(db, inward_id, batches)

        return InwardDispatchOverviewResponse(
            inward_id=inward.inward_id,
            srf_no=str(inward.srf_no or ""),
            origin_customer_id=inward.customer_id,
            origin_customer_details=str(inward.customer_details or ""),
            total_equipments=len(all_eqp_ids),
            assigned_equipments=len(assigned_eqp_ids),
            remaining_equipments=len(available_eqps),
            available_equipments=serialized_available,
            batches=serialized_batches,
        )

    @staticmethod
    def list_batches_for_inward(
        db: Session,
        inward_id: int,
        *,
        customer_id_filter: Optional[Union[int, Sequence[int]]] = None,
        include_cancelled: bool = True,
    ) -> List[DispatchBatchResponse]:
        """List dispatch batches for an inward.

        Pass `customer_id_filter` (single customer_id or pre-resolved company branch IDs)
        for customer-portal users to enforce company-level isolation
        (only non-cancelled batches dispatched to any branch of the company).
        """
        inward = db.query(Inward).filter(Inward.inward_id == inward_id).first()
        if inward is None:
            raise DispatchBatchNotFoundError(f"Inward {inward_id} not found.")

        query = db.query(DispatchBatch).filter(DispatchBatch.inward_id == inward_id)
        allowed_ids = _resolve_customer_scope(db, customer_id_filter)

        if allowed_ids is not None:
            if not allowed_ids:
                return []
            query = query.filter(
                DispatchBatch.dispatched_to_customer_id.in_(allowed_ids),
                DispatchBatch.status != "CANCELLED",
            )
        elif not include_cancelled:
            query = query.filter(DispatchBatch.status != "CANCELLED")

        batches = query.order_by(DispatchBatch.batch_no.asc()).all()
        return _build_batch_responses(db, inward_id, batches)

    @staticmethod
    def get_batch_by_id(
        db: Session,
        dispatch_id: int,
        *,
        customer_id_filter: Optional[Union[int, Sequence[int]]] = None,
    ) -> Optional[DispatchBatchResponse]:
        """Fetch a single batch; enforces company-level destination isolation when provided."""
        batch = (
            db.query(DispatchBatch)
            .filter(DispatchBatch.dispatch_id == dispatch_id)
            .first()
        )
        if batch is None:
            return None

        allowed_ids = _resolve_customer_scope(db, customer_id_filter)
        if allowed_ids is not None:
            if (
                batch.dispatched_to_customer_id not in allowed_ids
                or batch.status == "CANCELLED"
            ):
                return None

        serialized = _build_batch_responses(db, batch.inward_id, [batch])
        return serialized[0] if serialized else None

    @staticmethod
    def create_batch(
        db: Session,
        payload: DispatchBatchCreate,
        *,
        created_by: Optional[int] = None,
    ) -> DispatchBatchResponse:
        """Atomically create a dispatch batch and lock selected equipments."""
        requested_ids = _dedupe_eqp_ids(payload.inward_eqp_ids)
        if not requested_ids:
            raise ValueError("At least one equipment must be selected for a dispatch batch.")

        try:
            # Read-only row lock on parent inward strictly to serialize batch_no assignment
            inward = (
                db.query(Inward)
                .filter(Inward.inward_id == payload.inward_id)
                .with_for_update()
                .first()
            )
            if inward is None:
                raise DispatchBatchNotFoundError(
                    f"Inward {payload.inward_id} not found."
                )

            dest_customer = (
                db.query(Customer)
                .filter(Customer.customer_id == payload.dispatched_to_customer_id)
                .first()
            )
            if dest_customer is None:
                raise DispatchBatchNotFoundError(
                    f"Destination customer {payload.dispatched_to_customer_id} not found."
                )

            valid_equipments = (
                db.query(InwardEquipment)
                .filter(
                    InwardEquipment.inward_id == payload.inward_id,
                    InwardEquipment.inward_eqp_id.in_(requested_ids),
                )
                .all()
            )
            valid_map = {eq.inward_eqp_id: eq for eq in valid_equipments}
            missing_ids = [eid for eid in requested_ids if eid not in valid_map]
            if missing_ids:
                raise ValueError(
                    f"Equipments {missing_ids} do not belong to inward {payload.inward_id}."
                )

            already_assigned = (
                db.query(DispatchBatchItem.inward_eqp_id, DispatchBatch.batch_no)
                .join(
                    DispatchBatch,
                    DispatchBatch.dispatch_id == DispatchBatchItem.dispatch_id,
                )
                .filter(
                    DispatchBatchItem.inward_eqp_id.in_(requested_ids),
                    DispatchBatchItem.is_active.is_(True),
                )
                .all()
            )
            if already_assigned:
                conflict_desc = ", ".join(
                    f"{valid_map[eid].nepl_id} (Batch #{bno})"
                    for eid, bno in already_assigned
                    if eid in valid_map
                )
                raise DispatchBatchConflictError(
                    f"Equipment(s) already assigned to an active dispatch batch: {conflict_desc}"
                )

            max_batch_no = (
                db.query(func.coalesce(func.max(DispatchBatch.batch_no), 0))
                .filter(DispatchBatch.inward_id == payload.inward_id)
                .scalar()
            )
            next_batch_no = int(max_batch_no or 0) + 1

            batch = DispatchBatch(
                inward_id=payload.inward_id,
                dispatched_to_customer_id=payload.dispatched_to_customer_id,
                batch_no=next_batch_no,
                dispatch_dc_no=payload.dispatch_dc_no,
                status="DRAFT",
                remarks=payload.remarks,
                created_by=created_by,
            )
            db.add(batch)
            db.flush()

            for eq_id in requested_ids:
                db.add(
                    DispatchBatchItem(
                        dispatch_id=batch.dispatch_id,
                        inward_eqp_id=eq_id,
                        is_active=True,
                    )
                )

            db.commit()
            db.refresh(batch)

        except IntegrityError as exc:
            db.rollback()
            logger.exception("Integrity error creating dispatch batch")
            raise DispatchBatchConflictError(
                "One or more selected equipments were assigned concurrently to another dispatch batch."
            ) from exc
        except (
            DispatchBatchNotFoundError,
            DispatchBatchConflictError,
            DispatchBatchStateError,
            ValueError,
        ):
            db.rollback()
            raise
        except SQLAlchemyError:
            db.rollback()
            logger.exception("Database error creating dispatch batch")
            raise

        serialized = _build_batch_responses(db, batch.inward_id, [batch])
        return serialized[0]

    @staticmethod
    def update_batch(
        db: Session,
        dispatch_id: int,
        payload: DispatchBatchUpdate,
    ) -> DispatchBatchResponse:
        """Update a DRAFT/READY batch's destination customer, equipment list, or metadata."""
        try:
            batch = (
                db.query(DispatchBatch)
                .filter(DispatchBatch.dispatch_id == dispatch_id)
                .with_for_update()
                .first()
            )
            if batch is None:
                raise DispatchBatchNotFoundError(
                    f"Dispatch batch {dispatch_id} not found."
                )

            if batch.status == "CANCELLED":
                raise DispatchBatchStateError(
                    "Cannot modify a cancelled dispatch batch."
                )

            changes = payload.model_dump(exclude_unset=True)
            is_structural_change = (
                "dispatched_to_customer_id" in changes or "inward_eqp_ids" in changes
            )

            linked_fi = (
                db.query(FinalInspection)
                .filter(
                    FinalInspection.dispatch_id == dispatch_id,
                    FinalInspection.is_active.is_(True),
                )
                .first()
            )

            if is_structural_change:
                if batch.status == "DISPATCHED":
                    raise DispatchBatchStateError(
                        "Cannot change destination customer or equipments after the batch has been dispatched."
                    )
                if linked_fi is not None and bool(linked_fi.report_sent):
                    raise DispatchBatchStateError(
                        "Cannot change destination customer or equipments after the final inspection report has been sent."
                    )

            if "dispatched_to_customer_id" in changes:
                new_customer_id = changes["dispatched_to_customer_id"]
                dest_customer = (
                    db.query(Customer)
                    .filter(Customer.customer_id == new_customer_id)
                    .first()
                )
                if dest_customer is None:
                    raise DispatchBatchNotFoundError(
                        f"Destination customer {new_customer_id} not found."
                    )
                batch.dispatched_to_customer_id = new_customer_id

                linked_wcc = (
                    db.query(WorkCompletionCertificate)
                    .filter(WorkCompletionCertificate.dispatch_id == dispatch_id)
                    .first()
                )
                if linked_wcc is not None:
                    linked_wcc.dispatched_to_customer_id = new_customer_id

                if linked_fi is not None:
                    linked_fi.customer_id = new_customer_id

            if "dispatch_dc_no" in changes:
                batch.dispatch_dc_no = changes["dispatch_dc_no"]

            if "remarks" in changes:
                batch.remarks = changes["remarks"]

            if "inward_eqp_ids" in changes and changes["inward_eqp_ids"] is not None:
                requested_ids = _dedupe_eqp_ids(changes["inward_eqp_ids"])
                if not requested_ids:
                    raise ValueError(
                        "A dispatch batch must contain at least one equipment."
                    )

                valid_equipments = (
                    db.query(InwardEquipment)
                    .filter(
                        InwardEquipment.inward_id == batch.inward_id,
                        InwardEquipment.inward_eqp_id.in_(requested_ids),
                    )
                    .all()
                )
                valid_map = {eq.inward_eqp_id: eq for eq in valid_equipments}
                missing_ids = [eid for eid in requested_ids if eid not in valid_map]
                if missing_ids:
                    raise ValueError(
                        f"Equipments {missing_ids} do not belong to inward {batch.inward_id}."
                    )

                existing_items = (
                    db.query(DispatchBatchItem)
                    .filter(
                        DispatchBatchItem.dispatch_id == dispatch_id,
                        DispatchBatchItem.is_active.is_(True),
                    )
                    .all()
                )
                existing_id_set = {item.inward_eqp_id for item in existing_items}
                requested_id_set = set(requested_ids)

                to_remove = existing_id_set - requested_id_set
                to_add = [eid for eid in requested_ids if eid not in existing_id_set]

                if to_add:
                    conflicts = (
                        db.query(DispatchBatchItem.inward_eqp_id, DispatchBatch.batch_no)
                        .join(
                            DispatchBatch,
                            DispatchBatch.dispatch_id == DispatchBatchItem.dispatch_id,
                        )
                        .filter(
                            DispatchBatchItem.inward_eqp_id.in_(to_add),
                            DispatchBatchItem.is_active.is_(True),
                            DispatchBatchItem.dispatch_id != dispatch_id,
                        )
                        .all()
                    )
                    if conflicts:
                        conflict_desc = ", ".join(
                            f"{valid_map[eid].nepl_id} (Batch #{bno})"
                            for eid, bno in conflicts
                            if eid in valid_map
                        )
                        raise DispatchBatchConflictError(
                            f"Equipment(s) already assigned to another active batch: {conflict_desc}"
                        )

                if to_remove:
                    (
                        db.query(DispatchBatchItem)
                        .filter(
                            DispatchBatchItem.dispatch_id == dispatch_id,
                            DispatchBatchItem.inward_eqp_id.in_(list(to_remove)),
                            DispatchBatchItem.is_active.is_(True),
                        )
                        .delete(synchronize_session=False)
                    )
                    db.flush()

                for eq_id in to_add:
                    db.add(
                        DispatchBatchItem(
                            dispatch_id=dispatch_id,
                            inward_eqp_id=eq_id,
                            is_active=True,
                        )
                    )

            db.commit()
            db.refresh(batch)

        except IntegrityError as exc:
            db.rollback()
            logger.exception("Integrity error updating dispatch batch %s", dispatch_id)
            raise DispatchBatchConflictError(
                "Equipment selection conflicts with another active dispatch batch."
            ) from exc
        except (
            DispatchBatchNotFoundError,
            DispatchBatchConflictError,
            DispatchBatchStateError,
            ValueError,
        ):
            db.rollback()
            raise
        except SQLAlchemyError:
            db.rollback()
            logger.exception("Database error updating dispatch batch %s", dispatch_id)
            raise

        serialized = _build_batch_responses(db, batch.inward_id, [batch])
        return serialized[0]

    @staticmethod
    def cancel_batch(
        db: Session,
        dispatch_id: int,
        *,
        remarks: Optional[str] = None,
    ) -> DispatchBatchResponse:
        """Cancel a non-dispatched batch and release its equipments for reassignment."""
        try:
            batch = (
                db.query(DispatchBatch)
                .filter(DispatchBatch.dispatch_id == dispatch_id)
                .with_for_update()
                .first()
            )
            if batch is None:
                raise DispatchBatchNotFoundError(
                    f"Dispatch batch {dispatch_id} not found."
                )

            if batch.status == "CANCELLED":
                raise DispatchBatchStateError("Dispatch batch is already cancelled.")

            if batch.status == "DISPATCHED":
                raise DispatchBatchStateError(
                    "Cannot cancel a batch that has already been dispatched to a customer."
                )

            linked_fi = (
                db.query(FinalInspection)
                .filter(
                    FinalInspection.dispatch_id == dispatch_id,
                    FinalInspection.is_active.is_(True),
                )
                .first()
            )
            if linked_fi is not None and bool(linked_fi.report_sent):
                raise DispatchBatchStateError(
                    "Cannot cancel a batch after the final inspection report has been sent."
                )

            batch.status = "CANCELLED"
            if remarks:
                batch.remarks = (
                    f"{batch.remarks}\n[Cancelled]: {remarks}"
                    if batch.remarks
                    else f"[Cancelled]: {remarks}"
                )

            (
                db.query(DispatchBatchItem)
                .filter(
                    DispatchBatchItem.dispatch_id == dispatch_id,
                    DispatchBatchItem.is_active.is_(True),
                )
                .update(
                    {DispatchBatchItem.is_active: False},
                    synchronize_session=False,
                )
            )

            if linked_fi is not None:
                linked_fi.is_active = False
                linked_fi.status = "CANCELLED"

            db.commit()
            db.refresh(batch)

        except (DispatchBatchNotFoundError, DispatchBatchStateError):
            db.rollback()
            raise
        except SQLAlchemyError:
            db.rollback()
            logger.exception("Database error cancelling dispatch batch %s", dispatch_id)
            raise

        serialized = _build_batch_responses(db, batch.inward_id, [batch])
        return serialized[0]

    @staticmethod
    def sync_inward_dispatch_status(db: Session, inward_id: int) -> str:
        """
        No-op compatibility wrapper — intentionally does NOT modify Inward.status.
        Returns the derived dispatch status computed from DispatchBatch / DispatchBatchItem.
        """
        progress = DispatchBatchService.get_inward_dispatch_progress(db, inward_id)
        return str(progress["dispatch_status"])
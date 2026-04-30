# backend/services/deviation_service.py

from datetime import datetime, timezone
from pathlib import Path
import uuid
from typing import Dict, List, Optional
import fastapi.encoders
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from backend.models.deviation import Deviation
from backend.models.deviation_attachments import DeviationAttachment
from backend.models.external_deviation import ExternalDeviation, ExternalDeviationAttachment
from backend.models.inward import Inward
from backend.models.inward_equipments import InwardEquipment
from backend.models.htw.htw_job import HTWJob
from backend.models.htw.htw_repeatability import HTWRepeatability
from backend.schemas.deviation_schemas import (
    CustomerDeviationItem,
    DeviationAttachmentOut,
    DeviationDetailOut,
    ManualDeviationCreate,
)


BACKEND_BASE_DIR = Path(__file__).resolve().parents[1]
DEVIATION_UPLOAD_DIR = BACKEND_BASE_DIR / "uploads" / "deviations"
DEVIATION_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

def safe_bytes_encoder(obj: bytes):
    try:
        return obj.decode("utf-8")
    except UnicodeDecodeError:
        return f"<{len(obj)} bytes binary data>"

fastapi.encoders.ENCODERS_BY_TYPE[bytes] = safe_bytes_encoder
def _derive_deviation_type(d: Deviation) -> str:
    if d.job_id is not None and d.created_by is None:
        return "OOT"
    return "MANUAL"


def _derive_calibration_status(job_status: Optional[str], deviation_type: str) -> str:
    return "calibrated" if deviation_type == "OOT" else "not calibrated"


def _get_job_for_deviation(db: Session, d: Deviation) -> Optional[HTWJob]:
    if d.job_id is not None:
        return db.query(HTWJob).filter(HTWJob.job_id == d.job_id).first()
    return (
        db.query(HTWJob)
        .filter(HTWJob.inward_eqp_id == d.inward_eqp_id)
        .order_by(HTWJob.job_id.desc())
        .first()
    )


def sync_deviation_calibration_status(db: Session, d: Deviation) -> bool:
    job = _get_job_for_deviation(db, d)
    desired = _derive_calibration_status(job.job_status if job else None, _derive_deviation_type(d))
    if (d.calibration_status or "").strip().lower() != desired:
        d.calibration_status = desired
        d.updated_at = datetime.now(timezone.utc)
        return True
    return False


def sync_job_status_from_deviation(db: Session, d: Deviation, terminate: bool = False) -> None:
    job = _get_job_for_deviation(db, d)
    if not job:
        return

    if terminate:
        job.job_status = "Terminated"
        return

    active_count = (
        db.query(Deviation)
        .filter(
            Deviation.inward_eqp_id == d.inward_eqp_id,
            Deviation.status.in_(["OPEN", "IN_PROGRESS"]),
        )
        .count()
    )
    if active_count > 0:
        job.job_status = "On Hold"
    elif (job.job_status or "").strip().lower() == "on hold":
        deviation_type = _derive_deviation_type(d)
        job.job_status = "Calibrated" if deviation_type == "OOT" else "In Progress"


def _sync_legacy_deviation_statuses(db: Session) -> None:
    rows = db.query(Deviation).all()
    latest_by_eqp: Dict[int, Deviation] = {}
    active_count_by_eqp: Dict[int, int] = {}
    changed = False
    for d in rows:
        status_raw = (d.status or "").strip()
        status = status_raw.upper()
        decision = (d.customer_decision or "").strip()

        if not status:
            d.status = "OPEN"
            status = "OPEN"
            changed = True

        if decision and status == "OPEN":
            d.status = "IN_PROGRESS"
            status = "IN_PROGRESS"
            d.updated_at = datetime.now(timezone.utc)
            changed = True

        if status in ("OPEN", "IN_PROGRESS"):
            active_count_by_eqp[d.inward_eqp_id] = active_count_by_eqp.get(d.inward_eqp_id, 0) + 1

        prev = latest_by_eqp.get(d.inward_eqp_id)
        d_ts = d.updated_at or d.created_at
        p_ts = (prev.updated_at or prev.created_at) if prev else None
        if prev is None or (d_ts and (p_ts is None or d_ts >= p_ts)):
            latest_by_eqp[d.inward_eqp_id] = d

        if sync_deviation_calibration_status(db, d):
            changed = True

    for inward_eqp_id, latest in latest_by_eqp.items():
        job = (
            db.query(HTWJob)
            .filter(HTWJob.inward_eqp_id == inward_eqp_id)
            .order_by(HTWJob.job_id.desc())
            .first()
        )
        if not job:
            continue

        if active_count_by_eqp.get(inward_eqp_id, 0) > 0:
            desired_job_status = "On Hold"
        elif (job.job_status or "").strip().lower() == "on hold":
            desired_job_status = "Calibrated" if _derive_deviation_type(latest) == "OOT" else "In Progress"
        else:
            desired_job_status = None

        if desired_job_status and (job.job_status or "") != desired_job_status:
            job.job_status = desired_job_status
            changed = True

    if changed:
        db.commit()


def _row_to_customer_item(
    d: Deviation,
    eq: InwardEquipment,
    srf_no: Optional[str],
    customer_dc_no: Optional[str],
    customer_dc_date: Optional[str],
    inward_id: int,
    rep: Optional[HTWRepeatability],
    job_id: Optional[int],
) -> CustomerDeviationItem:
    return CustomerDeviationItem(
        deviation_id=d.id,
        inward_id=inward_id,
        inward_eqp_id=d.inward_eqp_id,
        srf_no=srf_no,
        customer_dc_no=customer_dc_no,
        customer_dc_date=customer_dc_date,
        nepl_id=eq.nepl_id,
        make=eq.make,
        model=eq.model,
        serial_no=eq.serial_no,
        job_id=job_id,
        step_percent=float(rep.step_percent) if rep and rep.step_percent is not None else None,
        deviation_percent=float(rep.deviation_percent)
        if rep and rep.deviation_percent is not None
        else None,
        deviation_type=_derive_deviation_type(d),
        status=d.status or "OPEN",
        calibration_status=d.calibration_status or "not calibrated",
        engineer_remarks=d.engineer_remarks,
        customer_decision=d.customer_decision,
        report=d.report or (d.created_at.date() if d.created_at else None),
        created_at=d.created_at,
    )


def _external_row_to_customer_item(
    d: ExternalDeviation,
    eq: InwardEquipment,
    srf_no: Optional[str],
    customer_dc_no: Optional[str],
    customer_dc_date: Optional[str],
    inward_id: int,
) -> CustomerDeviationItem:
    deviation_type = "MANUAL" if d.deviation_type == "NC" else "OOT"
    status = "IN_PROGRESS" if d.customer_decision else "OPEN"
    calibration_status = "calibrated" if deviation_type == "OOT" else "not calibrated"
    step_data = d.step_per_deviation or {}
    step_percent = step_data.get("step_percent")
    deviation_percent = step_data.get("deviation_percent")

    return CustomerDeviationItem(
        deviation_id=-d.id,
        inward_id=inward_id,
        inward_eqp_id=d.inward_eqp_id,
        srf_no=srf_no,
        customer_dc_no=customer_dc_no,
        customer_dc_date=customer_dc_date,
        nepl_id=eq.nepl_id,
        make=eq.make,
        model=eq.model,
        serial_no=eq.serial_no,
        job_id=None,
        step_percent=float(step_percent) if step_percent is not None else None,
        deviation_percent=float(deviation_percent) if deviation_percent is not None else None,
        deviation_type=deviation_type,
        status=status,
        tool_status=d.tool_status,
        calibration_status=calibration_status,
        engineer_remarks=d.engineer_remarks,
        customer_decision=d.customer_decision,
        report=d.report or (d.created_at.date() if d.created_at else None),
        created_at=d.created_at,
    )


def _get_primary_oot_step(db: Session, job_id: Optional[int]) -> Optional[HTWRepeatability]:
    if job_id is None:
        return None
    return (
        db.query(HTWRepeatability)
        .filter(
            HTWRepeatability.job_id == job_id,
            HTWRepeatability.deviation_percent.isnot(None),
        )
        .order_by(func.abs(HTWRepeatability.deviation_percent).desc())
        .first()
    )


def _get_oot_steps_for_job(db: Session, job_id: Optional[int]) -> List[HTWRepeatability]:
    if job_id is None:
        return []
    return (
        db.query(HTWRepeatability)
        .filter(
            HTWRepeatability.job_id == job_id,
            HTWRepeatability.deviation_percent.isnot(None),
        )
        .order_by(HTWRepeatability.step_percent.asc().nullslast())
        .all()
    )


def _collapse_manual_items(items: List[CustomerDeviationItem]) -> List[CustomerDeviationItem]:
    by_eqp: Dict[int, CustomerDeviationItem] = {}
    for item in items:
        key = item.inward_eqp_id
        current = by_eqp.get(key)
        if current is None:
            by_eqp[key] = item
            continue

        item_active = (item.status or "").strip().upper() in ("OPEN", "IN_PROGRESS")
        current_active = (current.status or "").strip().upper() in ("OPEN", "IN_PROGRESS")
        if item_active != current_active:
            if item_active:
                by_eqp[key] = item
            continue

        item_ts = item.created_at
        current_ts = current.created_at
        if item_ts and (current_ts is None or item_ts > current_ts):
            by_eqp[key] = item
            continue

        item_id = abs(item.deviation_id or 0)
        current_id = abs(current.deviation_id or 0)

        item_is_external = (item.deviation_id or 0) < 0
        current_is_external = (current.deviation_id or 0) < 0

        if item_ts == current_ts:
            if item_is_external == current_is_external:
                if item_id > current_id:
                     by_eqp[key] = item
            elif not item_is_external:
                 by_eqp[key] = item

    return sorted(
        by_eqp.values(),
        key=lambda x: (x.created_at or datetime.min.replace(tzinfo=timezone.utc)),
        reverse=True,
    )

def list_all_deviations_for_staff(db: Session) -> List[CustomerDeviationItem]:
    _sync_legacy_deviation_statuses(db)
    
    all_items: List[CustomerDeviationItem] = []

    rows = (
        db.query(
            Deviation, InwardEquipment, Inward.srf_no, Inward.customer_dc_no,
            Inward.customer_dc_date, Inward.inward_id,
        )
        .join(InwardEquipment, InwardEquipment.inward_eqp_id == Deviation.inward_eqp_id)
        .join(Inward, Inward.inward_id == InwardEquipment.inward_id)
        .all()
    )
    changed = False
    for d, *_ in rows:
        if sync_deviation_calibration_status(db, d):
            changed = True
    if changed:
        db.commit()
        rows = (
            db.query(
                Deviation, InwardEquipment, Inward.srf_no, Inward.customer_dc_no,
                Inward.customer_dc_date, Inward.inward_id,
            )
            .join(InwardEquipment, InwardEquipment.inward_eqp_id == Deviation.inward_eqp_id)
            .join(Inward, Inward.inward_id == InwardEquipment.inward_id)
            .all()
        )


    for d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id in rows:
        primary_rep = _get_primary_oot_step(db, d.job_id)
        all_items.append(
            _row_to_customer_item(
                d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id, primary_rep, d.job_id
            )
        )

    external_rows = (
        db.query(
            ExternalDeviation, InwardEquipment, Inward.srf_no, Inward.customer_dc_no,
            Inward.customer_dc_date, Inward.inward_id,
        )
        .join(InwardEquipment, InwardEquipment.inward_eqp_id == ExternalDeviation.inward_eqp_id)
        .join(Inward, Inward.inward_id == InwardEquipment.inward_id)
        .all()
    )
    for d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id in external_rows:
        all_items.append(
            _external_row_to_customer_item(d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id)
        )

    manual_items = [i for i in all_items if (i.deviation_type or "").upper() == "MANUAL"]
    non_manual_items = [i for i in all_items if (i.deviation_type or "").upper() != "MANUAL"]
    collapsed_manual = _collapse_manual_items(manual_items)
    merged = non_manual_items + collapsed_manual
    
    return sorted(
        merged,
        key=lambda x: (x.created_at or datetime.min.replace(tzinfo=timezone.utc)),
        reverse=True,
    )
def list_deviations_for_customer(db: Session, customer_id: int) -> List[CustomerDeviationItem]:
    _sync_legacy_deviation_statuses(db)
    
    all_items: List[CustomerDeviationItem] = []

    rows = (
        db.query(
            Deviation, InwardEquipment, Inward.srf_no, Inward.customer_dc_no,
            Inward.customer_dc_date, Inward.inward_id,
        )
        .join(InwardEquipment, InwardEquipment.inward_eqp_id == Deviation.inward_eqp_id)
        .join(Inward, Inward.inward_id == InwardEquipment.inward_id)
        .filter(Inward.customer_id == customer_id)
        .all()
    )
    changed = False
    for d, *_ in rows:
        if sync_deviation_calibration_status(db, d):
            changed = True
    if changed:
        db.commit()
        db.refresh(d)

    for d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id in rows:
        primary_rep = _get_primary_oot_step(db, d.job_id)
        all_items.append(
            _row_to_customer_item(
                d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id, primary_rep, d.job_id
            )
        )

    external_rows = (
        db.query(
            ExternalDeviation, InwardEquipment, Inward.srf_no, Inward.customer_dc_no,
            Inward.customer_dc_date, Inward.inward_id,
        )
        .join(InwardEquipment, InwardEquipment.inward_eqp_id == ExternalDeviation.inward_eqp_id)
        .join(Inward, Inward.inward_id == InwardEquipment.inward_id)
        .filter(Inward.customer_id == customer_id)
        .all()
    )
    for d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id in external_rows:
        all_items.append(
            _external_row_to_customer_item(d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id)
        )

    manual_items = [i for i in all_items if (i.deviation_type or "").upper() == "MANUAL"]
    non_manual_items = [i for i in all_items if (i.deviation_type or "").upper() != "MANUAL"]
    collapsed_manual = _collapse_manual_items(manual_items)
    merged = non_manual_items + collapsed_manual
    
    return sorted(
        merged,
        key=lambda x: (x.created_at or datetime.min.replace(tzinfo=timezone.utc)),
        reverse=True,
    )


def list_manual_deviations_for_staff(db: Session) -> List[CustomerDeviationItem]:
    _sync_legacy_deviation_statuses(db)
    
    manual_items: List[CustomerDeviationItem] = []

    rows = (
        db.query(
            Deviation, InwardEquipment, Inward.srf_no, Inward.customer_dc_no,
            Inward.customer_dc_date, Inward.inward_id,
        )
        .join(InwardEquipment, InwardEquipment.inward_eqp_id == Deviation.inward_eqp_id)
        .join(Inward, Inward.inward_id == InwardEquipment.inward_id)
        .order_by(Deviation.created_at.desc())
        .all()
    )
    changed = False
    for d, *_ in rows:
        if sync_deviation_calibration_status(db, d):
            changed = True
    if changed:
        db.commit()
        db.refresh(d)

    for d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id in rows:
        if _derive_deviation_type(d) != "MANUAL":
            continue
        job = _get_job_for_deviation(db, d)
        manual_items.append(
            _row_to_customer_item(
                d=d, eq=eq, srf_no=srf_no, customer_dc_no=customer_dc_no,
                customer_dc_date=customer_dc_date, inward_id=inward_id,
                rep=None, job_id=job.job_id if job else None,
            )
        )

    external_rows = (
        db.query(
            ExternalDeviation, InwardEquipment, Inward.srf_no, Inward.customer_dc_no,
            Inward.customer_dc_date, Inward.inward_id,
        )
        .join(InwardEquipment, InwardEquipment.inward_eqp_id == ExternalDeviation.inward_eqp_id)
        .join(Inward, Inward.inward_id == InwardEquipment.inward_id)
        .filter(ExternalDeviation.deviation_type == "NC")
        .order_by(ExternalDeviation.created_at.desc())
        .all()
    )
    for d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id in external_rows:
        manual_items.append(
            _external_row_to_customer_item(d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id)
        )
    
    return _collapse_manual_items(manual_items)


def create_manual_deviation(
    db: Session, payload: ManualDeviationCreate, created_by: Optional[int]
) -> Optional[DeviationDetailOut]:
    eq = (
        db.query(InwardEquipment)
        .filter(
            InwardEquipment.inward_eqp_id == payload.inward_eqp_id,
            InwardEquipment.inward_id == payload.inward_id,
        )
        .first()
    )
    if not eq:
        return None

    d = Deviation(
        inward_eqp_id=payload.inward_eqp_id,
        job_id=payload.job_id,
        created_by=created_by,
        status="OPEN",
        calibration_status="not calibrated",
        engineer_remarks=payload.engineer_remarks.strip(),
    )
    db.add(d)
    db.flush()
    sync_job_status_from_deviation(db, d)
    db.commit()
    return get_deviation_detail_for_staff(db, d.id)


def add_deviation_attachments(
    db: Session,
    deviation_id: int,
    files: List[tuple[str, Optional[str], bytes]],
    uploaded_by: Optional[int],
) -> Optional[DeviationDetailOut]:
    # NOTE: This function currently only works for positive deviation_ids (from the 'deviation' table).
    d = db.query(Deviation).filter(Deviation.id == deviation_id).first()
    if not d:
        return None

    for original_name, mime_type, content in files:
        suffix = Path(original_name).suffix if original_name else ""
        safe_name = f"{uuid.uuid4().hex}{suffix}"
        file_path = DEVIATION_UPLOAD_DIR / safe_name
        with open(file_path, "wb") as out:
            out.write(content)

        file_url = f"/api/uploads/deviations/{safe_name}"
        db.add(
            DeviationAttachment(
                deviation_id=deviation_id,
                file_name=original_name or safe_name,
                file_type=mime_type,
                file_url=file_url,
                uploaded_by=uploaded_by,
            )
        )

    d.updated_at = datetime.now(timezone.utc)
    db.commit()
    return get_deviation_detail_for_staff(db, deviation_id)

def _map_attachment_metadata(att) -> DeviationAttachmentOut:
    return DeviationAttachmentOut(
        id=att.id,
        file_name=str(att.file_name),
        file_type=str(att.file_type) if att.file_type else None,
        file_url=str(att.file_url),
        created_at=att.created_at
    )

# ====================================================================
# START MODIFIED FUNCTION: update_customer_decision
# ====================================================================
def update_customer_decision(
    db: Session, deviation_id: int, customer_id: int, decision: str
) -> Optional[CustomerDeviationItem]:
    """
    Handles customer decisions for both internal (positive ID) and external (negative ID) deviations.
    """
    # --- Handle negative IDs for ExternalDeviations ---
    if deviation_id < 0:
        ext_id = abs(deviation_id)
        row = (
            db.query(ExternalDeviation, InwardEquipment, Inward)
            .join(InwardEquipment, InwardEquipment.inward_eqp_id == ExternalDeviation.inward_eqp_id)
            .join(Inward, Inward.inward_id == InwardEquipment.inward_id)
            .filter(
                ExternalDeviation.id == ext_id,
                Inward.customer_id == customer_id # Security check
            )
            .first()
        )
        if not row:
            return None
        
        d, eq, inward = row
        stripped = decision.strip()
        d.customer_decision = stripped if stripped else None
        d.updated_at = datetime.now(timezone.utc)
        
        db.commit()
        db.refresh(d)
        
        # Use existing helper to create the response
        return _external_row_to_customer_item(
            d, eq, inward.srf_no, inward.customer_dc_no, str(inward.customer_dc_date), inward.inward_id
        )

    # --- Existing logic for positive IDs (internal deviations) ---
    row = (
        db.query(
            Deviation, InwardEquipment, Inward.srf_no, Inward.customer_dc_no,
            Inward.customer_dc_date, Inward.inward_id,
        )
        .join(InwardEquipment, InwardEquipment.inward_eqp_id == Deviation.inward_eqp_id)
        .join(Inward, Inward.inward_id == InwardEquipment.inward_id)
        .filter(Deviation.id == deviation_id, Inward.customer_id == customer_id)
        .first()
    )
    if not row:
        return None

    d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id = row
    stripped = decision.strip()
    d.customer_decision = stripped if stripped else None
    if stripped and (d.status or "").upper() != "CLOSED":
        d.status = "IN_PROGRESS"
    sync_job_status_from_deviation(db, d)
    sync_deviation_calibration_status(db, d)
    d.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(d)
    primary_rep = _get_primary_oot_step(db, d.job_id)
    return _row_to_customer_item(
        d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id, primary_rep, d.job_id
    )
# ====================================================================
# END MODIFIED FUNCTION
# ====================================================================


def _external_row_to_detail_out(db: Session, d: ExternalDeviation, eq: InwardEquipment, inward: Inward) -> DeviationDetailOut:
    deviation_type = "MANUAL" if d.deviation_type == "NC" else "OOT"
    
    status = "OPEN"
    if d.tool_status and str(d.tool_status).strip().lower() in ["closed", "terminated"]:
        status = "CLOSED"
    elif d.customer_decision:
        status = "IN_PROGRESS"

    calibration_status = "calibrated" if deviation_type == "OOT" else "not calibrated"

    oot_steps = []
    if deviation_type == "OOT" and isinstance(d.step_per_deviation, dict):
        for k, v in d.step_per_deviation.items():
            try:
                oot_steps.append({"step_percent": float(k), "deviation_percent": float(v)})
            except (ValueError, TypeError):
                continue
        oot_steps.sort(key=lambda x: x.get("step_percent", 0))

    safe_attachments = [_map_attachment_metadata(a) for a in d.attachments]

    return DeviationDetailOut(
        deviation_id=-d.id,
        inward_id=inward.inward_id,
        inward_eqp_id=d.inward_eqp_id,
        srf_no=inward.srf_no,
        customer_dc_no=inward.customer_dc_no,
        customer_dc_date=str(inward.customer_dc_date) if inward.customer_dc_date else None,
        customer_details=inward.customer_details,
        nepl_id=eq.nepl_id,
        make=eq.make,
        model=eq.model,
        serial_no=eq.serial_no,
        job_id=None,
        deviation_type=deviation_type,
        status=status,
        tool_status=d.tool_status,
        calibration_status=calibration_status,
        engineer_remarks=d.engineer_remarks,
        customer_decision=d.customer_decision,
        report=d.report,
        created_at=d.created_at,
        updated_at=d.updated_at,
        oot_steps=oot_steps,
        attachments=safe_attachments,
    )

def get_deviation_detail_for_staff(db: Session, deviation_id: int) -> Optional[DeviationDetailOut]:
    _sync_legacy_deviation_statuses(db)

    if deviation_id < 0:
        ext_id = abs(deviation_id)
        row = db.query(ExternalDeviation, InwardEquipment, Inward)\
            .join(InwardEquipment, InwardEquipment.inward_eqp_id == ExternalDeviation.inward_eqp_id)\
            .join(Inward, Inward.inward_id == InwardEquipment.inward_id)\
            .options(joinedload(ExternalDeviation.attachments))\
            .filter(ExternalDeviation.id == ext_id)\
            .first()
        
        if not row: return None
        d, eq, inward = row
        return _external_row_to_detail_out(db, d, eq, inward)

    row = db.query(Deviation, InwardEquipment, Inward).join(InwardEquipment, InwardEquipment.inward_eqp_id == Deviation.inward_eqp_id).join(Inward, Inward.inward_id == InwardEquipment.inward_id).filter(Deviation.id == deviation_id).first()
    if not row: return None
    d, eq, inward = row
    primary_rep = _get_primary_oot_step(db, d.job_id)
    oot_steps = _get_oot_steps_for_job(db, d.job_id)
    atts = db.query(DeviationAttachment).filter(DeviationAttachment.deviation_id == deviation_id).order_by(DeviationAttachment.created_at.desc()).all()
    
    return DeviationDetailOut(
        deviation_id=d.id, inward_id=inward.inward_id, inward_eqp_id=d.inward_eqp_id,
        srf_no=inward.srf_no, customer_dc_no=inward.customer_dc_no, customer_dc_date=inward.customer_dc_date,
        customer_details=inward.customer_details, nepl_id=eq.nepl_id, make=eq.make, model=eq.model, serial_no=eq.serial_no,
        job_id=d.job_id, deviation_type=_derive_deviation_type(d), status=d.status or "OPEN",
        calibration_status=d.calibration_status or "not calibrated", engineer_remarks=d.engineer_remarks,
        customer_decision=d.customer_decision, report=d.report, created_at=d.created_at, updated_at=d.updated_at,
        oot_steps=[{"step_percent": float(s.step_percent), "deviation_percent": float(s.deviation_percent)} for s in oot_steps if s.step_percent is not None],
        attachments=[DeviationAttachmentOut.model_validate(a) for a in atts]
    )

# ====================================================================
# START MODIFIED FUNCTION: get_deviation_detail_for_customer
# ====================================================================
def get_deviation_detail_for_customer(
    db: Session, deviation_id: int, customer_id: int
) -> Optional[DeviationDetailOut]:
    """
    Handles fetching details for both internal (positive ID) and external (negative ID) deviations
    for a specific customer, ensuring data access is authorized.
    """
    _sync_legacy_deviation_statuses(db)

    # --- Handle negative IDs for ExternalDeviations ---
    if deviation_id < 0:
        ext_id = abs(deviation_id)
        # Query ExternalDeviation, ensuring it belongs to the customer
        row = (
            db.query(ExternalDeviation, InwardEquipment, Inward)
            .join(InwardEquipment, InwardEquipment.inward_eqp_id == ExternalDeviation.inward_eqp_id)
            .join(Inward, Inward.inward_id == InwardEquipment.inward_id)
            .options(joinedload(ExternalDeviation.attachments)) # Eager load attachments
            .filter(
                ExternalDeviation.id == ext_id,
                Inward.customer_id == customer_id # Security check
            )
            .first()
        )
        if not row:
            return None
        d, eq, inward = row
        # Use the existing helper to format the response for the customer
        return _external_row_to_detail_out(db, d, eq, inward)

    # --- Handle positive IDs for internal deviations (existing logic) ---
    row = (
        db.query(Deviation, InwardEquipment, Inward)
        .join(InwardEquipment, InwardEquipment.inward_eqp_id == Deviation.inward_eqp_id)
        .join(Inward, Inward.inward_id == InwardEquipment.inward_id)
        .filter(Deviation.id == deviation_id, Inward.customer_id == customer_id)
        .first()
    )
    if not row:
        return None

    d, eq, inward = row
    if sync_deviation_calibration_status(db, d):
        db.commit()
        db.refresh(d)

    primary_rep = _get_primary_oot_step(db, d.job_id)
    oot_steps = _get_oot_steps_for_job(db, d.job_id)
    atts = (
        db.query(DeviationAttachment)
        .filter(DeviationAttachment.deviation_id == deviation_id)
        .order_by(DeviationAttachment.created_at.desc())
        .all()
    )
    
    return DeviationDetailOut(
        deviation_id=d.id,
        inward_id=inward.inward_id if inward else None,
        inward_eqp_id=d.inward_eqp_id,
        srf_no=inward.srf_no if inward else None,
        customer_dc_no=inward.customer_dc_no if inward else None,
        customer_dc_date=str(inward.customer_dc_date) if inward else None,
        customer_details=inward.customer_details if inward else None,
        nepl_id=eq.nepl_id if eq else None,
        make=eq.make if eq else None,
        model=eq.model if eq else None,
        serial_no=eq.serial_no if eq else None,
        job_id=d.job_id,
        repeatability_id=None,
        step_percent=float(primary_rep.step_percent) if primary_rep and primary_rep.step_percent is not None else None,
        set_torque=float(primary_rep.set_torque_ts) if primary_rep and primary_rep.set_torque_ts is not None else None,
        corrected_mean=float(primary_rep.corrected_mean) if primary_rep and primary_rep.corrected_mean is not None else None,
        deviation_percent=float(primary_rep.deviation_percent)
        if primary_rep and primary_rep.deviation_percent is not None
        else None,
        deviation_type=_derive_deviation_type(d),
        certificate_id=d.certificate_id,
        status=d.status or "OPEN",
        calibration_status=d.calibration_status or "not calibrated",
        engineer_remarks=d.engineer_remarks,
        customer_decision=d.customer_decision,
        report=d.report or (d.created_at.date() if d.created_at else None),
        created_at=d.created_at,
        updated_at=d.updated_at,
        oot_steps=[
            {
                "step_percent": float(step.step_percent) if step.step_percent is not None else None,
                "set_torque": float(step.set_torque_ts) if step.set_torque_ts is not None else None,
                "corrected_mean": float(step.corrected_mean) if step.corrected_mean is not None else None,
                "deviation_percent": float(step.deviation_percent) if step.deviation_percent is not None else None,
            }
            for step in oot_steps
        ],
        attachments=[DeviationAttachmentOut.model_validate(a) for a in atts],
    )
# ====================================================================
# END MODIFIED FUNCTION
# ====================================================================

def update_engineer_remarks(
    db: Session, deviation_id: int, remarks: str
) -> Optional[DeviationDetailOut]:
    d = db.query(Deviation).filter(Deviation.id == deviation_id).first()
    if not d:
        return None

    stripped = remarks.strip()
    d.engineer_remarks = stripped if stripped else None
    sync_deviation_calibration_status(db, d)
    d.updated_at = datetime.now(timezone.utc)
    db.commit()

    return get_deviation_detail_for_staff(db, deviation_id)


def close_deviation(db: Session, deviation_id: int) -> Optional[DeviationDetailOut]:
    d = db.query(Deviation).filter(Deviation.id == deviation_id).first()
    if not d:
        return None

    d.status = "CLOSED"
    sync_job_status_from_deviation(db, d)
    sync_deviation_calibration_status(db, d)
    d.updated_at = datetime.now(timezone.utc)
    db.commit()

    return get_deviation_detail_for_staff(db, deviation_id)


def terminate_deviation_job(db: Session, deviation_id: int) -> Optional[DeviationDetailOut]:
    d = db.query(Deviation).filter(Deviation.id == deviation_id).first()
    if not d:
        return None

    d.status = "CLOSED"
    sync_job_status_from_deviation(db, d, terminate=True)
    sync_deviation_calibration_status(db, d)
    d.updated_at = datetime.now(timezone.utc)
    db.commit()

    return get_deviation_detail_for_staff(db, deviation_id)
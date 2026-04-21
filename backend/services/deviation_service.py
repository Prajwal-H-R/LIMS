from datetime import datetime, timezone
from pathlib import Path
import uuid
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from backend.models.deviation import Deviation
from backend.models.deviation_attachments import DeviationAttachment
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


def _derive_deviation_type(d: Deviation) -> str:
    return "OOT" if d.repeatability_id is not None else "MANUAL"


def _derive_calibration_status(job_status: Optional[str], deviation_type: str) -> str:
    s = (job_status or "").strip().lower()
    if any(k in s for k in ("calibrated", "complete", "completed", "closed", "done")):
        return "calibrated"
    if deviation_type == "MANUAL" and ("progress" in s):
        return "not calibrated"
    return "not calibrated"


def _get_job_for_deviation(db: Session, d: Deviation) -> Optional[HTWJob]:
    if d.repeatability_id is not None:
        rep = db.query(HTWRepeatability).filter(HTWRepeatability.id == d.repeatability_id).first()
        if rep:
            return db.query(HTWJob).filter(HTWJob.job_id == rep.job_id).first()
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
        # Restore the expected workflow stage after all active deviations are closed.
        # OOT deviations generally map to completed/calibrated jobs, while manual deviations
        # raised during worksheet progress should resume as in-progress.
        deviation_type = _derive_deviation_type(d)
        job.job_status = "Calibrated" if deviation_type == "OOT" else "In Progress"


def _sync_legacy_deviation_statuses(db: Session) -> None:
    """
    Backfill old records to current workflow.

    Rules applied:
    - Empty status defaults to OPEN.
    - OPEN + customer decision becomes IN_PROGRESS (unless already CLOSED).
    - calibration_status is recomputed from current job state and deviation type.
    - Job status is recomputed per equipment:
      any OPEN/IN_PROGRESS deviation => On Hold,
      otherwise release On Hold back to In Progress (MANUAL) or Calibrated (OOT).
    """
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


def _collapse_manual_items(items: List[CustomerDeviationItem]) -> List[CustomerDeviationItem]:
    """
    Keep a single MANUAL deviation row per equipment for listing UIs.
    Preference:
    1) Active manual rows (OPEN/IN_PROGRESS) over CLOSED rows.
    2) Newer rows over older rows.
    """
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

        if (
            item_ts == current_ts
            and (item.deviation_id or 0) > (current.deviation_id or 0)
        ):
            by_eqp[key] = item

    return sorted(
        by_eqp.values(),
        key=lambda x: (x.created_at or datetime.min.replace(tzinfo=timezone.utc)),
        reverse=True,
    )


def list_deviations_for_customer(db: Session, customer_id: int) -> List[CustomerDeviationItem]:
    _sync_legacy_deviation_statuses(db)
    rows = (
        db.query(
            Deviation,
            InwardEquipment,
            Inward.srf_no,
            Inward.customer_dc_no,
            Inward.customer_dc_date,
            Inward.inward_id,
            HTWRepeatability,
            HTWJob.job_id,
        )
        .join(InwardEquipment, InwardEquipment.inward_eqp_id == Deviation.inward_eqp_id)
        .join(Inward, Inward.inward_id == InwardEquipment.inward_id)
        .outerjoin(HTWRepeatability, HTWRepeatability.id == Deviation.repeatability_id)
        .outerjoin(HTWJob, HTWJob.job_id == HTWRepeatability.job_id)
        .filter(Inward.customer_id == customer_id)
        .order_by(Deviation.created_at.desc())
        .all()
    )
    changed = False
    for d, *_ in rows:
        if sync_deviation_calibration_status(db, d):
            changed = True
    if changed:
        db.commit()

    all_items = [
        _row_to_customer_item(d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id, rep, job_id)
        for d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id, rep, job_id in rows
    ]
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
    rows = (
        db.query(
            Deviation,
            InwardEquipment,
            Inward.srf_no,
            Inward.customer_dc_no,
            Inward.customer_dc_date,
            Inward.inward_id,
        )
        .join(InwardEquipment, InwardEquipment.inward_eqp_id == Deviation.inward_eqp_id)
        .join(Inward, Inward.inward_id == InwardEquipment.inward_id)
        .filter(Deviation.repeatability_id.is_(None))
        .order_by(Deviation.created_at.desc())
        .all()
    )
    changed = False
    for d, *_ in rows:
        if sync_deviation_calibration_status(db, d):
            changed = True
    if changed:
        db.commit()

    items: List[CustomerDeviationItem] = []
    for d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id in rows:
        job = _get_job_for_deviation(db, d)
        items.append(
            _row_to_customer_item(
                d=d,
                eq=eq,
                srf_no=srf_no,
                customer_dc_no=customer_dc_no,
                customer_dc_date=customer_dc_date,
                inward_id=inward_id,
                rep=None,
                job_id=job.job_id if job else None,
            )
        )
    return _collapse_manual_items(items)


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


def update_customer_decision(
    db: Session, deviation_id: int, customer_id: int, decision: str
) -> Optional[CustomerDeviationItem]:
    row = (
        db.query(
            Deviation,
            InwardEquipment,
            Inward.srf_no,
            Inward.customer_dc_no,
            Inward.customer_dc_date,
            Inward.inward_id,
            HTWRepeatability,
            HTWJob.job_id,
        )
        .join(InwardEquipment, InwardEquipment.inward_eqp_id == Deviation.inward_eqp_id)
        .join(Inward, Inward.inward_id == InwardEquipment.inward_id)
        .outerjoin(HTWRepeatability, HTWRepeatability.id == Deviation.repeatability_id)
        .outerjoin(HTWJob, HTWJob.job_id == HTWRepeatability.job_id)
        .filter(Deviation.id == deviation_id, Inward.customer_id == customer_id)
        .first()
    )
    if not row:
        return None

    d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id, rep, job_id = row
    stripped = decision.strip()
    d.customer_decision = stripped if stripped else None
    if stripped and (d.status or "").upper() != "CLOSED":
        d.status = "IN_PROGRESS"
    sync_job_status_from_deviation(db, d)
    sync_deviation_calibration_status(db, d)
    d.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(d)
    return _row_to_customer_item(d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id, rep, job_id)


def get_deviation_detail_for_staff(db: Session, deviation_id: int) -> Optional[DeviationDetailOut]:
    _sync_legacy_deviation_statuses(db)
    row = (
        db.query(
            Deviation,
            InwardEquipment,
            Inward,
            HTWRepeatability,
            HTWJob.job_id,
        )
        .join(InwardEquipment, InwardEquipment.inward_eqp_id == Deviation.inward_eqp_id)
        .join(Inward, Inward.inward_id == InwardEquipment.inward_id)
        .outerjoin(HTWRepeatability, HTWRepeatability.id == Deviation.repeatability_id)
        .outerjoin(HTWJob, HTWJob.job_id == HTWRepeatability.job_id)
        .filter(Deviation.id == deviation_id)
        .first()
    )
    if not row:
        return None
    d, eq, inward, rep, job_id = row
    if sync_deviation_calibration_status(db, d):
        db.commit()
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
        customer_dc_date=inward.customer_dc_date if inward else None,
        customer_details=inward.customer_details if inward else None,
        nepl_id=eq.nepl_id if eq else None,
        make=eq.make if eq else None,
        model=eq.model if eq else None,
        serial_no=eq.serial_no if eq else None,
        job_id=job_id,
        repeatability_id=d.repeatability_id,
        step_percent=float(rep.step_percent) if rep and rep.step_percent is not None else None,
        set_torque=float(rep.set_torque_ts) if rep and rep.set_torque_ts is not None else None,
        corrected_mean=float(rep.corrected_mean) if rep and rep.corrected_mean is not None else None,
        deviation_percent=float(rep.deviation_percent)
        if rep and rep.deviation_percent is not None
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
        attachments=[DeviationAttachmentOut.model_validate(a) for a in atts],
    )


def get_deviation_detail_for_customer(
    db: Session, deviation_id: int, customer_id: int
) -> Optional[DeviationDetailOut]:
    _sync_legacy_deviation_statuses(db)
    row = (
        db.query(
            Deviation,
            InwardEquipment,
            Inward,
            HTWRepeatability,
            HTWJob.job_id,
        )
        .join(InwardEquipment, InwardEquipment.inward_eqp_id == Deviation.inward_eqp_id)
        .join(Inward, Inward.inward_id == InwardEquipment.inward_id)
        .outerjoin(HTWRepeatability, HTWRepeatability.id == Deviation.repeatability_id)
        .outerjoin(HTWJob, HTWJob.job_id == HTWRepeatability.job_id)
        .filter(Deviation.id == deviation_id, Inward.customer_id == customer_id)
        .first()
    )
    if not row:
        return None

    d, eq, inward, rep, job_id = row
    if sync_deviation_calibration_status(db, d):
        db.commit()
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
        customer_dc_date=inward.customer_dc_date if inward else None,
        customer_details=inward.customer_details if inward else None,
        nepl_id=eq.nepl_id if eq else None,
        make=eq.make if eq else None,
        model=eq.model if eq else None,
        serial_no=eq.serial_no if eq else None,
        job_id=job_id,
        repeatability_id=d.repeatability_id,
        step_percent=float(rep.step_percent) if rep and rep.step_percent is not None else None,
        set_torque=float(rep.set_torque_ts) if rep and rep.set_torque_ts is not None else None,
        corrected_mean=float(rep.corrected_mean) if rep and rep.corrected_mean is not None else None,
        deviation_percent=float(rep.deviation_percent)
        if rep and rep.deviation_percent is not None
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
        attachments=[DeviationAttachmentOut.model_validate(a) for a in atts],
    )


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

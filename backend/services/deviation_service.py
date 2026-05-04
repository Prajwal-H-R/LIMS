# backend/services/deviation_service.py

import logging
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

# >>>>> KEY CHANGE: The problematic import is REMOVED. <<<<<
# from backend.services.htw.htw_repeatability_services import sync_oot_deviation_records

from backend.schemas.deviation_schemas import (
    CustomerDeviationItem,
    DeviationAttachmentOut,
    DeviationDetailOut,
    ManualDeviationCreate,
)

# Logging Setup
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - [%(funcName)s:%(lineno)d] - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

BACKEND_BASE_DIR = Path(__file__).resolve().parents[1]
DEVIATION_UPLOAD_DIR = BACKEND_BASE_DIR / "uploads" / "deviations"
DEVIATION_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

def safe_bytes_encoder(obj: bytes):
    try: return obj.decode("utf-8")
    except UnicodeDecodeError: return f"<{len(obj)} bytes binary data>"

fastapi.encoders.ENCODERS_BY_TYPE[bytes] = safe_bytes_encoder

def _derive_deviation_type(d: Deviation) -> str:
    if d.job_id is not None and d.created_by is None: return "OOT"
    return "MANUAL"

def _derive_calibration_status(job_status: Optional[str], deviation_type: str) -> str:
    return "calibrated" if deviation_type == "OOT" else "not calibrated"

def _get_job_for_deviation(db: Session, d: Deviation) -> Optional[HTWJob]:
    if d.job_id is not None: return db.query(HTWJob).filter(HTWJob.job_id == d.job_id).first()
    return db.query(HTWJob).filter(HTWJob.inward_eqp_id == d.inward_eqp_id).order_by(HTWJob.job_id.desc()).first()

def sync_deviation_calibration_status(db: Session, d: Deviation) -> bool:
    job = _get_job_for_deviation(db, d)
    desired = _derive_calibration_status(job.job_status if job else None, _derive_deviation_type(d))
    if (d.calibration_status or "").strip().lower() != desired:
        d.calibration_status = desired; d.updated_at = datetime.now(timezone.utc); return True
    return False

def sync_job_status_from_deviation(db: Session, d: Deviation, terminate: bool = False) -> None:
    logging.debug(f"Entering for deviation_id={d.id}, inward_eqp_id={d.inward_eqp_id}, terminate={terminate}")
    job = _get_job_for_deviation(db, d)
    if not job: logging.warning(f"No associated job found for deviation_id={d.id}. Aborting status sync."); return
    logging.debug(f"Found job_id={job.job_id}. Current job_status BEFORE check is: '{job.job_status}'")
    FINAL_JOB_STATUSES = ["Completed", "Certificate Issued", "Shipped", "Terminated", "Calibrated", "Completed - OOT"]
    current_job_status = (job.job_status or "").strip()
    is_job_final = any(status.lower() == current_job_status.lower() for status in FINAL_JOB_STATUSES)
    logging.debug(f"Guard clause check: is_job_final = {is_job_final}")
    if not terminate and is_job_final:
        logging.info(f"Guard clause ACTIVATED. Job {job.job_id} is in a final state ('{current_job_status}'). No status change will be made."); return
    else: logging.debug("Guard clause PASSED. Proceeding with status evaluation.")
    if terminate: logging.warning(f"Termination requested. Setting job {job.job_id} status to 'Terminated'."); job.job_status = "Terminated"; return
    active_count = db.query(Deviation).filter(Deviation.inward_eqp_id == d.inward_eqp_id, Deviation.status.in_(["OPEN", "IN_PROGRESS"]),).count()
    logging.debug(f"Found {active_count} active deviations for inward_eqp_id={d.inward_eqp_id}.")
    if active_count > 0:
        if current_job_status.lower() != "on hold": logging.info(f"Changing job {job.job_id} status from '{current_job_status}' to 'On Hold'."); job.job_status = "On Hold"
    elif current_job_status.lower() == "on hold":
        new_status = "Calibrated" if _derive_deviation_type(d) == "OOT" else "In Progress"
        logging.info(f"Last active deviation closed. Changing job {job.job_id} status from 'On Hold' to '{new_status}'."); job.job_status = new_status

def _sync_legacy_deviation_statuses(db: Session) -> None:
    logging.debug("Entering _sync_legacy_deviation_statuses (SAFE VERSION).")
    rows = db.query(Deviation).all()
    changed = False
    for d in rows:
        status_raw = (d.status or "").strip(); status = status_raw.upper(); decision = (d.customer_decision or "").strip()
        if not status: d.status = "OPEN"; status = "OPEN"; changed = True
        if decision and status == "OPEN": d.status = "IN_PROGRESS"; status = "IN_PROGRESS"; d.updated_at = datetime.now(timezone.utc); changed = True
        
        # >>> CHANGE: Populate the 'report' date from 'created_at' if it is NULL.
        if d.report is None and d.created_at:
            d.report = d.created_at.date()
            changed = True
        
        if sync_deviation_calibration_status(db, d): changed = True
    if changed: logging.info("[Legacy Sync] Committed changes to DEVIATION records only."); db.commit()

def _row_to_customer_item(
    d: Deviation, eq: InwardEquipment, srf_no: Optional[str], customer_dc_no: Optional[str], customer_dc_date: Optional[str],
    inward_id: int, rep: Optional[HTWRepeatability], job_id: Optional[int],
) -> CustomerDeviationItem:
    return CustomerDeviationItem(
        deviation_id=d.id, inward_id=inward_id, inward_eqp_id=d.inward_eqp_id, srf_no=srf_no,
        customer_dc_no=customer_dc_no, customer_dc_date=customer_dc_date, nepl_id=eq.nepl_id,
        make=eq.make, model=eq.model, serial_no=eq.serial_no, job_id=job_id,
        step_percent=float(rep.step_percent) if rep and rep.step_percent is not None else None,
        deviation_percent=float(rep.deviation_percent) if rep and rep.deviation_percent is not None else None,
        deviation_type=_derive_deviation_type(d), status=d.status or "OPEN",
        calibration_status=d.calibration_status or "not calibrated", engineer_remarks=d.engineer_remarks,
        customer_decision=d.customer_decision, report=d.report or (d.created_at.date() if d.created_at else None),
        created_at=d.created_at,
    )

def _external_row_to_customer_item(
    d: ExternalDeviation, eq: InwardEquipment, srf_no: Optional[str], customer_dc_no: Optional[str], customer_dc_date: Optional[str],
    inward_id: int,
) -> CustomerDeviationItem:
    deviation_type = "MANUAL" if d.deviation_type == "NC" else "OOT"
    status = "IN_PROGRESS" if d.customer_decision else "OPEN"
    calibration_status = "calibrated" if deviation_type == "OOT" else "not calibrated"
    step_data = d.step_per_deviation or {}
    step_percent = step_data.get("step_percent"); deviation_percent = step_data.get("deviation_percent")
    return CustomerDeviationItem(
        deviation_id=-d.id, inward_id=inward_id, inward_eqp_id=d.inward_eqp_id, srf_no=srf_no,
        customer_dc_no=customer_dc_no, customer_dc_date=customer_dc_date, nepl_id=eq.nepl_id,
        make=eq.make, model=eq.model, serial_no=eq.serial_no, job_id=None,
        step_percent=float(step_percent) if step_percent is not None else None,
        deviation_percent=float(deviation_percent) if deviation_percent is not None else None,
        deviation_type=deviation_type, status=status, tool_status=d.tool_status,
        calibration_status=calibration_status, engineer_remarks=d.engineer_remarks,
        customer_decision=d.customer_decision, report=d.report or (d.created_at.date() if d.created_at else None),
        created_at=d.created_at,
    )

def _get_primary_oot_step(db: Session, job_id: Optional[int]) -> Optional[HTWRepeatability]:
    if job_id is None: return None
    return db.query(HTWRepeatability).filter(HTWRepeatability.job_id == job_id, HTWRepeatability.deviation_percent.isnot(None)).order_by(func.abs(HTWRepeatability.deviation_percent).desc()).first()

def _get_oot_steps_for_job(db: Session, job_id: Optional[int]) -> List[HTWRepeatability]:
    if job_id is None: return []
    return db.query(HTWRepeatability).filter(HTWRepeatability.job_id == job_id, HTWRepeatability.deviation_percent.isnot(None)).order_by(HTWRepeatability.step_percent.asc().nullslast()).all()

def _collapse_manual_items(items: List[CustomerDeviationItem]) -> List[CustomerDeviationItem]:
    by_eqp: Dict[int, CustomerDeviationItem] = {}
    for item in items:
        key = item.inward_eqp_id; current = by_eqp.get(key)
        if current is None: by_eqp[key] = item; continue
        item_active = (item.status or "").strip().upper() in ("OPEN", "IN_PROGRESS")
        current_active = (current.status or "").strip().upper() in ("OPEN", "IN_PROGRESS")
        if item_active != current_active:
            if item_active: by_eqp[key] = item
            continue
        item_ts = item.created_at; current_ts = current.created_at
        if item_ts and (current_ts is None or item_ts > current_ts): by_eqp[key] = item; continue
        item_id = abs(item.deviation_id or 0); current_id = abs(current.deviation_id or 0)
        item_is_external = (item.deviation_id or 0) < 0; current_is_external = (current.deviation_id or 0) < 0
        if item_ts == current_ts:
            if item_is_external == current_is_external:
                if item_id > current_id: by_eqp[key] = item
            elif not item_is_external: by_eqp[key] = item
    return sorted(by_eqp.values(), key=lambda x: (x.created_at or datetime.min.replace(tzinfo=timezone.utc)), reverse=True)

def list_all_deviations_for_staff(db: Session) -> List[CustomerDeviationItem]:
    # sync_oot_deviation_records(db) # <<< REMOVED
    _sync_legacy_deviation_statuses(db)
    all_items: List[CustomerDeviationItem] = []
    rows = db.query(Deviation, InwardEquipment, Inward.srf_no, Inward.customer_dc_no, Inward.customer_dc_date, Inward.inward_id,).join(InwardEquipment, InwardEquipment.inward_eqp_id == Deviation.inward_eqp_id).join(Inward, Inward.inward_id == InwardEquipment.inward_id).all()
    changed = False
    for d, *_ in rows:
        if sync_deviation_calibration_status(db, d): changed = True
    if changed:
        db.commit()
        rows = db.query(Deviation, InwardEquipment, Inward.srf_no, Inward.customer_dc_no, Inward.customer_dc_date, Inward.inward_id,).join(InwardEquipment, InwardEquipment.inward_eqp_id == Deviation.inward_eqp_id).join(Inward, Inward.inward_id == InwardEquipment.inward_id).all()
    for d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id in rows:
        primary_rep = _get_primary_oot_step(db, d.job_id)
        all_items.append(_row_to_customer_item(d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id, primary_rep, d.job_id))
    external_rows = db.query(ExternalDeviation, InwardEquipment, Inward.srf_no, Inward.customer_dc_no, Inward.customer_dc_date, Inward.inward_id,).join(InwardEquipment, InwardEquipment.inward_eqp_id == ExternalDeviation.inward_eqp_id).join(Inward, Inward.inward_id == InwardEquipment.inward_id).all()
    for d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id in external_rows:
        all_items.append(_external_row_to_customer_item(d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id))
    manual_items = [i for i in all_items if (i.deviation_type or "").upper() == "MANUAL"]
    non_manual_items = [i for i in all_items if (i.deviation_type or "").upper() != "MANUAL"]
    collapsed_manual = _collapse_manual_items(manual_items)
    merged = non_manual_items + collapsed_manual
    return sorted(merged, key=lambda x: (x.created_at or datetime.min.replace(tzinfo=timezone.utc)), reverse=True)

def list_deviations_for_customer(db: Session, customer_id: int) -> List[CustomerDeviationItem]:
    # sync_oot_deviation_records(db) # <<< REMOVED
    _sync_legacy_deviation_statuses(db)
    all_items: List[CustomerDeviationItem] = []
    rows = db.query(Deviation, InwardEquipment, Inward.srf_no, Inward.customer_dc_no, Inward.customer_dc_date, Inward.inward_id,).join(InwardEquipment, InwardEquipment.inward_eqp_id == Deviation.inward_eqp_id).join(Inward, Inward.inward_id == InwardEquipment.inward_id).filter(Inward.customer_id == customer_id).all()
    changed = False
    for d, *_ in rows:
        if sync_deviation_calibration_status(db, d): changed = True
    if changed:
        db.commit(); db.refresh(d)
    for d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id in rows:
        primary_rep = _get_primary_oot_step(db, d.job_id)
        all_items.append(_row_to_customer_item(d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id, primary_rep, d.job_id))
    external_rows = db.query(ExternalDeviation, InwardEquipment, Inward.srf_no, Inward.customer_dc_no, Inward.customer_dc_date, Inward.inward_id,).join(InwardEquipment, InwardEquipment.inward_eqp_id == ExternalDeviation.inward_eqp_id).join(Inward, Inward.inward_id == InwardEquipment.inward_id).filter(Inward.customer_id == customer_id).all()
    for d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id in external_rows:
        all_items.append(_external_row_to_customer_item(d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id))
    manual_items = [i for i in all_items if (i.deviation_type or "").upper() == "MANUAL"]
    non_manual_items = [i for i in all_items if (i.deviation_type or "").upper() != "MANUAL"]
    collapsed_manual = _collapse_manual_items(manual_items)
    merged = non_manual_items + collapsed_manual
    return sorted(merged, key=lambda x: (x.created_at or datetime.min.replace(tzinfo=timezone.utc)), reverse=True)

def list_manual_deviations_for_staff(db: Session) -> List[CustomerDeviationItem]:
    _sync_legacy_deviation_statuses(db)
    manual_items: List[CustomerDeviationItem] = []
    rows = db.query(Deviation, InwardEquipment, Inward.srf_no, Inward.customer_dc_no, Inward.customer_dc_date, Inward.inward_id,).join(InwardEquipment, InwardEquipment.inward_eqp_id == Deviation.inward_eqp_id).join(Inward, Inward.inward_id == InwardEquipment.inward_id).order_by(Deviation.created_at.desc()).all()
    changed = False
    for d, *_ in rows:
        if sync_deviation_calibration_status(db, d): changed = True
    if changed:
        db.commit(); db.refresh(d)
    for d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id in rows:
        if _derive_deviation_type(d) != "MANUAL": continue
        job = _get_job_for_deviation(db, d)
        manual_items.append(_row_to_customer_item(d=d, eq=eq, srf_no=srf_no, customer_dc_no=customer_dc_no, customer_dc_date=customer_dc_date, inward_id=inward_id, rep=None, job_id=job.job_id if job else None,))
    external_rows = db.query(ExternalDeviation, InwardEquipment, Inward.srf_no, Inward.customer_dc_no, Inward.customer_dc_date, Inward.inward_id,).join(InwardEquipment, InwardEquipment.inward_eqp_id == ExternalDeviation.inward_eqp_id).join(Inward, Inward.inward_id == InwardEquipment.inward_id).filter(ExternalDeviation.deviation_type == "NC").order_by(ExternalDeviation.created_at.desc()).all()
    for d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id in external_rows:
        manual_items.append(_external_row_to_customer_item(d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id))
    return _collapse_manual_items(manual_items)

def create_manual_deviation(db: Session, payload: ManualDeviationCreate, created_by: Optional[int]) -> Optional[DeviationDetailOut]:
    logging.info(f"Attempting to create manual deviation for inward_eqp_id={payload.inward_eqp_id} by user={created_by}")
    eq = db.query(InwardEquipment).filter(InwardEquipment.inward_eqp_id == payload.inward_eqp_id, InwardEquipment.inward_id == payload.inward_id,).first()
    if not eq:
        logging.error(f"Failed to create manual deviation: InwardEquipment {payload.inward_eqp_id} not found."); return None
    d = Deviation(inward_eqp_id=payload.inward_eqp_id, job_id=payload.job_id, created_by=created_by, status="OPEN", calibration_status="not calibrated", engineer_remarks=payload.engineer_remarks.strip(),)
    db.add(d); db.flush()
    
    # >>> CHANGE: Set the report date to the creation date upon creation.
    d.report = d.created_at.date()
    
    logging.debug(f"New deviation created with id={d.id}. Now calling sync_job_status_from_deviation.")
    sync_job_status_from_deviation(db, d)
    db.commit()
    logging.info(f"Successfully created manual deviation id={d.id} and committed changes.")
    return get_deviation_detail_for_staff(db, d.id)

def add_deviation_attachments(db: Session, deviation_id: int, files: List[tuple[str, Optional[str], bytes]], uploaded_by: Optional[int],) -> Optional[DeviationDetailOut]:
    d = db.query(Deviation).filter(Deviation.id == deviation_id).first()
    if not d: return None
    for original_name, mime_type, content in files:
        suffix = Path(original_name).suffix if original_name else ""
        safe_name = f"{uuid.uuid4().hex}{suffix}"
        file_path = DEVIATION_UPLOAD_DIR / safe_name
        with open(file_path, "wb") as out: out.write(content)
        file_url = f"/api/uploads/deviations/{safe_name}"
        db.add(DeviationAttachment(deviation_id=deviation_id, file_name=original_name or safe_name, file_type=mime_type, file_url=file_url, uploaded_by=uploaded_by,))
    d.updated_at = datetime.now(timezone.utc); db.commit()
    return get_deviation_detail_for_staff(db, deviation_id)

def _map_attachment_metadata(att) -> DeviationAttachmentOut:
    return DeviationAttachmentOut(id=att.id, file_name=str(att.file_name), file_type=str(att.file_type) if att.file_type else None, file_url=str(att.file_url), created_at=att.created_at)

def update_customer_decision(db: Session, deviation_id: int, customer_id: int, decision: str) -> Optional[CustomerDeviationItem]:
    if deviation_id < 0:
        ext_id = abs(deviation_id)
        row = db.query(ExternalDeviation, InwardEquipment, Inward).join(InwardEquipment, InwardEquipment.inward_eqp_id == ExternalDeviation.inward_eqp_id).join(Inward, Inward.inward_id == InwardEquipment.inward_id).filter(ExternalDeviation.id == ext_id, Inward.customer_id == customer_id).first()
        if not row: return None
        d, eq, inward = row
        stripped = decision.strip(); d.customer_decision = stripped if stripped else None; d.updated_at = datetime.now(timezone.utc)
        db.commit(); db.refresh(d)
        return _external_row_to_customer_item(d, eq, inward.srf_no, inward.customer_dc_no, str(inward.customer_dc_date), inward.inward_id)
    row = db.query(Deviation, InwardEquipment, Inward.srf_no, Inward.customer_dc_no, Inward.customer_dc_date, Inward.inward_id,).join(InwardEquipment, InwardEquipment.inward_eqp_id == Deviation.inward_eqp_id).join(Inward, Inward.inward_id == InwardEquipment.inward_id).filter(Deviation.id == deviation_id, Inward.customer_id == customer_id).first()
    if not row: return None
    d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id = row
    stripped = decision.strip(); d.customer_decision = stripped if stripped else None
    if stripped and (d.status or "").upper() != "CLOSED": d.status = "IN_PROGRESS"
    sync_job_status_from_deviation(db, d); sync_deviation_calibration_status(db, d); d.updated_at = datetime.now(timezone.utc)
    db.commit(); db.refresh(d)
    primary_rep = _get_primary_oot_step(db, d.job_id)
    return _row_to_customer_item(d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id, primary_rep, d.job_id)

def _external_row_to_detail_out(db: Session, d: ExternalDeviation, eq: InwardEquipment, inward: Inward) -> DeviationDetailOut:
    deviation_type = "MANUAL" if d.deviation_type == "NC" else "OOT"
    status = "OPEN"
    if d.tool_status and str(d.tool_status).strip().lower() in ["closed", "terminated"]: status = "CLOSED"
    elif d.customer_decision: status = "IN_PROGRESS"
    calibration_status = "calibrated" if deviation_type == "OOT" else "not calibrated"
    oot_steps = []
    if deviation_type == "OOT" and isinstance(d.step_per_deviation, dict):
        if "step_percent" in d.step_per_deviation: oot_steps.append(d.step_per_deviation)
        else:
            for k, v in d.step_per_deviation.items():
                try: oot_steps.append({"step_percent": float(k), "deviation_percent": float(v)})
                except (ValueError, TypeError): continue
        oot_steps.sort(key=lambda x: x.get("step_percent", 0))
    safe_attachments = [_map_attachment_metadata(a) for a in d.attachments]
    return DeviationDetailOut(
        deviation_id=-d.id, inward_id=inward.inward_id, inward_eqp_id=d.inward_eqp_id, srf_no=inward.srf_no,
        customer_dc_no=inward.customer_dc_no, customer_dc_date=str(inward.customer_dc_date) if inward.customer_dc_date else None,
        customer_details=inward.customer_details, nepl_id=eq.nepl_id, make=eq.make, model=eq.model, serial_no=eq.serial_no,
        job_id=None, deviation_type=deviation_type, status=status, tool_status=d.tool_status, calibration_status=calibration_status,
        engineer_remarks=d.engineer_remarks, customer_decision=d.customer_decision,
        # >>> CHANGE: Add fallback for report date.
        report=d.report or (d.created_at.date() if d.created_at else None),
        created_at=d.created_at, updated_at=d.updated_at, oot_steps=oot_steps, attachments=safe_attachments,
    )

def get_deviation_detail_for_staff(db: Session, deviation_id: int) -> Optional[DeviationDetailOut]:
    # sync_oot_deviation_records(db) # <<< REMOVED
    _sync_legacy_deviation_statuses(db)
    if deviation_id < 0:
        ext_id = abs(deviation_id)
        row = db.query(ExternalDeviation, InwardEquipment, Inward).join(InwardEquipment, InwardEquipment.inward_eqp_id == ExternalDeviation.inward_eqp_id).join(Inward, Inward.inward_id == InwardEquipment.inward_id).options(joinedload(ExternalDeviation.attachments)).filter(ExternalDeviation.id == ext_id).first()
        if not row: return None
        d, eq, inward = row; return _external_row_to_detail_out(db, d, eq, inward)
    row = db.query(Deviation, InwardEquipment, Inward).join(InwardEquipment, InwardEquipment.inward_eqp_id == Deviation.inward_eqp_id).join(Inward, Inward.inward_id == InwardEquipment.inward_id).filter(Deviation.id == deviation_id).first()
    if not row: return None
    d, eq, inward = row
    if sync_deviation_calibration_status(db, d): db.commit(); db.refresh(d)
    oot_steps = _get_oot_steps_for_job(db, d.job_id)
    atts = db.query(DeviationAttachment).filter(DeviationAttachment.deviation_id == deviation_id).order_by(DeviationAttachment.created_at.desc()).all()
    return DeviationDetailOut(
        deviation_id=d.id, inward_id=inward.inward_id, inward_eqp_id=d.inward_eqp_id, srf_no=inward.srf_no,
        customer_dc_no=inward.customer_dc_no, customer_dc_date=str(inward.customer_dc_date) if inward.customer_dc_date else None,
        customer_details=inward.customer_details, nepl_id=eq.nepl_id, make=eq.make, model=eq.model, serial_no=eq.serial_no,
        job_id=d.job_id, deviation_type=_derive_deviation_type(d), status=d.status or "OPEN",
        calibration_status=d.calibration_status or "not calibrated", engineer_remarks=d.engineer_remarks,
        customer_decision=d.customer_decision,
        # >>> CHANGE: Add fallback for report date.
        report=d.report or (d.created_at.date() if d.created_at else None),
        created_at=d.created_at, updated_at=d.updated_at,
        oot_steps=[{"step_percent": float(s.step_percent), "deviation_percent": float(s.deviation_percent)} for s in oot_steps if s.step_percent is not None],
        attachments=[DeviationAttachmentOut.model_validate(a) for a in atts])

def get_deviation_detail_for_customer(db: Session, deviation_id: int, customer_id: int) -> Optional[DeviationDetailOut]:
    # sync_oot_deviation_records(db) # <<< REMOVED
    _sync_legacy_deviation_statuses(db)
    if deviation_id < 0:
        ext_id = abs(deviation_id)
        row = db.query(ExternalDeviation, InwardEquipment, Inward).join(InwardEquipment, InwardEquipment.inward_eqp_id == ExternalDeviation.inward_eqp_id).join(Inward, Inward.inward_id == InwardEquipment.inward_id).options(joinedload(ExternalDeviation.attachments)).filter(ExternalDeviation.id == ext_id, Inward.customer_id == customer_id).first()
        if not row: return None
        d, eq, inward = row; return _external_row_to_detail_out(db, d, eq, inward)
    
    # >>> FIX: The function was incomplete. Completed it by mirroring the 'staff' version with a customer_id filter.
    row = db.query(Deviation, InwardEquipment, Inward).join(InwardEquipment, InwardEquipment.inward_eqp_id == Deviation.inward_eqp_id).join(Inward, Inward.inward_id == InwardEquipment.inward_id).filter(Deviation.id == deviation_id, Inward.customer_id == customer_id).first()
    if not row: return None
    d, eq, inward = row
    if sync_deviation_calibration_status(db, d): db.commit(); db.refresh(d)
    oot_steps = _get_oot_steps_for_job(db, d.job_id)
    atts = db.query(DeviationAttachment).filter(DeviationAttachment.deviation_id == deviation_id).order_by(DeviationAttachment.created_at.desc()).all()
    return DeviationDetailOut(
        deviation_id=d.id, inward_id=inward.inward_id, inward_eqp_id=d.inward_eqp_id, srf_no=inward.srf_no,
        customer_dc_no=inward.customer_dc_no, customer_dc_date=str(inward.customer_dc_date) if inward.customer_dc_date else None,
        customer_details=inward.customer_details, nepl_id=eq.nepl_id, make=eq.make, model=eq.model, serial_no=eq.serial_no,
        job_id=d.job_id, deviation_type=_derive_deviation_type(d), status=d.status or "OPEN",
        calibration_status=d.calibration_status or "not calibrated", engineer_remarks=d.engineer_remarks,
        customer_decision=d.customer_decision,
        # >>> CHANGE: Add fallback for report date.
        report=d.report or (d.created_at.date() if d.created_at else None),
        created_at=d.created_at, updated_at=d.updated_at,
        oot_steps=[{"step_percent": float(s.step_percent), "deviation_percent": float(s.deviation_percent)} for s in oot_steps if s.step_percent is not None],
        attachments=[DeviationAttachmentOut.model_validate(a) for a in atts])


def update_engineer_remarks(db: Session, deviation_id: int, remarks: str) -> Optional[DeviationDetailOut]:
    d = db.query(Deviation).filter(Deviation.id == deviation_id).first()
    if not d: return None
    d.engineer_remarks = remarks.strip() if remarks.strip() else None
    sync_deviation_calibration_status(db, d)
    d.updated_at = datetime.now(timezone.utc)
    db.commit()
    return get_deviation_detail_for_staff(db, deviation_id)


def close_deviation(db: Session, deviation_id: int) -> Optional[DeviationDetailOut]:
    d = db.query(Deviation).filter(Deviation.id == deviation_id).first()
    if not d: return None
    d.status = "CLOSED"
    sync_job_status_from_deviation(db, d)
    sync_deviation_calibration_status(db, d)
    d.updated_at = datetime.now(timezone.utc)
    db.commit()
    return get_deviation_detail_for_staff(db, deviation_id)


def terminate_deviation_job(db: Session, deviation_id: int) -> Optional[DeviationDetailOut]:
    d = db.query(Deviation).filter(Deviation.id == deviation_id).first()
    if not d: return None
    d.status = "CLOSED"
    sync_job_status_from_deviation(db, d, terminate=True)
    sync_deviation_calibration_status(db, d)
    d.updated_at = datetime.now(timezone.utc)
    db.commit()
    return get_deviation_detail_for_staff(db, deviation_id)


# REPORT COLUMN FILLING NULL STORE THE CREATED AT DATE ONLY TO THE REPORT COLUMN TO IDETIFY THE DEVIATION REPORT DATE
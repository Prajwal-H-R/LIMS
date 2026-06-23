# backend/services/deviation_service.py

import logging
from datetime import datetime, timezone
from pathlib import Path
import uuid
from typing import Dict, List, Optional
import fastapi.encoders
from sqlalchemy import func, or_, cast, String, select, union_all, literal, case
from fastapi import HTTPException
import traceback
from sqlalchemy.orm import Session, joinedload
from backend import models
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
    """
    STRICT CLASSIFICATION:
    - OOT: System-generated (has job_id AND created_by is NULL)
    - MANUAL: Human-generated (created_by is NOT NULL)
    """
    if d.job_id is not None and d.created_by is None:
        return "OOT"
    return "MANUAL"

def _derive_calibration_status(job_status: Optional[str], deviation_type: str) -> str:
    return "calibrated" if deviation_type == "OOT" else "not calibrated"

def _get_job_for_deviation(db: Session, d: Deviation) -> Optional[HTWJob]:
    """
    Finds the specific job for this deviation.
    If it's an OOT record, it MUST have a job_id or be the latest job.
    If it's MANUAL, we only link it to a job if job_id is explicitly set.
    """
    if d.job_id is not None:
        return db.query(HTWJob).filter(HTWJob.job_id == d.job_id).first()
    
    # Only fallback to 'latest job' for OOT types. 
    # Manual deviations shouldn't 'steal' job info unless linked.
    if _derive_deviation_type(d) == "OOT":
        return db.query(HTWJob).filter(HTWJob.inward_eqp_id == d.inward_eqp_id).order_by(HTWJob.job_id.desc()).first()
    
    return None

def sync_deviation_calibration_status(db: Session, d: Deviation) -> bool:
    """Updates status and ensures the 'report' date is filled from 'created_at'."""
    changed = False
    
    # 1. Fill the report date if missing (Critical for your requirement)
    if d.report is None and d.created_at:
        d.report = d.created_at.date()
        changed = True
    
    # 2. Ensure calibration status is correct based on type
    dev_type = _derive_deviation_type(d)
    desired = "calibrated" if dev_type == "OOT" else "not calibrated"
    
    if (d.calibration_status or "").lower() != desired:
        d.calibration_status = desired
        changed = True
            
    if changed:
        d.updated_at = datetime.now(timezone.utc)
    return changed

def sync_job_status_from_deviation(db: Session, d: Deviation, terminate: bool = False) -> None:
    # IMPORTANT: Flush the session so the DB query 'active_count' sees the current status change
    db.flush()
    
    job = _get_job_for_deviation(db, d)
    if not job: 
        logging.warning(f"No associated job found for deviation_id={d.id}. Aborting status sync.")
        return

    # Guard Clause: Don't change status if it's already in a final state
    FINAL_JOB_STATUSES = ["Completed", "Certificate Issued", "Shipped", "Terminated", "Calibrated", "Completed - OOT"]
    current_job_status = (job.job_status or "").strip()
    if not terminate and any(status.lower() == current_job_status.lower() for status in FINAL_JOB_STATUSES):
        return

    if terminate: 
        job.job_status = "Terminated"
        return

    # Check for other active deviations specifically for THIS job or general tool NCs
    active_count = db.query(Deviation).filter(
        Deviation.inward_eqp_id == d.inward_eqp_id,
        Deviation.status.in_(["OPEN", "IN_PROGRESS"]),
        # Only count deviations linked to this specific job or ones with no job_id (General NCs)
        or_(Deviation.job_id == job.job_id, Deviation.job_id.is_(None))
    ).count()

    logging.debug(f"Job {job.job_id} current status: '{current_job_status}', Active Deviations: {active_count}")

    if active_count > 0:
        if current_job_status.lower() != "on hold":
            job.job_status = "On Hold"
    else:
        # NO ACTIVE DEVIATIONS LEFT
        if current_job_status.lower() == "on hold":
            dev_type = _derive_deviation_type(d)
            
            # Logic: If it was a Manual NC, we go back to 'Created'
            # If it was an OOT, we go to 'Calibrated'
            if dev_type == "MANUAL":
                job.job_status = "Created"
            else:
                job.job_status = "Calibrated"
            
            logging.info(f"Setting Job {job.job_id} status to {job.job_status}")
def _sync_legacy_deviation_statuses(db: Session) -> None:
    """Synchronizes status, calibration status, and populates missing report dates."""
    
    # ⚡ LIGHTNING FAST FIX: Only fetch rows that actually have missing data!
    # This prevents the Full Table Scan of downloading thousands of perfectly fine records.
    rows = db.query(Deviation).filter(
        or_(
            Deviation.status == None,
            Deviation.status == "",
            Deviation.report == None,
            Deviation.calibration_status == None,
            Deviation.calibration_status == ""
        )
    ).all()
    
    # If no rows need fixing, exit instantly!
    if not rows:
        return

    changed_total = False
    for d in rows:
        row_changed = False
        status_raw = (d.status or "").strip().upper()
        decision = (d.customer_decision or "").strip()
        
        if not status_raw: 
            d.status = "OPEN"
            row_changed = True
        
        if decision and d.status == "OPEN": 
            d.status = "IN_PROGRESS"
            row_changed = True
        
        if sync_deviation_calibration_status(db, d): 
            row_changed = True
            
        if row_changed:
            d.updated_at = datetime.now(timezone.utc)
            changed_total = True
            
    if changed_total: 
        db.commit()

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
    """
    Only collapses MANUAL items per inward_eqp_id. 
    This ensures we only show the most relevant manual NC for a tool, 
    but OOT items (system driven) are handled outside this to prevent conflict.
    """
    by_eqp: Dict[int, CustomerDeviationItem] = {}
    for item in items:
        key = item.inward_eqp_id
        current = by_eqp.get(key)
        if current is None:
            by_eqp[key] = item
            continue
        
        # Priority 1: Show Active (OPEN/IN_PROGRESS) over CLOSED
        item_active = (item.status or "").strip().upper() in ("OPEN", "IN_PROGRESS")
        current_active = (current.status or "").strip().upper() in ("OPEN", "IN_PROGRESS")
        
        if item_active != current_active:
            if item_active: by_eqp[key] = item
            continue
            
        # Priority 2: Show Newer record
        item_ts = item.created_at or datetime.min.replace(tzinfo=timezone.utc)
        current_ts = current.created_at or datetime.min.replace(tzinfo=timezone.utc)
        if item_ts > current_ts:
            by_eqp[key] = item
            
    return sorted(by_eqp.values(), key=lambda x: (x.created_at or datetime.min.replace(tzinfo=timezone.utc)), reverse=True)

def list_all_deviations_for_staff(db: Session) -> List[CustomerDeviationItem]:
    _sync_legacy_deviation_statuses(db)
    
    # Fetch all internal records
    rows = db.query(Deviation, InwardEquipment, Inward.srf_no, Inward.customer_dc_no, Inward.customer_dc_date, Inward.inward_id).join(
        InwardEquipment, InwardEquipment.inward_eqp_id == Deviation.inward_eqp_id
    ).join(
        Inward, Inward.inward_id == InwardEquipment.inward_id
    ).all()
    
    manual_list: List[CustomerDeviationItem] = []
    oot_list: List[CustomerDeviationItem] = []
    
    for d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id in rows:
        primary_rep = _get_primary_oot_step(db, d.job_id)
        item = _row_to_customer_item(d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id, primary_rep, d.job_id)
        
        if item.deviation_type == "OOT":
            oot_list.append(item)
        else:
            manual_list.append(item)
            
    # Fetch External Records
    external_rows = db.query(ExternalDeviation, InwardEquipment, Inward.srf_no, Inward.customer_dc_no, Inward.customer_dc_date, Inward.inward_id).join(
        InwardEquipment, InwardEquipment.inward_eqp_id == ExternalDeviation.inward_eqp_id
    ).join(
        Inward, Inward.inward_id == InwardEquipment.inward_id
    ).all()
    
    for d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id in external_rows:
        item = _external_row_to_customer_item(d, eq, srf_no, customer_dc_no, customer_dc_date, inward_id)
        if item.deviation_type == "OOT":
            oot_list.append(item)
        else:
            manual_list.append(item)

    # Collapse ONLY manual items. System-driven OOT items are shown for every job/instance.
    collapsed_manual = _collapse_manual_items(manual_list)
    
    # Merge and sort by date
    merged = oot_list + collapsed_manual
    return sorted(merged, key=lambda x: (x.created_at or datetime.min.replace(tzinfo=timezone.utc)), reverse=True)

def list_deviations_for_customer(db: Session, customer_id: int) -> List[CustomerDeviationItem]:
    _sync_legacy_deviation_statuses(db)
    
    # 1. Fetch Internal Records
    rows = db.query(
        Deviation, InwardEquipment, Inward.srf_no, Inward.customer_dc_no, 
        Inward.customer_dc_date, Inward.inward_id
    ).join(
        InwardEquipment, InwardEquipment.inward_eqp_id == Deviation.inward_eqp_id
    ).join(
        Inward, Inward.inward_id == InwardEquipment.inward_id
    ).filter(Inward.customer_id == customer_id).all()

    manual_list: List[CustomerDeviationItem] = []
    oot_list: List[CustomerDeviationItem] = []

    for d, eq, srf_no, dc_no, dc_date, inward_id in rows:
        sync_deviation_calibration_status(db, d) # Ensures report date is filled
        dtype = _derive_deviation_type(d)
        
        if dtype == "OOT":
            # OOT VISIBILITY: Only show if flag is True
            if d.hide_customer_visibility is False:
                primary_rep = _get_primary_oot_step(db, d.job_id)
                oot_list.append(_row_to_customer_item(d, eq, srf_no, dc_no, dc_date, inward_id, primary_rep, d.job_id))
        else:
            # MANUAL VISIBILITY: Always show human-created NCs
            manual_list.append(_row_to_customer_item(d, eq, srf_no, dc_no, dc_date, inward_id, None, d.job_id))

    # 2. Fetch External Records (Respecting their visibility flag)
    external_rows = db.query(
        ExternalDeviation, InwardEquipment, Inward.srf_no, Inward.customer_dc_no, 
        Inward.customer_dc_date, Inward.inward_id
    ).join(
        InwardEquipment, InwardEquipment.inward_eqp_id == ExternalDeviation.inward_eqp_id
    ).join(
        Inward, Inward.inward_id == InwardEquipment.inward_id
    ).filter(
        Inward.customer_id == customer_id,
        ExternalDeviation.hide_customer_visibility == False
    ).all()

    for d, eq, srf_no, dc_no, dc_date, inward_id in external_rows:
        item = _external_row_to_customer_item(d, eq, srf_no, dc_no, dc_date, inward_id)
        if item.deviation_type == "OOT":
            oot_list.append(item)
        else:
            manual_list.append(item)

    # 3. COLLAPSE ONLY THE MANUALS
    # This prevents Manual NCs from conflicting with OOT records
    collapsed_manual = _collapse_manual_items(manual_list)
    
    # 4. Merge but keep them distinct
    merged = oot_list + collapsed_manual
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
            hide_customer_visibility=d.hide_customer_visibility, # <--- ADD THIS LINE

        created_at=d.created_at, updated_at=d.updated_at, oot_steps=oot_steps, attachments=safe_attachments,
    )

def get_deviation_detail_for_staff(db: Session, deviation_id: int) -> Optional[DeviationDetailOut]:
    _sync_legacy_deviation_statuses(db)
    
    # Handle External
    if deviation_id < 0:
        ext_id = abs(deviation_id)
        row = db.query(ExternalDeviation, InwardEquipment, Inward).join(
            InwardEquipment, InwardEquipment.inward_eqp_id == ExternalDeviation.inward_eqp_id
        ).join(
            Inward, Inward.inward_id == InwardEquipment.inward_id
        ).options(joinedload(ExternalDeviation.attachments)).filter(ExternalDeviation.id == ext_id).first()
        if not row: return None
        d, eq, inward = row
        return _external_row_to_detail_out(db, d, eq, inward)

    # Handle Internal
    row = db.query(Deviation, InwardEquipment, Inward).join(
        InwardEquipment, InwardEquipment.inward_eqp_id == Deviation.inward_eqp_id
    ).join(
        Inward, Inward.inward_id == InwardEquipment.inward_id
    ).filter(Deviation.id == deviation_id).first()
    
    if not row: return None
    d, eq, inward = row
    
    # 1. Determine type first
    dev_type = _derive_deviation_type(d)
    
    # 2. Sync and check report date
    if sync_deviation_calibration_status(db, d): 
        db.commit()
        db.refresh(d)

    # 3. GET DATA EXCLUSIVELY BASED ON TYPE
    oot_steps_data = []
    job = _get_job_for_deviation(db, d)
    
    # CONFLICT FIX: Only fetch OOT steps if the deviation is actually an OOT type
    if dev_type == "OOT" and job:
        steps = _get_oot_steps_for_job(db, job.job_id)
        oot_steps_data = [{"step_percent": float(s.step_percent), "deviation_percent": float(s.deviation_percent)} 
                          for s in steps if s.step_percent is not None]

    atts = db.query(DeviationAttachment).filter(DeviationAttachment.deviation_id == deviation_id).order_by(DeviationAttachment.created_at.desc()).all()

    return DeviationDetailOut(
        deviation_id=d.id,
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
        job_id=job.job_id if job else d.job_id,
        deviation_type=dev_type,
        status=d.status or "OPEN",
        calibration_status=d.calibration_status or "not calibrated",
        engineer_remarks=d.engineer_remarks,
        customer_decision=d.customer_decision,
        # Ensure report date is returned
        report=d.report or (d.created_at.date() if d.created_at else None),
        created_at=d.created_at,
        updated_at=d.updated_at,
        hide_customer_visibility=d.hide_customer_visibility,
        oot_steps=oot_steps_data, # This is now empty for Manual NCs
        attachments=[DeviationAttachmentOut.model_validate(a) for a in atts]
    )

def get_deviation_detail_for_customer(db: Session, deviation_id: int, customer_id: int) -> Optional[DeviationDetailOut]:
    _sync_legacy_deviation_statuses(db)
    
    # Handle External
    if deviation_id < 0:
        ext_id = abs(deviation_id)
        row = db.query(ExternalDeviation, InwardEquipment, Inward).join(
            InwardEquipment, InwardEquipment.inward_eqp_id == ExternalDeviation.inward_eqp_id
        ).join(Inward, Inward.inward_id == InwardEquipment.inward_id).filter(
            ExternalDeviation.id == ext_id, 
            Inward.customer_id == customer_id,
            ExternalDeviation.hide_customer_visibility == False
        ).first()
        return _external_row_to_detail_out(db, row[0], row[1], row[2]) if row else None
    
    # Handle Internal
    row = db.query(Deviation, InwardEquipment, Inward).join(
        InwardEquipment, InwardEquipment.inward_eqp_id == Deviation.inward_eqp_id
    ).join(Inward, Inward.inward_id == InwardEquipment.inward_id).filter(
        Deviation.id == deviation_id, 
        Inward.customer_id == customer_id
    ).first()
    
    if not row: return None
    d, eq, inward = row
    
    dtype = _derive_deviation_type(d)
    
    # SECURITY CHECK: If it's an OOT record and visibility is FALSE, deny access
    if dtype == "OOT" and d.hide_customer_visibility is True:
        return None

    # Sync report date on the fly
    if sync_deviation_calibration_status(db, d):
        db.commit()
        db.refresh(d)

    # ISOLATION LOGIC: Only get OOT steps if this specific record IS an OOT deviation
    oot_steps_data = []
    if dtype == "OOT":
        job = _get_job_for_deviation(db, d)
        if job:
            steps = _get_oot_steps_for_job(db, job.job_id)
            oot_steps_data = [{"step_percent": float(s.step_percent), "deviation_percent": float(s.deviation_percent)} 
                              for s in steps if s.step_percent is not None]

    atts = db.query(DeviationAttachment).filter(DeviationAttachment.deviation_id == deviation_id).all()
    
    return DeviationDetailOut(
        deviation_id=d.id,
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
        job_id=d.job_id,
        deviation_type=dtype,
        status=d.status or "OPEN",
        calibration_status=d.calibration_status,
        engineer_remarks=d.engineer_remarks,
        customer_decision=d.customer_decision,
        # Fix: report column fill
        report=d.report or (d.created_at.date() if d.created_at else None),
        created_at=d.created_at,
        updated_at=d.updated_at,
        oot_steps=oot_steps_data, # Strictly isolated to OOT types
        attachments=[DeviationAttachmentOut.model_validate(a) for a in atts]
    )

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

def update_deviation_visibility(db: Session, deviation_id: int, hide: bool) -> Optional[DeviationDetailOut]:
    d = db.query(Deviation).filter(Deviation.id == deviation_id).first()
    if not d:
        return None
    
    # Update the database field
    d.hide_customer_visibility = hide
    d.updated_at = datetime.now(timezone.utc)
    
    # Ensure report date exists
    if d.report is None and d.created_at:
        d.report = d.created_at.date()
        
    db.commit()
    # Refresh to return the full updated object
    return get_deviation_detail_for_staff(db, deviation_id)
# REPORT COLUMN FILLING NULL STORE THE CREATED AT DATE ONLY TO THE REPORT COLUMN TO IDETIFY THE DEVIATION REPORT DATE

def list_all_deviations_paginated(db, skip: int, limit: int, search: str, deviation_type: str):
    try:
        # --- SUBQUERY 1: STANDARD DEVIATIONS (INTERNAL) ---
        # NEW RULE: If calibration_status is 'not calibrated', group under NC. Otherwise, OOT.
        internal_dev_type = case(
            (models.Deviation.calibration_status.ilike('%not calibrated%'), 'NC'),
            else_='OOT'
        )

        stmt1 = select(
            (models.Deviation.id).label("deviation_id"),
            models.Deviation.inward_eqp_id,
            internal_dev_type.label("deviation_type"), # Dynamic based on Calibration Status
            models.Deviation.report.label("report_date"),
            models.Deviation.hide_customer_visibility,
            models.Deviation.status.label("status"),
            models.InwardEquipment.nepl_id,
            models.Inward.srf_no,
            models.Customer.customer_details.label("customer_name"),
            models.Inward.customer_dc_no.label("customer_dc_no")
        ).select_from(models.Deviation).join(
            models.InwardEquipment, models.Deviation.inward_eqp_id == models.InwardEquipment.inward_eqp_id
        ).join(
            models.Inward, models.InwardEquipment.inward_id == models.Inward.inward_id
        ).join(
            models.Customer, models.Inward.customer_id == models.Customer.customer_id
        )

        # --- SUBQUERY 2: EXTERNAL DEVIATIONS ---
        # Rule: Use the explicitly stored deviation_type ('NC' or 'OOT')
        ext_status = case(
            (models.ExternalDeviation.customer_decision.is_not(None), "CLOSED"),
            else_="OPEN"
        )

        stmt2 = select(
            (0 - models.ExternalDeviation.id).label("deviation_id"), # Negative ID for React router
            models.ExternalDeviation.inward_eqp_id,
            models.ExternalDeviation.deviation_type.label("deviation_type"),
            models.ExternalDeviation.report.label("report_date"),
            models.ExternalDeviation.hide_customer_visibility,
            ext_status.label("status"),
            models.InwardEquipment.nepl_id,
            models.Inward.srf_no,
            models.Customer.customer_details.label("customer_name"),
            models.Inward.customer_dc_no.label("customer_dc_no")
        ).select_from(models.ExternalDeviation).join(
            models.InwardEquipment, models.ExternalDeviation.inward_eqp_id == models.InwardEquipment.inward_eqp_id
        ).join(
            models.Inward, models.InwardEquipment.inward_id == models.Inward.inward_id
        ).join(
            models.Customer, models.Inward.customer_id == models.Customer.customer_id
        )

        # --- COMBINE THEM ---
        base_query = union_all(stmt1, stmt2).alias("base_query")

        # --- WRAP WITH WINDOW COUNT (SUPERFAST PAGINATION) ---
        final_stmt = select(
            base_query,
            func.count().over().label("total_window_count")
        )

        # --- FILTER BY TAB ---
        if deviation_type:
            if deviation_type == "MANUAL":
                # Frontend sends "MANUAL" for the NC tab
                final_stmt = final_stmt.where(base_query.c.deviation_type.in_(["MANUAL", "NC"]))
            else:
                final_stmt = final_stmt.where(base_query.c.deviation_type == deviation_type)

        # --- FILTER BY SEARCH ---
        if search:
            search_term = f"%{search}%"
            final_stmt = final_stmt.where(
                or_(
                    base_query.c.nepl_id.ilike(search_term),
                    cast(base_query.c.srf_no, String).ilike(search_term),
                    base_query.c.customer_name.ilike(search_term),
                    base_query.c.customer_dc_no.ilike(search_term)
                )
            )

        # --- PAGINATION & EXECUTE ---
        final_stmt = final_stmt.order_by(base_query.c.deviation_id.desc()).offset(skip).limit(limit)
        
        results = db.execute(final_stmt).mappings().all()
        total_records = results[0]["total_window_count"] if results else 0

        # --- FORMAT OUTPUT ---
        items = []
        for row in results:
            items.append({
                "deviation_id": row["deviation_id"],
                "inward_eqp_id": row["inward_eqp_id"],
                "nepl_id": row["nepl_id"] or "",
                "srf_no": str(row["srf_no"]) if row["srf_no"] else "",
                "customer_name": row["customer_name"] or "",
                "deviation_type": row["deviation_type"] or "",
                "report_date": str(row["report_date"]) if row["report_date"] else None,
                "hide_customer_visibility": bool(row["hide_customer_visibility"]),
                "status": str(row["status"])
            })

        return {
            "total": total_records,
            "items": items
        }

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Database Crash: {str(e)}")
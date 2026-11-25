import os
from typing import List, Dict, Any, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.db import get_db
from backend.auth import get_current_user, check_staff_role
from backend.schemas.user_schemas import UserResponse
from backend.schemas.final_inspection import (
    FinalInspectionCreate,
    FinalInspectionUpdate,
    FinalInspectionResponse,
    FinalInspectionDecisionRequest,
    FinalInspectionPage,
)
from backend.services.final_inspection_service import FinalInspectionService
from backend.services.dispatch_batch_service import DispatchBatchService

# --- MODELS & SERVICES ---
from backend.models import Customer
from backend.models.dispatch_batch import DispatchBatch, DispatchBatchItem
from backend.models.final_inspection import FinalInspection
from backend.models.inward import Inward
from backend.models.htw.htw_job import HTWJob
from backend.models.equipment_flow_config import EquipmentFlowConfig
from backend.models.external_upload import ExternalUpload
from backend.models.wcc import WorkCompletionCertificate
from backend.core.email import send_final_inspection_report_email

router = APIRouter(
    prefix="/final-inspections",
    tags=["Final Inspections"]
)

# Configuration for links (e.g., http://localhost:5173)
FRONTEND_URL = os.getenv("FRONTEND_URL")

# --- CRUD ENDPOINTS ---


@router.post("/", response_model=FinalInspectionResponse, status_code=status.HTTP_201_CREATED)
def create_inspection(payload: FinalInspectionCreate, db: Session = Depends(get_db)):
    return FinalInspectionService.create(db, payload)


@router.get("/", response_model=Dict[str, Any])
def read_inspections(search: Optional[str] = None, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """
    Optimized high-speed paginated endpoint.
    Queries ALL Inwards (so no pending SRFs are filtered out) and joins
    FinalInspection so the frontend can see everything and process new reports.
    """
    if limit > 1000:
        limit = 1000

    # 1. Base query for fast counting
    count_query = db.query(Inward.inward_id)
    if search:
        search_term = f"%{search}%"
        count_query = count_query.filter(
            (Inward.srf_no.ilike(search_term)) |
            (Inward.customer_details.ilike(search_term))
        )
    total_count = count_query.with_entities(func.count(Inward.inward_id)).scalar() or 0

    # 2. Main query Outer Joining active FinalInspection rows
    items_query = db.query(Inward, FinalInspection).outerjoin(
        FinalInspection,
        (Inward.inward_id == FinalInspection.inward_id)
        & (FinalInspection.is_active.is_(True)),
    )

    if search:
        items_query = items_query.filter(
            (Inward.srf_no.ilike(search_term)) |
            (Inward.customer_details.ilike(search_term))
        )

    items = items_query.order_by(Inward.inward_id.desc()).offset(skip).limit(limit).all()

    # 3. High-speed dictionary comprehension serialization
    result = []
    for inward, inspection in items:
        result.append({
            "inward_id": inward.inward_id,
            "dispatch_id": inspection.dispatch_id if inspection else None,
            "srf_no": inward.srf_no,
            "customer_details": getattr(inward, "customer_details", "N/A"),
            "customer_name": (
                inspection.customer_name
                if inspection and inspection.customer_name
                else getattr(inward, "customer_name", "N/A")
            ),
            "created_at": inward.created_at.isoformat() if getattr(inward, "created_at", None) else None,
            "inspection_status": inspection.status if inspection else "PENDING",
            "report_sent": inspection.report_sent if inspection else False,
            "report_sent_at": inspection.report_sent_at.isoformat() if inspection and inspection.report_sent_at else None,
            "customer_decision": inspection.customer_decision if inspection else None,
            "customer_remarks": inspection.customer_remarks if inspection else None,
            "final_inspection_id": inspection.id if inspection else None,
        })

    return {
        "total_count": total_count,
        "items": result,
    }


@router.get("/{inspection_id}", response_model=FinalInspectionResponse)
def read_inspection(inspection_id: int, db: Session = Depends(get_db)):
    db_obj = FinalInspectionService.get_by_id(db, inspection_id)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Inspection not found")
    return db_obj


@router.patch("/{inspection_id}", response_model=FinalInspectionResponse)
def update_inspection(inspection_id: int, payload: FinalInspectionUpdate, db: Session = Depends(get_db)):
    db_obj = FinalInspectionService.get_by_id(db, inspection_id)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Inspection not found")
    return FinalInspectionService.update(db, db_obj, payload)


@router.delete("/{inspection_id}")
def delete_inspection(inspection_id: int, db: Session = Depends(get_db)):
    db_obj = FinalInspectionService.delete(db, inspection_id)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Inspection not found")
    return {"message": "Inspection deleted successfully"}


# --- STAFF ENDPOINT: PREPARE FINAL INSPECTION DATA ---


@router.get("/inward/{inward_id}/details")
def get_final_inspection_details(
    inward_id: int,
    dispatch_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(check_staff_role),
):
    """
    Staff portal uses this to see which equipments are ready for the final report.
    When `dispatch_id` is supplied, scopes equipments, destination customer, and
    saved inspection state strictly to that dispatch batch.
    """
    inward = db.query(Inward).filter(Inward.inward_id == inward_id).first()
    if inward is None:
        raise HTTPException(status_code=404, detail="Inward not found")

    batch: Optional[DispatchBatch] = None
    dest_customer: Optional[Customer] = None
    scoped_equipments = list(inward.equipments)

    if dispatch_id is not None:
        batch = (
            db.query(DispatchBatch)
            .filter(
                DispatchBatch.dispatch_id == dispatch_id,
                DispatchBatch.inward_id == inward_id,
            )
            .first()
        )
        if batch is None:
            raise HTTPException(
                status_code=404,
                detail=f"Dispatch batch {dispatch_id} not found for inward {inward_id}",
            )

        dest_customer = (
            db.query(Customer)
            .filter(Customer.customer_id == batch.dispatched_to_customer_id)
            .first()
        )

        batch_item_rows = (
            db.query(DispatchBatchItem.inward_eqp_id)
            .filter(
                DispatchBatchItem.dispatch_id == dispatch_id,
                DispatchBatchItem.is_active.is_(True),
            )
            .all()
        )
        batch_eqp_ids = {row[0] for row in batch_item_rows}
        scoped_equipments = [
            eq for eq in inward.equipments if eq.inward_eqp_id in batch_eqp_ids
        ]

        saved_inspection = (
            db.query(FinalInspection)
            .filter(
                FinalInspection.dispatch_id == dispatch_id,
                FinalInspection.is_active.is_(True),
            )
            .first()
        )
    else:
        saved_inspection = (
            db.query(FinalInspection)
            .filter(
                FinalInspection.inward_id == inward_id,
                FinalInspection.is_active.is_(True),
            )
            .order_by(FinalInspection.id.asc())
            .first()
        )

    # 1. Fetch Live Data for Status Calculation
    flow_configs = db.query(EquipmentFlowConfig).filter(EquipmentFlowConfig.is_active == True).all()
    system_driven_types = {config.equipment_type for config in flow_configs}

    # Fetch all internal jobs for this inward
    jobs = db.query(HTWJob).filter(HTWJob.inward_id == inward_id).all()
    # Map inward_eqp_id to the EXACT job_status string from the database
    job_map = {j.inward_eqp_id: str(j.job_status) for j in jobs}

    # Fetch all external uploads for the scoped equipments
    eqp_ids = [eq.inward_eqp_id for eq in scoped_equipments]
    upload_map = {}
    if eqp_ids:
        uploads = db.query(ExternalUpload).filter(ExternalUpload.inward_eqp_id.in_(eqp_ids)).all()
        upload_map = {u.inward_eqp_id: u for u in uploads}

    # 2. Map existing remarks if record was previously saved
    existing_remarks_map = {}
    if saved_inspection is not None and saved_inspection.equipments:
        for old_eq in saved_inspection.equipments:
            eid = old_eq.get("inward_eqp_id")
            if eid:
                existing_remarks_map[eid] = old_eq.get("final_remarks", "")

    # 3. Build Equipment List with Live Status
    equipment_data = []
    for eq in scoped_equipments:
        is_system_driven = eq.material_description in system_driven_types

        if is_system_driven:
            raw_status = job_map.get(eq.inward_eqp_id, "PENDING")
        else:
            upload_record = upload_map.get(eq.inward_eqp_id)
            has_cert = False
            if upload_record is not None:
                cert_url = getattr(upload_record, "certificate_file_url", None)
                if cert_url and str(cert_url).strip():
                    has_cert = True
            raw_status = "COMPLETED" if has_cert else "PENDING"

        equipment_data.append({
            "inward_eqp_id": eq.inward_eqp_id,
            "nepl_id": str(eq.nepl_id),
            "material_description": str(eq.material_description),
            "serial_no": str(eq.serial_no),
            "quantity": getattr(eq, "quantity", 1),
            "make": str(eq.make),
            "model": str(eq.model),
            "range": str(eq.range),
            "visual_inspection_notes": str(eq.visual_inspection_notes or ""),
            "accessories_included": str(eq.accessories_included or ""),
            "engineer_remarks": str(eq.engineer_remarks or ""),
            "customer_remarks": str(eq.customer_remarks or ""),
            "job_status": raw_status,
            "flow_type": "INTERNAL" if is_system_driven else "EXTERNAL",
            "final_remarks": existing_remarks_map.get(eq.inward_eqp_id, ""),
        })

    # Resolve recipient customer info (batch destination takes precedence over origin)
    target_customer = dest_customer if dest_customer is not None else inward.customer
    cust_email = ""
    if target_customer is not None and getattr(target_customer, "email", None):
        cust_email = str(target_customer.email)

    cust_name = (
        str(dest_customer.customer_details)
        if dest_customer is not None
        else str(inward.customer_details)
    )

    response_data = {
        "inward_id": inward.inward_id,
        "dispatch_id": batch.dispatch_id if batch is not None else None,
        "batch_no": batch.batch_no if batch is not None else None,
        "dispatched_to_customer_id": (
            batch.dispatched_to_customer_id
            if batch is not None
            else inward.customer_id
        ),
        "dispatched_to_location": (
            dest_customer.location_name if dest_customer is not None else None
        ),
        "srf_no": str(inward.srf_no),
        "customer_dc_no": str(getattr(inward, "customer_dc_no", "N/A")),
        "customer_dc_date": inward.customer_dc_date,
        "receiver": str(inward.received_by),
        "customer_name": cust_name,
        "origin_customer_name": str(inward.customer_details),
        "created_at": str(inward.created_at),
        "customer_email": cust_email,
        "equipments": equipment_data,
        "is_previously_saved": saved_inspection is not None,
    }

    if saved_inspection is not None:
        response_data.update({
            "id": saved_inspection.id,
            "sent_emails": saved_inspection.sent_emails,
            "report_sent": saved_inspection.report_sent,
            "status": saved_inspection.status,
            "customer_decision": saved_inspection.customer_decision,
            "customer_remarks": saved_inspection.customer_remarks,
            "updated_at": saved_inspection.updated_at,
            "customer_email": cust_email or str(saved_inspection.customer_email or ""),
        })

    return response_data


# --- STAFF ENDPOINT: SEND FINAL REPORT ---


@router.post("/inward/{inward_id}/send-report")
async def send_final_report(
    inward_id: int,
    payload: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(check_staff_role),
):
    """
    Staff portal uses this to save data and trigger email dispatch to customer.
    Supports split dispatches when `dispatch_id` is included in `payload`.
    """
    try:
        inward = db.query(Inward).filter(Inward.inward_id == inward_id).first()
        if inward is None:
            raise HTTPException(status_code=404, detail="Inward record not found")

        dispatch_id = payload.get("dispatch_id")
        batch: Optional[DispatchBatch] = None
        target_customer_id = inward.customer_id

        if dispatch_id is not None:
            batch = (
                db.query(DispatchBatch)
                .filter(
                    DispatchBatch.dispatch_id == int(dispatch_id),
                    DispatchBatch.inward_id == inward_id,
                )
                .first()
            )
            if batch is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Dispatch batch {dispatch_id} not found for inward {inward_id}",
                )
            if batch.status == "CANCELLED":
                raise HTTPException(
                    status_code=400,
                    detail="Cannot dispatch a Final Inspection Report for a cancelled batch.",
                )

            # Enforce WCC prerequisite at the API layer for this exact batch
            wcc = (
                db.query(WorkCompletionCertificate)
                .filter(WorkCompletionCertificate.dispatch_id == batch.dispatch_id)
                .first()
            )
            if wcc is None:
                raise HTTPException(
                    status_code=400,
                    detail="Please complete and save the Work Completion Certificate for this dispatch batch first.",
                )

            target_customer_id = batch.dispatched_to_customer_id

            inspection = (
                db.query(FinalInspection)
                .filter(FinalInspection.dispatch_id == batch.dispatch_id)
                .first()
            )
            if inspection is None:
                inspection = FinalInspection(
                    inward_id=inward_id,
                    dispatch_id=batch.dispatch_id,
                    customer_id=target_customer_id,
                )
                db.add(inspection)
            else:
                inspection.customer_id = target_customer_id
        else:
            inspection = (
                db.query(FinalInspection)
                .filter(
                    FinalInspection.inward_id == inward_id,
                    FinalInspection.dispatch_id.is_(None),
                )
                .first()
            )
            if inspection is None:
                inspection = FinalInspection(
                    inward_id=inward_id,
                    customer_id=target_customer_id,
                )
                db.add(inspection)
            else:
                inspection.customer_id = target_customer_id

        now = datetime.now()
        inspection.customer_decision = None
        inspection.customer_remarks = None
        inspection.srf_no = str(payload.get("srf_no") or "")
        inspection.customer_name = str(payload.get("customer_name") or "")
        inspection.customer_dc_no = str(payload.get("customer_dc_no") or "")
        inspection.receiver = str(payload.get("receiver") or "")
        inspection.customer_email = str(payload.get("customer_email") or "")

        inspection.equipments = payload.get("equipments", [])
        inspection.status = "COMPLETED"
        inspection.report_sent = True
        inspection.report_sent_at = now
        inspection.is_active = True

        recipient_list = payload.get("emails", [])
        email_history = list(inspection.sent_emails or [])
        email_history.append({
            "sent_at": now.isoformat(),
            "recipients": recipient_list,
            "dispatched_by": current_user.full_name,
        })
        inspection.sent_emails = email_history

        if batch is not None:
            batch.status = "DISPATCHED"
            batch.dispatched_at = now
            DispatchBatchService.sync_inward_dispatch_status(db, inward_id)

        db.commit()
        db.refresh(inspection)

        direct_link = (
            f"{FRONTEND_URL}/customer/final-report/{inward_id}?dispatch_id={batch.dispatch_id}"
            if batch is not None
            else f"{FRONTEND_URL}/customer/final-report/{inward_id}"
        )
        login_link = f"{FRONTEND_URL}/login"

        if recipient_list:
            for email in recipient_list:
                await send_final_inspection_report_email(
                    background_tasks=background_tasks,
                    recipient_email=email,
                    inward_id=inward_id,
                    srf_no=str(inspection.srf_no or ""),
                    customer_name=str(inspection.customer_name or ""),
                    direct_link=direct_link,
                    login_link=login_link,
                    db=db,
                    created_by=str(current_user.full_name),
                )

        return {
            "status": "success",
            "message": "Report saved and dispatched.",
            "final_inspection_id": inspection.id,
            "dispatch_id": inspection.dispatch_id,
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# --- CUSTOMER PORTAL ENDPOINTS ---


@router.get("/customer/dashboard-reports", response_model=Dict[str, Any])
def get_customer_dashboard_reports(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    if current_user.customer_id is None:
        raise HTTPException(status_code=403, detail="Access denied. Customers only.")
    if limit > 1000:
        limit = 1000

    # 1. High Speed Query for FIRs (originating inwards awaiting customer remarks)
    firs = (
        db.query(Inward)
        .filter(
            Inward.customer_id == current_user.customer_id,
            Inward.status == "PENDING_CUSTOMER_REMARKS",
        )
        .order_by(Inward.inward_id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    # 2. High Speed Query for Finals (strictly scoped to destination customer_id)
    finals = (
        db.query(FinalInspection)
        .filter(
            FinalInspection.customer_id == current_user.customer_id,
            FinalInspection.is_active.is_(True),
        )
        .order_by(FinalInspection.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return {
        "firs": [
            {
                "inward_id": f.inward_id,
                "srf_no": f.srf_no,
                "material_inward_date": f.created_at,
                "status": f.status,
            }
            for f in firs
        ],
        "finals": [
            {
                "id": res.id,
                "inward_id": res.inward_id,
                "dispatch_id": res.dispatch_id,
                "srf_no": res.srf_no,
                "report_sent_at": res.report_sent_at,
                "status": res.status,
                "customer_decision": res.customer_decision,
            }
            for res in finals
        ],
    }


@router.get("/inward/{inward_id}/customer-reports", response_model=List[FinalInspectionResponse])
def list_final_inspections_for_customer_inward(
    inward_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Return all active Final Inspections for an inward scoped to the logged-in customer."""
    customer_filter: Optional[int] = None
    if str(getattr(current_user, "role", "")).lower() == "customer":
        if current_user.customer_id is None:
            raise HTTPException(status_code=403, detail="Access denied")
        customer_filter = current_user.customer_id

    return FinalInspectionService.list_by_inward_id(
        db, inward_id, customer_id_filter=customer_filter
    )


@router.get("/inward/{inward_id}/customer-view")
def get_final_inspection_customer_view(
    inward_id: int,
    dispatch_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    is_customer = str(getattr(current_user, "role", "")).lower() == "customer"
    customer_filter = current_user.customer_id if is_customer else None

    if is_customer and customer_filter is None:
        raise HTTPException(status_code=403, detail="Access denied to this report")

    inspection = FinalInspectionService.get_by_inward_id(
        db,
        inward_id,
        dispatch_id=dispatch_id,
        customer_id_filter=customer_filter,
    )

    if inspection is None:
        raise HTTPException(status_code=404, detail="Inspection not found")

    response_data = FinalInspectionResponse.model_validate(inspection).model_dump()
    dest_cust_row = (
        db.query(Customer)
        .filter(Customer.customer_id == inspection.customer_id)
        .first()
    )
    response_data["dispatched_to_location"] = (
        dest_cust_row.location_name if dest_cust_row is not None else None
    )
    other_dispatched_equipments: List[Dict[str, Any]] = []

    inward = db.query(Inward).filter(Inward.inward_id == inward_id).first()
    if (
        inward is not None
        and current_user.customer_id is not None
        and inward.customer_id == current_user.customer_id
    ):
        other_batches = (
            db.query(DispatchBatch)
            .filter(
                DispatchBatch.inward_id == inward_id,
                DispatchBatch.status != "CANCELLED",
                DispatchBatch.dispatched_to_customer_id != current_user.customer_id,
            )
            .order_by(DispatchBatch.batch_no.asc())
            .all()
        )
        if other_batches:
            other_dispatch_ids = [b.dispatch_id for b in other_batches]
            other_customer_ids = list({b.dispatched_to_customer_id for b in other_batches})
            cust_rows = (
                db.query(Customer)
                .filter(Customer.customer_id.in_(other_customer_ids))
                .all()
            )
            cust_map = {c.customer_id: c for c in cust_rows}
            batch_by_id = {b.dispatch_id: b for b in other_batches}

            from backend.models import InwardEquipment

            flow_configs = (
                db.query(EquipmentFlowConfig)
                .filter(EquipmentFlowConfig.is_active == True)
                .all()
            )
            system_driven_types = {cfg.equipment_type for cfg in flow_configs}

            jobs = db.query(HTWJob).filter(HTWJob.inward_id == inward_id).all()
            job_map = {j.inward_eqp_id: str(j.job_status) for j in jobs}

            other_eqp_ids = [
                row[0]
                for row in db.query(DispatchBatchItem.inward_eqp_id)
                .filter(
                    DispatchBatchItem.dispatch_id.in_(other_dispatch_ids),
                    DispatchBatchItem.is_active.is_(True),
                )
                .all()
            ]
            upload_map = {}
            if other_eqp_ids:
                uploads = (
                    db.query(ExternalUpload)
                    .filter(ExternalUpload.inward_eqp_id.in_(other_eqp_ids))
                    .all()
                )
                upload_map = {u.inward_eqp_id: u for u in uploads}

            batch_item_rows = (
                db.query(DispatchBatchItem, InwardEquipment)
                .join(
                    InwardEquipment,
                    InwardEquipment.inward_eqp_id == DispatchBatchItem.inward_eqp_id,
                )
                .filter(
                    DispatchBatchItem.dispatch_id.in_(other_dispatch_ids),
                    DispatchBatchItem.is_active.is_(True),
                )
                .order_by(DispatchBatchItem.id.asc())
                .all()
            )
            for item, eq in batch_item_rows:
                batch = batch_by_id.get(item.dispatch_id)
                dest_cust = cust_map.get(batch.dispatched_to_customer_id) if batch else None
                dest_label = "Other Branch"
                if dest_cust is not None:
                    dest_label = (
                        f"{dest_cust.customer_details} ({dest_cust.location_name})"
                        if dest_cust.location_name
                        else str(dest_cust.customer_details)
                    )
                is_system_driven = eq.material_description in system_driven_types
                if is_system_driven:
                    other_status = job_map.get(eq.inward_eqp_id, "PENDING")
                else:
                    upload_record = upload_map.get(eq.inward_eqp_id)
                    has_cert = bool(
                        upload_record is not None
                        and getattr(upload_record, "certificate_file_url", None)
                        and str(upload_record.certificate_file_url).strip()
                    )
                    other_status = "COMPLETED" if has_cert else "PENDING"

                other_dispatched_equipments.append({
                    "inward_eqp_id": eq.inward_eqp_id,
                    "nepl_id": str(eq.nepl_id or ""),
                    "material_description": str(eq.material_description or ""),
                    "serial_no": str(eq.serial_no or ""),
                    "quantity": getattr(eq, "quantity", 1),
                    "make": str(eq.make or ""),
                    "model": str(eq.model or ""),
                    "range": str(eq.range or ""),
                    "visual_inspection_notes": str(eq.visual_inspection_notes or ""),
                    "accessories_included": str(eq.accessories_included or ""),
                    "engineer_remarks": str(eq.engineer_remarks or ""),
                    "customer_remarks": str(eq.customer_remarks or ""),
                    "job_status": other_status,
                    "dispatched_to_label": dest_label,
                    "final_remarks": "",
                })

    response_data["other_dispatched_equipments"] = other_dispatched_equipments
    return response_data


@router.post("/inward/{inward_id}/submit-decision")
def submit_customer_decision(
    inward_id: int,
    payload: FinalInspectionDecisionRequest,
    dispatch_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    current_role = str(getattr(current_user, "role", "")).lower()
    customer_filter: Optional[int] = None

    if current_role == "customer":
        if current_user.customer_id is None:
            raise HTTPException(status_code=403, detail="Access denied")
        customer_filter = current_user.customer_id
    elif current_role not in {"admin", "engineer"}:
        raise HTTPException(
            status_code=403,
            detail="You are not authorized to submit this inspection decision",
        )

    inspection = FinalInspectionService.get_by_inward_id(
        db,
        inward_id,
        dispatch_id=dispatch_id,
        customer_id_filter=customer_filter,
    )

    if inspection is None:
        raise HTTPException(status_code=404, detail="Inspection report not found")

    updated_inspection = FinalInspectionService.update_decision(
        db=db,
        db_obj=inspection,
        decision=payload.decision.upper(),
        remarks=payload.remarks,
    )

    return {
        "status": "success",
        "message": f"Inspection {payload.decision}",
        "data": {
            "id": updated_inspection.id,
            "dispatch_id": updated_inspection.dispatch_id,
            "decision": updated_inspection.customer_decision,
            "status": updated_inspection.status,
        },
    }
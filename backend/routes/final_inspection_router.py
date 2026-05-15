import os
from typing import List, Dict, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.auth import get_current_user, check_staff_role
from backend.schemas.user_schemas import UserResponse
from backend.schemas.final_inspection import (
    FinalInspectionCreate, 
    FinalInspectionUpdate, 
    FinalInspectionResponse
)
from backend.services.final_inspection_service import FinalInspectionService

# --- MODELS & SERVICES ---
from backend.models.final_inspection import FinalInspection
from backend.models.inward import Inward
from backend.models.htw.htw_job import HTWJob
from backend.models.equipment_flow_config import EquipmentFlowConfig
from backend.models.external_upload import ExternalUpload 
from backend.core.email import send_final_inspection_report_email 

router = APIRouter(
    prefix="/final-inspections",
    tags=["Final Inspections"]
)

# Configuration for links (e.g., http://localhost:5173)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# --- CRUD ENDPOINTS ---

@router.post("/", response_model=FinalInspectionResponse, status_code=status.HTTP_201_CREATED)
def create_inspection(payload: FinalInspectionCreate, db: Session = Depends(get_db)):
    return FinalInspectionService.create(db, payload)

@router.get("/", response_model=List[FinalInspectionResponse])
def read_inspections(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return FinalInspectionService.get_multi(db, skip=skip, limit=limit)

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
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(check_staff_role)
):
    """
    Staff portal uses this to see which equipments are ready for the final report.
    Returns the exact status from HTWJob for internal items.
    """
    saved_inspection = db.query(FinalInspection).filter(FinalInspection.inward_id == inward_id).first()
    inward = db.query(Inward).filter(Inward.inward_id == inward_id).first()
    
    if inward is None:
        raise HTTPException(status_code=404, detail="Inward not found")

    # 1. Fetch Live Data for Status Calculation
    flow_configs = db.query(EquipmentFlowConfig).filter(EquipmentFlowConfig.is_active == True).all()
    system_driven_types = {config.equipment_type for config in flow_configs}
    
    # Fetch all internal jobs for this inward
    jobs = db.query(HTWJob).filter(HTWJob.inward_id == inward_id).all()
    # Map inward_eqp_id to the EXACT job_status string from the database
    job_map = {j.inward_eqp_id: str(j.job_status) for j in jobs}
    
    # Fetch all external uploads for this inward
    eqp_ids = [eq.inward_eqp_id for eq in inward.equipments]
    uploads = db.query(ExternalUpload).filter(ExternalUpload.inward_eqp_id.in_(eqp_ids)).all()
    upload_map = {u.inward_eqp_id: u for u in uploads}

    # 2. Map existing remarks if record was previously saved
    # This prevents typed remarks from being lost when the status updates
    existing_remarks_map = {}
    if saved_inspection is not None and saved_inspection.equipments:
        for old_eq in saved_inspection.equipments:
            eid = old_eq.get("inward_eqp_id")
            if eid:
                existing_remarks_map[eid] = old_eq.get("final_remarks", "")

    # 3. Build Equipment List with Live Status
    equipment_data = []
    for eq in inward.equipments:
        is_system_driven = eq.material_description in system_driven_types
        
        if is_system_driven:
            # INTERNAL: Show the exact status from htw_job table
            raw_status = job_map.get(eq.inward_eqp_id, "PENDING")
        else:
            # EXTERNAL: Determine if completed based on certificate file presence
            upload_record = upload_map.get(eq.inward_eqp_id)
            has_cert = False
            if upload_record is not None:
                cert_url = getattr(upload_record, 'certificate_file_url', None)
                if cert_url and str(cert_url).strip():
                    has_cert = True
            raw_status = "COMPLETED" if has_cert else "PENDING"

        equipment_data.append({
            "inward_eqp_id": eq.inward_eqp_id,
            "nepl_id": str(eq.nepl_id),
            "material_description": str(eq.material_description),
            "serial_no": str(eq.serial_no),
            "quantity": getattr(eq, 'quantity', 1),
            "make": str(eq.make),
            "model": str(eq.model),
            "range": str(eq.range),
            "visual_inspection_notes": str(eq.visual_inspection_notes or ""),
            "accessories_included": str(eq.accessories_included or ""),
            "engineer_remarks": str(eq.engineer_remarks or ""),
            "customer_remarks": str(eq.customer_remarks or ""),
            "job_status": raw_status, # Exact DB status for internal, calculated for external
            "flow_type": "INTERNAL" if is_system_driven else "EXTERNAL",
            "final_remarks": existing_remarks_map.get(eq.inward_eqp_id, "")
        })

    # Prepare standard response metadata
    cust_email = ""
    if inward.customer is not None:
        if getattr(inward.customer, 'email', None):
            cust_email = str(inward.customer.email)

    response_data = {
        "inward_id": inward.inward_id,
        "srf_no": str(inward.srf_no),
        "customer_dc_no": str(getattr(inward, 'customer_dc_no', 'N/A')),
        "customer_dc_date": inward.customer_dc_date,
        "receiver": str(inward.received_by),
        "customer_name": str(inward.customer_details),
        "created_at": str(inward.created_at),
        "customer_email": cust_email, 
        "equipments": equipment_data,
        "is_previously_saved": saved_inspection is not None
    }

    # If record exists in FinalInspection table, merge metadata
    if saved_inspection is not None:
        response_data.update({
            "id": saved_inspection.id,
            "sent_emails": saved_inspection.sent_emails,
            "report_sent": saved_inspection.report_sent,
            "status": saved_inspection.status,
            # Fallback to saved emails if the customer profile email is missing
            "customer_email": cust_email or str(saved_inspection.customer_email or "")
        })

    return response_data

# --- STAFF ENDPOINT: SEND FINAL REPORT ---

@router.post("/inward/{inward_id}/send-report")
async def send_final_report(
    inward_id: int, 
    payload: dict, 
    background_tasks: BackgroundTasks, 
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(check_staff_role) 
):
    """
    Staff portal uses this to save data and trigger email dispatch to customer.
    """
    try:
        inward = db.query(Inward).filter(Inward.inward_id == inward_id).first()
        if inward is None:
            raise HTTPException(status_code=404, detail="Inward record not found")

        inspection = db.query(FinalInspection).filter(FinalInspection.inward_id == inward_id).first()
        
        if inspection is None:
            inspection = FinalInspection(inward_id=inward_id, customer_id=inward.customer_id)
            db.add(inspection)
        else:
            inspection.customer_id = inward.customer_id

        # Solves Pylance AttributeAccessIssue: Forced string conversion ensures type safety
        inspection.srf_no = str(payload.get("srf_no") or "")
        inspection.customer_name = str(payload.get("customer_name") or "")
        inspection.customer_dc_no = str(payload.get("customer_dc_no") or "")
        inspection.receiver = str(payload.get("receiver") or "")
        inspection.customer_email = str(payload.get("customer_email") or "")
        
        inspection.equipments = payload.get("equipments", [])
        inspection.status = "COMPLETED"
        inspection.report_sent = True
        inspection.report_sent_at = datetime.now()
        inspection.is_active = True

        recipient_list = payload.get("emails", [])
        email_history = list(inspection.sent_emails or [])
        email_history.append({
            "sent_at": datetime.now().isoformat(),
            "recipients": recipient_list,
            "dispatched_by": current_user.full_name
        })
        inspection.sent_emails = email_history

        db.commit()
        db.refresh(inspection)

        # Generate direct links for the email template
        # React Route: /customer/final-report/:inwardId
        direct_link = f"{FRONTEND_URL}/customer/final-report/{inward_id}"
        login_link = f"{FRONTEND_URL}/login"

        if recipient_list:
            for email in recipient_list:
                # portal_link parameter is renamed to direct_link and login_link 
                # to match updated core/email.py and template requirements
                await send_final_inspection_report_email(
                    background_tasks=background_tasks,
                    recipient_email=email,
                    inward_id=inward_id,
                    srf_no=str(inspection.srf_no or ""),
                    customer_name=str(inspection.customer_name or ""),
                    direct_link=direct_link, 
                    login_link=login_link,
                    db=db,
                    created_by=str(current_user.full_name) 
                )

        return {"status": "success", "message": "Report saved and dispatched."}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# --- CUSTOMER PORTAL ENDPOINTS ---

@router.get("/customer/dashboard-reports")
def get_customer_dashboard_reports(
    db: Session = Depends(get_db), 
    current_user: UserResponse = Depends(get_current_user)
):
    if current_user.customer_id is None:
        raise HTTPException(status_code=403, detail="Access denied. Customers only.")

    firs = db.query(Inward).filter(
        Inward.customer_id == current_user.customer_id,
        Inward.status == "PENDING_CUSTOMER_REMARKS" 
    ).all()

    finals = db.query(FinalInspection).filter(
        FinalInspection.customer_id == current_user.customer_id
    ).all()

    return {
        "firs": [
            {
                "inward_id": f.inward_id,
                "srf_no": f.srf_no,
                "material_inward_date": f.created_at,
                "status": f.status
            } for f in firs
        ],
        "finals": [
            {
                "inward_id": res.inward_id,
                "srf_no": res.srf_no,
                "report_sent_at": res.report_sent_at,
                "status": res.status
            } for res in finals
        ]
    }

@router.get("/inward/{inward_id}/customer-view")
def get_final_inspection_customer_view(
    inward_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    inspection = db.query(FinalInspection).filter(FinalInspection.inward_id == inward_id).first()
    
    if inspection is None:
        raise HTTPException(status_code=404, detail="Inspection not found")
    
    # Security check: Ensure customer only views their own data
    if current_user.role.lower() == "customer" and inspection.customer_id != current_user.customer_id:
        raise HTTPException(status_code=403, detail="Access denied to this report")

    return inspection
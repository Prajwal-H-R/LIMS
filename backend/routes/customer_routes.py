"""
Portal routes for customer access to FIR and inward data.
Handles both authenticated customer access and direct token-based access.
"""
import asyncio
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
import logging

from backend import models 
from backend.db import get_db
from backend.services.customer_services import CustomerPortalService
from backend.auth import get_current_user
from backend.schemas.user_schemas import UserResponse
from backend.schemas.customer_schemas import (
    RemarksSubmissionRequest, 
    InwardForCustomer,
    AccountActivationRequest,
    CustomerDropdownResponse,
    TrackingResponse 
)
from backend.schemas.srf_schemas import SrfApiResponse, SrfResponse
from backend.schemas.certificate.certificate_schemas import CertificateResponse, CertificateRenderData, CustomerCertificateResponse
from backend.services.certificate import certificate_service as cert_service
from backend.services.certificate import certificate_pdf_service as pdf_service
from backend.services import deviation_service as deviation_svc
from backend.schemas.deviation_schemas import (
    CustomerDeviationItem,
    CustomerDecisionUpdate,
    DeviationDetailOut,
)

router = APIRouter(prefix="/portal", tags=["Customer Portal"])

# Initialize detailed logging for this module
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

def get_customer_user(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
    """Ensure the user is a customer and has an associated customer_id."""
    if not current_user or current_user.role.lower() != 'customer':
        raise HTTPException(status_code=403, detail="Customer access required")
    if not current_user.customer_id:
        raise HTTPException(status_code=403, detail="User is not associated with a customer account.")
    return current_user


# --- Schemas ---
class SrfStatusUpdateRequest(BaseModel):
    status: str
    remarks: Optional[str] = None

class FirStatusUpdateRequest(BaseModel):
    status: str
    remarks: Optional[str] = None


# --- SRF ENDPOINTS ---

@router.get("/srfs", response_model=SrfApiResponse)
async def get_customer_srfs(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_customer_user)
):
    service = CustomerPortalService(db)
    return service.get_srfs_for_customer(current_user.customer_id)

@router.put("/srfs/{srf_id}/status", response_model=SrfResponse)
async def update_srf_status_by_customer(
    srf_id: int,
    request: SrfStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_customer_user),
):
    service = CustomerPortalService(db)
    return await service.update_srf_status(
        srf_id=srf_id,
        customer_id=current_user.customer_id,
        new_status=request.status,
        remarks=request.remarks,
    )


# --- FIR ENDPOINTS ---

@router.get("/firs-for-review", response_model=List[InwardForCustomer])
async def get_firs_for_customer_review_list(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_customer_user)
):
    service = CustomerPortalService(db)
    return service.get_firs_for_customer_list(current_user.customer_id)


@router.get("/firs/{inward_id}", response_model=InwardForCustomer)
async def get_fir_for_review(
    inward_id: int, 
    db: Session = Depends(get_db), 
    current_user: UserResponse = Depends(get_customer_user)
):
    service = CustomerPortalService(db)
    fir_details = service.get_fir_for_customer_review(inward_id, current_user.customer_id)
    
    if not fir_details:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="FIR not found or you do not have permission to view it."
        )
    return fir_details


@router.put("/firs/{inward_id}/status")
async def update_fir_status(
    inward_id: int,
    request: FirStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_customer_user)
):
    """
    Allows a customer to update FIR status.
    Valid statuses: 'approved', 'rejected', 'reviewed'.
    """
    inward = db.query(models.Inward).filter(models.Inward.inward_id == inward_id).first()

    if not inward:
        raise HTTPException(status_code=404, detail="FIR not found")
    
    if inward.customer_id != current_user.customer_id:
        raise HTTPException(status_code=404, detail="FIR not found") 

    status_input = request.status.strip().lower()
    valid_statuses = ["created", "updated", "reviewed"]
    
    if status_input not in valid_statuses:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid status '{request.status}'. Allowed values: {valid_statuses}"
        )

    inward.status = status_input
    
    if hasattr(inward, 'customer_remarks'):
        inward.customer_remarks = request.remarks

    try:
        db.commit()
        db.refresh(inward)
        return {"message": f"FIR marked as {status_input}", "inward_id": inward_id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.post("/firs/{inward_id}/remarks")
async def submit_fir_remarks(
    inward_id: int, 
    request: RemarksSubmissionRequest, 
    db: Session = Depends(get_db), 
    current_user: UserResponse = Depends(get_customer_user)
):
    service = CustomerPortalService(db)
    return service.submit_customer_remarks(inward_id, request, current_user.customer_id)


# --- DEVIATIONS ---

@router.get("/deviations", response_model=List[CustomerDeviationItem])
async def list_customer_deviations(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_customer_user),
):
    return deviation_svc.list_deviations_for_customer(db, current_user.customer_id)


@router.get("/deviations/{deviation_id}", response_model=DeviationDetailOut)
async def get_customer_deviation_detail(
    deviation_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_customer_user),
):
    detail = deviation_svc.get_deviation_detail_for_customer(
        db, deviation_id, current_user.customer_id
    )
    if not detail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deviation not found or you do not have permission to view it.",
        )
    return detail


@router.patch("/deviations/{deviation_id}", response_model=CustomerDeviationItem)
async def update_deviation_customer_decision(
    deviation_id: int,
    body: CustomerDecisionUpdate,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_customer_user),
):
    updated = deviation_svc.update_customer_decision(
        db, deviation_id, current_user.customer_id, body.customer_decision
    )
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deviation not found or you do not have permission to update it.",
        )
    return updated


# --- TRACKING ---
@router.get("/track", response_model=Optional[TrackingResponse])
async def track_application_status(
    query: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_customer_user)
):
    service = CustomerPortalService(db)
    result = service.track_equipment_status(current_user.customer_id, query)
    
    if not result:
        raise HTTPException(status_code=404, detail="No matching records found for this account.")
    return result


# --- DIRECT ACCESS ---

@router.get("/direct-fir/{inward_id}", response_model=InwardForCustomer)
async def get_fir_direct_access(
    inward_id: int,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    service = CustomerPortalService(db)
    fir_details = service.get_fir_for_direct_access(inward_id, token)
    
    if not fir_details:
        raise HTTPException(status_code=404, detail="FIR not found or invalid token.")
    return fir_details

@router.post("/direct-fir/{inward_id}/remarks")
async def submit_fir_remarks_direct(
    inward_id: int,
    request: RemarksSubmissionRequest,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    service = CustomerPortalService(db)
    return service.submit_remarks_direct_access(inward_id, request, token)

@router.post("/activate-account")
async def activate_customer_account(
    request: AccountActivationRequest,
    db: Session = Depends(get_db)
):
    service = CustomerPortalService(db)
    token = service.activate_account_and_set_password(request.token, request.password)
    return {"access_token": token, "token_type": "bearer"}

@router.get("/customers/dropdown", response_model=List[CustomerDropdownResponse])
async def get_customers_for_dropdown(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    service = CustomerPortalService(db)
    return service.get_all_customers_for_dropdown()


# --- CUSTOMER CERTIFICATES (Updated with detailed Logging) ---

@router.get("/certificates")
async def get_customer_certificates(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_customer_user)
):
    """
    List all issued certificates for the authenticated customer.
    Includes BOTH system certificates and external_uploads.
    """
    logger.info(f"[PORTAL_CERT_LOG] Requesting certificates for Customer ID: {current_user.customer_id}")
    
    try:
        # Use the combined service logic
        results = cert_service.list_certificates_with_external(
            db, 
            customer_id=current_user.customer_id, 
            status="ISSUED"
        )
        
        logger.info(f"[PORTAL_CERT_LOG] Service returned {len(results)} total records.")
        
        # Log how many of each type were found
        system_count = sum(1 for x in results if not x.get("is_external"))
        manual_count = sum(1 for x in results if x.get("is_external"))
        
        logger.info(f"[PORTAL_CERT_LOG] System Generated: {system_count}, Manual Uploads: {manual_count}")
        
        # Detailed log for manual uploads to ensure URLs are correctly fetched
        for item in results:
            if item.get("is_external"):
                logger.info(f"[PORTAL_CERT_LOG] Found External Cert: {item.get('certificate_no')} - URL: {item.get('certificate_file_url')}")

        return results

    except Exception as e:
        logger.error(f"[PORTAL_CERT_LOG] Error in get_customer_certificates: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while fetching certificates.")


@router.get("/certificates/{certificate_id}/view", response_model=CertificateRenderData)
async def get_customer_certificate_view(
    certificate_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_customer_user)
):
    """View logic for System Certificates (Note: External certs open URL directly on frontend)"""
    logger.info(f"[PORTAL_CERT_LOG] Viewing certificate_id: {certificate_id}")
    
    cert = cert_service.get_certificate_for_customer(db, certificate_id, current_user.customer_id)
    if not cert:
        logger.warning(f"[PORTAL_CERT_LOG] Certificate {certificate_id} not found or permission denied for customer {current_user.customer_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate not found or you do not have permission to view it."
        )
        
    base_url = str(request.base_url).rstrip("/")
    template_data = cert_service.build_template_data(
        db, cert.job_id, certificate=cert, base_url=base_url, use_data_uris=False
    )
    
    cal_str = cert.date_of_calibration.strftime("%d-%m-%Y") if cert.date_of_calibration else ""
    rec_str = cert.recommended_cal_due_date.strftime("%d-%m-%Y") if cert.recommended_cal_due_date else ""
    
    return CertificateRenderData(
        certificate_id=cert.certificate_id,
        status=cert.status,
        certificate_no=cert.certificate_no,
        date_of_calibration=cal_str,
        recommended_cal_due_date=rec_str,
        ulr_no=cert.ulr_no,
        field_of_parameter=cert.field_of_parameter,
        authorised_signatory=cert.authorised_signatory,
        template_data=template_data,
    )


@router.get("/certificates/{certificate_id}/download-pdf")
async def download_customer_certificate_pdf(
    certificate_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_customer_user),
):
    """Download System Certificates as PDF."""
    logger.info(f"[PORTAL_CERT_LOG] Downloading PDF for cert_id: {certificate_id}")
    
    cert = cert_service.get_certificate_for_customer(db, certificate_id, current_user.customer_id)
    if not cert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate not found or you do not have permission to download it.",
        )
    try:
        pdf_bytes = await asyncio.to_thread(
            pdf_service.generate_certificate_pdf, db, certificate_id, False
        )
    except (ValueError, RuntimeError) as e:
        logger.error(f"[PORTAL_CERT_LOG] PDF Generation Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
        
    filename = cert_service.get_certificate_pdf_filename(db, certificate_id)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
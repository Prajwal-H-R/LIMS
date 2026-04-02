# backend/routes/htw_certificate_router.py

import io
import zipfile
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response, HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.auth import get_current_user, check_staff_role
from backend.schemas.user_schemas import UserResponse
from backend.schemas.certificate.certificate_schemas import (
    CertificateResponse,
    CertificateWithContext,
    CertificateUpdate,
    CertificateEngineerFields,
    CertificateApproval,
    CertificateRework,
    CertificateRenderData,
    CertificateBulkDownloadRequest,
)
from backend.services.certificate import certificate_service as cert_service
from backend.services.certificate import certificate_pdf_service as pdf_service


router = APIRouter(prefix="/certificates", tags=["HTW Certificates"])

# Initialize Jinja2 Templates
# Ensure this path matches your project structure. 
# Usually it is "backend/templates" relative to where you run uvicorn.
templates = Jinja2Templates(directory="backend/templates")


def _check_admin(current_user: UserResponse) -> None:
    """Ensure user has admin role."""
    if current_user.role.lower() != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")


@router.post("/render-preview", response_class=HTMLResponse)
async def render_certificate_preview_html(
    request: Request,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(check_staff_role),
):
    """
    Takes raw JSON data (certificate fields) and renders the 
    'certificate_combined.html' template server-side.
    Returns an HTML string to be displayed in an iframe on the frontend.
    """
    # Merge request object (required by FastAPI templates) with the data payload
    context = {"request": request, **payload}
    
    return templates.TemplateResponse(
        "certificate/certificate_combined.html", 
        context
    )


@router.post("/jobs/{job_id}/generate", response_model=CertificateResponse)
def generate_certificate(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(check_staff_role),
):
    """
    Step 1–2: Engineer clicks "Generate Certificate".
    Creates certificate in DRAFT status with auto-filled data.
    """
    cert = cert_service.generate_certificate(db, job_id, created_by=current_user.user_id)
    return cert


@router.get("/srf-groups")
def list_srf_groups_with_eligible_equipment(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(check_staff_role),
):
    """
    List SRFs with all equipments eligible for certificate (equipments with calibration jobs).
    When an SRF is expanded, shows all such equipments - with Generate button if no cert, or cert UI if exists.
    """
    return cert_service.list_srf_groups_with_eligible_equipment(db)


@router.get("/", response_model=List[CertificateWithContext])
def list_certificates(
    job_id: Optional[int] = Query(None, description="Filter by job ID"),
    inward_id: Optional[int] = Query(None, description="Filter by inward ID"),
    status: Optional[str] = Query(None, description="Filter by status (DRAFT, CREATED, REWORK, APPROVED, ISSUED)"),
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(check_staff_role),
):
    """List certificates with optional filters. Includes srf_no, nepl_id, material_description for SRF grouping."""
    certs = cert_service.list_certificates_with_context(db, job_id=job_id, inward_id=inward_id, status=status)
    return certs


@router.post("/download-bulk-pdf")
def download_bulk_certificate_pdf(
    payload: CertificateBulkDownloadRequest,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(check_staff_role),
):
    """
    Download multiple certificates as a single ZIP file.
    Only certificates in APPROVED or ISSUED status are allowed.
    """
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for cert_id in payload.certificate_ids:
            cert = cert_service.get_certificate_by_id(db, cert_id)
            if not cert:
                raise HTTPException(status_code=404, detail=f"Certificate ID {cert_id} not found")
            if cert.status not in ("APPROVED", "ISSUED"):
                raise HTTPException(
                    status_code=400,
                    detail=f"Certificate {cert_id} has status {cert.status}. Only APPROVED or ISSUED can be bulk-downloaded.",
                )
            try:
                pdf_bytes = pdf_service.generate_certificate_pdf(
                    db, cert_id, no_header_footer=payload.no_header_footer
                )
            except (ValueError, RuntimeError) as e:
                raise HTTPException(status_code=500, detail=f"Failed to generate PDF for certificate {cert_id}: {str(e)}")
            safe_name = cert_service.get_certificate_pdf_filename(db, cert_id)
            zf.writestr(safe_name, pdf_bytes)
    buf.seek(0)
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="certificates.zip"'},
    )


@router.get("/{certificate_id}/download-pdf")
def download_certificate_pdf(
    certificate_id: int,
    no_header_footer: bool = Query(False, description="Use no-header-footer template for engineer/admin"),
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(check_staff_role),
):
    """Download certificate as PDF. Use no_header_footer=true for engineer/admin (clean print)."""
    try:
        pdf_bytes = pdf_service.generate_certificate_pdf(db, certificate_id, no_header_footer=no_header_footer)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    cert = cert_service.get_certificate_by_id(db, certificate_id)
    filename = cert_service.get_certificate_pdf_filename(db, certificate_id)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{certificate_id}", response_model=CertificateResponse)
def get_certificate(
    certificate_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(check_staff_role),
):
    """Get certificate by ID."""
    cert = cert_service.get_certificate_by_id(db, certificate_id)
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    return cert


@router.patch("/{certificate_id}", response_model=CertificateResponse)
def update_certificate(
    certificate_id: int,
    payload: CertificateUpdate,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(check_staff_role),
):
    """
    Step 3: Engineer/Admin updates mandatory fields (ulr_no, field_of_parameter, recommended_cal_due_date).
    Admin can also set authorised_signatory when status is CREATED.
    """
    updates = payload.model_dump(exclude_unset=True)
    cert = cert_service.update_certificate(db, certificate_id, updates)
    return cert


@router.post("/{certificate_id}/submit", response_model=CertificateResponse)
def submit_for_approval(
    certificate_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(check_staff_role),
):
    """
    Step 4: Engineer submits for approval. DRAFT -> CREATED.
    Requires ulr_no, field_of_parameter, recommended_cal_due_date to be set.
    """
    cert = cert_service.submit_for_approval(db, certificate_id)
    return cert


@router.post("/{certificate_id}/approve", response_model=CertificateResponse)
def approve_certificate(
    certificate_id: int,
    payload: CertificateApproval,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Step 5–6: Admin approves certificate. CREATED -> APPROVED.
    Applies authorised signatory.
    """
    _check_admin(current_user)
    cert = cert_service.approve_certificate(
        db,
        certificate_id,
        authorised_signatory=payload.authorised_signatory,
        approved_by=current_user.user_id,
    )
    return cert


@router.post("/{certificate_id}/rework", response_model=CertificateResponse)
def rework_certificate_endpoint(
    certificate_id: int,
    payload: CertificateRework,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Admin sends certificate for rework. CREATED -> REWORK.
    Requires rework_comment explaining what needs to be changed.
    """
    _check_admin(current_user)
    return cert_service.rework_certificate(
        db,
        certificate_id,
        rework_comment=payload.rework_comment,
        approved_by=current_user.user_id,
    )


@router.post("/{certificate_id}/resubmit", response_model=CertificateResponse)
def resubmit_for_approval(
    certificate_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(check_staff_role),
):
    """
    Engineer resubmits certificate after rework. REWORK -> CREATED.
    """
    return cert_service.resubmit_for_approval(db, certificate_id)


@router.post("/{certificate_id}/issue", response_model=CertificateResponse)
def issue_certificate(
    certificate_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Step 7: Admin issues certificate. APPROVED -> ISSUED.
    Certificate becomes available in Customer Portal.
    """
    _check_admin(current_user)
    cert = cert_service.issue_certificate(db, certificate_id)
    return cert


@router.get("/{certificate_id}/preview", response_model=CertificateRenderData)
def get_certificate_preview(
    certificate_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(check_staff_role),
):
    """
    Get full certificate data for preview/rendering.
    Returns template_data suitable for certificate templates.
    Images (logos, QR code) are served via API URLs from certificate_assets.
    """
    cert = cert_service.get_certificate_by_id(db, certificate_id)
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")

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


@router.get("/jobs/{job_id}/preview-data")
def get_job_preview_data(
    job_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(check_staff_role),
):
    """
    Get certificate template data for a job (before or without certificate).
    Useful for preview before generating certificate.
    """
    base_url = str(request.base_url).rstrip("/")
    template_data = cert_service.build_template_data(
        db, job_id, certificate=None, base_url=base_url, use_data_uris=False
    )
    return {"job_id": job_id, "template_data": template_data}
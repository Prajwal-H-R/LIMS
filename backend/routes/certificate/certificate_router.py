# backend/routes/htw_certificate_router.py
from datetime import date
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
    CertificateQrGenerateRequest,
    CertificateQrBulkGenerateRequest,
    CertificateQrGenerateResponse,
    QrScanCertificateView,
    PaginatedSrfGroupResponse,
    PaginatedCertificateResponse
)
from backend.services.certificate import certificate_service as cert_service
from backend.services.certificate import certificate_pdf_service as pdf_service
from backend.models.certificate.certificate import HTWCertificate
from backend.models.lab_scope import LabScope

router = APIRouter(prefix="/certificates", tags=["HTW Certificates"])

# Initialize Jinja2 Templates
# Ensure this path matches your project structure. 
# Usually it is "backend/templates" relative to where you run uvicorn.
templates = Jinja2Templates(directory="backend/templates")


def _check_admin(current_user: UserResponse) -> None:
    """Ensure user has admin role."""
    if current_user.role.lower() != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")

@router.get("/next-ulr")
def get_next_ulr(db: Session = Depends(get_db)):
    """
    Generates the next sequential NABL ULR.
    Trims hyphens from lab_unique_number to ensure 18-char standard.
    """
    # 1. Get Prefix from active lab scope
    scope = db.query(LabScope).filter(LabScope.is_active == True).first()
    if not scope or not scope.lab_unique_number:
        raise HTTPException(
            status_code=400, 
            detail="Active Lab Scope with Unique Number not found."
        )

    # Clean the prefix: Remove hyphens and whitespace
    # Example: "CC-4466" -> "CC4466"
    raw_prefix = scope.lab_unique_number.replace("-", "").strip().upper()
    
    # Validation: NABL prefix should be 6 characters
    if len(raw_prefix) != 6:
        # If your prefix isn't exactly 6, we log it but proceed 
        # (NABL standard is 6 for prefix + 2 year + 1 loc + 8 serial + 1 scope = 18)
        pass

    current_year = str(date.today().year)[-2:] # "24"
    location_code = "0"
    scope_flag = "F"

    # 2. Find the last generated ULR in the database for this year
    # Pattern: CC4466 24 0 %
    search_pattern = f"{raw_prefix}{current_year}{location_code}%"
    
    last_cert = db.query(HTWCertificate).filter(
        HTWCertificate.ulr_no.like(search_pattern)
    ).order_by(HTWCertificate.ulr_no.desc()).first()

    next_serial = 1
    if last_cert and last_cert.ulr_no:
        try:
            # The serial number is the 8 digits before the last character
            # ULR: [Prefix 6][YY 2][Loc 1] [Serial 8] [Scope 1]
            # Index: 0...5   6,7    8      9...16      17
            last_serial_str = last_cert.ulr_no[9:17]
            next_serial = int(last_serial_str) + 1
        except (ValueError, IndexError):
            next_serial = 1

    # 3. Construct 18-character ULR
    serial_str = f"{next_serial:08d}" # Pads with zeros to 8 digits
    generated_ulr = f"{raw_prefix}{current_year}{location_code}{serial_str}{scope_flag}"

    return {"next_ulr": generated_ulr}
@router.post("/render-preview", response_class=HTMLResponse)
async def render_certificate_preview_html(
    request: Request,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
):
    """
    Takes raw JSON data (certificate fields) and renders the 
    'certificate_combined.html' template server-side.
    Returns an HTML string to be displayed in an iframe on the frontend.
    """
    # Merge request object (required by FastAPI templates) with the data payload
    context = {"request": request, **payload}
    
    return templates.TemplateResponse(
        request,
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


@router.post("/{certificate_id}/qr/generate", response_model=CertificateQrGenerateResponse)
def generate_qr_for_certificate(
    certificate_id: int,
    payload: CertificateQrGenerateRequest,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(check_staff_role),
):
    cert = cert_service.upsert_certificate_qr(db, certificate_id, payload.qr_image_base64)
    return CertificateQrGenerateResponse(
        certificate_id=cert.certificate_id,
        qr_token=cert.qr_token or "",
        qr_generated_at=cert.qr_generated_at,
    )


@router.post("/qr/generate-bulk", response_model=List[CertificateQrGenerateResponse])
def generate_qr_bulk(
    payload: CertificateQrBulkGenerateRequest,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(check_staff_role),
):
    certs = cert_service.bulk_upsert_certificate_qr(
        db,
        [item.model_dump() for item in payload.items],
    )
    return [
        CertificateQrGenerateResponse(
            certificate_id=c.certificate_id,
            qr_token=c.qr_token or "",
            qr_generated_at=c.qr_generated_at,
        )
        for c in certs
    ]


@router.get("/qr/{qr_token}", response_model=QrScanCertificateView)
def view_certificate_by_qr(
    qr_token: str,
    request: Request,
    db: Session = Depends(get_db),
):
    cert = cert_service.get_certificate_by_qr_token(db, qr_token)
    if not cert:
        raise HTTPException(status_code=404, detail="QR code not found")

    base_url = str(request.base_url).rstrip("/")
    template_data = cert_service.build_template_data(
        db, cert.job_id, certificate=cert, base_url=base_url, use_data_uris=False
    )
    cal_str = cert.date_of_calibration.strftime("%d-%m-%Y") if cert.date_of_calibration else ""
    rec_str = cert.recommended_cal_due_date.strftime("%d-%m-%Y") if cert.recommended_cal_due_date else ""
    return QrScanCertificateView(
        certificate_id=cert.certificate_id,
        certificate_no=cert.certificate_no,
        status=cert.status,
        date_of_calibration=cal_str,
        recommended_cal_due_date=rec_str,
        calibration_status=cert_service.get_calibration_status(cert),
        template_data=template_data,
        print_pdf_url=f"/api/certificates/{cert.certificate_id}/download-pdf",
    )


@router.get("/qr/certificate/{certificate_id}", response_model=QrScanCertificateView)
def view_certificate_by_id_for_qr(
    certificate_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    cert = cert_service.get_certificate_by_id(db, certificate_id)
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")


    base_url = str(request.base_url).rstrip("/")
    template_data = cert_service.build_template_data(
        db, cert.job_id, certificate=cert, base_url=base_url, use_data_uris=False
    )
    cal_str = cert.date_of_calibration.strftime("%d-%m-%Y") if cert.date_of_calibration else ""
    rec_str = cert.recommended_cal_due_date.strftime("%d-%m-%Y") if cert.recommended_cal_due_date else ""
    return QrScanCertificateView(
        certificate_id=cert.certificate_id,
        certificate_no=cert.certificate_no,
        status=cert.status,
        date_of_calibration=cal_str,
        recommended_cal_due_date=rec_str,
        calibration_status=cert_service.get_calibration_status(cert),
        template_data=template_data,
        print_pdf_url=f"/api/certificates/{cert.certificate_id}/download-pdf",
    )


@router.get("/qr/certificate/{certificate_id}/view", response_class=HTMLResponse)
def view_certificate_page_by_id_for_qr(
    certificate_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    cert = cert_service.get_certificate_by_id(db, certificate_id)
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")


    base_url = str(request.base_url).rstrip("/")
    cal_str = cert.date_of_calibration.strftime("%d-%m-%Y") if cert.date_of_calibration else "-"
    rec_str = cert.recommended_cal_due_date.strftime("%d-%m-%Y") if cert.recommended_cal_due_date else "-"
    cal_status = cert_service.get_calibration_status(cert)
    pdf_url = f"/api/certificates/{cert.certificate_id}/download-pdf"

    html = f"""
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Certificate View</title>
  <style>
    body {{ margin: 0; font-family: Arial, sans-serif; background: #f1f5f9; }}
    .wrap {{ max-width: 1080px; margin: 0 auto; padding: 16px; }}
    .card {{
      background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
      padding: 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
    }}
    .title {{ margin: 0; font-size: 24px; }}
    .meta {{ color: #475569; margin-top: 6px; font-size: 14px; }}
    .btn {{
      display: inline-block; text-decoration: none; background: #16a34a; color: #fff;
      padding: 10px 14px; border-radius: 8px; font-size: 14px; font-weight: 600;
    }}
    .viewer {{
      margin-top: 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;
    }}
    iframe {{ width: 100%; min-height: 80vh; border: 0; }}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div>
        <h1 class="title">Certificate View</h1>
        <div class="meta">{cert.certificate_no or "-"} | Calibration Date: {cal_str} | Cal Due: {rec_str} | {cal_status}</div>
      </div>
      <a class="btn" href="{pdf_url}" target="_blank" rel="noreferrer">Download PDF</a>
    </div>
    <div class="viewer">
      <iframe src="{pdf_url}" title="Certificate PDF"></iframe>
    </div>
  </div>
</body>
</html>
"""
    return HTMLResponse(content=html)


@router.get("/srf-groups", response_model=PaginatedSrfGroupResponse)
def list_srf_groups_with_eligible_equipment(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    inward_id: Optional[int] = None,
    status: Optional[str] = Query(None),       # NEW: Filters by Tab
    start_date: Optional[str] = Query(None),   # NEW: Date filter
    end_date: Optional[str] = Query(None),     # NEW: Date filter
    is_htw: Optional[bool] = Query(None), 
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(check_staff_role),
):
    if limit > 1000: limit = 1000

    # Ensure your cert_service is updated to accept these parameters!
    # Example Implementation for cert_service.list_srf_groups_with_eligible_equipment:
    """
    conditions = []
    if inward_id:
        conditions.append(Inward.inward_id == inward_id)
    if search:
        search_term = f"%{search}%"
        conditions.append(or_(
            Inward.srf_no.ilike(search_term),
            Inward.customer_details.ilike(search_term)
        ))

    # Fast Count
    count_stmt = select(func.count(Inward.inward_id)).where(*conditions)
    total_count = db.scalar(count_stmt) or 0

    # Paginated Fetch with Eager Loading
    stmt = select(Inward).options(selectinload(Inward.equipments)).where(*conditions)
    stmt = stmt.order_by(Inward.inward_id.desc()).offset(skip).limit(limit)
    inwards = db.scalars(stmt).all()
    """
    
    return cert_service.list_srf_groups_with_eligible_equipment(
        db, 
        skip=skip, 
        limit=limit, 
        search=search, 
        inward_id=inward_id,
        status=status,
        start_date=start_date,
        end_date=end_date,
        is_htw=is_htw
    )

# --- 2. Optimized Certificates Endpoint ---
@router.get("/", response_model=PaginatedCertificateResponse)
def list_certificates(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    job_id: Optional[int] = Query(None),
    inward_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    if limit > 1000: limit = 1000
    
    customer_id = None
    exclude_external = False
    user_role = current_user.role.lower()

    if user_role == "customer":
        customer_id = current_user.customer_id
        status = "ISSUED"
        exclude_external = False 
    elif user_role == "admin":
        exclude_external = True 
    else:
        exclude_external = False

    # Update your service to accept skip, limit, search and return a dict {total_count, items}
    return cert_service.list_certificates_with_external(
        db, 
        skip=skip,
        limit=limit,
        search=search,
        customer_id=customer_id, 
        status=status,
        exclude_external=exclude_external
    )


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
    inline: bool = Query(
        False,
        description="If true, use Content-Disposition: inline so browsers/PDF viewers can embed or open the file without forcing download.",
    ),
    db: Session = Depends(get_db),
):
    """Download certificate as PDF. Use no_header_footer=true for engineer/admin (clean print)."""
    try:
        pdf_bytes = pdf_service.generate_certificate_pdf(db, certificate_id, no_header_footer=no_header_footer)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    # Defensive: optional data-fetching code in PDF generation may catch DB exceptions
    # internally; ensure session is usable before subsequent metadata queries.
    db.rollback()
    cert = cert_service.get_certificate_by_id(db, certificate_id)
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")

    filename = cert_service.get_certificate_pdf_filename(db, certificate_id)
    disposition = "inline" if inline else "attachment"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'{disposition}; filename="{filename}"'},
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
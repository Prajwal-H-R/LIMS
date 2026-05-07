# backend/schemas/certificate_schemas.py

from datetime import date, datetime
from typing import Optional, Any, Dict, List
from pydantic import BaseModel, Field


# --- Certificate Status Enum (for reference) ---
# DRAFT -> CREATED -> APPROVED -> ISSUED
# CREATED -> REWORK (admin rework) -> CREATED (engineer resubmits)

# --- Engineer mandatory fields (Step 3) ---
class CertificateEngineerFields(BaseModel):
    ulr_no: str
    field_of_parameter: str  # e.g., "Torque"
    recommended_cal_due_date: date


# --- Update for DRAFT/CREATED (engineer or admin can edit) ---
class CertificateUpdate(BaseModel):
    ulr_no: Optional[str] = None
    field_of_parameter: Optional[str] = None
    recommended_cal_due_date: Optional[date] = None
    item_status: Optional[str] = None  # Status of item on Receipt
    authorised_signatory: Optional[str] = None  # Admin can set when CREATED


# --- Admin approval payload ---
class CertificateApproval(BaseModel):
    authorised_signatory: str


class CertificateRework(BaseModel):
    rework_comment: str


# --- Bulk PDF download (multiple certificates as ZIP) ---
class CertificateBulkDownloadRequest(BaseModel):
    certificate_ids: List[int] = Field(..., min_length=1, max_length=50)
    no_header_footer: bool = False


class CertificateQrGenerateRequest(BaseModel):
    qr_image_base64: str = Field(..., min_length=16)


class CertificateQrBulkGenerateItem(BaseModel):
    certificate_id: int
    qr_image_base64: str = Field(..., min_length=16)


class CertificateQrBulkGenerateRequest(BaseModel):
    items: List[CertificateQrBulkGenerateItem] = Field(..., min_length=1, max_length=200)


class CertificateQrGenerateResponse(BaseModel):
    certificate_id: int
    qr_token: str
    qr_generated_at: Optional[datetime] = None


class QrScanCertificateView(BaseModel):
    certificate_id: int
    certificate_no: str
    status: str
    date_of_calibration: Optional[str] = None
    recommended_cal_due_date: Optional[str] = None
    calibration_status: str
    template_data: Dict[str, Any] = Field(default_factory=dict)
    print_pdf_url: str


# --- Certificate Response (for API) ---
class CertificateResponse(BaseModel):
    certificate_id: int
    job_id: int
    inward_id: Optional[int] = None
    inward_eqp_id: Optional[int] = None
    certificate_no: str
    date_of_calibration: date
    ulr_no: Optional[str] = None
    field_of_parameter: Optional[str] = None
    recommended_cal_due_date: Optional[date] = None
    item_status: Optional[str] = None
    authorised_signatory: Optional[str] = None
    permissible_deviation_iso_6789: Optional[List[str]] = None
    iso_6789_results: Optional[List[str]] = None
    status: str
    admin_rework_comment: Optional[str] = None
    created_by: Optional[int] = None
    created_at: Optional[datetime] = None
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None
    issued_at: Optional[datetime] = None
    qr_token: Optional[str] = None
    qr_image_base64: Optional[str] = None
    qr_generated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# --- Certificate list item for customer portal (includes DC number) ---
class CustomerCertificateResponse(CertificateResponse):
    """Certificate with dc_number for customer portal display."""
    dc_number: Optional[str] = None


# --- Certificate list item with SRF/equipment context (for grouping) ---
class CertificateWithContext(CertificateResponse):
    """Certificate with srf_no and equipment info for grouping by SRF."""
    srf_no: Optional[str] = None
    nepl_id: Optional[str] = None
    material_description: Optional[str] = None


# --- Full certificate data for rendering (includes all template fields) ---
class CertificateRenderData(BaseModel):
    """Certificate data ready for template rendering."""
    certificate_id: int
    status: str
    certificate_no: str
    date_of_calibration: str
    recommended_cal_due_date: Optional[str] = None
    ulr_no: Optional[str] = None
    field_of_parameter: Optional[str] = None
    authorised_signatory: Optional[str] = None
    # Full template payload
    template_data: Dict[str, Any] = Field(default_factory=dict)

class CertificateWithContext(BaseModel):
    certificate_id: Any  # Changed to Any because external uses strings "ext_1"
    # ... existing fields ...
    is_external: bool = False
    certificate_file_url: Optional[str] = None
    certificate_file_name: Optional[str] = None
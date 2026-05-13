from datetime import date, datetime
from typing import Optional, Any, Dict, List
from pydantic import BaseModel, Field

# --- Engineer mandatory fields ---
class CertificateEngineerFields(BaseModel):
    ulr_no: str
    field_of_parameter: str
    recommended_cal_due_date: date

# --- Update for DRAFT/CREATED ---
class CertificateUpdate(BaseModel):
    ulr_no: Optional[str] = None
    field_of_parameter: Optional[str] = None
    recommended_cal_due_date: Optional[date] = None
    item_status: Optional[str] = None
    authorised_signatory: Optional[str] = None

# --- Admin approval payload ---
class CertificateApproval(BaseModel):
    authorised_signatory: str

class CertificateRework(BaseModel):
    rework_comment: str

# --- Bulk PDF download ---
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

# --- Certificate Response (Base) ---
class CertificateResponse(BaseModel):
    # Changed to Any to support system IDs (int) and external IDs ("ext_1")
    certificate_id: Any 
    job_id: Optional[int] = None
    inward_id: Optional[int] = None
    inward_eqp_id: Optional[int] = None
    certificate_no: Optional[str] = None
    date_of_calibration: Optional[date] = None
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

# --- Unified CertificateWithContext (Replaces the two duplicate classes) ---
class CertificateWithContext(CertificateResponse):
    """
    Unified schema for Internal and External certificates.
    Includes srf_no, nepl_id for grouping and external fields for manual uploads.
    """
    # Context fields for grouping
    srf_no: Optional[str] = None
    nepl_id: Optional[str] = None
    material_description: Optional[str] = None
    customer_dc_no: Optional[str] = None

    # External upload fields
    is_external: bool = False
    certificate_file_url: Optional[str] = None
    certificate_file_name: Optional[str] = None

# --- Other specific responses ---

class CustomerCertificateResponse(CertificateResponse):
    dc_number: Optional[str] = None

class CertificateRenderData(BaseModel):
    certificate_id: int
    status: str
    certificate_no: str
    date_of_calibration: str
    recommended_cal_due_date: Optional[str] = None
    ulr_no: Optional[str] = None
    field_of_parameter: Optional[str] = None
    authorised_signatory: Optional[str] = None
    template_data: Dict[str, Any] = Field(default_factory=dict)
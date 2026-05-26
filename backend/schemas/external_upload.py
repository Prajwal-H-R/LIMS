from pydantic import BaseModel, Field
from typing import Optional, Any, List
from datetime import datetime, date


# ─────────────────────────────────────────────
# UNLOCK REQUEST NESTED SCHEMA
# ─────────────────────────────────────────────

class UnlockRequestHistory(BaseModel):
    """Single past unlock request cycle stored inside history[]."""
    status: Optional[str] = None
    engineer_reason: Optional[str] = None
    admin_comment: Optional[str] = None
    requested_at: Optional[str] = None
    actioned_at: Optional[str] = None

    class Config:
        from_attributes = True


class UnlockRequest(BaseModel):
    """
    Full unlock request object stored as JSONB.
    Lifecycle: PENDING → APPROVED | REJECTED
    Previous cycles moved into history[].
    """
    status: str
    engineer_reason: str
    requested_by: Optional[int] = None
    requested_at: Optional[str] = None
    admin_comment: Optional[str] = None
    actioned_by: Optional[int] = None
    actioned_at: Optional[str] = None
    history: Optional[List[UnlockRequestHistory]] = Field(default_factory=list)

    class Config:
        from_attributes = True


# ─────────────────────────────────────────────
# BASE — shared fields across all schemas
# ─────────────────────────────────────────────

class ExternalUploadBase(BaseModel):
    inward_eqp_id: int

    # ── Calibration Worksheet ──────────────────
    calibration_worksheet_file_name: Optional[str] = Field(None, max_length=255)
    calibration_worksheet_file_type: Optional[str] = Field(None, max_length=255)
    calibration_worksheet_file_url:  Optional[str] = None

    # ── Certificate ────────────────────────────
    certificate_file_name: Optional[str] = Field(None, max_length=255)
    certificate_file_type: Optional[str] = Field(None, max_length=255)
    certificate_file_url:  Optional[str] = None

    # ── Date fields ────────────────────────────
    report_date: Optional[date] = Field(
        default=None,
        description="Report date recorded on the calibration certificate.",
    )
    recommended_cal_due_date: Optional[date] = Field(
        default=None,
        description="Next recommended calibration due date.",
    )

    created_by: Optional[int] = None


# ─────────────────────────────────────────────
# CREATE
# ─────────────────────────────────────────────

class ExternalUploadCreate(ExternalUploadBase):
    """Used when first creating an upload record."""
    pass


# ─────────────────────────────────────────────
# UPDATE — file fields only, no lock fields
# ─────────────────────────────────────────────

class ExternalUploadUpdate(BaseModel):
    """Partial update for file metadata and date fields."""
    calibration_worksheet_file_name: Optional[str] = Field(None, max_length=255)
    calibration_worksheet_file_type: Optional[str] = Field(None, max_length=255)
    calibration_worksheet_file_url:  Optional[str] = None

    certificate_file_name: Optional[str] = Field(None, max_length=255)
    certificate_file_type: Optional[str] = Field(None, max_length=255)
    certificate_file_url:  Optional[str] = None

    report_date: Optional[date] = None
    recommended_cal_due_date: Optional[date] = None


# ─────────────────────────────────────────────
# READ — returned by all endpoints
# ─────────────────────────────────────────────

class ExternalUpload(ExternalUploadBase):
    id: int

    # ── Calibration Worksheet lock state ───────
    calibration_worksheet_locked: bool = Field(
        default=False,
        description="True after engineer uploads. Blocks re-upload/delete.",
    )
    calibration_worksheet_unlock_request: Optional[UnlockRequest] = Field(
        default=None,
        description="Current unlock request lifecycle for the worksheet.",
    )

    # ── Certificate lock state ─────────────────
    certificate_locked: bool = Field(
        default=False,
        description="True after engineer uploads. Blocks re-upload/delete.",
    )
    certificate_unlock_request: Optional[UnlockRequest] = Field(
        default=None,
        description="Current unlock request lifecycle for the certificate.",
    )

    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ─────────────────────────────────────────────
# REQUEST BODIES for lock/unlock endpoints
# ─────────────────────────────────────────────

class RequestUnlockBody(BaseModel):
    """Engineer → POST /request-unlock"""
    doc_type: str = Field(
        ...,
        description="Which file to unlock: 'result' or 'certificate'",
        pattern="^(result|certificate)$",
    )
    reason: str = Field(
        ...,
        min_length=10,
        max_length=500,
        description="Engineer must explain why re-upload is needed.",
    )


class ActionUnlockBody(BaseModel):
    """Admin → POST /action-unlock"""
    doc_type: str = Field(
        ...,
        description="Which file: 'result' or 'certificate'",
        pattern="^(result|certificate)$",
    )
    action: str = Field(
        ...,
        description="Decision: 'APPROVED' or 'REJECTED'",
        pattern="^(APPROVED|REJECTED)$",
    )
    comment: Optional[str] = Field(
        default="",
        max_length=500,
        description="Required when action is REJECTED.",
    )


# ─────────────────────────────────────────────
# RESPONSE HELPERS
# ─────────────────────────────────────────────

class ExternalUploadSummary(BaseModel):
    """Slim version used in table rows."""
    id: int
    inward_eqp_id: int

    # Worksheet
    calibration_worksheet_file_name: Optional[str] = None
    calibration_worksheet_file_url:  Optional[str] = None
    calibration_worksheet_locked:    bool = False
    calibration_worksheet_unlock_status: Optional[str] = Field(
        default=None,
        description="PENDING | APPROVED | REJECTED | null",
    )

    # Certificate
    certificate_file_name: Optional[str] = None
    certificate_file_url:  Optional[str] = None
    certificate_locked:    bool = False
    certificate_unlock_status: Optional[str] = Field(
        default=None,
        description="PENDING | APPROVED | REJECTED | null",
    )

    # Date fields
    report_date: Optional[date] = None
    recommended_cal_due_date: Optional[date] = None

    updated_at: datetime

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_with_status(cls, obj: Any) -> "ExternalUploadSummary":
        ws_req   = obj.calibration_worksheet_unlock_request or {}
        cert_req = obj.certificate_unlock_request or {}

        return cls(
            id=obj.id,
            inward_eqp_id=obj.inward_eqp_id,
            calibration_worksheet_file_name=obj.calibration_worksheet_file_name,
            calibration_worksheet_file_url=obj.calibration_worksheet_file_url,
            calibration_worksheet_locked=obj.calibration_worksheet_locked,
            calibration_worksheet_unlock_status=ws_req.get("status"),
            certificate_file_name=obj.certificate_file_name,
            certificate_file_url=obj.certificate_file_url,
            certificate_locked=obj.certificate_locked,
            certificate_unlock_status=cert_req.get("status"),
            report_date=obj.report_date,
            recommended_cal_due_date=obj.recommended_cal_due_date,
            updated_at=obj.updated_at,
        )
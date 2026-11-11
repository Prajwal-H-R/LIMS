from datetime import date, datetime
from typing import List, Optional, Literal

from pydantic import BaseModel, Field


class CalibrationDueItem(BaseModel):
    certificate_id: int
    certificate_no: str
    recommended_cal_due_date: date
    days_until_due: int

    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None

    inward_id: Optional[int] = None
    srf_no: Optional[str] = None
    customer_dc_no: Optional[str] = None
    customer_dc_date: Optional[date] = None

    inward_eqp_id: Optional[int] = None
    nepl_id: Optional[str] = None
    serial_no: Optional[str] = None
    material_description: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    range: Optional[str] = None
    unit: Optional[str] = None

    status: Optional[str] = None
    issued_at: Optional[datetime] = None

    # Derived metadata from existing tables
    source_type: Literal["INTERNAL", "EXTERNAL"] = "INTERNAL"
    already_in_lab: bool = False
    renewal_inward_id: Optional[int] = None
    renewal_srf_no: Optional[str] = None


class CalibrationCustomerGroup(BaseModel):
    customer_id: int
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    due_count: int = 0
    overdue_count: int = 0
    already_in_lab_count: int = 0
    last_notified_at: Optional[datetime] = None
    certificates: List[CalibrationDueItem] = Field(default_factory=list)


class CalibrationDueSummary(BaseModel):
    window_days: int
    days_back: int = 0
    total_due_count: int
    overdue_count: int = 0
    customer_count: int
    groups: List[CalibrationCustomerGroup] = Field(default_factory=list)


class CalibrationSendRequest(BaseModel):
    days_ahead: int = 7
    dry_run: bool = False


class CalibrationSendResultItem(BaseModel):
    certificate_id: Optional[int] = None
    certificate_no: str
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    due_date: Optional[date] = None
    reminder_subject: Optional[str] = None
    email_sent: bool
    window: Optional[int] = None
    skipped_reason: Optional[str] = None


class CalibrationSendResult(BaseModel):
    window_days: int
    dry_run: bool
    total_candidates: int
    sent_count: int = 0
    sent_emails_count: int = 0
    skipped_count: int
    results: List[CalibrationSendResultItem] = Field(default_factory=list)


class ManualCustomerEmailRequest(BaseModel):
    to_emails: List[str] = Field(..., min_length=1, description="One or more recipient email addresses")
    cc_emails: List[str] = Field(default_factory=list, description="Optional CC email addresses")
    certificate_ids: Optional[List[int]] = Field(
        default=None,
        description="Optional subset of certificate IDs to include; if omitted, sends all due certificates in window",
    )
    days_ahead: int = Field(default=45, ge=1, le=365)
    days_back: int = Field(default=30, ge=0, le=365)
    custom_subject: Optional[str] = Field(default=None, max_length=200)
    custom_note: Optional[str] = Field(default=None, max_length=1000)


class ManualCustomerEmailResponse(BaseModel):
    customer_id: int
    customer_name: str
    recipients: List[str]
    cc_recipients: List[str] = Field(default_factory=list)
    certificate_count: int
    subject: str
    sent_at: datetime
    notification_id: int
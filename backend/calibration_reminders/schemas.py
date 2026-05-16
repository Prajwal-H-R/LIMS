from datetime import date, datetime
from typing import List, Optional

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


class CalibrationCustomerGroup(BaseModel):
    customer_id: int
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    due_count: int = 0
    certificates: List[CalibrationDueItem] = Field(default_factory=list)


class CalibrationDueSummary(BaseModel):
    window_days: int
    total_due_count: int
    customer_count: int
    groups: List[CalibrationCustomerGroup] = Field(default_factory=list)


class CalibrationSendRequest(BaseModel):
    days_ahead: int = 7
    dry_run: bool = False


class CalibrationSendResultItem(BaseModel):
    certificate_id: int
    certificate_no: str
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    due_date: date
    reminder_subject: str
    email_sent: bool
    skipped_reason: Optional[str] = None


class CalibrationSendResult(BaseModel):
    window_days: int
    dry_run: bool
    total_candidates: int
    sent_count: int
    skipped_count: int
    results: List[CalibrationSendResultItem] = Field(default_factory=list)

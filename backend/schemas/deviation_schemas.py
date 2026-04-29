from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class DeviationAttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    file_name: str
    file_type: Optional[str] = None
    file_url: str
    created_at: datetime


class CustomerDeviationItem(BaseModel):
    deviation_id: int
    inward_id: int
    inward_eqp_id: int
    srf_no: Optional[str] = None
    customer_dc_no: Optional[str] = None
    customer_dc_date: Optional[str] = None
    nepl_id: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    serial_no: Optional[str] = None
    job_id: Optional[int] = None
    step_percent: Optional[float] = None
    deviation_percent: Optional[float] = None
    deviation_type: str = "OOT"
    status: str
    tool_status: Optional[str] = None  # Add this
    calibration_status: str = "not calibrated"
    engineer_remarks: Optional[str] = None
    customer_decision: Optional[str] = None
    report: Optional[date] = None
    created_at: Optional[datetime] = None


class CustomerDecisionUpdate(BaseModel):
    """Empty string clears the stored decision."""

    customer_decision: str = Field(default="", max_length=8000)


class EngineerRemarksUpdate(BaseModel):
    """Empty string clears the stored engineer remarks."""

    engineer_remarks: str = Field(default="", max_length=8000)


class ManualDeviationCreate(BaseModel):
    inward_id: int
    inward_eqp_id: int
    job_id: Optional[int] = None
    engineer_remarks: str = Field(min_length=1, max_length=8000)


class OOTStepOut(BaseModel):
    step_percent: Optional[float] = None
    set_torque: Optional[float] = None
    corrected_mean: Optional[float] = None
    deviation_percent: Optional[float] = None


class DeviationDetailOut(BaseModel):
    deviation_id: int
    inward_id: Optional[int] = None
    inward_eqp_id: int
    srf_no: Optional[str] = None
    customer_dc_no: Optional[str] = None
    customer_dc_date: Optional[str] = None
    customer_details: Optional[str] = None
    nepl_id: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    serial_no: Optional[str] = None
    job_id: Optional[int] = None
    repeatability_id: Optional[int] = None
    step_percent: Optional[float] = None
    set_torque: Optional[float] = None
    corrected_mean: Optional[float] = None
    deviation_percent: Optional[float] = None
    deviation_type: str = "OOT"
    certificate_id: Optional[int] = None
    tool_status: Optional[str] = None
    calibration_status: str = "not calibrated"
    engineer_remarks: Optional[str] = None
    customer_decision: Optional[str] = None
    report: Optional[date] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    oot_steps: List[OOTStepOut] = []
    attachments: List[DeviationAttachmentOut] = []

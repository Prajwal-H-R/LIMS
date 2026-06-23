from pydantic import BaseModel, EmailStr, ConfigDict
from datetime import datetime
from typing import List, Any, Optional

class FinalInspectionBase(BaseModel):
    inward_id: int
    srf_no: str
    customer_dc_no: Optional[str] = None
    receiver: Optional[str] = None
    customer_name: str
    customer_email: Optional[str] = None
    equipments: List[Any] = []
    sent_emails: List[Any] = []
    status: str = "PENDING"
    customer_decision: Optional[str] = None  # APPROVED / REJECTED
    customer_remarks: Optional[str] = None
class FinalInspectionResponse(FinalInspectionBase):
    id: int
    report_sent: bool
    report_sent_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class FinalInspectionDecisionRequest(BaseModel):
    decision: str  # "APPROVED" or "REJECTED"
    remarks: Optional[str] = None

    
class FinalInspectionUpdate(BaseModel):
    equipments: Optional[List[Any]] = None
    sent_emails: Optional[List[Any]] = None
    report_sent: Optional[bool] = None
    status: Optional[str] = None
    customer_dc_no: Optional[str] = None
    receiver: Optional[str] = None

class FinalInspectionCreate(BaseModel):
    equipments: Optional[List[Any]] = None
    sent_emails: Optional[List[Any]] = None
    report_sent: Optional[bool] = None
    status: Optional[str] = None
    customer_dc_no: Optional[str] = None
    receiver: Optional[str] = None
# Schema for the frontend's POST request
class FinalReportSendRequest(BaseModel):
    emails: List[EmailStr]
    equipments: List[Any]  # Contains the updated final_remarks
    customer_name: str
    srf_no: str
    # Add other fields if you want to update them during send

class FinalInspectionPage(BaseModel):
    total_count: int
    items: List[FinalInspectionResponse]
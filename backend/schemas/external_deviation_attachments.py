from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List

class AttachmentBase(BaseModel):
    file_name: str
    file_type: Optional[str] = None
    file_url: str

class AttachmentRead(AttachmentBase):
    id: int
    created_at: datetime
    uploaded_by: Optional[int]

    class Config:
        from_attributes = True

class ExternalDeviationRead(BaseModel):
    id: int
    inward_eqp_id: int
    deviation_type: str
    tool_status: str
    step_per_deviation: dict
    engineer_remarks: Optional[str]
    customer_decision: Optional[str]
    attachments: List[AttachmentRead] = []

    class Config:
        from_attributes = True
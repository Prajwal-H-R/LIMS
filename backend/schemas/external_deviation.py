# schemas.py

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any,List
from datetime import date, datetime
from enum import Enum
from backend.schemas.external_deviation_attachments import AttachmentRead


# Enum for deviation_type to enforce valid values
class DeviationTypeEnum(str, Enum):
    oot = "OOT"
    nc = "NC"

# Base schema with common attributes
class ExternalDeviationBase(BaseModel):
    inward_eqp_id: int
    deviation_type: DeviationTypeEnum
    tool_status: Optional[str] = Field(None, max_length=50)
    step_per_deviation: Dict[str, Any]
    created_by: Optional[int] = None
    engineer_remarks: Optional[str] = None
    customer_decision: Optional[str] = None
    report: Optional[date] = None

# Schema for creating a new deviation (used in POST requests)
class ExternalDeviationCreate(ExternalDeviationBase):
    pass

# Schema for updating a deviation (all fields are optional, used in PATCH requests)
class ExternalDeviationUpdate(BaseModel):
    inward_eqp_id: Optional[int] = None
    deviation_type: Optional[DeviationTypeEnum] = None
    tool_status: Optional[str] = Field(None, max_length=50)
    step_per_deviation: Optional[Dict[str, Any]] = None
    created_by: Optional[int] = None
    engineer_remarks: Optional[str] = None
    customer_decision: Optional[str] = None
    report: Optional[date] = None

# Schema for reading/returning a deviation from the API (includes DB-generated fields)
class ExternalDeviation(ExternalDeviationBase):
    id: int
    created_at: datetime
    updated_at: datetime
    attachments: List[AttachmentRead] = []

    class Config:
        from_attributes = True # This allows Pydantic to read data from ORM models
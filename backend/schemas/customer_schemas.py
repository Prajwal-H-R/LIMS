from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import List, Optional, Any
from datetime import date, datetime

# ------------------------------------------------------------------ #
#  REQUEST SCHEMAS                                                      #
# ------------------------------------------------------------------ #

class AccountActivationRequest(BaseModel):
    """Schema for the request to set a password using an invitation token."""
    token: str
    password: str = Field(..., min_length=8, description="New password for the account")


class EquipmentRemarkUpdate(BaseModel):
    """Schema for a single equipment remark update."""
    inward_eqp_id: int
    customer_remark: Optional[str] = ""
    customer_remarks: Optional[str] = None  # alias support
    status: Optional[str] = None


class RemarksSubmissionRequest(BaseModel):
    """Schema for submitting a list of remarks for an inward."""
    remarks: List[EquipmentRemarkUpdate]
    status: Optional[str] = None


# ------------------------------------------------------------------ #
#  BASIC RESPONSE SCHEMAS                                               #
# ------------------------------------------------------------------ #

class EquipmentForCustomer(BaseModel):
    """A simplified view of an Inward Equipment for the customer portal."""
    inward_eqp_id: int
    nepl_id: str
    material_description: Optional[str] = None
    make: Optional[str] = None
    range: Optional[str] = None
    model: Optional[str] = None
    serial_no: Optional[str] = None
    visual_inspection_notes: Optional[str] = None
    engineer_remarks: Optional[str] = None
    customer_remarks: Optional[str] = Field(None, alias="customer_remarks")
    remarks_and_decision: Optional[str] = None
    photos: Optional[List[str]] = None
    status: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class InwardForCustomer(BaseModel):
    """A detailed view of an Inward for the customer, including equipment."""
    inward_id: int
    srf_no: str
    material_inward_date: Optional[date] = None
    date: Optional[date] = None
    created_at: Optional[datetime] = None
    status: str
    customer_dc_no: Optional[str] = None
    equipments: List[EquipmentForCustomer] = []

    model_config = ConfigDict(from_attributes=True)


class InwardListItemForCustomer(BaseModel):
    """A summarized view of an Inward for listing purposes."""
    inward_id: int
    srf_no: str
    material_inward_date: date
    status: str
    equipment_count: int


class CustomerInwardListResponse(BaseModel):
    """The response model for the list of a customer's inwards."""
    inwards: List[InwardListItemForCustomer]


class CustomerSchema(BaseModel):
    """Schema for customer data, including contact details."""
    customer_id: int
    customer_details: Optional[str] = None
    phone: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[EmailStr] = None

    model_config = ConfigDict(from_attributes=True)


class CustomerDropdownResponse(BaseModel):
    """Schema for customer data to be used in dropdowns."""
    customer_id: int
    customer_details: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    ship_to_address: Optional[str] = None
    bill_to_address: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ------------------------------------------------------------------ #
#  TRACKING SCHEMAS                                                     #
# ------------------------------------------------------------------ #

class TimelineStep(BaseModel):
    """
    Represents one step in the equipment tracking timeline.

    status values:
      - "completed"  → step is done (green)
      - "current"    → step is active / in progress (blue)
      - "pending"    → step not yet reached (grey)
      - "terminated" → HTW job was terminated at this step (red)
      - "deviated"   → HTW job is on hold / deviation raised (amber)
    """
    label: str
    status: str
    date: Optional[str] = None
    icon: str


class ActivityLogItem(BaseModel):
    """
    A single entry in the equipment activity log.

    type values (optional, used by UI for colour coding):
      - "info"    (default, blue)
      - "success" (green)
      - "warning" (amber)  – deviation / on-hold
      - "error"   (red)    – terminated
    """
    date: str
    title: str
    description: str
    type: Optional[str] = "info"


class TrackingEquipmentItem(BaseModel):
    """Full tracking detail for one equipment item."""
    nepl_id: str
    inward_eqp_id: int
    srf_no: str
    customer_name: str
    dc_number: Optional[str] = None
    qty: int

    # Raw DB status (e.g. "pending", "dispatched")
    current_status: str

    # Pretty UI label (e.g. "Calibration In Progress", "Terminated", "Deviation Raised")
    display_status: str

    # Optional alert banner text for special states (terminated / deviated)
    alert_message: Optional[str] = None

    timeline: List[TimelineStep]
    activity_log: List[ActivityLogItem]

    expected_completion: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class TrackingResponse(BaseModel):
    """Top-level response for the /track endpoint."""
    search_query: str
    found_via: str
    equipments: List[TrackingEquipmentItem]

    model_config = ConfigDict(from_attributes=True)
"""Pydantic schemas for multi-customer split dispatch batches."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class DispatchDestinationCustomer(BaseModel):
    """Minimal customer/branch details for dropdowns and batch headers."""

    customer_id: int
    customer_details: str
    location_name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    ship_to_address: Optional[str] = None
    bill_to_address: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class AvailableEquipmentItem(BaseModel):
    """One inward equipment with its live calibration status for batch selection."""

    inward_eqp_id: int
    nepl_id: str
    material_description: str = ""
    serial_no: str = ""
    quantity: int = 1
    make: str = ""
    model: str = ""
    range: str = ""
    unit: str = ""
    visual_inspection_notes: str = ""
    accessories_included: str = ""
    engineer_remarks: str = ""
    customer_remarks: str = ""
    job_status: str = "PENDING"
    flow_type: str = "EXTERNAL"


class DispatchBatchItemResponse(AvailableEquipmentItem):
    """Equipment item linked to a specific dispatch batch."""

    id: int
    is_active: bool = True


class DispatchBatchCreate(BaseModel):
    inward_id: int = Field(..., gt=0)
    dispatched_to_customer_id: int = Field(..., gt=0)
    inward_eqp_ids: List[int] = Field(..., min_length=1)
    dispatch_dc_no: Optional[str] = Field(default=None, max_length=100)
    remarks: Optional[str] = None

    model_config = ConfigDict(extra="forbid")

    @field_validator("inward_eqp_ids")
    @classmethod
    def validate_equipment_ids(cls, value: List[int]) -> List[int]:
        deduped = list(dict.fromkeys(value))
        if not deduped:
            raise ValueError("At least one equipment must be selected for a dispatch batch.")
        if any(eq_id <= 0 for eq_id in deduped):
            raise ValueError("All inward_eqp_ids must be positive integers.")
        return deduped


class DispatchBatchUpdate(BaseModel):
    dispatched_to_customer_id: Optional[int] = Field(default=None, gt=0)
    inward_eqp_ids: Optional[List[int]] = None
    dispatch_dc_no: Optional[str] = Field(default=None, max_length=100)
    remarks: Optional[str] = None

    model_config = ConfigDict(extra="forbid")

    @field_validator("inward_eqp_ids")
    @classmethod
    def validate_equipment_ids(cls, value: Optional[List[int]]) -> Optional[List[int]]:
        if value is None:
            return None
        deduped = list(dict.fromkeys(value))
        if not deduped:
            raise ValueError("At least one equipment must remain in the dispatch batch.")
        if any(eq_id <= 0 for eq_id in deduped):
            raise ValueError("All inward_eqp_ids must be positive integers.")
        return deduped


class DispatchBatchCancelRequest(BaseModel):
    remarks: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


class DispatchBatchResponse(BaseModel):
    dispatch_id: int
    inward_id: int
    batch_no: int
    dispatched_to_customer_id: int
    dispatch_dc_no: Optional[str] = None
    status: str
    remarks: Optional[str] = None
    created_by: Optional[int] = None
    dispatched_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    destination_customer: Optional[DispatchDestinationCustomer] = None
    equipment_count: int = 0
    inward_eqp_ids: List[int] = Field(default_factory=list)
    items: List[DispatchBatchItemResponse] = Field(default_factory=list)

    # Linked outbound document summaries for UI navigation & gating
    wcc_id: Optional[int] = None
    wcc_no: Optional[str] = None
    final_inspection_id: Optional[int] = None
    final_inspection_status: Optional[str] = None
    report_sent: bool = False
    customer_decision: Optional[str] = None
    customer_remarks: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class InwardDispatchOverviewResponse(BaseModel):
    """Summary used by staff on the Final Inspection page to split & manage batches."""

    inward_id: int
    srf_no: str
    origin_customer_id: Optional[int] = None
    origin_customer_details: str = ""
    total_equipments: int
    assigned_equipments: int
    remaining_equipments: int
    available_equipments: List[AvailableEquipmentItem] = Field(default_factory=list)
    batches: List[DispatchBatchResponse] = Field(default_factory=list)
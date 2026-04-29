# backend/schemas/equipment_flow_config.py

from pydantic import BaseModel, Field
from datetime import datetime, date
from typing import Optional, List

"""
Pydantic schemas for the Equipment Flow Configuration and workflow routing logic.
"""

# =============================================================================
# Schemas for Equipment Flow Configuration (CRUD)
# =============================================================================

class EquipmentFlowConfigBase(BaseModel):
    equipment_type: str = Field(..., max_length=100)
    # ❌ REMOVED: flow_type: str = Field(..., max_length=50)
    is_active: bool = Field(default=True)

class EquipmentFlowConfigCreate(EquipmentFlowConfigBase):
    pass

class EquipmentFlowConfigUpdate(BaseModel):
    # ❌ REMOVED: flow_type: Optional[str] = Field(None, max_length=50)
    is_active: Optional[bool] = Field(None)

class EquipmentFlowConfig(EquipmentFlowConfigBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True

# ... (rest of the file is unchanged) ...
# =============================================================================
# Schemas for the Core Workflow Routing Logic
# =============================================================================

class WorkflowRouteRequest(BaseModel):
    equipment_type: str

class WorkflowRouteResponse(BaseModel):
    equipment_type: str
    determined_flow: str
    is_default_flow: bool

# =============================================================================
# Schemas for HIGH-PERFORMANCE Manual Calibration Endpoints
# =============================================================================

class ManualSrfGroup(BaseModel):
    """
    Schema for the summarized response of SRF groups (the list view).
    """
    srf_no: str
    customer_name: str
    received_date: date
    equipment_count: int

    class Config:
        orm_mode = True

# ✅ NEW SCHEMA for document details
class ManualEquipmentDocument(BaseModel):
    result: Optional[str] = None
    deviation: Optional[str] = None
    certificate: Optional[str] = None

# ✅ NEW SCHEMA for the "details" endpoint response
class ManualEquipmentDetail(BaseModel):
    """
    Schema for a single piece of equipment within a manual SRF group.
    """
    inward_eqp_id: int
    nepl_id: str
    material_description: str
    # You will need to join with another table to get these document paths
    # For now, we assume a placeholder or a JSONB field.


    class Config:
        orm_mode = True

class SystemDrivenJob(BaseModel):
        inward_id: int
        srf_no: str
        customer_dc_no: str
        customer_dc_date: Optional[date] = None
        status: str
        pending_count: int
        in_progress_count: int
        completed_count: int
        class Config:
            orm_mode = True
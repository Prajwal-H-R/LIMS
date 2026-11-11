from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import date, datetime

class AnalyticsFilter(BaseModel):
    start_date: date = Field(..., description="Start date for the reporting period")
    end_date: date = Field(..., description="End date for the reporting period")
    customer_id: Optional[int] = Field(None, description="Filter by specific customer")

class DashboardSummary(BaseModel):
    total_equipments_received: int
    total_certificates_issued: int
    open_deviations: int
    active_customers: int

class CustomerThroughputResponse(BaseModel):
    customer_id: int
    customer_details: str
    total_inwards: int
    total_srfs: int
    total_equipments: int
    completed_jobs: int
    issued_certificates: int
    last_certificate_dispatched_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)

class StandardExpiryAlert(BaseModel):
    master_standard_id: int
    nomenclature: str
    calibration_valid_upto: date
    days_remaining: int

    model_config = ConfigDict(from_attributes=True)
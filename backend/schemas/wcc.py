# backend/schemas/wcc.py
from datetime import date as Date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class WorkDetailItem(BaseModel):
    """One row in the details_table JSONB array."""

    po_s_no: int | None = None
    description_of_work: str = ""
    uom: str = ""
    quantity_completed: int | float | None = None
    sac_no: str = ""
    status_of_work_completed: str = ""

    model_config = ConfigDict(extra="forbid")


class SignatureDetails(BaseModel):
    """Editable representative/company-seal labels stored in signature_details."""

    representative_and_company_seal_name: str = ""
    vendor_representative_company_seal_name: str = ""

    model_config = ConfigDict(extra="forbid")


class WCCFields(BaseModel):
    # Link to the Final Inspection inward record
    inward_id: int | None = None

    # Vendor details (vendor_code has been removed)
    vendor_company_details: str | None = None
    tax_registration_details: str | None = None

    # Nextage dispatch details
    nextage_dispatch_dc_no: str | None = None
    date: Date | None = None

    # Customer and work location details
    services_delivered_to: str | None = None
    work_location_1: str | None = None
    work_location_2: str | None = None
    work_location_3: str | None = None
    gst_no: str | None = None
    pan_no: str | None = None

    # Certificate and purchase-order details
    wcc_no: str | None = None
    work_start_date: Date | None = None
    work_completion_date: Date | None = None
    po_no: str | None = None
    po_date: Date | None = None
    project_name: str | None = None

    # JSONB data
    details_table: list[WorkDetailItem] = Field(
        default_factory=lambda: [WorkDetailItem()]
    )
    remarks: str | None = None
    signature_details: SignatureDetails = Field(default_factory=SignatureDetails)

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def validate_work_dates(self) -> "WCCFields":
        if (
            self.work_start_date is not None
            and self.work_completion_date is not None
            and self.work_completion_date < self.work_start_date
        ):
            raise ValueError("work_completion_date cannot be before work_start_date")
        return self


class WCCCreate(WCCFields):
    """Request schema for creating a work completion certificate."""


class WCCUpdate(WCCFields):
    """PATCH schema. Only explicitly supplied fields are changed by the service."""


class WCCResponse(WCCFields):
    id: int
    created_at: datetime
    updated_at: datetime

    # Derived from the linked inward record; these are not WCC table columns.
    srf_no: str | None = None
    customer_dc_no: str | None = None

    model_config = ConfigDict(from_attributes=True, extra="forbid")

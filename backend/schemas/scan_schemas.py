from pydantic import BaseModel
from typing import Optional, List
from datetime import date

class DeviceInfo(BaseModel):
    srf_number: Optional[str]
    inward_date: Optional[date]
    dc_number: Optional[str]
    dc_date: Optional[str]
    nepl_id: str

class CustomerInfo(BaseModel):
    company_name: str
    contact_person: Optional[str]
    phone: Optional[str]
    address: Optional[str]

class EquipmentDetails(BaseModel):
    id: str
    description: Optional[str]
    make: Optional[str]
    model: Optional[str]
    range: Optional[str]
    serial_no: Optional[str]
    qty: int
    supplier: Optional[str]
    in_dc: Optional[str]
    out_dc: Optional[str]
    calib_by: Optional[str]
    visual_status: Optional[str]
    eng_remarks: Optional[str]
    cust_remarks: Optional[str]

class StatusFlow(BaseModel):
    inward: bool
    srf: bool
    job: bool
    certificate: bool

class ScanResponse(BaseModel):
    device_info: DeviceInfo
    customer_info: CustomerInfo
    equipment: EquipmentDetails
    status_flow: StatusFlow
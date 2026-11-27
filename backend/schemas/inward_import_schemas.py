# backend/schemas/inward_import_schemas.py

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class ManufacturerSpecOption(BaseModel):
    make: str
    model: str
    range_min: Optional[float] = None
    range_max: Optional[float] = None
    unit: Optional[str] = None
    range_text: str = ""


class ImportMetadataResponse(BaseModel):
    material_descriptions: List[str]
    configured_types: List[str]
    spec_driven_materials: List[str]
    calibration_options: List[str]
    visual_inspection_options: List[str]
    makes: List[str]
    models_by_make: Dict[str, List[ManufacturerSpecOption]]


class ImportFieldIssue(BaseModel):
    field: str
    code: str
    message: str
    suggestion: Optional[str] = None
    valid_options: List[str] = Field(default_factory=list)
    can_add_material: bool = False


class ValidatedEquipmentPayload(BaseModel):
    material_desc: str = ""
    make: str = ""
    model: str = ""
    range: str = ""
    serial_no: str = ""
    qty: int = 1
    calibration_by: Literal["In House(Torque Lab)", "Outsource", "On-Site"] = "In House(Torque Lab)"
    supplier: Optional[str] = None
    in_dc: Optional[str] = None
    out_dc: Optional[str] = None
    accessories_included: str = ""
    inspe_status: Literal["OK", "Not OK"] = "OK"
    engineer_remarks: str = ""


class ValidatedImportRow(BaseModel):
    row_number: int
    status: Literal["valid", "warning", "error"]
    is_spec_driven: bool = False
    raw: Dict[str, str] = Field(default_factory=dict)
    data: ValidatedEquipmentPayload
    errors: List[ImportFieldIssue] = Field(default_factory=list)
    warnings: List[ImportFieldIssue] = Field(default_factory=list)


class ImportValidationResponse(BaseModel):
    filename: str
    file_type: Literal["csv", "xlsx"]
    total_rows: int = 0
    valid_count: int = 0
    warning_count: int = 0
    error_count: int = 0
    can_import: bool = False
    file_errors: List[str] = Field(default_factory=list)
    missing_materials: List[str] = Field(default_factory=list)
    resolved_makes: List[str] = Field(default_factory=list)
    models_by_make: Dict[str, List[str]] = Field(default_factory=dict)
    rows: List[ValidatedImportRow] = Field(default_factory=list)


class RevalidateRowsRequest(BaseModel):
    filename: str = "import.csv"
    file_type: Literal["csv", "xlsx"] = "csv"
    rows: List[Dict[str, Any]]
    known_materials: List[str] = Field(default_factory=list)
    configured_types: List[str] = Field(default_factory=list)

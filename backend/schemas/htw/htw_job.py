from pydantic import BaseModel, Field, validator, model_validator
from datetime import date, datetime
from typing import Optional

# --- SHARED BASE ---
class HTWJobBase(BaseModel):
    inward_id: int
    inward_eqp_id: int
    srf_id: Optional[int] = None
    srf_eqp_id: Optional[int] = None
    
    # Frontend sends 'calibration_date', DB expects 'date'
    calibration_date: Optional[date] = None 
    
    # Frontend sends 'device_type', DB expects 'type'
    device_type: Optional[str] = "indicating"
    classification: Optional[str] = "Type I Class C"
    
    # Numeric values (Frontend might send strings, we handle conversion in Service)
    range_value: Optional[str] = None 
    resolution_pressure_gauge: Optional[str] = None
    
    # These might be sent by frontend but aren't in your specific HTWJob table
    # We define them here so the API doesn't reject them
    range_unit: Optional[str] = None
    resolution_unit: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    serial_no: Optional[str] = None
    material_nomenclature: Optional[str] = None
    calibration_mode: Optional[str] = None


# --- CREATE SCHEMA (Input) ---
class HTWJobCreate(HTWJobBase):
    class Config:
        populate_by_name = True

# ... (existing code in schemas/htw_job.py) ...

class JobStatusUpdate(BaseModel):
    job_status: str


# --- RESPONSE SCHEMA (Output) ---
class HTWJobResponse(BaseModel):
    job_id: int
    inward_eqp_id: int
    
    # Map DB 'date' -> Frontend 'calibration_date'
    calibration_date: Optional[date] = Field(alias="date")
    
    # Map DB 'type' -> Frontend 'device_type'
    device_type: Optional[str] = Field(alias="type")
    
    classification: Optional[str]
    job_status: Optional[str]
    created_at: Optional[datetime]
    
    # Numeric fields from DB
    range_min: Optional[float]
    range_max: Optional[float]
    res_pressure: Optional[float]

    # --- FLATTENING RELATIONSHIPS ---
    # Since 'make', 'model' are not in HTWJob, we fetch them from 'inward_equipment'
    srf_no: Optional[str] = None
    nepl_id: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    serial_no: Optional[str] = None
    material_nomenclature: Optional[str] = None
    range_value: Optional[str] = None
    range_unit: Optional[str] = None

    @validator("make", "model", "serial_no", "material_nomenclature", pre=True, always=True)
    def extract_from_relation(cls, v, values):
        """
        If the value is missing in HTWJob, try to pull it from the 
        linked 'inward_equipment' relationship object provided by SQLAlchemy.
        """
        # 'inward_equipment' is the relationship name in your SQL Model
        eqp = values.get("inward_equipment") 
        if eqp:
            # Map fields dynamically based on which field we are validating
            field_name = values.get("_curr_field_name") # Internal logic helper or manual map below
            # Since we can't easily get current field name in older pydantic versions inside validator easily without context:
            return v 
        return v

    # Custom validator to populate fields from the relationship manually
    @validator("make", always=True, pre=True)
    def get_make(cls, v, values):
        eqp = values.get("inward_equipment")
        return eqp.make if eqp and hasattr(eqp, 'make') else v

    @validator("model", always=True, pre=True)
    def get_model(cls, v, values):
        eqp = values.get("inward_equipment")
        return eqp.model if eqp and hasattr(eqp, 'model') else v

    @validator("serial_no", always=True, pre=True)
    def get_serial(cls, v, values):
        eqp = values.get("inward_equipment")
        return eqp.serial_no if eqp and hasattr(eqp, 'serial_no') else v
    
    @validator("material_nomenclature", always=True, pre=True)
    def get_nomenclature(cls, v, values):
        eqp = values.get("inward_equipment")
        return eqp.material_description if eqp and hasattr(eqp, 'material_description') else v

    # Reconstruct range string from min/max for frontend display
    @validator("range_value", always=True, pre=True)
    def get_range_str(cls, v, values):
        r_min = values.get("range_min")
        r_max = values.get("range_max")
        if r_min is not None and r_max is not None:
            return f"{r_min} - {r_max}"
        return v

    @model_validator(mode="before")
    @classmethod
    def inject_nepl_id_from_equipment(cls, data):
        """When building from ORM, add nepl_id from equipment_rel."""
        if hasattr(data, "equipment_rel") and not isinstance(data, dict):
            eqp = data.equipment_rel
            base = {k: getattr(data, k, None) for k in ("job_id", "inward_eqp_id", "date", "type", "classification", "job_status", "created_at", "range_min", "range_max", "res_pressure")}
            base["nepl_id"] = eqp.nepl_id if eqp else None
            inward = getattr(data, "inward_rel", None)
            base["srf_no"] = (inward.srf_no if inward and hasattr(inward, "srf_no") else None) or ""
            if eqp:
                base["make"] = getattr(eqp, "make", None)
                base["model"] = getattr(eqp, "model", None)
                base["serial_no"] = getattr(eqp, "serial_no", None)
                base["material_nomenclature"] = getattr(eqp, "material_description", None)
            return base
        return data

    class Config:
        from_attributes = True
        populate_by_name = True
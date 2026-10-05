from pydantic import BaseModel, Field, model_validator
from datetime import date, datetime
from typing import Optional, List


# =========================================================
# BASE INPUT SCHEMA
# =========================================================
class HTWJobBase(BaseModel):
    inward_id: int
    inward_eqp_id: int
    srf_id: Optional[int] = None
    srf_eqp_id: Optional[int] = None

    calibration_date: Optional[date] = None
    device_type: Optional[str] = "indicating"
    classification: Optional[str] = "Type I Class C"

    range_value: Optional[str] = None
    resolution_pressure_gauge: Optional[str] = None

    range_unit: Optional[str] = None
    resolution_unit: Optional[str] = None

    make: Optional[str] = None
    model: Optional[str] = None
    serial_no: Optional[str] = None
    material_nomenclature: Optional[str] = None
    calibration_mode: Optional[str] = None


# =========================================================
# CREATE SCHEMA
# =========================================================
class HTWJobCreate(HTWJobBase):
    class Config:
        populate_by_name = True


# =========================================================
# STATUS UPDATE SCHEMA
# =========================================================
class JobStatusUpdate(BaseModel):
    job_status: str


# =========================================================
# RESPONSE SCHEMA
# =========================================================
class HTWJobResponse(BaseModel):
    job_id: int
    inward_eqp_id: int

    # Removed the alias, map this directly in flatten_orm
    calibration_date: Optional[date] = None
    device_type: Optional[str] = None

    classification: Optional[str] = None
    job_status: Optional[str] = None
    created_at: Optional[datetime] = None
    
    range_min: Optional[float] = None
    range_max: Optional[float] = None
    res_pressure: Optional[float] = None

    # flattened fields
    srf_no: Optional[str] = None
    nepl_id: Optional[str] = None

    make: Optional[str] = None
    model: Optional[str] = None
    serial_no: Optional[str] = None
    material_nomenclature: Optional[str] = None

    range_value: Optional[str] = None
    range_unit: Optional[str] = None
    calibration_mode: Optional[str] = None
    
    resolution_pressure_gauge: Optional[float] = None
    resolution_unit: Optional[str] = None

    # =====================================================
    # CLEAN ORM FLATTENING (ONE SOURCE OF TRUTH)
    # =====================================================
    @model_validator(mode="before")
    @classmethod
    def flatten_orm(cls, data):
        """
        Converts SQLAlchemy ORM object → clean API response
        """
        if isinstance(data, dict) or data is None:
            return data

        eqp = getattr(data, "equipment_rel", None)
        inward = getattr(data, "inward_rel", None)

        range_min = getattr(data, "range_min", None)
        range_max = getattr(data, "range_max", None)
        res_pressure = getattr(data, "res_pressure", None)
        res_pressure_unit = getattr(data, "res_pressure_unit", None)

        return {
            "job_id": getattr(data, "job_id", None),
            "inward_eqp_id": getattr(data, "inward_eqp_id", None),

            # --- FIX IS HERE ---
            # Map DB 'date' to API 'calibration_date'
            "calibration_date": getattr(data, "date", None),
            # Map DB 'type' to API 'device_type'
            "device_type": getattr(data, "type", None),
            
            "classification": getattr(data, "classification", None),
            "calibration_mode": getattr(data, "calibration_mode", None),
            "job_status": getattr(data, "job_status", None),
            "created_at": getattr(data, "created_at", None),

            "range_min": range_min,
            "range_max": range_max,
            "res_pressure": res_pressure,

            # Computed fields
            "range_value": f"{range_min} - {range_max}" if range_min is not None and range_max is not None else None,
            "resolution_pressure_gauge": res_pressure,
            "resolution_unit": res_pressure_unit,
            # Inward equipment relationships
            "nepl_id": getattr(eqp, "nepl_id", None) if eqp else None,
            "make": getattr(eqp, "make", None) if eqp else None,
            "model": getattr(eqp, "model", None) if eqp else None,
            "serial_no": getattr(eqp, "serial_no", None) if eqp else None,
            "material_nomenclature": getattr(eqp, "material_description", None) if eqp else None,
            "range_unit": getattr(eqp, "range_unit", None) if eqp else None,

            # Inward relationships
            "srf_no": getattr(inward, "srf_no", None) if inward else None,
        }

    class Config:
        from_attributes = True
        populate_by_name = True


# =========================================================
# PAGINATED RESPONSE SCHEMA
# =========================================================
class HTWJobListResponse(BaseModel):
    total_count: int
    jobs: List[HTWJobResponse]

class HTWJobUpdate(BaseModel):
    range_value: Optional[str] = None
    resolution_pressure_gauge: Optional[str] = None
    resolution_unit: Optional[str] = None         # <-- Add this line
    calibration_date: Optional[date] = None
    device_type: Optional[str] = None
    classification: Optional[str] = None
    calibration_mode: Optional[str] = None
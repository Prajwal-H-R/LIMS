from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, Literal, List
from datetime import datetime
from decimal import Decimal


# -------------------------
# INPUT
# -------------------------
class HTWJobEnvironmentBase(BaseModel):
    condition_stage: Literal["PRE", "POST"]
    ambient_temperature: Decimal
    temperature_unit: str = "°C"
    relative_humidity: Decimal
    humidity_unit: str = "%"

    @field_validator("ambient_temperature", "relative_humidity")
    @classmethod
    def validate_numeric(cls, v):
        if isinstance(v, str):
            v = Decimal(v)
        return v

    @model_validator(mode="after")
    def no_partial(self):
        if self.ambient_temperature is None or self.relative_humidity is None:
            raise ValueError("Both temperature and humidity are required")
        return self


class HTWJobEnvironmentCreate(HTWJobEnvironmentBase):
    pass


# -------------------------
# DATA (ORM → API)
# -------------------------
class HTWJobEnvironmentData(BaseModel):
    id: int
    job_id: int
    # Made Optional to handle legacy records where this might be NULL
    environment_config_id: Optional[int] = None  
    condition_stage: str
    ambient_temperature: Decimal
    temperature_unit: str
    relative_humidity: Decimal
    humidity_unit: str
    recorded_at: datetime

    class Config:
        from_attributes = True


# -------------------------
# VALIDATION RESULT
# -------------------------
class HTWJobEnvironmentValidationResponse(BaseModel):
    is_temperature_in_range: bool
    is_humidity_in_range: bool
    is_valid: bool
    warnings: List[str]
    blocks_job_flow: bool
    
    # Optional: Return the limits used for this validation for UI display
    limit_temp_min: Optional[Decimal] = None
    limit_temp_max: Optional[Decimal] = None
    limit_humidity_min: Optional[Decimal] = None
    limit_humidity_max: Optional[Decimal] = None


# -------------------------
# FINAL RESPONSE
# -------------------------
class HTWJobEnvironmentResponse(BaseModel):
    data: HTWJobEnvironmentData
    validation: HTWJobEnvironmentValidationResponse
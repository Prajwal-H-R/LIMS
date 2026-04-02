# backend/schemas/htw/htw_environment_config.py

from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field, model_validator

class HTWEnvironmentConfigBase(BaseModel):
    temp_min: float = Field(..., description="Minimum allowed temperature (e.g. 20.00)")
    temp_max: float = Field(..., description="Maximum allowed temperature (e.g. 25.00)")
    humidity_min: float = Field(..., description="Minimum allowed humidity percentage (e.g. 30.00)")
    humidity_max: float = Field(..., description="Maximum allowed humidity percentage (e.g. 60.00)")

class HTWEnvironmentConfigCreate(HTWEnvironmentConfigBase):
    """
    Schema for creating a new configuration.
    Includes validation to ensure min < max.
    """
    @model_validator(mode='after')
    def check_ranges(self):
        if self.temp_min > self.temp_max:
            raise ValueError('temp_min cannot be greater than temp_max')
        if self.humidity_min > self.humidity_max:
            raise ValueError('humidity_min cannot be greater than humidity_max')
        return self

class HTWEnvironmentConfigUpdate(BaseModel):
    """
    Schema for updating. All fields are optional.
    """
    temp_min: Optional[float] = None
    temp_max: Optional[float] = None
    humidity_min: Optional[float] = None
    humidity_max: Optional[float] = None

class HTWEnvironmentConfigResponse(HTWEnvironmentConfigBase):
    """
    Schema for reading data (returns ID and timestamps).
    """
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
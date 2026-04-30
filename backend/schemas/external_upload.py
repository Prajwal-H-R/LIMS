from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class ExternalUploadBase(BaseModel):
    inward_eqp_id: int
    
    # All file fields are now optional
    calibration_worksheet_file_name: Optional[str] = Field(None, max_length=255)
    calibration_worksheet_file_type: Optional[str] = Field(None, max_length=255)
    calibration_worksheet_file_url: Optional[str] = None
    
    certificate_file_name: Optional[str] = Field(None, max_length=255)
    certificate_file_type: Optional[str] = Field(None, max_length=255)
    certificate_file_url: Optional[str] = None
    
    created_by: Optional[int] = None

# This schema is no longer the primary way to create records,
# but it's good to keep it aligned.
class ExternalUploadCreate(ExternalUploadBase):
    pass

class ExternalUploadUpdate(BaseModel):
    # This can be used for bulk updates if needed later
    calibration_worksheet_file_name: Optional[str] = Field(None, max_length=255)
    calibration_worksheet_file_type: Optional[str] = Field(None, max_length=255)
    calibration_worksheet_file_url: Optional[str] = None
    
    certificate_file_name: Optional[str] = Field(None, max_length=255)
    certificate_file_type: Optional[str] = Field(None, max_length=255)
    certificate_file_url: Optional[str] = None

class ExternalUpload(ExternalUploadBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True
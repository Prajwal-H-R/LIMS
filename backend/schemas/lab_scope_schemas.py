# backend/schemas/lab_scope_schemas.py

from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime


class LabScopeBase(BaseModel):
    laboratory_name: str
    accreditation_standard: Optional[str] = None
    lab_unique_number: Optional[str] = None
    valid_from: Optional[date] = None
    valid_upto: Optional[date] = None
    is_active: bool = False


class LabScopeCreate(LabScopeBase):
    pass


class LabScopeUpdate(BaseModel):
    laboratory_name: Optional[str] = None
    accreditation_standard: Optional[str] = None
    lab_unique_number: Optional[str] = None
    valid_from: Optional[date] = None
    valid_upto: Optional[date] = None
    is_active: Optional[bool] = None


class LabScopeResponse(LabScopeBase):
    id: int
    document_filename: Optional[str] = None
    has_document: bool = False
    updated_by: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

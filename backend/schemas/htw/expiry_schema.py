from pydantic import BaseModel
from datetime import date
from typing import List

class ExpiryCheckRequest(BaseModel):
    reference_date: date  # This represents the "browser's date"

class ExpiryCheckResponse(BaseModel):
    message: str
    affected_tables: List[str]
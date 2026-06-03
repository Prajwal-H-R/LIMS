from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.db import get_db
from backend.schemas.scan_schemas import ScanResponse
from backend.services import scan_service

router = APIRouter()

@router.get("/scan/{nepl_id}", response_model=ScanResponse)
def get_equipment_by_scan(nepl_id: str, db: Session = Depends(get_db)):
    return scan_service.get_scan_details(db, nepl_id)
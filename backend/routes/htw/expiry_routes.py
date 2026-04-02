from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.db import get_db
from backend.schemas.htw.expiry_schema import (
    ExpiryCheckRequest,
    ExpiryCheckResponse
    )
from backend.services.htw.expiry_service import (
    deactivate_expired_records,
)

router = APIRouter(
    prefix="/calibration",
    tags=["Calibration"]
)

@router.post("/check-expiry", response_model=ExpiryCheckResponse)
def check_and_update_expiry(
    request: ExpiryCheckRequest,
    db: Session = Depends(get_db)
):
    """
    Checks multiple tables for records where 'valid_upto' is less than the provided date.
    Sets 'is_active' to False for those records.
    Returns a list of tables that had updates.
    """
    try:
        updated_tables_list =deactivate_expired_records(
            db=db, 
            browser_date=request.reference_date
        )
        
        return {
            "message": "Calibration expiry check completed successfully.",
            "affected_tables": updated_tables_list
        }
    except Exception as e:
        # In case of DB error, rollback changes
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
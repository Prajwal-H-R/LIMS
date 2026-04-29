# routes.py

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional # Make sure Optional is imported
from backend.schemas.deviation_schemas import DeviationDetailOut
from backend.services import deviation_service as unified_svc

from backend.schemas import external_deviation as schemas
from backend.services import external_deviation as services
from backend.db import get_db

router = APIRouter(
    prefix="/external-deviations",
    tags=["External Deviations"],
    responses={404: {"description": "Not found"}},
)

@router.post("/", response_model=schemas.ExternalDeviation, status_code=status.HTTP_201_CREATED)
def create_new_external_deviation(
    deviation: schemas.ExternalDeviationCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new external deviation record.
    """
    return services.create_external_deviation(db=db, deviation=deviation)


# --- MODIFIED ROUTE ---
@router.get("/", response_model=List[schemas.ExternalDeviation])
def read_all_external_deviations(
    inward_eqp_id: Optional[int] = None, # Add this to accept a query parameter like ?inward_eqp_id=123
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    Retrieve external deviation records.
    - If `inward_eqp_id` is provided, returns records for that specific equipment.
    - Otherwise, returns all records with pagination.
    """
    # Pass the inward_eqp_id to the service function
    deviations = services.get_external_deviations(
        db, inward_eqp_id=inward_eqp_id, skip=skip, limit=limit
    )
    return deviations


@router.get("/{deviation_id}", response_model=schemas.ExternalDeviation)
def read_single_external_deviation(deviation_id: int, db: Session = Depends(get_db)):
    """
    Retrieve a single external deviation by its ID.
    """
    db_deviation = services.get_external_deviation(db, deviation_id=deviation_id)
    if db_deviation is None:
        raise HTTPException(status_code=404, detail="External deviation not found")
    return db_deviation

@router.patch("/{deviation_id}", response_model=DeviationDetailOut) # CHANGED response_model
def update_existing_external_deviation(
    deviation_id: int,
    deviation_update: schemas.ExternalDeviationUpdate,
    db: Session = Depends(get_db)
):
    """
    Update an existing external deviation.
    Returns the full, unified DeviationDetailOut schema for the frontend.
    """
    # Step 1: Update the record in the database using your existing service.
    updated_deviation = services.update_external_deviation(db, deviation_id, deviation_update)
    if updated_deviation is None:
        raise HTTPException(status_code=404, detail="External deviation not found")

    # Step 2: After successfully updating, fetch the complete, unified view of the record.
    # We use the get_deviation_detail_for_staff function which is an expert at this.
    # It expects a NEGATIVE ID for external deviations, so we pass -deviation_id.
    unified_detail = unified_svc.get_deviation_detail_for_staff(db, deviation_id=-deviation_id)
    
    if unified_detail is None:
        # This is a safety net; it should not happen if the update succeeded.
        raise HTTPException(status_code=404, detail="Could not retrieve unified detail for the updated deviation")

    # Step 3: Return the complete, unified object to the frontend.
    return unified_detail

@router.delete("/{deviation_id}", response_model=schemas.ExternalDeviation)
def delete_an_external_deviation(deviation_id: int, db: Session = Depends(get_db)):
    """
    Delete an external deviation by its ID.
    """
    deleted_deviation = services.delete_external_deviation(db, deviation_id=deviation_id)
    if deleted_deviation is None:
        raise HTTPException(status_code=404, detail="External deviation not found")
    return deleted_deviation
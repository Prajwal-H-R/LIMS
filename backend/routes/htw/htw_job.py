# services/htw_job.py

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ...db import get_db
from ...schemas.htw.htw_job import HTWJobCreate, HTWJobResponse, JobStatusUpdate
from ...services.htw import htw_job as service

# --- NEW IMPORTS for the "Finish Job" endpoint ---
from ...services.htw.htw_repeatability_services import finalize_htw_job
# We also import the LockGuard from the generalized service file
from ...services.lock_service import LockGuard
# --------------------------------------------------

router = APIRouter(prefix="/htw-jobs", tags=["HTW Jobs"])

@router.post("/", response_model=HTWJobResponse)
def create_or_update_htw_job(job_data: HTWJobCreate, db: Session = Depends(get_db)):
    """
    Creates a new HTW Job based on technical details.

    1. Validates that all HTW Standard tables have data.
    2. If validation passes, creates or updates the job.
    """
    service.validate_all_standards_present(db)
    return service.create_job(db, job_data)


@router.get("/", response_model=List[HTWJobResponse])
def list_jobs(
    inward_eqp_id: Optional[int] = Query(None, description="Filter by inward equipment id"),
    skip: int = Query(0, ge=0),
    limit: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
):
    """
    Lists all HTW jobs, with optional filtering.
    """
    return service.get_jobs(db, inward_eqp_id=inward_eqp_id, skip=skip, limit=limit)


@router.patch(
    "/{job_id}",
    response_model=HTWJobResponse,
    dependencies=[Depends(LockGuard(entity_type="HTW_JOB", id_param_name="job_id"))]
)
def update_job_status(job_id: int, status_data: JobStatusUpdate, db: Session = Depends(get_db)):
    """
    Updates the status of a specific HTW job.
    This is a generic status update endpoint, protected by a lock.
    """
    job = service.get_job_by_id(db, job_id=job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job.job_status = status_data.job_status
    db.commit()
    db.refresh(job)

    return job

# ====================================================================
# START: NEW "FINISH JOB" ENDPOINT
# ====================================================================
@router.post(
    "/{job_id}/finish",
    summary="Finalize HTW Job",
    dependencies=[Depends(LockGuard(entity_type="HTW_JOB", id_param_name="job_id"))]
)
def finish_htw_job_and_create_deviation_if_oot(
    job_id: int,
    db: Session = Depends(get_db)
):
    """
    Finalizes a job. This endpoint should be called when the engineer clicks the 
    "Finish and Exit" button after completing all calibration steps.

    This critical process performs the following actions:
    1.  Validates that the job is ready for completion (e.g., environment data is present).
    2.  Scans all `HTWRepeatability` records for the job to check for Out-of-Tolerance (OOT) conditions.
    3.  **If OOT is found:** Creates an official `Deviation` record and sets the job status to `Completed - OOT`.
    4.  **If no OOT is found:** Sets the job status to `Calibrated`.
    5.  Commits the changes to the database.
    """
    try:
        result = finalize_htw_job(db, job_id)
        return result
    except ValueError as e:
        # Handles validation errors from the service, like missing data
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Generic error handler for unexpected issues
        db.rollback()
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred during job finalization: {e}")
# ====================================================================
# END: NEW "FINISH JOB" ENDPOINT
# ====================================================================
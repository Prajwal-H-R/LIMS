# services/htw_job.py
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ...db import get_db
from ...schemas.htw.htw_job import HTWJobCreate, HTWJobResponse, JobStatusUpdate
from ...services.htw import htw_job as service

# --- NEW IMPORT ---
# We import the LockGuard from the generalized service file
from ...services.lock_service import LockGuard
# ------------------

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
    return service.get_jobs(db, inward_eqp_id=inward_eqp_id, skip=skip, limit=limit)


@router.patch(
    "/{job_id}",
    response_model=HTWJobResponse,
    dependencies=[Depends(LockGuard(entity_type="HTW_JOB", id_param_name="job_id"))]
)
def update_job_status(job_id: int, status_data: JobStatusUpdate, db: Session = Depends(get_db)):
    job = service.get_job_by_id(db, job_id=job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job.job_status = status_data.job_status
    db.commit()
    db.refresh(job)

    return job
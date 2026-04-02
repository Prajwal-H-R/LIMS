from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional

from backend.db import get_db
from backend.services.htw.htw_job_environment_service import HTWJobEnvironmentService
from backend.schemas.htw.htw_job_environment_schemas import (
    HTWJobEnvironmentCreate,
    HTWJobEnvironmentResponse
)

# Prefix: /api/staff/jobs (Assuming main.py mounts this with /api)
router = APIRouter(
    prefix="/staff/jobs",
    tags=["HTW Job Environment"]
)

# --------------------------
# 1. GET Pre-Status (Fixes the 404 Error)
# --------------------------
@router.get("/{job_id}/environment/pre-status")
def check_pre_environment_status(
    job_id: int, 
    db: Session = Depends(get_db)
):
    """
    Checks if a PRE environment record exists for the job.
    Used by frontend to unlock calibration steps.
    """
    service = HTWJobEnvironmentService(db)
    # Check if any "PRE" record exists
    records = service.get_environment_by_job(job_id, stage="PRE")
    return {"pre_is_valid": len(records) > 0}

# --------------------------
# 2. GET Post-Status
# --------------------------
@router.get("/{job_id}/environment/post-status")
def check_post_environment_status(
    job_id: int, 
    db: Session = Depends(get_db)
):
    """
    Checks if a POST environment record exists for the job.
    Used by frontend to determine job completion status.
    """
    service = HTWJobEnvironmentService(db)
    records = service.get_environment_by_job(job_id, stage="POST")
    return {"post_is_valid": len(records) > 0}

# --------------------------
# 3. GET Environment Data (List)
# --------------------------
@router.get("/{job_id}/environment", response_model=List[HTWJobEnvironmentResponse])
def get_job_environment(
    job_id: int, 
    condition_stage: Optional[str] = None, 
    db: Session = Depends(get_db)
):
    """
    Fetches the environment records for a given job.
    Returns an empty list [] if no records exist.
    """
    service = HTWJobEnvironmentService(db)
    return service.get_environment_by_job(job_id, condition_stage)

# --------------------------
# 4. POST Environment (Create/Save)
# --------------------------
@router.post("/{job_id}/environment", response_model=HTWJobEnvironmentResponse)
def create_job_environment(
    job_id: int,
    payload: HTWJobEnvironmentCreate,
    db: Session = Depends(get_db)
):
    """
    Saves a new environment record (Pre or Post check).
    Validates values against the active/historical configuration.
    """
    service = HTWJobEnvironmentService(db)
    
    # The service returns tuple: (record, validation_result)
    record, validation = service.create_environment(job_id, payload)
    
    return {
        "data": record,
        "validation": validation
    }
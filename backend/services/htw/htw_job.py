from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError
from sqlalchemy import text
from fastapi import HTTPException
from typing import Optional
import re
 
from backend.models.htw.htw_job import HTWJob
from backend.schemas.htw.htw_job import HTWJobCreate
from backend.services.htw.htw_job_standard_selection import auto_select_standards_for_job
 
# --- 1. Validation Function ---
def validate_all_standards_present(db: Session):
    """
    Checks if required reference tables have data.
    Raises 400 if tables are empty, preventing job creation.
    """
    # List of tables that MUST have data
    required_tables = {
        "htw_cmc_reference": "Hydraulic CMC Backup data",
        "htw_const_coverage_factor": "Coverage Factor (k)",
        "htw_manufacturer_spec": "Manufacturer Specifications",
        "htw_master_standard": "Master Standard Details",
        "htw_max_val_measure_err": "Max Val of Measurement Error",
        "htw_nomenclature_range": "Nomenclature Range",
        "htw_pressure_gauge_resolution": "Resolution of Pressure Gauge",
        "htw_standard_uncertainty_reference": "Interpolation Ranges",
        "htw_t_distribution": "Student t Table",
        "htw_un_pg_master": "Uncertainty of Pressure Gauge (Un-PG)",
        "htw_tool_type": "Tool Type",
        "htw_environment_config": "Environment Configuration"  # ✅ Added Environment Config to required tables
    }

    empty_tables = []
   
    # Check each table
    for table in required_tables:
        query = text(f"SELECT EXISTS (SELECT 1 FROM {table} LIMIT 1)")
        try:
            has_data = db.execute(query).scalar()
            if not has_data:
                empty_tables.append(required_tables[table])  # ✅ use label
        except Exception:
            empty_tables.append(required_tables[table])      # ✅ use label

    if empty_tables:
        print(f"--- DEBUG: Job Creation Blocked. Missing data in: {empty_tables} ---")
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "MISSING_STANDARDS",
                "message": "Required reference standards are missing.",
                "missing_tables": empty_tables  # now contains labels
            }
        )
   
    return True
# --- 2. Helper Functions ---
def parse_range_string(range_str: str):
    if not range_str:
        return None, None
    clean_str = re.sub(r'[a-zA-Z%]+', '', range_str)
    numbers = [float(n) for n in re.findall(r"[-+]?\d*\.\d+|\d+", clean_str)]
    if len(numbers) >= 2:
        return min(numbers), max(numbers)
    elif len(numbers) == 1:
        return 0.0, numbers[0]
    return None, None
 
def get_jobs(db: Session, inward_eqp_id: Optional[int] = None, skip: int = 0, limit: int = 100):
    query = (
        db.query(HTWJob)
        .options(
            joinedload(HTWJob.equipment_rel),
            joinedload(HTWJob.inward_rel),
        )
    )
    if inward_eqp_id is not None:
        query = query.filter(HTWJob.inward_eqp_id == inward_eqp_id)
    return query.offset(skip).limit(limit).all()
 
def get_job_by_id(db: Session, job_id: int):
    return db.query(HTWJob).filter(HTWJob.job_id == job_id).first()
 
def get_srf_ids(db: Session, inward_eqp_id: int):
    try:
        with db.begin_nested():
            query = text("""
                SELECT se.srf_id, se.srf_eqp_id
                FROM inward_equipments ie
                JOIN srf_equipments se ON ie.srf_eqp_id = se.srf_eqp_id
                WHERE ie.inward_eqp_id = :id
            """)
            result = db.execute(query, {"id": inward_eqp_id}).fetchone()
            if result:
                return result.srf_id, result.srf_eqp_id
            return None, None
    except Exception:
        return None, None
 
# --- 3. Main Create Job Function ---
def create_job(db: Session, job_data: HTWJobCreate):
   
    # STEP A: Strict Validation - Stop here if tables are empty
    validate_all_standards_present(db)
 
    print(f"--- DEBUG: Validation Passed. Creating job for inward_eqp_id: {job_data.inward_eqp_id} ---")
 
    # Data Parsing
    r_min, r_max = parse_range_string(job_data.range_value)
    res_val = None
    if job_data.resolution_pressure_gauge:
        try:
            clean_res = re.sub(r'[a-zA-Z%]+', '', job_data.resolution_pressure_gauge)
            res_val = float(clean_res)
        except ValueError:
            res_val = None
 
    db_srf_id, db_srf_eqp_id = get_srf_ids(db, job_data.inward_eqp_id)
    final_srf_id = db_srf_id if db_srf_id else job_data.srf_id
    final_srf_eqp_id = db_srf_eqp_id if db_srf_eqp_id else job_data.srf_eqp_id
 
    # STEP B: Creation with Atomic Transaction
    try:
        existing_job = db.query(HTWJob).filter(HTWJob.inward_eqp_id == job_data.inward_eqp_id).first()
       
        if existing_job:
            # UPDATE LOGIC
            existing_job.srf_id = final_srf_id
            existing_job.srf_eqp_id = final_srf_eqp_id
            existing_job.range_min = r_min
            existing_job.range_max = r_max
            existing_job.res_pressure = res_val
            existing_job.date = job_data.calibration_date
            existing_job.type = job_data.device_type
            existing_job.classification = job_data.classification
           
            db.flush()
           
            # Re-run selection
            auto_select_standards_for_job(
                db=db,
                job_id=existing_job.job_id,
                inward_eqp_id=job_data.inward_eqp_id,
                job_date=job_data.calibration_date
            )
           
            db.commit()
            db.refresh(existing_job)
            return existing_job
        else:
            # CREATE LOGIC
            db_job = HTWJob(
                inward_id=job_data.inward_id,
                inward_eqp_id=job_data.inward_eqp_id,
                srf_id=final_srf_id,
                srf_eqp_id=final_srf_eqp_id,
                date=job_data.calibration_date,
                range_min=r_min,
                range_max=r_max,
                res_pressure=res_val,
                type=job_data.device_type,
                classification=job_data.classification,
                job_status="Created"
            )
           
            db.add(db_job)
            db.flush() # Generate ID, do not commit
           
            # Auto-select standards
            auto_select_standards_for_job(
                db=db,
                job_id=db_job.job_id,
                inward_eqp_id=job_data.inward_eqp_id,
                job_date=job_data.calibration_date
            )
           
            db.commit() # Commit only if both succeed
            db.refresh(db_job)
            return db_job
 
    except Exception as e:
        db.rollback() # Rollback everything on error
        print(f"--- ERROR: Job Creation Rolled Back: {str(e)} ---")
        # Pass the specific error message to frontend
        raise HTTPException(status_code=400, detail=str(e))
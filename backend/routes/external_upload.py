import os
import uuid
import shutil
import logging
import traceback
from pathlib import Path
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
    File,
    UploadFile,
    Form,
    Request
)
from sqlalchemy.orm import Session
from typing import Optional

from ..services import external_upload_service as service
from ..schemas import external_upload as schemas
from backend.db import get_db

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

router = APIRouter(
    tags=["Manual Calibration Uploads"],
    responses={404: {"description": "Not found"}},
)

# --- NEW GET ENDPOINT TO FETCH DOCUMENT DETAILS ---
@router.get("/manual-calibration/equipment/{inward_eqp_id}/documents", response_model=schemas.ExternalUpload)
def get_upload_details(inward_eqp_id: int, db: Session = Depends(get_db)):
    """
    Retrieves the details of uploaded documents for a specific piece of equipment.
    This is used by the frontend to know which files have already been uploaded.
    """
    db_upload = service.get_upload_by_equipment_id(db, inward_eqp_id=inward_eqp_id)
    
    # If no record exists for this equipment, it's not an error, it just means no
    # files have been uploaded yet. The frontend needs to handle this.
    # However, returning a 404 is the correct RESTful approach.
    if db_upload is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No uploaded documents found for this equipment.",
        )
    return db_upload
@router.delete("/manual-calibration/equipment/{inward_eqp_id}/document/{doc_type}", response_model=schemas.ExternalUpload)
def handle_document_delete(
    inward_eqp_id: int,
    doc_type: str,
    db: Session = Depends(get_db)
):
    """
    Deletes a specific document by setting its URL and name to NULL in the database.
    """
    updated_record = service.delete_document_for_equipment(db, inward_eqp_id, doc_type)
    
    if updated_record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No upload record found for this equipment to delete from."
        )
    
    return updated_record
# --- EXISTING POST ENDPOINT FOR UPLOADING ---
@router.post("/manual-calibration/equipment/{inward_eqp_id}/upload", response_model=schemas.ExternalUpload)
async def handle_document_upload(
    request: Request,
    inward_eqp_id: int,
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
    doc_type: str = Form(...),
):
    """
    Handles uploading a single document ('result', 'certificate', 'deviation')
    for a specific piece of equipment.
    """
    allowed_doc_types = ["result", "certificate", "deviation"]
    if doc_type not in allowed_doc_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid doc_type '{doc_type}'. Must be one of {allowed_doc_types}",
        )

    try:
        unique_id = uuid.uuid4().hex
        sanitized_filename = os.path.basename(file.filename)
        saved_filename = f"{unique_id}_{sanitized_filename}"
        file_path = UPLOAD_DIR / saved_filename
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        logger.error("Failed to save the uploaded file to disk.", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"There was an error saving the file: {e}")
    finally:
        file.file.close()

    file_url = f"/api/uploads/{saved_filename}"     
    
    try:
        db_upload_record = service.upsert_document_for_equipment(
            db=db,
            inward_eqp_id=inward_eqp_id,
            doc_type=doc_type,
            file_name=file.filename,
            file_content_type=file.content_type,
            file_url=file_url,
            user_id=None
        )
        return db_upload_record
    except ValueError as e:
        logger.warning(f"A known value error occurred during DB upsert: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error("An unexpected error occurred while updating the database record.", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="An internal server error occurred. Please check server logs for details.")
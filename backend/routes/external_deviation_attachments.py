import json
from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from backend.db import get_db
from backend.services.external_deviation_attachments import DeviationAttachmentService
# Import the schemas you provided
from backend.schemas.external_deviation_attachments import ExternalDeviationRead, AttachmentRead

router = APIRouter(prefix="/external-deviations", tags=["Deviations"])

@router.get("/", response_model=List[ExternalDeviationRead])
async def get_deviation(inward_eqp_id: int, db: Session = Depends(get_db)):
    deviation = DeviationAttachmentService.get_deviation_by_eqp_id(db, inward_eqp_id)
    if not deviation:
        return []
    # Log to server console to see if attachments exist before sending
    if deviation:
        print(f"DEBUG: Found {len(deviation.attachments)} attachments for EQP {inward_eqp_id}")
    return [deviation]

# FIX: Added response_model=ExternalDeviationRead
@router.post("/", response_model=ExternalDeviationRead)
async def create_deviation_with_files(
    data: str = Form(...), 
    files: List[UploadFile] = File(None), 
    db: Session = Depends(get_db)
):
    try:
        deviation_dict = json.loads(data)
        # Note: Ensure user_id logic matches your auth system
        return await DeviationAttachmentService.create_deviation_with_attachments(
            db, deviation_dict, files or [], user_id=1
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{deviation_id}/attachments", response_model=AttachmentRead)
async def upload_single_attachment(
    deviation_id: int, 
    file: UploadFile = File(...), 
    db: Session = Depends(get_db)
):
    return await DeviationAttachmentService.save_attachment(db, deviation_id, file, user_id=1)

@router.delete("/attachments/{attachment_id}")
def delete_attachment(attachment_id: int, db: Session = Depends(get_db)):
    success = DeviationAttachmentService.delete_attachment(db, attachment_id)
    if not success:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return {"message": "Deleted successfully"}
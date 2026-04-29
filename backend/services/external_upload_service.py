from sqlalchemy.orm import Session
from typing import Optional

from ..models import external_upload as models
from ..schemas import external_upload as schemas

def get_upload_by_equipment_id(db: Session, inward_eqp_id: int) -> Optional[models.ExternalUpload]:
    """
    Retrieve an external_upload record by the equipment ID.
    """
    return db.query(models.ExternalUpload).filter(models.ExternalUpload.inward_eqp_id == inward_eqp_id).first()

def upsert_document_for_equipment(
    db: Session,
    inward_eqp_id: int,
    doc_type: str,
    file_name: str,
    file_content_type: Optional[str],
    file_url: str,
    user_id: Optional[int] = None,
) -> models.ExternalUpload:
    """
    Creates or updates an external_upload record for a specific equipment ID
    and populates the correct document fields based on doc_type.
    """
    # 1. Find if a record already exists for this equipment
    db_upload = get_upload_by_equipment_id(db, inward_eqp_id)

    # 2. If it doesn't exist, create a new one
    if not db_upload:
        db_upload = models.ExternalUpload(
            inward_eqp_id=inward_eqp_id,
            created_by=user_id
        )
        db.add(db_upload)

    # 3. Update the fields based on the document type from the frontend
    if doc_type == "result":
        db_upload.calibration_worksheet_file_name = file_name
        db_upload.calibration_worksheet_file_type = file_content_type
        db_upload.calibration_worksheet_file_url = file_url
    elif doc_type == "certificate":
        db_upload.certificate_file_name = file_name
        db_upload.certificate_file_type = file_content_type
        db_upload.certificate_file_url = file_url
    elif doc_type == "deviation":
        # --- IMPORTANT ---
        # This will fail until you add 'deviation' columns to the model and DB.
        # Once added, uncomment the lines below.
        # db_upload.deviation_file_name = file_name
        # db_upload.deviation_file_type = file_content_type
        # db_upload.deviation_file_url = file_url
        print(f"WARNING: Received 'deviation' doc_type, but no database column is configured.")
        # For now, we can raise an error or just ignore it. Let's ignore it to not break the UI.
        pass
    else:
        # If an unknown doc_type is sent, we can raise an error
        raise ValueError(f"Unknown document type: {doc_type}")

    # 4. Commit and refresh
    db.commit()
    db.refresh(db_upload)
    return db_upload

# In backend/services/external_upload_service.py

def delete_document_for_equipment(
    db: Session,
    inward_eqp_id: int,
    doc_type: str,
) -> Optional[models.ExternalUpload]:
    """
    Finds the external_upload record and nullifies the fields for a specific doc_type.
    """
    db_upload = get_upload_by_equipment_id(db, inward_eqp_id)

    if not db_upload:
        # If no record exists, there's nothing to delete.
        return None

    # Based on the doc_type, set the corresponding fields to None
    if doc_type == "result":
        db_upload.calibration_worksheet_file_name = None
        db_upload.calibration_worksheet_file_type = None
        db_upload.calibration_worksheet_file_url = None
    elif doc_type == "certificate":
        db_upload.certificate_file_name = None
        db_upload.certificate_file_type = None
        db_upload.certificate_file_url = None
    elif doc_type == "deviation":
        # When you add deviation columns, you'll nullify them here
        # db_upload.deviation_file_name = None
        # etc.
        pass
    else:
        raise ValueError(f"Unknown document type for deletion: {doc_type}")

    db.commit()
    db.refresh(db_upload)
    return db_upload
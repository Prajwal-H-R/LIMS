import os
import uuid
from fastapi import UploadFile
from sqlalchemy.orm import Session, joinedload
from backend.models.external_deviation import ExternalDeviation 
from backend.models.external_deviation_attachments import ExternalDeviationAttachment

UPLOAD_DIR = "backend/uploads/deviations"

class DeviationAttachmentService:
    @staticmethod
    def get_deviation_by_eqp_id(db: Session, inward_eqp_id: int):
        """Fetches the deviation and EAGERLY LOADS attachments using joinedload"""
        return db.query(ExternalDeviation).options(
            joinedload(ExternalDeviation.attachments)
        ).filter(
            ExternalDeviation.inward_eqp_id == inward_eqp_id
        ).first()

    @staticmethod
    async def save_physical_file(file: UploadFile):
        if not os.path.exists(UPLOAD_DIR):
            os.makedirs(UPLOAD_DIR, exist_ok=True)

        unique_filename = f"{uuid.uuid4()}_{file.filename}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)
        
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Returns the URL path used by the frontend to access the file
        return f"/api/uploads/deviations/{unique_filename}", file.filename, file.content_type

    @staticmethod
    async def create_deviation_with_attachments(db: Session, deviation_data: dict, files: list[UploadFile], user_id: int):
        try:
            new_deviation = ExternalDeviation(**deviation_data)
            db.add(new_deviation)
            db.flush() 

            if files:
                for file in files:
                    file_url, file_name, file_type = await DeviationAttachmentService.save_physical_file(file)
                    attachment = ExternalDeviationAttachment(
                        external_deviation_id=new_deviation.id,
                        file_name=file_name,
                        file_type=file_type,
                        file_url=file_url,
                        uploaded_by=user_id
                    )
                    db.add(attachment)

            db.commit()
            
            # FIX: Fetch the newly created record WITH the attachments joined
            # This ensures the response sent back to React has the 'attachments' key populated
            return DeviationAttachmentService.get_deviation_by_eqp_id(db, new_deviation.inward_eqp_id)
            
        except Exception as e:
            db.rollback()
            raise e

    @staticmethod
    async def save_attachment(db: Session, deviation_id: int, file: UploadFile, user_id: int):
        file_url, file_name, file_type = await DeviationAttachmentService.save_physical_file(file)
        attachment = ExternalDeviationAttachment(
            external_deviation_id=deviation_id,
            file_name=file_name,
            file_type=file_type,
            file_url=file_url,
            uploaded_by=user_id
        )
        db.add(attachment)
        db.commit()
        db.refresh(attachment)
        return attachment

    @staticmethod
    def delete_attachment(db: Session, attachment_id: int):
        attachment = db.query(ExternalDeviationAttachment).filter_by(id=attachment_id).first()
        if attachment:
            db.delete(attachment)
            db.commit()
            return True
        return False
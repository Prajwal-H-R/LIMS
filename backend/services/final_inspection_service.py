from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime
from backend.models import FinalInspection # Adjust import based on your structure
from backend.schemas.final_inspection import FinalInspectionCreate, FinalInspectionUpdate

class FinalInspectionService:
    @staticmethod
    def create(db: Session, obj_in: FinalInspectionCreate):
        db_obj = FinalInspection(**obj_in.model_dump())
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    @staticmethod
    def get_by_id(db: Session, inspection_id: int):
        return db.query(FinalInspection).filter(FinalInspection.id == inspection_id).first()

    @staticmethod
    def get_multi(db: Session, skip: int = 0, limit: int = 100):
        return db.query(FinalInspection).offset(skip).limit(limit).all()

    @staticmethod
    def update(db: Session, db_obj: FinalInspection, obj_in: FinalInspectionUpdate):
        update_data = obj_in.model_dump(exclude_unset=True)
        
        # Logic for report_sent_at timestamp
        if update_data.get("report_sent") is True and not db_obj.report_sent:
            update_data["report_sent_at"] = datetime.now()

        for field in update_data:
            setattr(db_obj, field, update_data[field])

        db.commit()
        db.refresh(db_obj)
        return db_obj
    @staticmethod
    def get_by_inward_id(db: Session, inward_id: int):
    # This will return the whole model instance including the 'id' field
        return db.query(FinalInspection).filter(FinalInspection.inward_id == inward_id).first()
    @staticmethod
    def delete(db: Session, inspection_id: int):
        db_obj = db.query(FinalInspection).filter(FinalInspection.id == inspection_id).first()
        if db_obj:
            db.delete(db_obj)
            db.commit()
        return db_obj
        
    @staticmethod
    def update_decision(db: Session, db_obj: FinalInspection, decision: str, remarks: Optional[str]):
        db_obj.customer_decision = decision
        db_obj.customer_remarks = remarks
        # Update status based on decision
        if decision == "APPROVED":
            db_obj.status = "APPROVED"
        else:
            db_obj.status = "REJECTED"
            
        db.commit()
        db.refresh(db_obj)
        return db_obj
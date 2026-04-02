# backend/models/lab_scope.py

from sqlalchemy import Column, Integer, String, Text, Boolean, Date, TIMESTAMP, ForeignKey, LargeBinary, func
from backend.db import Base


class LabScope(Base):
    __tablename__ = "lab_scope"

    id = Column(Integer, primary_key=True, index=True)
    laboratory_name = Column(String(255), nullable=False)
    accreditation_standard = Column(String(255), nullable=True)
    lab_unique_number = Column(String(100), nullable=True)
    # Map API/model attribute names to existing DB column names.
    valid_from = Column("validity_from", Date, nullable=True)
    valid_upto = Column("validity_upto", Date, nullable=True)
    is_active = Column(Boolean, default=False)
    document_data = Column(LargeBinary, nullable=True)
    document_filename = Column(String(255), nullable=True)
    document_content_type = Column(String(128), nullable=True)
    updated_by = Column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), onupdate=func.now())

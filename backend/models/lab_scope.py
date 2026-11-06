# backend/models/lab_scope.py

from sqlalchemy import Boolean, Column, Date, ForeignKey, Integer, String, TIMESTAMP, func
from backend.db import Base


class LabScope(Base):
    __tablename__ = "lab_scope"

    id = Column(Integer, primary_key=True, index=True)
    laboratory_name = Column(String(255), nullable=False)
    accreditation_standard = Column(String(255), nullable=True)
    lab_unique_number = Column(String(100), nullable=True)
    # Map API/model attribute names to the existing database column names.
    valid_from = Column(Date, nullable=True)
    valid_upto = Column(Date, nullable=True)
    is_active = Column(Boolean, default=False)

    # The file contents live under UPLOADS_DIR/lab_scope. PostgreSQL stores
    # only the original filename, generated disk basename and MIME type.
    document_filename = Column(String(255), nullable=True)
    document_storage_name = Column(String(255), nullable=True)
    document_content_type = Column(String(128), nullable=True)

    updated_by = Column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), onupdate=func.now())

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    ForeignKey,
    TIMESTAMP,
    func,
)
from sqlalchemy.orm import relationship
from backend.db import Base
from backend.models.users import User
class ExternalUpload(Base):
    """
    SQLAlchemy model for the 'external_uploads' table.
    Updated to allow nullable file fields to support one-by-one uploads.
    """
    __tablename__ = "external_uploads"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True, autoincrement=True, nullable=False)
    # Ensure this FK is unique to have a 1-to-1 relationship with inward_equipments
    inward_eqp_id = Column(
        Integer,
        ForeignKey("inward_equipments.inward_eqp_id", ondelete="CASCADE"),
        nullable=False,
        unique=True  # Important for the "upsert" logic
    )

    # Calibration worksheet file (maps to 'result' from frontend)
    calibration_worksheet_file_name = Column(String(255), nullable=True)
    calibration_worksheet_file_type = Column(String(50), nullable=True)
    calibration_worksheet_file_url = Column(Text, nullable=True)

    # Certificate file (maps to 'certificate' from frontend)
    certificate_file_name = Column(String(255), nullable=True)
    certificate_file_type = Column(String(50), nullable=True)
    certificate_file_url = Column(Text, nullable=True)
    
    # --- FUTURE EXPANSION for 'deviation' ---
    # To support 'deviation' uploads, add these columns to your table and model:
    # deviation_file_name = Column(String(255), nullable=True)
    # deviation_file_type = Column(String(50), nullable=True)
    # deviation_file_url = Column(Text, nullable=True)
    # ------------------------------------------

    # Timestamps and user tracking
    created_by = Column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
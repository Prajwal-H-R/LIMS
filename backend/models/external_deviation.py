# models.py

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Date,
    DateTime,
    ForeignKey,
    func
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from backend.db import Base
from backend.models.users import User
from backend.models.external_deviation_attachments import ExternalDeviationAttachment
# --- Placeholder Models for Foreign Keys ---
# Assuming these tables/models exist elsewhere in your application.
# If they don't, SQLAlchemy will still create the foreign key constraint
# but relationships won't work without a mapped class.

class ExternalDeviation(Base):
    __tablename__ = "external_deviation"

    id = Column(Integer, primary_key=True, index=True)
    
    inward_eqp_id = Column(
        Integer,
        ForeignKey("inward_equipments.inward_eqp_id", ondelete="CASCADE"),
        nullable=False
    )
    
    deviation_type = Column(String(20), nullable=False)
    tool_status = Column(String(50), nullable=True)
    
    step_per_deviation = Column(JSONB, nullable=False)
    
    created_by = Column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    
    engineer_remarks = Column(Text, nullable=True)
    customer_decision = Column(Text, nullable=True)
    report = Column(Date, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    inward_equipment = relationship("InwardEquipment", back_populates="deviations")
    creator = relationship("User", back_populates="created_deviations")
    attachments = relationship(
        "ExternalDeviationAttachment",
        back_populates="external_deviation",  # Must match the name in the other model
        cascade="all, delete-orphan",
        lazy="joined" # This ensures attachments are always loaded
    )
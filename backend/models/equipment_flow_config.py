# backend/models/equipment_flow_config.py

from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    TIMESTAMP,
    func
)

from backend.db import Base

class EquipmentFlowConfig(Base):
    """
    SQLAlchemy ORM model for the equipment_flow_config table.

    This table enables a configuration-driven approach to determine the calibration
    workflow for each equipment type. It eliminates hardcoded logic by dynamically
    routing equipment to the appropriate flow (e.g., system-driven or external/manual).
    """
    __tablename__ = "equipment_flow_config"

    # --- Columns ---

    # Primary key for the configuration record.
    id = Column(Integer, primary_key=True)

    # The unique type of equipment (e.g., 'HTW', 'Pressure Gauge').
    # Indexed for fast lookups during workflow routing.
    # Marked as unique to prevent duplicate configurations for the same equipment type.
    equipment_type = Column(String(100), nullable=False, unique=True, index=True)

    # A flag to enable or disable this routing rule without deleting the record.
    # If a rule is inactive, the system will fall back to the default workflow.
    is_active = Column(Boolean, nullable=False, default=True)

    # Timestamp indicating when the configuration record was created.
    # The database will automatically set this value upon insertion.
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    # Timestamp indicating the last time the record was updated.
    # The database will automatically update this value on any modification.
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # --- Relationships ---
    # This table is a configuration leaf node and does not have direct relationships
    # to other tables in this model definition. Other services will query it directly.

    def __repr__(self):
        """Provides a developer-friendly string representation of the object."""
        return (
            f"<EquipmentFlowConfig(id={self.id}, "
            f"equipment_type='{self.equipment_type}', "
        )
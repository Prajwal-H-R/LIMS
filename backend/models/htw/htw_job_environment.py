# backend/models/htw_job_environment.py
 
from sqlalchemy import (
    Column,
    Integer,
    String,
    Numeric,
    TIMESTAMP,
    func,
    CheckConstraint,
    UniqueConstraint,
    ForeignKey,
)
from sqlalchemy.orm import relationship
from backend.db import Base
 
 
class HTWJobEnvironment(Base):
    __tablename__ = "htw_job_environment"
 
    id = Column(Integer, primary_key=True, index=True)
 
    job_id = Column(
        Integer,
        ForeignKey("htw_job.job_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
 
    # ✅ NEW: Foreign key to config table
    environment_config_id = Column(
        Integer,
        ForeignKey("htw_environment_config.id", ondelete="SET NULL"),
        nullable=True,
    )
 
    condition_stage = Column(String(10), nullable=False)  # PRE / POST
 
    ambient_temperature = Column(Numeric(5, 2), nullable=False)
    temperature_unit = Column(String(10), default="°C")
 
    relative_humidity = Column(Numeric(5, 2), nullable=False)
    humidity_unit = Column(String(10), default="%")
 
    recorded_at = Column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
 
    __table_args__ = (
        CheckConstraint(
            "condition_stage IN ('PRE', 'POST')",
            name="check_condition_stage",
        ),
        UniqueConstraint(
            "job_id",
            "condition_stage",
            name="unique_job_condition_stage",
        ),
    )
 
    # Relationships
    job = relationship("HTWJob", back_populates="environments")
 
    # ✅ NEW: relationship to config
    environment_config = relationship(
    "HTWEnvironmentConfig",
    back_populates="environments",
    )
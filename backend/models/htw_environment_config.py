# backend/models/htw/htw_environment_config.py

from sqlalchemy import Column, Integer, Numeric, TIMESTAMP, func
from backend.db import Base
from sqlalchemy.orm import relationship


class HTWEnvironmentConfig(Base):
    __tablename__ = "htw_environment_config"

    id = Column(Integer, primary_key=True, index=True)

    # Temperature range
    temp_min = Column(Numeric(5, 2), nullable=False)
    temp_max = Column(Numeric(5, 2), nullable=False)

    # Humidity range
    humidity_min = Column(Numeric(5, 2), nullable=False)
    humidity_max = Column(Numeric(5, 2), nullable=False)

    created_at = Column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    updated_at = Column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # ✅ CORRECT RELATIONSHIP
    environments = relationship(
        "HTWJobEnvironment",
        back_populates="environment_config",
    )
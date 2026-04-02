#lims-phase-2/backend/license/license_models.py
from sqlalchemy import Column, Integer, Date, Text, String, TIMESTAMP
from backend.db import Base

class LicenseMaster(Base):
    __tablename__ = "license_master"

    id = Column(Integer, primary_key=True)
    valid_from = Column(Date, nullable=False)
    valid_until = Column(Date, nullable=False)
    last_checked_date = Column(Date, nullable=False)
    checksum = Column(Text, nullable=False)
    last_extended_by = Column(String(100))
    last_extended_at = Column(TIMESTAMP)

class LicenseAudit(Base):
    __tablename__ = "license_audit"

    id = Column(Integer, primary_key=True)
    old_valid_until = Column(Date)
    new_valid_until = Column(Date)
    extended_by = Column(String(100))
    extended_at = Column(TIMESTAMP)

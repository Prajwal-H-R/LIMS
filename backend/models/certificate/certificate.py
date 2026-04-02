# backend/models/htw_certificate.py

from sqlalchemy import (
    Column, Integer, String, Date, TIMESTAMP, Text,
    ForeignKey, func
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from backend.db import Base


class HTWCertificate(Base):
    __tablename__ = "certificate"

    certificate_id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(Integer, ForeignKey("htw_job.job_id", ondelete="CASCADE"), nullable=False)
    inward_id = Column(Integer, ForeignKey("inward.inward_id", ondelete="CASCADE"), nullable=True)
    inward_eqp_id = Column(Integer, ForeignKey("inward_equipments.inward_eqp_id", ondelete="CASCADE"), nullable=True)

    certificate_no = Column(String(255), nullable=False)
    date_of_calibration = Column(Date, nullable=False)
    ulr_no = Column(String(255), nullable=True)
    field_of_parameter = Column(String(255), nullable=True)
    recommended_cal_due_date = Column(Date, nullable=True)
    item_status = Column(String(255), nullable=True, default="Satisfactory")  # Status of item on Receipt

    authorised_signatory = Column(String(255), nullable=True)
    status = Column(String(50), nullable=False, default="DRAFT")
    admin_rework_comment = Column(Text, nullable=True)

    # Persisted ISO 6789 conformity values for certificate table F.
    # Stored as 3-row arrays (template requirement).
    permissible_deviation_iso_6789 = Column(JSONB, nullable=True)
    iso_6789_results = Column(JSONB, nullable=True)

    created_by = Column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    approved_by = Column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    approved_at = Column(TIMESTAMP(timezone=True), nullable=True)
    issued_at = Column(TIMESTAMP(timezone=True), nullable=True)

    job_rel = relationship("HTWJob", backref="certificates")

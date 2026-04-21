from sqlalchemy import Column, Integer, String, Text, Date, TIMESTAMP, ForeignKey, func
from sqlalchemy.orm import relationship

from backend.db import Base


class Deviation(Base):
    __tablename__ = "deviation"

    id = Column(Integer, primary_key=True, autoincrement=True)

    inward_eqp_id = Column(
        Integer,
        ForeignKey("inward_equipments.inward_eqp_id", ondelete="CASCADE"),
        nullable=False,
    )
    certificate_id = Column(
        Integer,
        ForeignKey("htw_certificate.certificate_id", ondelete="SET NULL"),
        nullable=True,
    )
    repeatability_id = Column(
        Integer,
        ForeignKey("htw_repeatability.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_by = Column(
        Integer,
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )

    status = Column(String(50), nullable=False, server_default="OPEN")
    calibration_status = Column(String(50), nullable=False, server_default="not calibrated")
    engineer_remarks = Column(Text, nullable=True)
    customer_decision = Column(Text, nullable=True)
    report = Column(Date, nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    attachments = relationship(
        "DeviationAttachment",
        back_populates="deviation",
        cascade="all, delete-orphan",
    )

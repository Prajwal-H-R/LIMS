from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    ForeignKey,
    TIMESTAMP,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from backend.db import Base
from backend.models.users import User


class ExternalUpload(Base):
    """
    SQLAlchemy model for the 'external_uploads' table.
    Supports one-by-one uploads with independent lock/unlock
    per file (calibration worksheet & certificate).
    """
    __tablename__ = "external_uploads"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True, autoincrement=True, nullable=False)

    inward_eqp_id = Column(
        Integer,
        ForeignKey("inward_equipments.inward_eqp_id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    # ── Calibration Worksheet ──────────────────────────────────────────
    calibration_worksheet_file_name = Column(String(255), nullable=True)
    calibration_worksheet_file_type = Column(String(255), nullable=True)
    calibration_worksheet_file_url  = Column(Text, nullable=True)

    # Lock flag — set TRUE automatically after upload
    calibration_worksheet_locked = Column(Boolean, nullable=False, default=False)

    # Unlock request lifecycle stored as JSONB
    # Shape:
    # {
    #   "status": "PENDING" | "APPROVED" | "REJECTED",
    #   "engineer_reason": "...",
    #   "requested_by": <user_id>,
    #   "requested_at": "<ISO timestamp>",
    #   "admin_comment": "..." | null,
    #   "actioned_by": <user_id> | null,
    #   "actioned_at": "<ISO timestamp>" | null,
    #   "history": [ ...previous requests ]
    # }
    calibration_worksheet_unlock_request = Column(JSONB, nullable=True, default=None)

    # ── Certificate ────────────────────────────────────────────────────
    certificate_file_name = Column(String(255), nullable=True)
    certificate_file_type = Column(String(50),  nullable=True)
    certificate_file_url  = Column(Text, nullable=True)

    # Lock flag — set TRUE automatically after upload
    certificate_locked = Column(Boolean, nullable=False, default=False)

    # Unlock request lifecycle stored as JSONB (same shape as above)
    certificate_unlock_request = Column(JSONB, nullable=True, default=None)

    # ── Audit ──────────────────────────────────────────────────────────
    created_by = Column(
        Integer,
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at = Column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # ── Relationships ──────────────────────────────────────────────────
    creator = relationship("User", foreign_keys=[created_by])
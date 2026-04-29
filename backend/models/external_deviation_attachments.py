from sqlalchemy import Column, Integer, String, Text, TIMESTAMP, ForeignKey, func
from sqlalchemy.orm import relationship

from backend.db import Base


class ExternalDeviationAttachment(Base):
    __tablename__ = "external_deviation_attachments"

    id = Column(Integer, primary_key=True, autoincrement=True)

    external_deviation_id = Column(
        Integer,
        ForeignKey("external_deviation.id", ondelete="CASCADE"),
        nullable=False,
    )

    file_name = Column(String(255), nullable=False)
    file_type = Column(String(50), nullable=True)
    file_url = Column(Text, nullable=False)

    uploaded_by = Column(
        Integer,
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at = Column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    external_deviation = relationship(
        "ExternalDeviation",
        back_populates="attachments"
    )
    
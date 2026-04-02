# backend/models/refresh_token.py

from datetime import datetime, timezone
from typing import Optional, TYPE_CHECKING
from sqlalchemy import DateTime, ForeignKey, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db import Base

if TYPE_CHECKING:
    from .users import User


class RefreshToken(Base):
    """SQLAlchemy model for the refresh_tokens table."""
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.user_id"),
        nullable=False,
        index=True
    )

    token: Mapped[str] = mapped_column(
        Text,
        unique=True,
        nullable=False
    )

    # ✅ timezone-aware (UTC)
    expiry_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False
    )

    is_revoked: Mapped[Optional[int]] = mapped_column(
        default=0
    )

    # ✅ standardized UTC
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP")
    )

    user: Mapped["User"] = relationship(
        back_populates="refresh_tokens"
    )

    def __repr__(self) -> str:
        return (
            f"RefreshToken("
            f"user_id={self.user_id}, "
            f"expiry_time={self.expiry_time}, "
            f"revoked={self.is_revoked})"
        )
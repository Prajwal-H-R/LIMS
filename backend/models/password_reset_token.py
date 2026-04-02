# backend/models/password_reset_token.py

from datetime import datetime, timezone
from typing import TYPE_CHECKING
from sqlalchemy import DateTime, ForeignKey, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db import Base

if TYPE_CHECKING:
    from .users import User


class PasswordResetToken(Base):
    """SQLAlchemy model for the password_reset_tokens table."""
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.user_id"),
        nullable=False,
        index=True
    )

    token: Mapped[str] = mapped_column(
        unique=True,
        nullable=False,
        index=True
    )

    # ✅ FIX: timezone-aware column
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False
    )

    is_used: Mapped[bool] = mapped_column(
        default=False,
        nullable=False
    )

    # ✅ FIX: timezone-aware + UTC default
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP")
    )

    user: Mapped["User"] = relationship(
        back_populates="password_reset_tokens"
    )

    def __repr__(self) -> str:
        return (
            f"PasswordResetToken("
            f"user_id={self.user_id}, "
            f"expires_at={self.expires_at}, "
            f"is_used={self.is_used})"
        )
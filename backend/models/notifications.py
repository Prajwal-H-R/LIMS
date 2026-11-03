import json

from sqlalchemy import (
    Column,
    ForeignKey,
    Integer,
    String,
    Text,
    TIMESTAMP,
    event,
    func,
    text,
)
from sqlalchemy.orm import relationship

from backend.db import Base


# PostgreSQL channel used by the authenticated notification SSE endpoint.
# Keep this value in sync with backend/routes/notifications.py.
PROFILE_NOTIFICATION_CHANNEL = "ylims_profile_notifications"


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True)
    recipient_user_id = Column(Integer, ForeignKey("users.user_id"))
    to_email = Column(String(255))
    inward_id = Column(Integer, ForeignKey("inward.inward_id"))
    subject = Column(Text)
    body_text = Column(Text)
    email_sent_at = Column(TIMESTAMP(timezone=True))
    created_at = Column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    created_by = Column(String(255))
    status = Column(String(30), default="pending")
    error = Column(Text)

    # Relationships
    recipient = relationship("User", back_populates="notifications")
    inward = relationship("Inward", back_populates="notifications")


def _publish_profile_notification_event(connection, target, action: str) -> None:
    """Publish a lightweight event after a profile notification is inserted/updated.

    PostgreSQL delivers NOTIFY messages only after the surrounding transaction
    commits. The payload deliberately contains identifiers only; the client
    retrieves the authoritative notification details through GET /notifications.
    """
    if target.recipient_user_id is None:
        return

    # Match the existing GET /notifications endpoint's filter exactly.
    if target.created_by != "profile_update" or target.inward_id is not None:
        return

    payload = json.dumps(
        {
            "notification_id": int(target.id),
            "recipient_user_id": int(target.recipient_user_id),
            "action": action,
        }
    )

    connection.execute(
        text("SELECT pg_notify(:channel, :payload)"),
        {
            "channel": PROFILE_NOTIFICATION_CHANNEL,
            "payload": payload,
        },
    )


@event.listens_for(Notification, "after_insert")
def _notify_after_insert(mapper, connection, target) -> None:
    _publish_profile_notification_event(connection, target, "created")


@event.listens_for(Notification, "after_update")
def _notify_after_update(mapper, connection, target) -> None:
    _publish_profile_notification_event(connection, target, "updated")

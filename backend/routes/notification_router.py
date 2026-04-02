from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.auth import get_current_user
from backend.db import get_db
from backend.models.notifications import Notification
from backend.schemas.notification_schemas import AdminNotificationsResponse, AdminNotificationItem

router = APIRouter(tags=["Notifications"])


@router.get("/notifications", response_model=AdminNotificationsResponse)
async def get_admin_profile_update_notifications(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role.lower() not in ("admin", "engineer"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Must be an administrator or engineer.",
        )

    stmt = (
        select(Notification)
        .where(
            Notification.recipient_user_id == current_user.user_id,
            Notification.created_by == "profile_update",
            Notification.inward_id.is_(None),
        )
        .order_by(Notification.created_at.desc())
        .limit(50)
    )

    notifications = db.scalars(stmt).all()
    return AdminNotificationsResponse(
        notifications=[
            AdminNotificationItem(
                id=n.id,
                subject=n.subject,
                body_text=n.body_text,
                created_at=n.created_at,
                status=n.status,
                error=n.error,
            )
            for n in notifications
        ]
    )

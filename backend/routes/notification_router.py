import asyncio
import json
import logging
import select
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select as sqlalchemy_select
from sqlalchemy.orm import Session

from backend.auth import get_current_user
from backend.db import get_db
from backend.models.notifications import (
    Notification,
    PROFILE_NOTIFICATION_CHANNEL,
)
from backend.schemas.notification_schemas import (
    AdminNotificationItem,
    AdminNotificationsResponse,
)


router = APIRouter(tags=["Notifications"])
logger = logging.getLogger(__name__)


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
        sqlalchemy_select(Notification)
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


def _wait_for_postgres_notifications(connection, timeout_seconds: int = 10) -> List[Any]:
    """Wait for and drain pending psycopg2 NOTIFY messages.

    This function runs in a worker thread so the synchronous psycopg2 socket
    wait does not block FastAPI's event loop.
    """
    readable, _, _ = select.select([connection], [], [], timeout_seconds)
    if not readable:
        return []

    connection.poll()
    pending = []
    while connection.notifies:
        pending.append(connection.notifies.pop(0))
    return pending


@router.get("/notifications/stream")
async def stream_profile_update_notifications(
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Stream profile notification events for the authenticated staff user.

    The stream sends only notification IDs/actions. The frontend should call
    GET /notifications after receiving an event to load authoritative details.
    """
    role = (current_user.role or "").lower()
    if role not in ("admin", "engineer"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Must be an administrator or engineer.",
        )

    try:
        recipient_user_id = int(current_user.user_id)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid authenticated user.",
        )

    # Preserve the existing authentication dependency, then release its
    # request-scoped Session connection. The long-lived LISTEN connection is
    # obtained separately and returned to the pool when the stream closes.
    engine = db.get_bind()
    db.close()

    pooled_connection = None
    cursor = None
    try:
        pooled_connection = engine.raw_connection()

        # SQLAlchemy 2.x exposes driver_connection; older versions expose
        # the DBAPI connection through .connection.
        driver_connection = getattr(pooled_connection, "driver_connection", None)
        if driver_connection is None:
            driver_connection = getattr(
                pooled_connection,
                "connection",
                pooled_connection,
            )

        cursor = driver_connection.cursor()
        cursor.execute(f"LISTEN {PROFILE_NOTIFICATION_CHANNEL}")
    except Exception as exc:
        if cursor is not None:
            try:
                cursor.close()
            except Exception:
                pass
        if pooled_connection is not None:
            try:
                pooled_connection.close()
            except Exception:
                pass
        logger.exception("Unable to establish PostgreSQL notification listener")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Notification stream is temporarily unavailable.",
        ) from exc

    async def event_generator():
        try:
            # A comment/ready event confirms that the stream has been opened.
            yield "event: ready\ndata: {}\n\n"

            while True:
                if await request.is_disconnected():
                    break

                try:
                    pending_events = await asyncio.to_thread(
                        _wait_for_postgres_notifications,
                        driver_connection,
                        10,
                    )
                except Exception:
                    logger.exception("PostgreSQL notification listener failed")
                    # End the stream; the frontend should reconnect and perform
                    # GET /notifications to recover any events missed offline.
                    break

                if await request.is_disconnected():
                    break

                if not pending_events:
                    # Keep proxies/load balancers from treating the stream as idle.
                    yield ": keep-alive\n\n"
                    continue

                for pg_event in pending_events:
                    try:
                        payload = json.loads(pg_event.payload)
                        event_recipient_id = int(payload.get("recipient_user_id", 0))
                        notification_id = int(payload.get("notification_id", 0))
                        action = str(payload.get("action", "created"))
                    except (TypeError, ValueError, json.JSONDecodeError):
                        logger.warning("Ignoring malformed PostgreSQL notification payload")
                        continue

                    # PostgreSQL broadcasts on the channel; enforce recipient
                    # isolation before sending an event to this HTTP connection.
                    if event_recipient_id != recipient_user_id or notification_id <= 0:
                        continue

                    event_data = json.dumps(
                        {
                            "notification_id": notification_id,
                            "action": action,
                        }
                    )
                    yield (
                        f"id: {notification_id}\n"
                        "event: notification\n"
                        f"data: {event_data}\n\n"
                    )
        finally:
            if cursor is not None:
                try:
                    cursor.close()
                except Exception:
                    logger.debug("Error closing PostgreSQL LISTEN cursor", exc_info=True)

            if pooled_connection is not None:
                try:
                    pooled_connection.close()
                except Exception:
                    logger.debug("Error returning PostgreSQL listener connection", exc_info=True)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

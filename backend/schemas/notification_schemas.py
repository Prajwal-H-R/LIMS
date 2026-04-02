from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class AdminNotificationItem(BaseModel):
    id: int
    subject: str
    body_text: Optional[str] = None
    created_at: datetime
    status: str
    error: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class AdminNotificationsResponse(BaseModel):
    notifications: List[AdminNotificationItem]

from __future__ import annotations

from typing import Callable

from sqlalchemy.orm import Session

from .service import dispatch_due_calibration_reminders


def run_daily_calibration_reminder_job(db_factory: Callable[[], Session], days_ahead: int = 7) -> dict:
    db = db_factory()
    try:
        return dispatch_due_calibration_reminders(db=db, days_ahead=days_ahead, dry_run=False)
    finally:
        db.close()

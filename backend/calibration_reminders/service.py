from __future__ import annotations
import logging
from datetime import date, timedelta, datetime
from typing import Any, Dict, List, Optional, Literal

from sqlalchemy.orm import Session

from .emailer import build_html_body, build_plain_text_body, build_reminder_subject, send_email
from .repository import fetch_due_certificates, group_by_customer, insert_notification, notification_exists

logger = logging.getLogger(__name__)

SortBy = Literal["due_date", "certificate_no", "nepl_id", "serial_no", "srf_no"]
SortOrder = Literal["asc", "desc"]

def safe_to_date(val: Any) -> Optional[date]:
    """Ensures reliable date comparison across string, datetime, and date types."""
    if val is None: return None
    if isinstance(val, date) and not isinstance(val, datetime):
        return val
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, str):
        try:
            return date.fromisoformat(val[:10])
        except:
            return None
    return None

def build_customer_digest_subject(customer_id: int, days_ahead: int, run_date: date) -> str:
    """
    If window is 7, subject is unique per day.
    If window is 45, subject is unique per ISO week.
    """
    if days_ahead <= 7:
        return f"Calibration due reminder | customer_id={customer_id} | window=7d | date={run_date.isoformat()}"
    else:
        year, week, _ = run_date.isocalendar()
        return f"Calibration due reminder | customer_id={customer_id} | window=45d | week={year}-W{week}"

def get_engineer_due_summary(
    db: Session,
    days_ahead: int = 7,
    customer_id: Optional[int] = None,
    search: Optional[str] = None,
    lot: Optional[str] = None,
    sort_by: SortBy = "due_date",
    sort_order: SortOrder = "asc",
) -> Dict[str, Any]:
    rows = fetch_due_certificates(
        db=db,
        days_ahead=days_ahead,
        customer_id=customer_id,
        search=search,
        lot=lot,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    groups = group_by_customer(rows)
    return {
        "window_days": days_ahead,
        "total_due_count": len(rows),
        "customer_count": len(groups),
        "groups": groups,
    }

def get_customer_due_summary(
    db: Session,
    customer_id: int,
    days_ahead: int = 7,
    search: Optional[str] = None,
    lot: Optional[str] = None,
    sort_by: SortBy = "due_date",
    sort_order: SortOrder = "asc",
) -> Dict[str, Any]:
    rows = fetch_due_certificates(
        db=db,
        days_ahead=days_ahead,
        customer_id=customer_id,
        search=search,
        lot=lot,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    groups = group_by_customer(rows)
    return {
        "window_days": days_ahead,
        "total_due_count": len(rows),
        "customer_count": len(groups),
        "groups": groups,
    }

def dispatch_due_calibration_reminders(
    db: Session,
    days_ahead: int = 7,
    dry_run: bool = False,
    created_by: Optional[int] = None,
) -> Dict[str, Any]:
    # We always look ahead up to 45 days to capture both daily and weekly candidates
    max_lookahead = 45
    rows = fetch_due_certificates(db=db, days_ahead=max_lookahead)
    groups = group_by_customer(rows)
    
    run_date = date.today()
    urgent_threshold = run_date + timedelta(days=7)
    
    sent_count = 0
    skipped_count = 0
    results: List[Dict[str, Any]] = []

    for group in groups:
        customer_email = group.get("customer_email")
        customer_name = group.get("customer_name") or "Customer"
        customer_id = group.get("customer_id") or 0
        all_certs = group["certificates"]

        if not customer_email:
            skipped_count += len(all_certs)
            continue

        # Separate certificates into Daily (Urgent) and Weekly (Advance) lists
        urgent_certs = []
        advance_certs = []
        for cert in all_certs:
            due_dt = safe_to_date(cert.get("recommended_cal_due_date"))
            if due_dt and due_dt <= urgent_threshold:
                urgent_certs.append(cert)
            else:
                advance_certs.append(cert)

        # Process Reminders independently so both can be sent if needed
        for cert_subset, window in [(urgent_certs, 7), (advance_certs, 45)]:
            if not cert_subset:
                continue

            digest_subject = build_customer_digest_subject(customer_id, window, run_date)

            # Check if this specific frequency was already sent
            if notification_exists(db, customer_email, digest_subject):
                skipped_count += len(cert_subset)
                continue

            if dry_run:
                skipped_count += len(cert_subset)
                continue

            try:
                plain_text = build_plain_text_body(customer_name, cert_subset, window)
                html_body = build_html_body(customer_name, cert_subset, window)

                send_email(customer_email, digest_subject, plain_text, html_body)

                insert_notification(
                    db,
                    to_email=customer_email,
                    inward_id=None,
                    subject=digest_subject,
                    body_text=plain_text,
                    created_by=created_by,
                    recipient_user_id=None,
                    status="SENT",
                    error=None,
                )
                db.commit()
                sent_count += 1

                for cert in cert_subset:
                    results.append({
                        "certificate_no": cert["certificate_no"],
                        "customer_name": customer_name,
                        "email_sent": True,
                        "window": window
                    })

            except Exception as exc:
                db.rollback()
                logger.error(f"Failed to send {window}d reminder to {customer_email}: {exc}")
                skipped_count += len(cert_subset)

    return {
        "window_days": max_lookahead,
        "dry_run": dry_run,
        "total_candidates": len(rows),
        "sent_emails_count": sent_count,
        "skipped_count": skipped_count,
        "results": results,
    }
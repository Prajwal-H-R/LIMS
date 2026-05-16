from __future__ import annotations
from datetime import date
from typing import Any, Dict, List, Optional, Literal

from sqlalchemy.orm import Session

from .emailer import build_html_body, build_plain_text_body, build_reminder_subject, send_email
from .repository import fetch_due_certificates, group_by_customer, insert_notification, notification_exists

SortBy = Literal["due_date", "certificate_no", "nepl_id", "serial_no", "srf_no"]
SortOrder = Literal["asc", "desc"]
def build_customer_digest_subject(customer_id: int, days_ahead: int, run_date: date) -> str:
    return (
        f"Calibration due reminder | customer_id={customer_id} "
        f"| window={days_ahead}d | date={run_date.isoformat()}"
    )

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
    rows = fetch_due_certificates(db=db, days_ahead=days_ahead)
    groups = group_by_customer(rows)
    run_date = date.today()

    sent_count = 0
    skipped_count = 0
    results: List[Dict[str, Any]] = []

    for group in groups:
        customer_email = group.get("customer_email")
        customer_name = group.get("customer_name") or "Customer"
        certs = group["certificates"]

        if not customer_email:
            for cert in certs:
                results.append(
                    {
                        "certificate_id": cert["certificate_id"],
                        "certificate_no": cert["certificate_no"],
                        "customer_id": group.get("customer_id"),
                        "customer_name": customer_name,
                        "customer_email": None,
                        "due_date": cert["recommended_cal_due_date"],
                        "reminder_subject": "",
                        "email_sent": False,
                        "skipped_reason": "customer_email_missing",
                    }
                )
                skipped_count += 1
            continue

        digest_subject = build_customer_digest_subject(
            customer_id=group.get("customer_id") or 0,
            days_ahead=days_ahead,
            run_date=run_date,
        )

        # One mail per customer per day
        if notification_exists(db, customer_email, digest_subject):
            for cert in certs:
                results.append(
                    {
                        "certificate_id": cert["certificate_id"],
                        "certificate_no": cert["certificate_no"],
                        "customer_id": group.get("customer_id"),
                        "customer_name": customer_name,
                        "customer_email": customer_email,
                        "due_date": cert["recommended_cal_due_date"],
                        "reminder_subject": digest_subject,
                        "email_sent": False,
                        "skipped_reason": "already_sent",
                    }
                )
            skipped_count += len(certs)
            continue

        plain_text = build_plain_text_body(customer_name, certs, days_ahead)
        html_body = build_html_body(customer_name, certs, days_ahead)

        if dry_run:
            for cert in certs:
                results.append(
                    {
                        "certificate_id": cert["certificate_id"],
                        "certificate_no": cert["certificate_no"],
                        "customer_id": group.get("customer_id"),
                        "customer_name": customer_name,
                        "customer_email": customer_email,
                        "due_date": cert["recommended_cal_due_date"],
                        "reminder_subject": digest_subject,
                        "email_sent": False,
                        "skipped_reason": "dry_run",
                    }
                )
            skipped_count += len(certs)
            continue

        try:
            send_email(customer_email, digest_subject, plain_text, html_body)

            insert_notification(
                db,
                to_email=customer_email,
                inward_id=None,  # digest email covers multiple certificates
                subject=digest_subject,
                body_text=plain_text,
                created_by=created_by,
                recipient_user_id=None,
                status="SENT",
                error=None,
            )
            db.commit()

            sent_count += 1  # one email sent for the customer digest

            for cert in certs:
                results.append(
                    {
                        "certificate_id": cert["certificate_id"],
                        "certificate_no": cert["certificate_no"],
                        "customer_id": group.get("customer_id"),
                        "customer_name": customer_name,
                        "customer_email": customer_email,
                        "due_date": cert["recommended_cal_due_date"],
                        "reminder_subject": digest_subject,
                        "email_sent": True,
                        "skipped_reason": None,
                    }
                )
        except Exception as exc:
            db.rollback()
            insert_notification(
                db,
                to_email=customer_email,
                inward_id=None,
                subject=digest_subject,
                body_text=plain_text,
                created_by=created_by,
                recipient_user_id=None,
                status="FAILED",
                error=str(exc),
            )
            db.commit()

            skipped_count += len(certs)
            for cert in certs:
                results.append(
                    {
                        "certificate_id": cert["certificate_id"],
                        "certificate_no": cert["certificate_no"],
                        "customer_id": group.get("customer_id"),
                        "customer_name": customer_name,
                        "customer_email": customer_email,
                        "due_date": cert["recommended_cal_due_date"],
                        "reminder_subject": digest_subject,
                        "email_sent": False,
                        "skipped_reason": f"send_failed: {exc}",
                    }
                )

    return {
        "window_days": days_ahead,
        "dry_run": dry_run,
        "total_candidates": len(rows),
        "sent_count": sent_count,
        "skipped_count": skipped_count,
        "results": results,
    }
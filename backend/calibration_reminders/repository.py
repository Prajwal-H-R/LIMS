from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from typing import Any, Dict, Iterable, List, Optional, Literal

from sqlalchemy import text
from sqlalchemy.orm import Session

SortBy = Literal["due_date", "certificate_no", "nepl_id", "serial_no", "srf_no"]
SortOrder = Literal["asc", "desc"]
SourceFilter = Literal["ALL", "INTERNAL", "EXTERNAL"]

SORT_COLUMN_MAP = {
    "due_date": "recommended_cal_due_date",
    "certificate_no": "certificate_no",
    "nepl_id": "nepl_id",
    "serial_no": "serial_no",
    "srf_no": "srf_no",
}


def _like_term(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    return f"%{value}%"


def _build_due_rows_sql(sort_by: str, sort_order: str):
    sort_column = SORT_COLUMN_MAP.get(sort_by, SORT_COLUMN_MAP["due_date"])
    direction = "DESC" if str(sort_order).lower() == "desc" else "ASC"

    return text(
        f"""
        WITH due_rows AS (
            SELECT
                c.certificate_id::int AS certificate_id,
                c.certificate_no,
                c.recommended_cal_due_date,
                c.status,
                c.issued_at,
                c.inward_id,
                c.inward_eqp_id,
                i.srf_no,
                i.customer_id,
                i.customer_dc_no,
                i.customer_dc_date,
                cu.customer_details AS customer_name,
                cu.email AS customer_email,
                ie.nepl_id,
                ie.serial_no,
                ie.material_description,
                ie.make,
                ie.model,
                ie.range,
                ie.unit,
                'INTERNAL'::text AS source_type
            FROM public.certificate c
            LEFT JOIN public.inward i
                ON i.inward_id = c.inward_id
            LEFT JOIN public.customers cu
                ON cu.customer_id = i.customer_id
            LEFT JOIN public.inward_equipments ie
                ON ie.inward_eqp_id = c.inward_eqp_id
            WHERE c.recommended_cal_due_date IS NOT NULL
              AND c.status = 'ISSUED'
              AND c.recommended_cal_due_date >= (
                  CURRENT_DATE - (:days_back || ' days')::interval
              )::date
              AND c.recommended_cal_due_date <= (
                  CURRENT_DATE + (:days_ahead || ' days')::interval
              )::date
              AND (:customer_id IS NULL OR cu.customer_id = :customer_id)

            UNION ALL

            SELECT
                eu.id::int AS certificate_id,
                COALESCE(ie.nepl_id, eu.certificate_file_name) AS certificate_no,
                eu.recommended_cal_due_date,
                'EXTERNAL'::text AS status,
                eu.report_date AS issued_at,
                ie.inward_id AS inward_id,
                eu.inward_eqp_id,
                i.srf_no,
                i.customer_id,
                i.customer_dc_no,
                i.customer_dc_date,
                cu.customer_details AS customer_name,
                cu.email AS customer_email,
                ie.nepl_id,
                ie.serial_no,
                ie.material_description,
                ie.make,
                ie.model,
                ie.range,
                ie.unit,
                'EXTERNAL'::text AS source_type
            FROM public.external_uploads eu
            LEFT JOIN public.inward_equipments ie
                ON ie.inward_eqp_id = eu.inward_eqp_id
            LEFT JOIN public.inward i
                ON i.inward_id = ie.inward_id
            LEFT JOIN public.customers cu
                ON cu.customer_id = i.customer_id
            WHERE eu.recommended_cal_due_date IS NOT NULL
              AND eu.report_date IS NOT NULL
              AND eu.recommended_cal_due_date >= (
                  CURRENT_DATE - (:days_back || ' days')::interval
              )::date
              AND eu.recommended_cal_due_date <= (
                  CURRENT_DATE + (:days_ahead || ' days')::interval
              )::date
              AND (:customer_id IS NULL OR cu.customer_id = :customer_id)
        )
        SELECT
            dr.certificate_id,
            dr.certificate_no,
            dr.recommended_cal_due_date,
            dr.status,
            dr.issued_at,
            dr.inward_id,
            dr.inward_eqp_id,
            dr.srf_no,
            dr.customer_id,
            dr.customer_dc_no,
            dr.customer_dc_date,
            dr.customer_name,
            dr.customer_email,
            dr.nepl_id,
            dr.serial_no,
            dr.material_description,
            dr.make,
            dr.model,
            dr.range,
            dr.unit,
            dr.source_type,
            renewal.inward_id AS renewal_inward_id,
            renewal.srf_no AS renewal_srf_no
        FROM due_rows dr
        LEFT JOIN LATERAL (
            SELECT
                i2.inward_id,
                i2.srf_no
            FROM public.inward_equipments ie2
            JOIN public.inward i2
                ON i2.inward_id = ie2.inward_id
            WHERE dr.customer_id IS NOT NULL
              AND i2.customer_id = dr.customer_id
              AND dr.inward_eqp_id IS NOT NULL
              AND ie2.inward_eqp_id > dr.inward_eqp_id
              AND (
                  (
                      NULLIF(TRIM(COALESCE(dr.serial_no, '')), '') IS NOT NULL
                      AND LOWER(TRIM(COALESCE(ie2.serial_no, ''))) = LOWER(TRIM(dr.serial_no))
                  )
                  OR (
                      NULLIF(TRIM(COALESCE(dr.nepl_id, '')), '') IS NOT NULL
                      AND LOWER(TRIM(COALESCE(ie2.nepl_id, ''))) = LOWER(TRIM(dr.nepl_id))
                  )
              )
            ORDER BY ie2.inward_eqp_id DESC
            LIMIT 1
        ) renewal ON TRUE
        WHERE (
            :source_filter = 'ALL'
            OR dr.source_type = :source_filter
        )
          AND (
            :search_like IS NULL
            OR COALESCE(dr.certificate_no, '') ILIKE :search_like
            OR COALESCE(dr.srf_no, '') ILIKE :search_like
            OR COALESCE(dr.customer_name, '') ILIKE :search_like
            OR COALESCE(dr.customer_email, '') ILIKE :search_like
            OR COALESCE(dr.nepl_id, '') ILIKE :search_like
            OR COALESCE(dr.serial_no, '') ILIKE :search_like
            OR COALESCE(dr.material_description, '') ILIKE :search_like
            OR COALESCE(dr.make, '') ILIKE :search_like
            OR COALESCE(dr.model, '') ILIKE :search_like
            OR COALESCE(dr.customer_dc_no, '') ILIKE :search_like
        )
          AND (
            :lot_like IS NULL
            OR COALESCE(dr.nepl_id, '') ILIKE :lot_like
            OR COALESCE(dr.certificate_no, '') ILIKE :lot_like
            OR COALESCE(dr.srf_no, '') ILIKE :lot_like
            OR COALESCE(dr.serial_no, '') ILIKE :lot_like
            OR COALESCE(dr.customer_dc_no, '') ILIKE :lot_like
        )
        ORDER BY
            dr.{sort_column} {direction},
            dr.customer_name NULLS LAST,
            dr.certificate_no ASC
        """
    )


EXISTING_NOTIFICATION_SQL = text(
    """
    SELECT 1
    FROM public.notifications
    WHERE recipient_user_id IS NULL
      AND to_email = :to_email
      AND subject = :subject
    LIMIT 1
    """
)

INSERT_NOTIFICATION_SQL = text(
    """
    INSERT INTO public.notifications
        (recipient_user_id, to_email, inward_id, subject, body_text, email_sent_at, created_by, status, error)
    VALUES
        (:recipient_user_id, :to_email, :inward_id, :subject, :body_text, NOW(), :created_by, :status, :error)
    RETURNING id
    """
)

LATEST_CUSTOMER_NOTIFICATIONS_SQL = text(
    """
    SELECT
        to_email,
        MAX(email_sent_at) AS last_sent_at
    FROM public.notifications
    WHERE status = 'SENT'
      AND subject ILIKE 'Calibration%'
    GROUP BY to_email
    """
)


def fetch_latest_notifications_by_email(db: Session) -> Dict[str, datetime]:
    try:
        rows = db.execute(LATEST_CUSTOMER_NOTIFICATIONS_SQL).mappings().all()
        out: Dict[str, datetime] = {}
        for row in rows:
            email_val = (row.get("to_email") or "").strip().lower()
            sent_at = row.get("last_sent_at")
            if email_val and sent_at:
                # Also index individual addresses if comma-separated
                for part in email_val.split(","):
                    clean = part.strip()
                    if clean and (clean not in out or sent_at > out[clean]):
                        out[clean] = sent_at
        return out
    except Exception:
        return {}


def fetch_due_certificates(
    db: Session,
    days_ahead: int = 7,
    days_back: int = 0,
    customer_id: Optional[int] = None,
    search: Optional[str] = None,
    lot: Optional[str] = None,
    source_filter: SourceFilter = "ALL",
    sort_by: SortBy = "due_date",
    sort_order: SortOrder = "asc",
) -> List[Dict[str, Any]]:
    query = _build_due_rows_sql(sort_by=sort_by, sort_order=sort_order)
    rows = db.execute(
        query,
        {
            "days_ahead": days_ahead,
            "days_back": max(0, days_back),
            "customer_id": customer_id,
            "search_like": _like_term(search),
            "lot_like": _like_term(lot),
            "source_filter": source_filter if source_filter in ("ALL", "INTERNAL", "EXTERNAL") else "ALL",
        },
    ).mappings().all()

    results: List[Dict[str, Any]] = []
    today = date.today()

    for row in rows:
        due_date = row["recommended_cal_due_date"]
        days_until_due = (due_date - today).days if due_date else 0
        renewal_inward_id = row.get("renewal_inward_id")
        renewal_srf_no = row.get("renewal_srf_no")

        results.append(
            {
                "certificate_id": row["certificate_id"],
                "certificate_no": row["certificate_no"],
                "recommended_cal_due_date": due_date,
                "days_until_due": days_until_due,
                "customer_id": row["customer_id"],
                "customer_name": row["customer_name"],
                "customer_email": row["customer_email"],
                "inward_id": row["inward_id"],
                "srf_no": row["srf_no"],
                "customer_dc_no": row["customer_dc_no"],
                "customer_dc_date": row["customer_dc_date"],
                "inward_eqp_id": row["inward_eqp_id"],
                "nepl_id": row["nepl_id"],
                "serial_no": row["serial_no"],
                "material_description": row["material_description"],
                "make": row["make"],
                "model": row["model"],
                "range": row["range"],
                "unit": row["unit"],
                "status": row["status"],
                "issued_at": row["issued_at"],
                "source_type": row.get("source_type") or "INTERNAL",
                "already_in_lab": renewal_inward_id is not None,
                "renewal_inward_id": renewal_inward_id,
                "renewal_srf_no": renewal_srf_no,
            }
        )
    return results


def group_by_customer(
    rows: Iterable[Dict[str, Any]],
    last_notified_map: Optional[Dict[str, datetime]] = None,
) -> List[Dict[str, Any]]:
    grouped = defaultdict(lambda: {"certificates": []})
    notified_lookup = last_notified_map or {}

    for row in rows:
        customer_id = row["customer_id"]
        key = customer_id if customer_id is not None else -1
        bucket = grouped[key]

        bucket["customer_id"] = customer_id if customer_id is not None else 0
        bucket["customer_name"] = row.get("customer_name")
        bucket["customer_email"] = row.get("customer_email")
        bucket["certificates"].append(row)

    out: List[Dict[str, Any]] = []
    for bucket in grouped.values():
        certs = bucket["certificates"]
        cust_email = (bucket.get("customer_email") or "").strip().lower()
        last_sent = notified_lookup.get(cust_email) if cust_email else None

        out.append(
            {
                "customer_id": bucket["customer_id"],
                "customer_name": bucket.get("customer_name"),
                "customer_email": bucket.get("customer_email"),
                "due_count": len(certs),
                "overdue_count": sum(1 for c in certs if (c.get("days_until_due") or 0) < 0),
                "already_in_lab_count": sum(1 for c in certs if c.get("already_in_lab")),
                "last_notified_at": last_sent,
                "certificates": certs,
            }
        )

    out.sort(key=lambda x: (x["customer_name"] or "", x["customer_id"] or 0))
    return out


def notification_exists(db: Session, to_email: str, subject: str) -> bool:
    result = db.execute(EXISTING_NOTIFICATION_SQL, {"to_email": to_email, "subject": subject}).first()
    return result is not None


def insert_notification(
    db: Session,
    *,
    to_email: str,
    inward_id: Optional[int],
    subject: str,
    body_text: str,
    created_by: Optional[int] = None,
    recipient_user_id: Optional[int] = None,
    status: str = "SENT",
    error: Optional[str] = None,
) -> int:
    row = db.execute(
        INSERT_NOTIFICATION_SQL,
        {
            "recipient_user_id": recipient_user_id,
            "to_email": to_email,
            "inward_id": inward_id,
            "subject": subject,
            "body_text": body_text,
            "created_by": created_by,
            "status": status,
            "error": error,
        },
    ).first()
    return int(row[0]) if row else 0
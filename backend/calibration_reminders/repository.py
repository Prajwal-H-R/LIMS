from __future__ import annotations
 
from collections import defaultdict
from datetime import date
from typing import Any, Dict, Iterable, List, Optional, Literal
 
from sqlalchemy import text
from sqlalchemy.orm import Session
 
SortBy = Literal["due_date", "certificate_no", "nepl_id", "serial_no", "srf_no"]
SortOrder = Literal["asc", "desc"]
 
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
                ie.unit
            FROM public.certificate c
            LEFT JOIN public.inward i
                ON i.inward_id = c.inward_id
            LEFT JOIN public.customers cu
                ON cu.customer_id = i.customer_id
            LEFT JOIN public.inward_equipments ie
                ON ie.inward_eqp_id = c.inward_eqp_id
            WHERE c.recommended_cal_due_date IS NOT NULL
              AND c.status = 'ISSUED'
              AND c.recommended_cal_due_date >= CURRENT_DATE
              AND c.recommended_cal_due_date <= (
                  CURRENT_DATE + (:days_ahead || ' days')::interval
              )::date
              AND (:customer_id IS NULL OR cu.customer_id = :customer_id)
 
            UNION ALL
 
            SELECT
                eu.id::int AS certificate_id,
                COALESCE(ie.nepl_id, eu.certificate_file_name) AS certificate_no,
                eu.recommended_cal_due_date,
                NULL::text AS status,
                eu.report_date AS issued_at,
                NULL::int AS inward_id,
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
                ie.unit
            FROM public.external_uploads eu
            LEFT JOIN public.inward_equipments ie
                ON ie.inward_eqp_id = eu.inward_eqp_id
            LEFT JOIN public.inward i
                ON i.inward_id = ie.inward_id
            LEFT JOIN public.customers cu
                ON cu.customer_id = i.customer_id
            WHERE eu.recommended_cal_due_date IS NOT NULL
              AND eu.report_date IS NOT NULL
              AND eu.recommended_cal_due_date >= CURRENT_DATE
              AND eu.recommended_cal_due_date <= (
                  CURRENT_DATE + (:days_ahead || ' days')::interval
              )::date
              AND (:customer_id IS NULL OR cu.customer_id = :customer_id)
        )
        SELECT
            certificate_id,
            certificate_no,
            recommended_cal_due_date,
            status,
            issued_at,
            inward_id,
            inward_eqp_id,
            srf_no,
            customer_id,
            customer_dc_no,
            customer_dc_date,
            customer_name,
            customer_email,
            nepl_id,
            serial_no,
            material_description,
            make,
            model,
            range,
            unit
        FROM due_rows
        WHERE (
            :search_like IS NULL
            OR COALESCE(certificate_no, '') ILIKE :search_like
            OR COALESCE(srf_no, '') ILIKE :search_like
            OR COALESCE(customer_name, '') ILIKE :search_like
            OR COALESCE(customer_email, '') ILIKE :search_like
            OR COALESCE(nepl_id, '') ILIKE :search_like
            OR COALESCE(serial_no, '') ILIKE :search_like
            OR COALESCE(material_description, '') ILIKE :search_like
            OR COALESCE(make, '') ILIKE :search_like
            OR COALESCE(model, '') ILIKE :search_like
            OR COALESCE(customer_dc_no, '') ILIKE :search_like
        )
          AND (
            :lot_like IS NULL
            OR COALESCE(nepl_id, '') ILIKE :lot_like
            OR COALESCE(certificate_no, '') ILIKE :lot_like
            OR COALESCE(srf_no, '') ILIKE :lot_like
            OR COALESCE(serial_no, '') ILIKE :lot_like
            OR COALESCE(customer_dc_no, '') ILIKE :lot_like
        )
        ORDER BY
            {sort_column} {direction},
            customer_name NULLS LAST,
            certificate_no ASC
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
 
 
def fetch_due_certificates(
    db: Session,
    days_ahead: int = 7,
    customer_id: Optional[int] = None,
    search: Optional[str] = None,
    lot: Optional[str] = None,
    sort_by: SortBy = "due_date",
    sort_order: SortOrder = "asc",
) -> List[Dict[str, Any]]:
    query = _build_due_rows_sql(sort_by=sort_by, sort_order=sort_order)
    rows = db.execute(
        query,
        {
            "days_ahead": days_ahead,
            "customer_id": customer_id,
            "search_like": _like_term(search),
            "lot_like": _like_term(lot),
        },
    ).mappings().all()
 
    results: List[Dict[str, Any]] = []
    today = date.today()
 
    for row in rows:
        due_date = row["recommended_cal_due_date"]
        days_until_due = (due_date - today).days if due_date else None
 
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
            }
        )
    return results
 
 
def group_by_customer(rows: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    grouped = defaultdict(lambda: {"certificates": []})
 
    for row in rows:
        customer_id = row["customer_id"]
        key = customer_id if customer_id is not None else -1
        bucket = grouped[key]
 
        bucket["customer_id"] = customer_id
        bucket["customer_name"] = row.get("customer_name")
        bucket["customer_email"] = row.get("customer_email")
        bucket["certificates"].append(row)
 
    out: List[Dict[str, Any]] = []
    for bucket in grouped.values():
        out.append(
            {
                "customer_id": bucket["customer_id"],
                "customer_name": bucket.get("customer_name"),
                "customer_email": bucket.get("customer_email"),
                "due_count": len(bucket["certificates"]),
                "certificates": bucket["certificates"],
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
 
 
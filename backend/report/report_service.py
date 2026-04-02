from sqlalchemy import text
from datetime import date
from backend.db import engine


MAJOR_TABLES = {
    "inward": "status",
    "inward_equipments": "status",
    "srfs": "status",
    "srf_equipments": "status",
    "htw_job": "job_status",
}


# =========================================================
# STATUS COUNTS (DATE FILTERED)
# =========================================================
def get_status_counts(from_date: date, to_date: date):

    results = {}

    with engine.connect() as conn:
        for table, column in MAJOR_TABLES.items():

            query = text(f"""
                SELECT {column}, COUNT(*)
                FROM {table}
                WHERE created_at::date BETWEEN :from_date AND :to_date
                GROUP BY {column}
                ORDER BY {column}
            """)

            rows = conn.execute(query, {
                "from_date": from_date,
                "to_date": to_date
            }).fetchall()

            status_dict = {
                (r[0] if r[0] else "UNKNOWN"): r[1]
                for r in rows
            }

            total_count = sum(status_dict.values())

            results[table] = {
                "statuses": status_dict,
                "total": total_count
            }

    return results


# =========================================================
# LICENSE AUDIT DATA
# =========================================================
def get_license_audit_data():

    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT old_valid_until,
                   new_valid_until,
                   extended_by,
                   extended_at
            FROM license_audit
            ORDER BY extended_at DESC
        """)).fetchall()

        return rows


# =========================================================
# INSTALLATION DATE
# =========================================================
def get_installation_date():

    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT valid_from
            FROM license_master
            LIMIT 1
        """)).fetchone()

        return row[0] if row else None


# =========================================================
# REPORT LOG (TRACK SENT REPORTS)
# =========================================================
def get_last_sent_date(report_type: str):

    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT last_sent_date
            FROM report_log
            WHERE report_type = :type
            ORDER BY id DESC
            LIMIT 1
        """), {"type": report_type}).fetchone()

        return row[0] if row else None


def log_report_sent(report_type: str, sent_date: date):

    with engine.connect() as conn:
        conn.execute(text("""
            INSERT INTO report_log (report_type, last_sent_date)
            VALUES (:type, :date)
        """), {
            "type": report_type,
            "date": sent_date
        })
        conn.commit()

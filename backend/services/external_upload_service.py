from datetime import datetime, timezone, date
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
import logging

from ..models import external_upload as models
from ..schemas import external_upload as schemas

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────
# HELPER — map doc_type to column attribute names
# ─────────────────────────────────────────────

def _get_lock_fields(doc_type: str) -> dict:
    """
    Returns a dict of attribute names for the given doc_type.
    Raises ValueError for unknown types.
    """
    mapping = {
        "result": {
            "file_name":      "calibration_worksheet_file_name",
            "file_type":      "calibration_worksheet_file_type",
            "file_url":       "calibration_worksheet_file_url",
            "locked":         "calibration_worksheet_locked",
            "unlock_request": "calibration_worksheet_unlock_request",
            "label":          "Calibration Worksheet",
        },
        "certificate": {
            "file_name":      "certificate_file_name",
            "file_type":      "certificate_file_type",
            "file_url":       "certificate_file_url",
            "locked":         "certificate_locked",
            "unlock_request": "certificate_unlock_request",
            "label":          "Certificate",
        },
    }
    if doc_type not in mapping:
        raise ValueError(
            f"Unknown document type: '{doc_type}'. "
            f"Must be 'result' or 'certificate'."
        )
    return mapping[doc_type]


def _now() -> str:
    """ISO timestamp in UTC — used inside JSONB payloads."""
    return datetime.now(timezone.utc).isoformat()


# ─────────────────────────────────────────────
# READ
# ─────────────────────────────────────────────

def get_upload_by_equipment_id(
    db: Session,
    inward_eqp_id: int,
) -> Optional[models.ExternalUpload]:
    """
    Retrieve the external_upload record for a given equipment ID.
    Returns None if no record exists yet.
    """
    return (
        db.query(models.ExternalUpload)
        .filter(models.ExternalUpload.inward_eqp_id == inward_eqp_id)
        .first()
    )


# ─────────────────────────────────────────────
# LOCK CHECKS  (pure logic, no DB commit)
# ─────────────────────────────────────────────

def is_file_locked(
    record: models.ExternalUpload,
    doc_type: str,
) -> bool:
    """Returns True if the specified file is currently locked."""
    fields = _get_lock_fields(doc_type)
    return bool(getattr(record, fields["locked"], False))


def get_unlock_request(
    record: models.ExternalUpload,
    doc_type: str,
) -> dict:
    """Returns the current unlock_request JSONB dict (never None)."""
    fields = _get_lock_fields(doc_type)
    return getattr(record, fields["unlock_request"]) or {}


def can_modify(
    record: Optional[models.ExternalUpload],
    doc_type: str,
    user_role: str,
) -> tuple[bool, str]:
    """
    Central permission check used by both upload and delete.

    Returns:
        (True, "")           — allowed
        (False, reason_str)  — blocked with a human-readable reason
    """
    if record is None:
        return True, ""

    if user_role == "admin":
        return True, ""

    if not is_file_locked(record, doc_type):
        return True, ""

    unlock_req = get_unlock_request(record, doc_type)
    if unlock_req.get("status") == "APPROVED":
        return True, ""

    fields     = _get_lock_fields(doc_type)
    req_status = unlock_req.get("status")

    if req_status == "PENDING":
        reason = (
            f"{fields['label']} is locked and an unlock request is "
            "pending admin review. Please wait for approval."
        )
    elif req_status == "REJECTED":
        reason = (
            f"{fields['label']} is locked. Your previous unlock request "
            "was rejected. Please submit a new request."
        )
    else:
        reason = (
            f"{fields['label']} is locked. "
            "Submit an unlock request for admin approval."
        )

    return False, reason


# ─────────────────────────────────────────────
# UPSERT — upload a document
# ─────────────────────────────────────────────

def upsert_document_for_equipment(
    db: Session,
    inward_eqp_id: int,
    doc_type: str,
    file_name: str,
    file_content_type: Optional[str],
    file_url: str,
    user_id: Optional[int] = None,
    report_date: Optional[date] = None,
    recommended_cal_due_date: Optional[date] = None,
) -> models.ExternalUpload:
    """
    Creates or updates an external_upload record and populates
    the correct file fields based on doc_type.

    Date fields (report_date, recommended_cal_due_date):
      - Accepted only when doc_type == 'certificate'.
      - Ignored silently for doc_type == 'result'.

    After saving:
      - The file is AUTO-LOCKED (locked flag set to True).
      - If the previous unlock_request was APPROVED it is cleared.
    """
    fields = _get_lock_fields(doc_type)   # raises ValueError for bad doc_type

    # ── Get or create record ────────────────────────────────────────
    db_upload = get_upload_by_equipment_id(db, inward_eqp_id)

    if not db_upload:
        db_upload = models.ExternalUpload(
            inward_eqp_id=inward_eqp_id,
            created_by=user_id,
        )
        db.add(db_upload)
        db.flush()   # get the PK before we set attributes

    # ── Set file fields ─────────────────────────────────────────────
    setattr(db_upload, fields["file_name"], file_name)
    setattr(db_upload, fields["file_type"], file_content_type)
    setattr(db_upload, fields["file_url"],  file_url)

    # ── Persist date fields only for certificate uploads ────────────
    if doc_type == "certificate":
        if report_date is not None:
            db_upload.report_date = report_date
            logger.debug(
                "Setting report_date=%s for inward_eqp_id=%s",
                report_date,
                inward_eqp_id,
            )
        if recommended_cal_due_date is not None:
            db_upload.recommended_cal_due_date = recommended_cal_due_date
            logger.debug(
                "Setting recommended_cal_due_date=%s for inward_eqp_id=%s",
                recommended_cal_due_date,
                inward_eqp_id,
            )
    else:
        logger.debug(
            "Date fields ignored for doc_type='%s' on inward_eqp_id=%s",
            doc_type,
            inward_eqp_id,
        )

    # ── Auto-lock after upload ──────────────────────────────────────
    setattr(db_upload, fields["locked"], True)

    # ── Clear the approved request — loop cycle complete ────────────
    current_req = getattr(db_upload, fields["unlock_request"]) or {}
    if current_req.get("status") == "APPROVED":
        setattr(db_upload, fields["unlock_request"], None)
        flag_modified(db_upload, fields["unlock_request"])

    db_upload.updated_at = datetime.now(timezone.utc)

    # ── Flush so all changes are staged, then verify ─────────────────
    db.flush()

    # ── Sanity-check: confirm dates are staged before commit ─────────
    if doc_type == "certificate":
        logger.debug(
            "Pre-commit check | inward_eqp_id=%s report_date=%s cal_due=%s",
            inward_eqp_id,
            db_upload.report_date,
            db_upload.recommended_cal_due_date,
        )

    db.commit()
    db.refresh(db_upload)

    # ── Post-commit verification ─────────────────────────────────────
    if doc_type == "certificate":
        logger.info(
            "Post-commit dates | inward_eqp_id=%s report_date=%s cal_due=%s",
            inward_eqp_id,
            db_upload.report_date,
            db_upload.recommended_cal_due_date,
        )

    return db_upload


# ─────────────────────────────────────────────
# UPDATE DATE FIELDS ONLY (standalone endpoint)
# ─────────────────────────────────────────────

def update_date_fields(
    db: Session,
    inward_eqp_id: int,
    report_date: Optional[date] = None,
    recommended_cal_due_date: Optional[date] = None,
) -> models.ExternalUpload:
    """
    Updates only the date fields on an existing record.
    Does not touch file fields or lock state.

    Raises ValueError when no record exists.
    """
    db_upload = get_upload_by_equipment_id(db, inward_eqp_id)
    if not db_upload:
        raise ValueError(
            f"No upload record found for inward_eqp_id={inward_eqp_id}."
        )

    if report_date is not None:
        db_upload.report_date = report_date
        logger.debug(
            "update_date_fields | setting report_date=%s for inward_eqp_id=%s",
            report_date,
            inward_eqp_id,
        )

    if recommended_cal_due_date is not None:
        db_upload.recommended_cal_due_date = recommended_cal_due_date
        logger.debug(
            "update_date_fields | setting recommended_cal_due_date=%s "
            "for inward_eqp_id=%s",
            recommended_cal_due_date,
            inward_eqp_id,
        )

    # Explicitly mark Date columns as modified so SQLAlchemy always
    # issues an UPDATE even when the value has not changed.
    flag_modified(db_upload, "report_date")
    flag_modified(db_upload, "recommended_cal_due_date")

    db_upload.updated_at = datetime.now(timezone.utc)

    db.flush()
    db.commit()
    db.refresh(db_upload)

    logger.info(
        "update_date_fields | committed | inward_eqp_id=%s "
        "report_date=%s cal_due=%s",
        inward_eqp_id,
        db_upload.report_date,
        db_upload.recommended_cal_due_date,
    )

    return db_upload


# ─────────────────────────────────────────────
# DELETE — nullify a document
# ─────────────────────────────────────────────

def delete_document_for_equipment(
    db: Session,
    inward_eqp_id: int,
    doc_type: str,
) -> Optional[models.ExternalUpload]:
    """
    Nullifies all file fields for the given doc_type.

    After deletion:
      - The locked flag is set to FALSE.
      - The unlock_request is cleared.
      - For certificate: date fields are also cleared.
    """
    fields = _get_lock_fields(doc_type)

    db_upload = get_upload_by_equipment_id(db, inward_eqp_id)
    if not db_upload:
        return None

    # ── Null-out file fields ────────────────────────────────────────
    setattr(db_upload, fields["file_name"], None)
    setattr(db_upload, fields["file_type"], None)
    setattr(db_upload, fields["file_url"],  None)

    # ── Clear date fields when the certificate is deleted ────────────
    if doc_type == "certificate":
        db_upload.report_date              = None
        db_upload.recommended_cal_due_date = None
        flag_modified(db_upload, "report_date")
        flag_modified(db_upload, "recommended_cal_due_date")

    # ── Unlock so engineer can re-upload immediately ────────────────
    setattr(db_upload, fields["locked"],         False)
    setattr(db_upload, fields["unlock_request"], None)
    flag_modified(db_upload, fields["unlock_request"])

    db_upload.updated_at = datetime.now(timezone.utc)

    db.flush()
    db.commit()
    db.refresh(db_upload)
    return db_upload


# ─────────────────────────────────────────────
# ENGINEER — submit unlock request
# ─────────────────────────────────────────────

def submit_unlock_request(
    db: Session,
    inward_eqp_id: int,
    doc_type: str,
    reason: str,
    requested_by: int,
) -> models.ExternalUpload:
    """
    Engineer submits a reason to request that a locked file be unlocked.

    Rules:
      - Record must exist.
      - File must be locked.
      - No duplicate PENDING request.
      - Previous request archived into history[].
    """
    fields = _get_lock_fields(doc_type)

    db_upload = get_upload_by_equipment_id(db, inward_eqp_id)
    if not db_upload:
        raise ValueError("No upload record found for this equipment.")

    if not getattr(db_upload, fields["locked"], False):
        raise ValueError(f"{fields['label']} is not currently locked.")

    existing_req: dict = getattr(db_upload, fields["unlock_request"]) or {}

    if existing_req.get("status") == "PENDING":
        raise ValueError(
            "An unlock request is already pending. "
            "Please wait for the admin's decision."
        )

    # ── Archive previous request into history[] ─────────────────────
    history: list = list(existing_req.get("history", []))
    if existing_req.get("status"):
        history.append({
            "status":          existing_req.get("status"),
            "engineer_reason": existing_req.get("engineer_reason"),
            "admin_comment":   existing_req.get("admin_comment"),
            "requested_at":    existing_req.get("requested_at"),
            "actioned_at":     existing_req.get("actioned_at"),
        })

    new_request = {
        "status":          "PENDING",
        "engineer_reason": reason.strip(),
        "requested_by":    requested_by,
        "requested_at":    _now(),
        "admin_comment":   None,
        "actioned_by":     None,
        "actioned_at":     None,
        "history":         history,
    }

    setattr(db_upload, fields["unlock_request"], new_request)
    flag_modified(db_upload, fields["unlock_request"])

    db_upload.updated_at = datetime.now(timezone.utc)

    db.flush()
    db.commit()
    db.refresh(db_upload)
    return db_upload


# ─────────────────────────────────────────────
# ADMIN — approve or reject unlock request
# ─────────────────────────────────────────────

def action_unlock_request(
    db: Session,
    inward_eqp_id: int,
    doc_type: str,
    action: str,
    comment: str,
    actioned_by: int,
) -> models.ExternalUpload:
    """
    Admin approves or rejects the pending unlock request.

    APPROVED → locked flag set to FALSE.
    REJECTED → locked flag stays TRUE.
    """
    if action not in ("APPROVED", "REJECTED"):
        raise ValueError("action must be 'APPROVED' or 'REJECTED'.")

    fields = _get_lock_fields(doc_type)

    db_upload = get_upload_by_equipment_id(db, inward_eqp_id)
    if not db_upload:
        raise ValueError("No upload record found for this equipment.")

    current_req: dict = dict(
        getattr(db_upload, fields["unlock_request"]) or {}
    )

    if current_req.get("status") != "PENDING":
        raise ValueError(
            f"No pending unlock request found for {fields['label']}."
        )

    current_req["status"]        = action
    current_req["admin_comment"] = comment.strip() if comment else ""
    current_req["actioned_by"]   = actioned_by
    current_req["actioned_at"]   = _now()

    setattr(db_upload, fields["unlock_request"], current_req)
    flag_modified(db_upload, fields["unlock_request"])

    if action == "APPROVED":
        setattr(db_upload, fields["locked"], False)

    db_upload.updated_at = datetime.now(timezone.utc)

    db.flush()
    db.commit()
    db.refresh(db_upload)
    return db_upload


# ─────────────────────────────────────────────
# CONVENIENCE — lock status summary
# ─────────────────────────────────────────────

def get_lock_status_summary(record: models.ExternalUpload) -> dict:
    """
    Returns a lightweight dict describing the lock state of both files
    plus the current date field values.

    Example output:
    {
        "result": {
            "locked": true,
            "unlock_status": "PENDING",
            "has_file": true
        },
        "certificate": {
            "locked": false,
            "unlock_status": null,
            "has_file": false,
            "report_date": "2024-06-01",
            "recommended_cal_due_date": "2025-06-01"
        }
    }
    """
    def _summary(doc_type: str) -> dict:
        fields = _get_lock_fields(doc_type)
        req    = getattr(record, fields["unlock_request"]) or {}
        data   = {
            "locked":        bool(getattr(record, fields["locked"], False)),
            "unlock_status": req.get("status"),
            "has_file":      bool(getattr(record, fields["file_url"])),
        }
        if doc_type == "certificate":
            data["report_date"] = (
                record.report_date.isoformat()
                if record.report_date else None
            )
            data["recommended_cal_due_date"] = (
                record.recommended_cal_due_date.isoformat()
                if record.recommended_cal_due_date else None
            )
        return data

    return {
        "result":      _summary("result"),
        "certificate": _summary("certificate"),
    }
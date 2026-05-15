from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session

from ..models import external_upload as models
from ..schemas import external_upload as schemas


# ─────────────────────────────────────────────
# HELPER — map doc_type to column attribute names
# ─────────────────────────────────────────────

def _get_lock_fields(doc_type: str) -> dict:
    """
    Returns a dict of attribute names for the given doc_type.
    Raises ValueError for unknown types — caller converts to HTTPException.
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
            f"Unknown document type: '{doc_type}'. Must be 'result' or 'certificate'."
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
        (True, "")            — allowed
        (False, reason_str)   — blocked with a human-readable reason

    Rules:
        - No record yet         → always allowed (first upload)
        - Admin                 → always allowed
        - Not locked            → allowed
        - Locked + APPROVED req → allowed (engineer is in re-upload window)
        - Locked + no/PENDING/REJECTED req → blocked
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

    fields = _get_lock_fields(doc_type)
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
) -> models.ExternalUpload:
    """
    Creates or updates an external_upload record and populates
    the correct file fields based on doc_type.

    After saving:
      - The file is AUTO-LOCKED (locked flag set to True).
      - If the previous unlock_request was APPROVED it is cleared,
        completing one full lock → request → approve → re-upload cycle.
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

    # ── Auto-lock after upload ──────────────────────────────────────
    setattr(db_upload, fields["locked"], True)

    # ── Clear the approved request — loop cycle complete ────────────
    current_req = getattr(db_upload, fields["unlock_request"]) or {}
    if current_req.get("status") == "APPROVED":
        setattr(db_upload, fields["unlock_request"], None)

    db_upload.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(db_upload)
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
      - The locked flag is set to FALSE so the engineer
        can immediately re-upload without a new unlock request.
      - The unlock_request is cleared — clean state for next upload.
    """
    fields = _get_lock_fields(doc_type)   # raises ValueError for bad doc_type

    db_upload = get_upload_by_equipment_id(db, inward_eqp_id)
    if not db_upload:
        return None

    # ── Null-out file fields ────────────────────────────────────────
    setattr(db_upload, fields["file_name"], None)
    setattr(db_upload, fields["file_type"], None)
    setattr(db_upload, fields["file_url"],  None)

    # ── Unlock so engineer can re-upload immediately ────────────────
    setattr(db_upload, fields["locked"],         False)
    setattr(db_upload, fields["unlock_request"], None)

    db_upload.updated_at = datetime.now(timezone.utc)

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

    Rules enforced here (router should pre-check, but service is the source of truth):
      - Record must exist.
      - File must be locked.
      - No duplicate PENDING request.
      - Previous request (any status) is archived into history[].
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
    db_upload.updated_at = datetime.now(timezone.utc)

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
    action: str,            # "APPROVED" | "REJECTED"
    comment: str,
    actioned_by: int,
) -> models.ExternalUpload:
    """
    Admin approves or rejects the pending unlock request.

    APPROVED:
      - locked flag set to FALSE.
      - Engineer can now delete / re-upload.
      - On next upload, lock is reapplied and request cleared.

    REJECTED:
      - locked flag stays TRUE.
      - Engineer sees the rejection reason.
      - Engineer can submit a new request (loop continues).
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

    # ── Update request in-place ─────────────────────────────────────
    current_req["status"]        = action
    current_req["admin_comment"] = comment.strip() if comment else ""
    current_req["actioned_by"]   = actioned_by
    current_req["actioned_at"]   = _now()

    setattr(db_upload, fields["unlock_request"], current_req)

    # Only physically unlock the file on approval
    if action == "APPROVED":
        setattr(db_upload, fields["locked"], False)

    db_upload.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(db_upload)
    return db_upload


# ─────────────────────────────────────────────
# CONVENIENCE — get lock status summary
# Useful for admin dashboard / list views
# ─────────────────────────────────────────────

def get_lock_status_summary(record: models.ExternalUpload) -> dict:
    """
    Returns a lightweight dict describing the lock state of both files.
    Used by list endpoints that don't need the full unlock history.

    Example output:
    {
        "result": {
            "locked": true,
            "unlock_status": "PENDING",   # or APPROVED | REJECTED | null
            "has_file": true
        },
        "certificate": {
            "locked": false,
            "unlock_status": null,
            "has_file": false
        }
    }
    """
    def _summary(doc_type: str) -> dict:
        fields = _get_lock_fields(doc_type)
        req = getattr(record, fields["unlock_request"]) or {}
        return {
            "locked":         bool(getattr(record, fields["locked"], False)),
            "unlock_status":  req.get("status"),            # None if no request
            "has_file":       bool(getattr(record, fields["file_url"])),
        }

    return {
        "result":      _summary("result"),
        "certificate": _summary("certificate"),
    }
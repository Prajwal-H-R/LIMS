import os
import copy
import uuid
import shutil
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    File,
    Form,
    UploadFile,
    status,
)
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..services import external_upload_service as service
from ..schemas import external_upload as schemas
from backend.db import get_db
from backend.auth import get_current_user
from backend.models.users import User

# ── Adjust these import paths to match your project structure ────────────────
from backend.models.external_upload import ExternalUpload
from backend.models.inward_equipments import InwardEquipment

logger = logging.getLogger(__name__)

# ── Upload directory setup ───────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

router = APIRouter(
    tags=["Manual Calibration Uploads"],
    responses={404: {"description": "Not found"}},
)


# ====================================================================
# REQUEST BODIES
# ====================================================================

class RequestUnlockBody(BaseModel):
    """Payload for engineer → unlock request."""
    doc_type: str   # "result" | "certificate"
    reason: str     # must be non-empty


class ActionUnlockBody(BaseModel):
    """Payload for admin → approve or reject an unlock request."""
    doc_type: str
    action: str                  # "APPROVED" | "REJECTED"
    comment: Optional[str] = ""  # mandatory when action == "REJECTED"


# ====================================================================
# RESPONSE SCHEMA (for unlock-requests list endpoint)
# ====================================================================

class UnlockRequestDetail(BaseModel):
    """
    Shape of a single unlock request entry returned by the
    admin list endpoint. Mirrors the frontend UnlockNotificationItem type.
    """
    inward_eqp_id:        int
    nepl_id:              str
    material_description: str
    doc_type:             str           # "result" | "certificate"
    unlock_request:       dict          # full JSONB payload + requested_by_name


# ====================================================================
# PRIVATE HELPERS
# ====================================================================

# Mapping from doc_type string → ORM column attribute names
_DOC_TYPE_MAP: dict[str, dict[str, str]] = {
    "result": {
        "locked":         "calibration_worksheet_locked",
        "unlock_request": "calibration_worksheet_unlock_request",
        "file_url":       "calibration_worksheet_file_url",
        "file_name":      "calibration_worksheet_file_name",
        "file_type":      "calibration_worksheet_file_type",
        "label":          "Calibration Worksheet",
    },
    "certificate": {
        "locked":         "certificate_locked",
        "unlock_request": "certificate_unlock_request",
        "file_url":       "certificate_file_url",
        "file_name":      "certificate_file_name",
        "file_type":      "certificate_file_type",
        "label":          "Certificate",
    },
}


def _get_lock_fields(doc_type: str) -> dict:
    """
    Returns the column-name mapping for doc_type.
    Raises HTTP 400 for unrecognised values.
    """
    try:
        return _DOC_TYPE_MAP[doc_type]
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Invalid doc_type '{doc_type}'. "
                f"Allowed values: {list(_DOC_TYPE_MAP.keys())}."
            ),
        )


def _require_admin(current_user: User) -> None:
    """Raise HTTP 403 if the caller is not an admin."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required for this action.",
        )


def _check_lock_permission(
    record: Optional[object],
    fields: dict,
    current_user: User,
) -> None:
    """
    Central lock gate for upload and delete operations.

    Allowed when:
      ✓ No record yet (first upload)
      ✓ Caller is admin
      ✓ File is not locked
      ✓ Unlock request status is APPROVED

    Raises HTTP 403 when:
      ✗ File is locked AND caller is not admin AND no APPROVED unlock request
    """
    if record is None:
        return  # first upload — always allowed

    if current_user.role == "admin":
        return  # admins bypass lock

    is_locked: bool = getattr(record, fields["locked"], False)
    if not is_locked:
        return  # file is not locked — allowed

    unlock_req: dict = getattr(record, fields["unlock_request"]) or {}
    req_status: Optional[str] = unlock_req.get("status")

    if req_status == "APPROVED":
        return  # engineer has explicit approval

    # Build a context-specific error message
    label = fields["label"]
    if req_status == "PENDING":
        message = (
            f"{label} is locked and an unlock request is pending admin review. "
            "Please wait for a decision."
        )
    elif req_status == "REJECTED":
        message = (
            f"{label} is locked. Your previous unlock request was rejected. "
            "Please submit a new request with more detail."
        )
    else:
        message = (
            f"{label} is locked. "
            "Submit an unlock request for admin approval to re-upload or delete."
        )

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={"code": "FILE_LOCKED", "message": message},
    )


def _delete_file_from_disk(file_url: Optional[str]) -> None:
    """
    Best-effort deletion of a previously saved file.
    Logs a warning on failure but does not raise.
    """
    if not file_url:
        return
    # file_url format: "/api/uploads/<filename>"
    filename = file_url.split("/")[-1]
    path = UPLOAD_DIR / filename
    try:
        path.unlink(missing_ok=True)
    except Exception:
        logger.warning(
            "Could not delete orphaned file: %s", path, exc_info=True
        )


def _resolve_engineer_name(db: Session, user_id: Optional[int]) -> Optional[str]:
    """
    Fetches the display name for a user_id.
    Returns None safely when user_id is None or user not found.
    """
    if user_id is None:
        return None
    engineer = db.query(User).filter(User.user_id == user_id).first()
    if engineer is None:
        return None
    return engineer.full_name or engineer.username or f"User #{user_id}"


# ====================================================================
# ROUTES
# ====================================================================

# ── GET /manual-calibration/equipment/{id}/documents ────────────────────────

@router.get(
    "/manual-calibration/equipment/{inward_eqp_id}/documents",
    response_model=schemas.ExternalUpload,
    summary="Get uploaded document details for a piece of equipment",
)
def get_upload_details(
    inward_eqp_id: int,
    db: Session = Depends(get_db),
):
    """
    Returns file metadata, lock flags, and unlock_request JSONB for both
    documents tied to this equipment ID.

    Raises 404 when no files have been uploaded yet.
    """
    db_upload = service.get_upload_by_equipment_id(
        db, inward_eqp_id=inward_eqp_id
    )
    if db_upload is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No uploaded documents found for this equipment.",
        )
    return db_upload


# ── POST /manual-calibration/equipment/{id}/upload ──────────────────────────

@router.post(
    "/manual-calibration/equipment/{inward_eqp_id}/upload",
    response_model=schemas.ExternalUpload,
    summary="Upload a calibration worksheet or certificate",
)
async def handle_document_upload(
    request: Request,
    inward_eqp_id: int,
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a single document ('result' or 'certificate') for a piece of equipment.

    Lock lifecycle
    ──────────────
    1. Locked file → engineer submits unlock request.
    2. Admin approves → file unlocked (APPROVED status set).
    3. Engineer re-uploads → file auto-locked again + APPROVED request cleared.

    The two document slots are locked independently.
    """
    fields = _get_lock_fields(doc_type)

    # ── 1. Lock check (before any disk I/O) ─────────────────────────────────
    existing = service.get_upload_by_equipment_id(db, inward_eqp_id)
    _check_lock_permission(existing, fields, current_user)

    # ── 2. Persist file to disk ──────────────────────────────────────────────
    unique_id      = uuid.uuid4().hex
    sanitized_name = os.path.basename(file.filename or "upload")
    saved_filename = f"{unique_id}_{sanitized_name}"
    file_path      = UPLOAD_DIR / saved_filename

    try:
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception:
        logger.error("Failed to save uploaded file to disk.", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error saving file. Please try again.",
        )
    finally:
        await file.close()

    file_url = f"/api/uploads/{saved_filename}"

    # ── 3. Upsert DB record ──────────────────────────────────────────────────
    try:
        db_record = service.upsert_document_for_equipment(
            db=db,
            inward_eqp_id=inward_eqp_id,
            doc_type=doc_type,
            file_name=file.filename,
            file_content_type=file.content_type,
            file_url=file_url,
            user_id=current_user.user_id,
        )
    except ValueError as exc:
        _delete_file_from_disk(file_url)
        logger.warning("ValueError during DB upsert: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception:
        _delete_file_from_disk(file_url)
        logger.error("Unexpected error updating DB record.", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error. Check server logs.",
        )

    # ── 4. Auto-lock + clear APPROVED request ────────────────────────────────
    setattr(db_record, fields["locked"], True)

    unlock_req: dict = copy.copy(
        getattr(db_record, fields["unlock_request"]) or {}
    )
    if unlock_req.get("status") == "APPROVED":
        setattr(db_record, fields["unlock_request"], None)

    db_record.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(db_record)

    logger.info(
        "Uploaded & locked | eqp_id=%s doc_type=%s user=%s file=%s",
        inward_eqp_id, doc_type, current_user.user_id, file.filename,
    )
    return db_record


# ── DELETE /manual-calibration/equipment/{id}/document/{doc_type} ───────────

@router.delete(
    "/manual-calibration/equipment/{inward_eqp_id}/document/{doc_type}",
    response_model=schemas.ExternalUpload,
    summary="Delete a specific document (nullify its DB fields)",
)
def handle_document_delete(
    inward_eqp_id: int,
    doc_type: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Nullifies the file URL, name, and type for the given doc_type,
    resets the lock flag to FALSE, and clears any unlock_request.

    After deletion the engineer can re-upload immediately without
    submitting a new unlock request.
    """
    fields = _get_lock_fields(doc_type)

    record = service.get_upload_by_equipment_id(db, inward_eqp_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No upload record found for this equipment.",
        )

    _check_lock_permission(record, fields, current_user)

    _delete_file_from_disk(getattr(record, fields["file_url"], None))

    setattr(record, fields["file_url"],       None)
    setattr(record, fields["file_name"],      None)
    setattr(record, fields["file_type"],      None)
    setattr(record, fields["locked"],         False)
    setattr(record, fields["unlock_request"], None)

    record.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(record)

    logger.info(
        "Document deleted & unlocked | eqp_id=%s doc_type=%s user=%s",
        inward_eqp_id, doc_type, current_user.user_id,
    )
    return record


# ── POST /manual-calibration/equipment/{id}/request-unlock ──────────────────

@router.post(
    "/manual-calibration/equipment/{inward_eqp_id}/request-unlock",
    response_model=schemas.ExternalUpload,
    summary="Engineer: submit an unlock request for a locked file",
)
def request_unlock(
    inward_eqp_id: int,
    body: RequestUnlockBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Engineer submits a reason to request that a locked file be unlocked.

    Rules
    ─────
    • File must currently be locked.
    • Duplicate PENDING requests are blocked.
    • Previous requests are archived in history[] for a full audit trail.
    • Engineers may re-submit after a REJECTED decision.
    """
    reason = (body.reason or "").strip()
    if not reason:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A reason is required to submit an unlock request.",
        )

    fields = _get_lock_fields(body.doc_type)

    record = service.get_upload_by_equipment_id(db, inward_eqp_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No upload record found for this equipment.",
        )

    if not getattr(record, fields["locked"], False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{fields['label']} is not currently locked.",
        )

    existing_req: dict = copy.deepcopy(
        getattr(record, fields["unlock_request"]) or {}
    )

    if existing_req.get("status") == "PENDING":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "An unlock request is already pending admin review. "
                "Please wait for a decision before submitting another."
            ),
        )

    # Archive the previous request into history[]
    history: list = list(existing_req.get("history", []))
    if existing_req.get("status"):
        history.append({
            "status":          existing_req.get("status"),
            "engineer_reason": existing_req.get("engineer_reason"),
            "admin_comment":   existing_req.get("admin_comment"),
            "requested_at":    existing_req.get("requested_at"),
            "actioned_at":     existing_req.get("actioned_at"),
        })

    new_request: dict = {
        "status":          "PENDING",
        "engineer_reason": reason,
        "requested_by":    current_user.user_id,
        "requested_at":    datetime.now(timezone.utc).isoformat(),
        "admin_comment":   None,
        "actioned_by":     None,
        "actioned_at":     None,
        "history":         history,
    }

    setattr(record, fields["unlock_request"], new_request)
    record.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(record)

    logger.info(
        "Unlock requested | eqp_id=%s doc_type=%s user=%s reason='%s'",
        inward_eqp_id, body.doc_type, current_user.user_id, reason,
    )
    return record


# ── POST /manual-calibration/equipment/{id}/action-unlock ───────────────────

@router.post(
    "/manual-calibration/equipment/{inward_eqp_id}/action-unlock",
    response_model=schemas.ExternalUpload,
    summary="Admin: approve or reject an engineer's unlock request",
)
def action_unlock(
    inward_eqp_id: int,
    body: ActionUnlockBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Admin approves or rejects a PENDING unlock request.

    APPROVED → locked flag set to FALSE; engineer may re-upload immediately.
    REJECTED → locked flag unchanged; engineer must re-submit with more detail.

    A comment is mandatory on rejection.
    History is preserved for auditing.
    """
    _require_admin(current_user)

    if body.action not in ("APPROVED", "REJECTED"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="action must be 'APPROVED' or 'REJECTED'.",
        )

    comment = (body.comment or "").strip()
    if body.action == "REJECTED" and not comment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A comment is required when rejecting an unlock request.",
        )

    fields = _get_lock_fields(body.doc_type)

    record = service.get_upload_by_equipment_id(db, inward_eqp_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No upload record found for this equipment.",
        )

    unlock_req: dict = copy.deepcopy(
        getattr(record, fields["unlock_request"]) or {}
    )

    if unlock_req.get("status") != "PENDING":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"No pending unlock request found for {fields['label']}. "
                "Cannot action a request that is not in PENDING state."
            ),
        )

    unlock_req["status"]        = body.action
    unlock_req["admin_comment"] = comment
    unlock_req["actioned_by"]   = current_user.user_id
    unlock_req["actioned_at"]   = datetime.now(timezone.utc).isoformat()

    setattr(record, fields["unlock_request"], unlock_req)

    if body.action == "APPROVED":
        setattr(record, fields["locked"], False)

    record.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(record)

    logger.info(
        "Unlock %s | eqp_id=%s doc_type=%s admin=%s comment='%s'",
        body.action, inward_eqp_id, body.doc_type,
        current_user.user_id, comment,
    )
    return record


# ── GET /manual-calibration/unlock-requests ─────────────────────────────────

@router.get(
    "/manual-calibration/unlock-requests",
    response_model=List[UnlockRequestDetail],
    summary="Admin: list all equipment with active unlock requests",
)
def list_unlock_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns every ExternalUpload row that has a non-null unlock_request
    on the calibration worksheet, the certificate, or both.

    Each document slot is returned as a separate entry so the frontend
    can render one card per (equipment, doc_type) pair.

    Sort order
    ──────────
    1. PENDING requests first (newest first within group)
    2. Non-pending (APPROVED / REJECTED) newest first

    Admin only.
    """
    _require_admin(current_user)

    # ── 1. Fetch all ExternalUpload rows with at least one unlock_request ────
    try:
        records = (
            db.query(ExternalUpload)
            .filter(
                or_(
                    ExternalUpload.calibration_worksheet_unlock_request.isnot(None),
                    ExternalUpload.certificate_unlock_request.isnot(None),
                )
            )
            .all()
        )
    except Exception:
        logger.error(
            "Failed to query ExternalUpload for unlock requests.", exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve unlock requests.",
        )

    result: list[dict] = []

    for rec in records:

        # ── 2. Resolve equipment details ─────────────────────────────────────
        try:
            eqp = (
                db.query(InwardEquipment)
                .filter(InwardEquipment.inward_eqp_id == rec.inward_eqp_id)
                .first()
            )
        except Exception:
            logger.warning(
                "Could not resolve InwardEquipment for inward_eqp_id=%s",
                rec.inward_eqp_id,
                exc_info=True,
            )
            eqp = None

        nepl_id              = getattr(eqp, "nepl_id", None) or str(rec.inward_eqp_id)
        material_description = getattr(eqp, "material_description", None) or ""

        # ── 3. One entry per document slot that has an unlock_request ────────
        slots = [
            ("result",      rec.calibration_worksheet_unlock_request),
            ("certificate", rec.certificate_unlock_request),
        ]

        for doc_type, raw_req in slots:
            if raw_req is None:
                continue  # this slot has no request — skip

            # Defensive copy so we don't mutate the ORM object
            req_payload: dict = copy.deepcopy(raw_req)

            # ── 4. Enrich with engineer's display name ───────────────────────
            req_payload["requested_by_name"] = _resolve_engineer_name(
                db, req_payload.get("requested_by")
            )

            result.append(
                {
                    "inward_eqp_id":        rec.inward_eqp_id,
                    "nepl_id":              nepl_id,
                    "material_description": material_description,
                    "doc_type":             doc_type,
                    "unlock_request":       req_payload,
                }
            )

    # ── 5. Sort: PENDING first (newest), then others (newest) ───────────────
    def _sort_key(item: dict) -> tuple:
        req          = item["unlock_request"]
        is_pending   = 0 if req.get("status") == "PENDING" else 1
        requested_at = req.get("requested_at") or ""
        return (is_pending, requested_at)

    result.sort(key=_sort_key, reverse=False)

    # Within each group, newest first → reverse the date component
    pending    = [r for r in result if r["unlock_request"].get("status") == "PENDING"]
    non_pending = [r for r in result if r["unlock_request"].get("status") != "PENDING"]

    pending.sort(
        key=lambda r: r["unlock_request"].get("requested_at") or "",
        reverse=True,   # newest PENDING first
    )
    non_pending.sort(
        key=lambda r: r["unlock_request"].get("requested_at") or "",
        reverse=True,   # newest actioned first
    )

    logger.info(
        "Unlock requests listed | admin=%s pending=%d others=%d",
        current_user.user_id, len(pending), len(non_pending),
    )

    return pending + non_pending
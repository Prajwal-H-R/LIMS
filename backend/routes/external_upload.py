import os
import copy
import uuid
import shutil
import logging
from datetime import datetime, timezone, date
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
from backend.models.external_upload import ExternalUpload
from backend.models.inward_equipments import InwardEquipment

logger = logging.getLogger(__name__)

# ── Upload directory ─────────────────────────────────────────────────────────
BASE_DIR   = Path(__file__).resolve().parent.parent
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
    doc_type: str
    reason: str


class ActionUnlockBody(BaseModel):
    doc_type: str
    action: str
    comment: Optional[str] = ""


class UpdateDatesBody(BaseModel):
    """
    Payload for the standalone date-update endpoint.
    Both fields are optional so callers can patch either or both.
    """
    report_date: Optional[date] = None
    recommended_cal_due_date: Optional[date] = None


# ====================================================================
# RESPONSE SCHEMA (unlock-requests list)
# ====================================================================

class UnlockRequestDetail(BaseModel):
    inward_eqp_id:        int
    nepl_id:              str
    material_description: str
    doc_type:             str
    unlock_request:       dict


# ====================================================================
# PRIVATE HELPERS
# ====================================================================

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
    if record is None:
        return
    if current_user.role == "admin":
        return

    is_locked: bool = getattr(record, fields["locked"], False)
    if not is_locked:
        return

    unlock_req: dict = getattr(record, fields["unlock_request"]) or {}
    req_status: Optional[str] = unlock_req.get("status")

    if req_status == "APPROVED":
        return

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
    if not file_url:
        return
    filename = file_url.split("/")[-1]
    path = UPLOAD_DIR / filename
    try:
        path.unlink(missing_ok=True)
    except Exception:
        logger.warning("Could not delete orphaned file: %s", path, exc_info=True)


def _resolve_engineer_name(db: Session, user_id: Optional[int]) -> Optional[str]:
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
    db_upload = service.get_upload_by_equipment_id(db, inward_eqp_id=inward_eqp_id)
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
    report_date: Optional[date] = Form(
        default=None,
        description="Report date (YYYY-MM-DD). Certificate uploads only.",
    ),
    recommended_cal_due_date: Optional[date] = Form(
        default=None,
        description="Next calibration due date (YYYY-MM-DD). Certificate uploads only.",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a single document ('result' or 'certificate').

    For **certificate** uploads you may also supply:
    - `report_date`              — date printed on the certificate
    - `recommended_cal_due_date` — next due date for calibration

    These two fields are ignored when `doc_type == 'result'`.

    The service layer handles:
      - DB upsert
      - Auto-locking
      - Clearing APPROVED unlock requests
      - Committing and refreshing

    The router does NOT issue a second commit.
    """
    fields = _get_lock_fields(doc_type)

    # ── Note if date fields are being ignored ────────────────────────
    if doc_type != "certificate" and (
        report_date is not None or recommended_cal_due_date is not None
    ):
        logger.debug(
            "Date fields supplied for doc_type='%s' on inward_eqp_id=%s; "
            "they will be ignored by the service layer.",
            doc_type,
            inward_eqp_id,
        )

    # ── 1. Lock check ────────────────────────────────────────────────
    existing = service.get_upload_by_equipment_id(db, inward_eqp_id)
    _check_lock_permission(existing, fields, current_user)

    # ── 2. Persist file to disk ──────────────────────────────────────
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

    # ── 3. Upsert DB record ──────────────────────────────────────────
    # The service handles: file fields, date fields, auto-lock,
    # clearing APPROVED unlock request, flush, commit, and refresh.
    # ⚠️  Do NOT add a second db.commit() after this call.
    try:
        db_record = service.upsert_document_for_equipment(
            db=db,
            inward_eqp_id=inward_eqp_id,
            doc_type=doc_type,
            file_name=file.filename,
            file_content_type=file.content_type,
            file_url=file_url,
            user_id=current_user.user_id,
            report_date=report_date,
            recommended_cal_due_date=recommended_cal_due_date,
        )
    except ValueError as exc:
        _delete_file_from_disk(file_url)
        logger.warning(
            "ValueError during DB upsert | inward_eqp_id=%s error=%s",
            inward_eqp_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception:
        _delete_file_from_disk(file_url)
        logger.error(
            "Unexpected error during DB upsert | inward_eqp_id=%s",
            inward_eqp_id,
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error. Check server logs.",
        )

    logger.info(
        "Uploaded & locked | eqp_id=%s doc_type=%s user=%s file=%s "
        "report_date=%s cal_due=%s",
        inward_eqp_id,
        doc_type,
        current_user.user_id,
        file.filename,
        report_date,
        recommended_cal_due_date,
    )
    return db_record


# ── PATCH /manual-calibration/equipment/{id}/dates ──────────────────────────

@router.patch(
    "/manual-calibration/equipment/{inward_eqp_id}/dates",
    response_model=schemas.ExternalUpload,
    summary="Update report_date and/or recommended_cal_due_date without re-uploading",
)
def update_dates(
    inward_eqp_id: int,
    body: UpdateDatesBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Patch only the date fields on an existing upload record.

    - Both fields are optional; supply whichever needs changing.
    - Does **not** affect file content, lock state, or unlock requests.
    - Available to both engineers and admins.
    - Record must exist (returns 404 otherwise).
    """
    if body.report_date is None and body.recommended_cal_due_date is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "At least one date field must be provided: "
                "'report_date' or 'recommended_cal_due_date'."
            ),
        )

    try:
        db_record = service.update_date_fields(
            db=db,
            inward_eqp_id=inward_eqp_id,
            report_date=body.report_date,
            recommended_cal_due_date=body.recommended_cal_due_date,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    logger.info(
        "Dates updated | eqp_id=%s user=%s report_date=%s cal_due=%s",
        inward_eqp_id,
        current_user.user_id,
        body.report_date,
        body.recommended_cal_due_date,
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
    Delegates fully to the service layer which handles:
      - Nullifying file fields
      - Clearing date fields (certificate only)
      - Resetting lock to FALSE
      - Clearing unlock_request
      - flush + commit + refresh
    """
    fields = _get_lock_fields(doc_type)

    record = service.get_upload_by_equipment_id(db, inward_eqp_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No upload record found for this equipment.",
        )

    _check_lock_permission(record, fields, current_user)

    # ── Delete physical file from disk before nullifying the URL ────
    _delete_file_from_disk(getattr(record, fields["file_url"], None))

    # ── Delegate all DB operations to the service ────────────────────
    updated_record = service.delete_document_for_equipment(
        db=db,
        inward_eqp_id=inward_eqp_id,
        doc_type=doc_type,
    )

    logger.info(
        "Document deleted & unlocked | eqp_id=%s doc_type=%s user=%s",
        inward_eqp_id,
        doc_type,
        current_user.user_id,
    )
    return updated_record


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
    reason = (body.reason or "").strip()
    if not reason:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A reason is required to submit an unlock request.",
        )

    try:
        db_record = service.submit_unlock_request(
            db=db,
            inward_eqp_id=inward_eqp_id,
            doc_type=body.doc_type,
            reason=reason,
            requested_by=current_user.user_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    logger.info(
        "Unlock requested | eqp_id=%s doc_type=%s user=%s reason='%s'",
        inward_eqp_id,
        body.doc_type,
        current_user.user_id,
        reason,
    )
    return db_record


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

    try:
        db_record = service.action_unlock_request(
            db=db,
            inward_eqp_id=inward_eqp_id,
            doc_type=body.doc_type,
            action=body.action,
            comment=comment,
            actioned_by=current_user.user_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    logger.info(
        "Unlock %s | eqp_id=%s doc_type=%s admin=%s comment='%s'",
        body.action,
        inward_eqp_id,
        body.doc_type,
        current_user.user_id,
        comment,
    )
    return db_record


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
    _require_admin(current_user)

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

        slots = [
            ("result",      rec.calibration_worksheet_unlock_request),
            ("certificate", rec.certificate_unlock_request),
        ]

        for doc_type, raw_req in slots:
            if raw_req is None:
                continue

            req_payload: dict = copy.deepcopy(raw_req)
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

    pending     = [r for r in result if r["unlock_request"].get("status") == "PENDING"]
    non_pending = [r for r in result if r["unlock_request"].get("status") != "PENDING"]

    pending.sort(
        key=lambda r: r["unlock_request"].get("requested_at") or "",
        reverse=True,
    )
    non_pending.sort(
        key=lambda r: r["unlock_request"].get("requested_at") or "",
        reverse=True,
    )

    logger.info(
        "Unlock requests listed | admin=%s pending=%d others=%d",
        current_user.user_id,
        len(pending),
        len(non_pending),
    )

    return pending + non_pending
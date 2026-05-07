# customer_portal_service.py

import json
from datetime import datetime
from typing import List, Optional, Dict, Any, Iterable

from sqlalchemy.orm import Session, selectinload
from sqlalchemy import select, and_, or_
from fastapi import HTTPException, status
import logging

# ORM Models
from backend.models.users import User
from backend.models.inward import Inward
from backend.models.inward_equipments import InwardEquipment
from backend.models.invitations import Invitation
from backend.models.srfs import Srf
from backend.models.customers import Customer
from backend.models.htw.htw_job import HTWJob
from backend.models.external_upload import ExternalUpload
from backend.models.external_deviation import ExternalDeviation
from backend.models.deviation import Deviation
from backend.models.certificate.certificate import HTWCertificate

# Schemas
from backend.schemas.customer_schemas import RemarksSubmissionRequest, InwardForCustomer
from backend.core import security
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

logger = logging.getLogger(__name__)


# ================================================================== #
#  STATUS CONSTANTS                                                    #
# ================================================================== #

class InwardStatus:
    DRAFT       = "draft"
    CREATED     = "created"
    REVIEWED    = "reviewed"
    UPDATED     = "updated"
    SRF_CREATED = "srf_created"


class SrfStatus:
    DRAFT            = "draft"
    CREATED          = "created"
    INWARD_COMPLETED = "inward_completed"
    APPROVED         = "approved"
    REJECTED         = "rejected"


class JobStatus:
    CREATED       = "created"
    IN_PROGRESS   = "in_progress"
    COMPLETED     = "completed"
    CALIBRATED    = "calibrated"
    COMPLETED_OOT = "completed_oot"
    ON_HOLD       = "on_hold"
    TERMINATED    = "terminated"
    CLOSED        = "closed"

    ACTIVE_SET     = {CREATED, IN_PROGRESS}
    COMPLETED_SET  = {COMPLETED, CALIBRATED, CLOSED}
    ON_HOLD_SET    = {ON_HOLD, "hold", "onhold"}
    TERMINATED_SET = {TERMINATED}


class DeviationStatus:
    OPEN        = "open"
    IN_PROGRESS = "in_progress"
    CLOSED      = "closed"

    ACTIVE_SET = {OPEN, IN_PROGRESS, "inprogress", "pending"}
    CLOSED_SET = {CLOSED, "resolved", "rejected"}


class CertStatus:
    DRAFT    = "draft"
    CREATED  = "created"
    REWORK   = "rework"
    APPROVED = "approved"
    ISSUED   = "issued"

    READY_SET      = {"approved"}
    DISPATCHED_SET = {"issued"}

    PRIORITY: Dict[str, int] = {
        "issued":   4,
        "approved": 3,
        "created":  2,
        "rework":   1,
        "draft":    0,
    }


# ================================================================== #
#  INTERNAL SENTINEL                                                   #
# ================================================================== #

class _UploadSentinel:
    calibration_worksheet_file_url: Optional[str] = None
    certificate_file_url:           Optional[str] = None
    updated_at:                     Optional[datetime] = None


# ================================================================== #
#  HELPERS                                                             #
# ================================================================== #

def _safe_strftime(dt: Optional[Any], fmt: str, fallback: str) -> str:
    if dt is None:
        return fallback
    try:
        return dt.strftime(fmt)
    except Exception:
        return fallback


# ================================================================== #
#  SERVICE                                                             #
# ================================================================== #

class CustomerPortalService:

    HTW_KEYWORDS = [
        "hydraulic torque wrench",
        "htw",
    ]

    def __init__(self, db: Session):
        self.db = db

    # ---------------------------------------------------------------- #
    #  PHOTO PATH HELPER                                                 #
    # ---------------------------------------------------------------- #

    @staticmethod
    def _format_photo_paths(photos: Optional[Any]) -> List[str]:
        if not photos:
            return []
        if isinstance(photos, str):
            try:
                loaded = json.loads(photos)
                photos_iterable: Iterable[Any] = (
                    loaded if isinstance(loaded, list) else [loaded]
                )
            except Exception:
                photos_iterable = [photos]
        else:
            photos_iterable = photos

        formatted: List[str] = []
        for photo in photos_iterable:
            if not photo:
                continue
            path = str(photo).replace("\\", "/")
            if path.startswith("http://") or path.startswith("https://"):
                formatted.append(path)
                continue
            path = path.lstrip("/")
            if not path:
                continue
            if path.startswith("uploads/"):
                formatted.append(f"/api/{path}")
            elif path.startswith("api/uploads/"):
                formatted.append(f"/{path}")
            else:
                formatted.append(f"/{path}")
        return formatted

    # ---------------------------------------------------------------- #
    #  HTW DETECTION                                                     #
    # ---------------------------------------------------------------- #

    def _is_htw_equipment(self, equipment: InwardEquipment) -> bool:
        haystack = " ".join(filter(None, [
            (equipment.material_description or "").lower(),
            (equipment.calibration_by or "").lower(),
        ]))
        return any(kw in haystack for kw in self.HTW_KEYWORDS)

    # ---------------------------------------------------------------- #
    #  DEVIATION STATE HELPERS                                           #
    # ---------------------------------------------------------------- #

    @staticmethod
    def _check_htw_deviation_state(
        deviation_records: List[Any],
    ) -> tuple[bool, bool]:
        if not deviation_records:
            return False, False

        has_active = False
        for dev in deviation_records:
            raw  = (getattr(dev, "status", None) or "").strip().lower()
            norm = raw.replace(" ", "_")
            if norm in DeviationStatus.ACTIVE_SET or (
                norm and norm not in DeviationStatus.CLOSED_SET
            ):
                has_active = True
                break

        return has_active, not has_active

    @staticmethod
    def _check_external_deviation_state(
        has_deviation_record:     bool,
        has_certificate_uploaded: bool,
    ) -> tuple[bool, bool]:
        if not has_deviation_record:
            return False, False
        if has_certificate_uploaded:
            return False, True
        return True, False

    # ---------------------------------------------------------------- #
    #  LISTING METHODS                                                   #
    # ---------------------------------------------------------------- #

    def get_firs_for_customer_list(self, customer_id: int) -> List[Inward]:
        stmt = (
            select(Inward)
            .where(and_(
                Inward.customer_id == customer_id,
                or_(
                    Inward.status == InwardStatus.CREATED,
                    Inward.status == InwardStatus.REVIEWED,
                    Inward.status == InwardStatus.UPDATED,
                ),
            ))
            .order_by(Inward.material_inward_date.desc())
        )
        return self.db.scalars(stmt).all()

    def get_srfs_for_customer(self, customer_id: int) -> Dict[str, List[Srf]]:
        inward_ids = self.db.scalars(
            select(Inward.inward_id).where(Inward.customer_id == customer_id)
        ).all()

        if not inward_ids:
            return {"pending": [], "approved": [], "rejected": []}

        all_srfs = self.db.scalars(
            select(Srf)
            .where(Srf.inward_id.in_(inward_ids))
            .options(selectinload(Srf.inward))
            .order_by(Srf.created_at.desc())
        ).all()

        categorised: Dict[str, list] = {
            "pending": [], "approved": [], "rejected": []
        }
        for srf in all_srfs:
            s = srf.status.lower()
            if s == SrfStatus.APPROVED:
                categorised["approved"].append(srf)
            elif s == SrfStatus.REJECTED:
                categorised["rejected"].append(srf)
            elif s == SrfStatus.INWARD_COMPLETED:
                categorised["pending"].append(srf)

        return categorised

    # ---------------------------------------------------------------- #
    #  SRF STATUS UPDATE                                                 #
    # ---------------------------------------------------------------- #

    async def update_srf_status(
        self,
        srf_id:      int,
        customer_id: int,
        new_status:  str,
        remarks:     Optional[str] = None,
    ) -> Srf:
        srf = (
            self.db.query(Srf)
            .join(Inward)
            .filter(Srf.srf_id == srf_id, Inward.customer_id == customer_id)
            .first()
        )
        if not srf:
            raise HTTPException(
                status_code=404,
                detail="SRF not found or you do not have permission to access it.",
            )

        valid_initial = [
            SrfStatus.INWARD_COMPLETED, SrfStatus.CREATED,
            "pending", "reviewed", "updated",
        ]
        if srf.status.lower() not in valid_initial:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot update SRF from status: '{srf.status}'",
            )

        srf.status = new_status
        if new_status == SrfStatus.REJECTED and remarks:
            srf.remarks = remarks
        srf.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(srf)
        return srf

    # ---------------------------------------------------------------- #
    #  ACCOUNT ACTIVATION                                                #
    # ---------------------------------------------------------------- #

    def activate_account_and_set_password(self, token: str, new_password: str) -> str:
        invitation = self.db.scalars(
            select(Invitation).where(Invitation.token == token)
        ).first()

        if (
            not invitation
            or invitation.used_at
            or invitation.expires_at < datetime.utcnow()
        ):
            raise HTTPException(
                status_code=400,
                detail="Invalid or expired invitation token.",
            )

        user = self.db.scalars(
            select(User).where(User.email == invitation.email)
        ).first()
        if not user:
            raise HTTPException(
                status_code=404,
                detail="Associated user account not found.",
            )

        user.password_hash = pwd_context.hash(new_password)
        user.is_active     = True
        invitation.used_at = datetime.utcnow()
        self.db.commit()

        return security.create_access_token(data={
            "user_id":     user.user_id,
            "sub":         user.email,
            "role":        user.role,
            "customer_id": user.customer_id,
        })

    # ---------------------------------------------------------------- #
    #  FIR & REMARKS                                                     #
    # ---------------------------------------------------------------- #

    def get_fir_for_customer_review(
        self, inward_id: int, customer_id: Optional[int] = None
    ) -> InwardForCustomer:
        try:
            stmt = select(Inward).where(
                Inward.inward_id == inward_id,
                Inward.is_draft.is_(False),
            )
            if customer_id:
                stmt = stmt.where(Inward.customer_id == customer_id)

            inward = self.db.scalars(stmt).first()
            if not inward:
                raise HTTPException(
                    status_code=404,
                    detail="Inward record not found or access denied.",
                )

            sorted_equipments = (
                self.db.query(InwardEquipment)
                .filter(InwardEquipment.inward_id == inward_id)
                .order_by(InwardEquipment.inward_eqp_id)
                .all()
            )

            equipment_list = [
                {
                    "inward_eqp_id":           eq.inward_eqp_id,
                    "nepl_id":                 eq.nepl_id,
                    "material_description":    eq.material_description,
                    "make":                    eq.make,
                    "model":                   eq.model,
                    "range":                   eq.range,
                    "serial_no":               eq.serial_no,
                    "visual_inspection_notes": eq.visual_inspection_notes,
                    "customer_remarks":        eq.customer_remarks,
                    "engineer_remarks":        eq.engineer_remarks,
                    "photos":                  self._format_photo_paths(eq.photos),
                    "status":                  eq.status,
                }
                for eq in sorted_equipments
            ]

            return InwardForCustomer(
                inward_id=inward.inward_id,
                srf_no=inward.srf_no,
                material_inward_date=inward.material_inward_date,
                status=inward.status,
                customer_dc_no=inward.customer_dc_no,
                equipments=equipment_list,
            )

        except HTTPException:
            raise
        except Exception as e:
            logger.error(
                "CRITICAL ERROR in get_fir_for_customer_review: %s",
                e, exc_info=True,
            )
            raise HTTPException(
                status_code=500,
                detail="Failed to retrieve FIR details.",
            )

    def submit_customer_remarks(
        self,
        inward_id:    int,
        remarks_data: RemarksSubmissionRequest,
        customer_id:  Optional[int] = None,
    ) -> Dict[str, Any]:
        try:
            stmt = select(Inward).where(Inward.inward_id == inward_id)
            if customer_id:
                stmt = stmt.where(Inward.customer_id == customer_id)

            inward = self.db.scalars(stmt).first()
            if not inward:
                raise HTTPException(
                    status_code=404,
                    detail="Inward record not found or access denied",
                )

            reviewable = [
                InwardStatus.CREATED,
                InwardStatus.REVIEWED,
                InwardStatus.UPDATED,
            ]
            if inward.status not in reviewable:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"FIR has been finalized. Current status: {inward.status}",
                )

            eqp_remark_map: Dict[int, Optional[str]] = {}
            for item in remarks_data.remarks:
                remark_val = getattr(
                    item, "customer_remarks",
                    getattr(item, "customer_remark", None),
                )
                eqp_remark_map[item.inward_eqp_id] = remark_val

            if eqp_remark_map:
                equipments = self.db.scalars(
                    select(InwardEquipment).where(
                        InwardEquipment.inward_id == inward_id,
                        InwardEquipment.inward_eqp_id.in_(eqp_remark_map.keys()),
                    )
                ).all()
                for eqp in equipments:
                    new_remark = eqp_remark_map.get(eqp.inward_eqp_id)
                    if new_remark is not None:
                        eqp.customer_remarks = new_remark
                        eqp.status           = InwardStatus.REVIEWED
                        eqp.updated_at       = datetime.utcnow()

            if inward.status == InwardStatus.CREATED:
                inward.status = InwardStatus.REVIEWED

            inward.updated_at = datetime.utcnow()
            self.db.commit()
            return {"message": "Remarks submitted successfully", "status": inward.status}

        except HTTPException:
            raise
        except Exception as e:
            self.db.rollback()
            logger.error("Error submitting customer remarks: %s", e, exc_info=True)
            raise HTTPException(
                status_code=500,
                detail="Failed to submit remarks",
            )

    # ================================================================ #
    #  TIMELINE BUILDERS                                                 #
    # ================================================================ #

    def _build_htw_timeline(
        self,
        equipment:            InwardEquipment,
        inward:               Inward,
        job:                  Optional[HTWJob],
        cert:                 Optional[HTWCertificate],
        has_active_deviation: bool,
        deviation_was_closed: bool,
    ) -> Dict[str, Any]:

        steps = [
            {"label": "Received",                "icon": "box"},
            {"label": "Inward",                  "icon": "file"},
            {"label": "Calibration In Progress", "icon": "settings"},
            {"label": "Calibration Completed",   "icon": "check"},
            {"label": "Certificate Ready",       "icon": "badge"},
            {"label": "Certificate Dispatched",  "icon": "truck"},
        ]

        received_date = _safe_strftime(
            inward.material_inward_date, "%Y-%m-%d",
            datetime.now().strftime("%Y-%m-%d"),
        )
        inward_date = _safe_strftime(
            inward.created_at, "%Y-%m-%d %H:%M", received_date
        )
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M")

        activity_log: List[Dict[str, str]] = [
            {
                "date":        received_date,
                "title":       "Material Received",
                "description": f"Received at gate via DC: {inward.customer_dc_no or 'N/A'}",
                "type":        "info",
            },
            {
                "date":        inward_date,
                "title":       "Inward Entry Created",
                "description": f"SRF Generated: {inward.srf_no}",
                "type":        "info",
            },
        ]

        current_step   = 1
        display_status = "Inward Generated"
        alert_message: Optional[str] = None

        # ── Job logic ─────────────────────────────────────────────────
        if job:
            raw  = (job.job_status or "").strip().lower()
            norm = raw.replace(" ", "_").replace("-", "_")
            job_ts = _safe_strftime(job.created_at, "%Y-%m-%d %H:%M", now_str)

            if norm in JobStatus.TERMINATED_SET:
                current_step   = 2
                display_status = "Terminated"
                alert_message  = (
                    "The calibration job for this equipment has been terminated. "
                    "Please contact the lab for further assistance."
                )
                activity_log.append({
                    "date":        job_ts,
                    "title":       "Calibration Started",
                    "description": f"Job #{job.job_id} was assigned.",
                    "type":        "info",
                })
                activity_log.append({
                    "date":        now_str,
                    "title":       "Calibration Terminated",
                    "description": "The calibration process was terminated. Please contact the lab.",
                    "type":        "error",
                })

            elif norm in JobStatus.ON_HOLD_SET:
                current_step = 2
                activity_log.append({
                    "date":        job_ts,
                    "title":       "Calibration Started",
                    "description": f"Job #{job.job_id} was assigned.",
                    "type":        "info",
                })

                if has_active_deviation:
                    display_status = "Deviation Raised"
                    alert_message  = (
                        "A deviation has been raised for this equipment and it is "
                        "currently on hold. Our team will contact you shortly."
                    )
                    activity_log.append({
                        "date":        now_str,
                        "title":       "Deviation Raised – Equipment On Hold",
                        "description": "Equipment is on hold due to an active deviation. Awaiting decision.",
                        "type":        "warning",
                    })
                elif deviation_was_closed:
                    display_status = "Calibration In Progress"
                    activity_log.append({
                        "date":        now_str,
                        "title":       "Deviation Resolved – Calibration Resuming",
                        "description": "The deviation has been closed. Calibration is resuming.",
                        "type":        "success",
                    })
                else:
                    display_status = "Calibration On Hold"
                    alert_message  = (
                        "This equipment's calibration is currently on hold. "
                        "Please contact the lab for more information."
                    )
                    activity_log.append({
                        "date":        now_str,
                        "title":       "Calibration On Hold",
                        "description": "Equipment is on hold. Awaiting further action.",
                        "type":        "warning",
                    })

            elif norm == JobStatus.COMPLETED_OOT:
                current_step   = 3
                display_status = "Calibration Completed (OOT)"
                alert_message  = (
                    "Calibration was completed but the instrument is Out Of Tolerance. "
                    "Please review the results."
                )
                activity_log.append({
                    "date":        job_ts,
                    "title":       "Calibration Started",
                    "description": f"Job #{job.job_id} was assigned.",
                    "type":        "info",
                })
                activity_log.append({
                    "date":        now_str,
                    "title":       "Calibration Completed – Out Of Tolerance",
                    "description": "Final readings recorded. Instrument is out of tolerance.",
                    "type":        "warning",
                })

            elif norm in JobStatus.COMPLETED_SET:
                current_step   = 3
                display_status = "Calibration Completed"
                activity_log.append({
                    "date":        job_ts,
                    "title":       "Calibration Started",
                    "description": f"Job #{job.job_id} was assigned.",
                    "type":        "info",
                })
                activity_log.append({
                    "date":        now_str,
                    "title":       "Calibration Completed",
                    "description": "Final readings recorded and verified.",
                    "type":        "success",
                })

            elif norm in JobStatus.ACTIVE_SET or raw:
                current_step   = 2
                display_status = "Calibration In Progress"
                activity_log.append({
                    "date":        job_ts,
                    "title":       "Calibration Started",
                    "description": f"Job #{job.job_id} assigned to technician.",
                    "type":        "info",
                })

        # ── Certificate logic ─────────────────────────────────────────
        if cert:
            cert_status = (cert.status or "").strip().lower()

            if cert_status in CertStatus.DISPATCHED_SET:
                current_step   = 5
                display_status = "Certificate Dispatched"
                alert_message  = None
                issued_date    = _safe_strftime(
                    getattr(cert, "issued_at", None), "%Y-%m-%d %H:%M", now_str
                )
                activity_log.append({
                    "date":        issued_date,
                    "title":       "Certificate Issued & Dispatched",
                    "description": (
                        f"Certificate No: {cert.certificate_no} has been "
                        "issued and dispatched to the customer."
                    ),
                    "type": "success",
                })

            elif cert_status in CertStatus.READY_SET:
                current_step   = 4
                display_status = "Certificate Ready"
                alert_message  = None
                approved_date  = _safe_strftime(
                    getattr(cert, "approved_at", None), "%Y-%m-%d %H:%M", now_str
                )
                activity_log.append({
                    "date":        approved_date,
                    "title":       "Certificate Ready",
                    "description": (
                        f"Certificate No: {cert.certificate_no} has been "
                        "approved and is ready for dispatch."
                    ),
                    "type": "success",
                })

        return self._assemble_timeline(
            steps, current_step, display_status,
            received_date, inward_date, activity_log, alert_message,
        )

    # ---------------------------------------------------------------- #
    #  NON-HTW TIMELINE                                                  #
    # ---------------------------------------------------------------- #

    def _build_external_timeline(
        self,
        equipment:            InwardEquipment,
        inward:               Inward,
        ext_upload:           Any,
        cert:                 Optional[HTWCertificate],
        has_active_deviation: bool,
        deviation_resolved:   bool,
    ) -> Dict[str, Any]:

        steps = [
            {"label": "Received",                "icon": "box"},
            {"label": "Inward",                  "icon": "file"},
            {"label": "Calibration In Progress", "icon": "settings"},
            {"label": "Certificate Ready",       "icon": "badge"},
            {"label": "Certificate Dispatched",  "icon": "truck"},
        ]

        received_date = _safe_strftime(
            inward.material_inward_date, "%Y-%m-%d",
            datetime.now().strftime("%Y-%m-%d"),
        )
        inward_date = _safe_strftime(
            inward.created_at, "%Y-%m-%d %H:%M", received_date
        )
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M")

        activity_log: List[Dict[str, str]] = [
            {
                "date":        received_date,
                "title":       "Material Received",
                "description": f"Received at gate via DC: {inward.customer_dc_no or 'N/A'}",
                "type":        "info",
            },
            {
                "date":        inward_date,
                "title":       "Inward Entry Created",
                "description": f"SRF Generated: {inward.srf_no}",
                "type":        "info",
            },
        ]

        current_step   = 1
        display_status = "Inward Generated"
        alert_message: Optional[str] = None

        upload_ts = _safe_strftime(
            getattr(ext_upload, "updated_at", None),
            "%Y-%m-%d %H:%M", now_str,
        )

        has_calibration_doc = bool(
            ext_upload
            and getattr(ext_upload, "calibration_worksheet_file_url", None)
        )
        has_certificate_doc = bool(
            ext_upload
            and getattr(ext_upload, "certificate_file_url", None)
        )

        if has_calibration_doc:
            current_step   = 2
            display_status = "Calibration In Progress"
            activity_log.append({
                "date":        upload_ts,
                "title":       "Calibration In Progress",
                "description": "Calibration worksheet has been uploaded by the lab.",
                "type":        "info",
            })

        if has_active_deviation:
            current_step   = 2
            display_status = "Deviation Raised"
            alert_message  = (
                "A deviation has been raised for this equipment. "
                "Our team will contact you shortly regarding the next steps."
            )
            activity_log.append({
                "date":        now_str,
                "title":       "Deviation Raised",
                "description": (
                    "A deviation record has been raised for this equipment "
                    "by the engineer. Calibration is on hold."
                ),
                "type": "warning",
            })
        elif deviation_resolved:
            activity_log.append({
                "date":        upload_ts,
                "title":       "Deviation Resolved",
                "description": (
                    "The deviation has been resolved. "
                    "A calibration certificate has been uploaded."
                ),
                "type": "success",
            })

        if has_certificate_doc:
            current_step   = 3
            display_status = "Certificate Ready"
            alert_message  = None
            activity_log.append({
                "date":        upload_ts,
                "title":       "Certificate Ready",
                "description": (
                    "The calibration certificate document has been "
                    "uploaded by the lab and is ready."
                ),
                "type": "success",
            })

        if cert:
            cert_status = (cert.status or "").strip().lower()

            if cert_status in CertStatus.DISPATCHED_SET:
                current_step   = 4
                display_status = "Certificate Dispatched"
                alert_message  = None
                issued_date    = _safe_strftime(
                    getattr(cert, "issued_at", None), "%Y-%m-%d %H:%M", now_str
                )
                activity_log.append({
                    "date":        issued_date,
                    "title":       "Certificate Issued & Dispatched",
                    "description": (
                        f"Certificate No: {cert.certificate_no} has been "
                        "issued and dispatched to the customer."
                    ),
                    "type": "success",
                })

        return self._assemble_timeline(
            steps, current_step, display_status,
            received_date, inward_date, activity_log, alert_message,
        )

    # ---------------------------------------------------------------- #
    #  TIMELINE ASSEMBLER                                                #
    # ---------------------------------------------------------------- #

    @staticmethod
    def _assemble_timeline(
        steps:          List[Dict[str, str]],
        current_step:   int,
        display_status: str,
        received_date:  str,
        inward_date:    str,
        activity_log:   List[Dict[str, str]],
        alert_message:  Optional[str],
    ) -> Dict[str, Any]:
        ds = display_status.lower()

        timeline: List[Dict[str, Any]] = []
        for idx, step in enumerate(steps):
            if idx < current_step:
                step_status = "completed"
            elif idx == current_step:
                if "terminated" in ds:
                    step_status = "terminated"
                elif "deviation" in ds:
                    step_status = "deviated"
                elif "on hold" in ds or "on_hold" in ds:
                    step_status = "onhold"
                elif "oot" in ds or "out of tolerance" in ds:
                    step_status = "oot"
                else:
                    step_status = "current"
            else:
                step_status = "pending"

            step_date: Optional[str] = None
            if idx == 0:
                step_date = received_date
            if idx == 1:
                step_date = inward_date

            timeline.append({
                "label":  step["label"],
                "status": step_status,
                "date":   step_date,
                "icon":   step["icon"],
            })

        return {
            "display_status": display_status,
            "alert_message":  alert_message,
            "timeline":       timeline,
            "activity_log":   activity_log,
        }

    # ---------------------------------------------------------------- #
    #  DISPATCHER                                                        #
    # ---------------------------------------------------------------- #

    def _determine_timeline_and_status(
        self,
        equipment:            InwardEquipment,
        inward:               Inward,
        job:                  Optional[HTWJob],
        ext_upload:           Any = None,
        cert:                 Optional[HTWCertificate] = None,
        has_active_deviation: bool = False,
        deviation_was_closed: bool = False,
        has_active_ext_dev:   bool = False,
        ext_dev_resolved:     bool = False,
    ) -> Dict[str, Any]:
        is_htw = self._is_htw_equipment(equipment)

        if is_htw:
            return self._build_htw_timeline(
                equipment, inward, job, cert,
                has_active_deviation, deviation_was_closed,
            )
        return self._build_external_timeline(
            equipment, inward, ext_upload, cert,
            has_active_ext_dev, ext_dev_resolved,
        )

    # ================================================================ #
    #  TRACKING — main entry point                                      #
    # ================================================================ #

    def track_equipment_status(
        self, customer_id: int, query_str: str
    ) -> Optional[Dict[str, Any]]:
        clean_query = query_str.strip()

        # ── Strategy 1: SRF No or DC No ──────────────────────────────
        inward_result = self.db.scalars(
            select(Inward).where(and_(
                Inward.customer_id == customer_id,
                or_(
                    Inward.srf_no.ilike(clean_query),
                    Inward.customer_dc_no.ilike(clean_query),
                ),
            ))
        ).first()

        target_inward_id: Optional[int] = None
        filter_nepl_id:   Optional[str] = None
        found_via = "Reference No"

        if inward_result:
            target_inward_id = inward_result.inward_id
            found_via = "SRF Number"
            if (
                inward_result.customer_dc_no
                and inward_result.customer_dc_no.lower() == clean_query.lower()
            ):
                found_via = "DC Number"
        else:
            eq_match = self.db.execute(
                select(InwardEquipment.inward_id, InwardEquipment.nepl_id)
                .join(Inward, InwardEquipment.inward_id == Inward.inward_id)
                .where(and_(
                    Inward.customer_id == customer_id,
                    InwardEquipment.nepl_id.ilike(clean_query),
                ))
            ).first()

            if eq_match:
                target_inward_id = eq_match.inward_id
                filter_nepl_id   = eq_match.nepl_id
                found_via        = "NEPL ID"
            else:
                return None

        # ── Main query ────────────────────────────────────────────────
        main_query = (
            select(InwardEquipment, Inward, Customer, HTWJob)
            .join(Inward,    InwardEquipment.inward_id  == Inward.inward_id)
            .join(Customer,  Inward.customer_id          == Customer.customer_id)
            .outerjoin(HTWJob, HTWJob.inward_eqp_id      == InwardEquipment.inward_eqp_id)
            .where(InwardEquipment.inward_id == target_inward_id)
        )
        if filter_nepl_id:
            main_query = main_query.where(
                InwardEquipment.nepl_id == filter_nepl_id
            )

        rows = self.db.execute(
            main_query.order_by(InwardEquipment.inward_eqp_id)
        ).all()

        if not rows:
            return None

        eqp_ids = [row[0].inward_eqp_id for row in rows]

        # ── Batch 1: ExternalUploads ──────────────────────────────────
        ext_upload_map: Dict[int, Any] = {
            eu.inward_eqp_id: eu
            for eu in self.db.execute(
                select(ExternalUpload).where(
                    ExternalUpload.inward_eqp_id.in_(eqp_ids)
                )
            ).scalars().unique().all()
        }

        # ── Batch 2: ExternalDeviation IDs ───────────────────────────
        ext_deviation_eqp_ids: set = set(
            self.db.execute(
                select(ExternalDeviation.inward_eqp_id)
                .where(ExternalDeviation.inward_eqp_id.in_(eqp_ids))
                .distinct()
            ).scalars().all()
        )

        # ── Batch 3: HTW Deviation records ───────────────────────────
        htw_dev_map: Dict[int, List[Any]] = {i: [] for i in eqp_ids}
        for dev in self.db.execute(
            select(Deviation).where(Deviation.inward_eqp_id.in_(eqp_ids))
        ).scalars().unique().all():
            htw_dev_map[dev.inward_eqp_id].append(dev)

        # ── Batch 4: Certificates ─────────────────────────────────────
        # Fetch ALL certs first then filter in Python to avoid
        # DB-level case-sensitivity issues with status comparison.
        cert_map: Dict[int, HTWCertificate] = {}
        try:
            all_certs = self.db.execute(
                select(HTWCertificate).where(
                    HTWCertificate.inward_eqp_id.in_(eqp_ids)
                )
            ).scalars().unique().all()

            wanted_statuses: set = (
                CertStatus.READY_SET | CertStatus.DISPATCHED_SET
            )  # {"approved", "issued"}

            # Sort descending by certificate_id so highest ID is processed first
            cert_rows = [
                c for c in sorted(
                    all_certs,
                    key=lambda c: c.certificate_id,
                    reverse=True,
                )
                if (c.status or "").strip().lower() in wanted_statuses
            ]

            for c in cert_rows:
                eqp_id = c.inward_eqp_id
                if eqp_id is None:
                    continue

                existing = cert_map.get(eqp_id)
                if existing is None:
                    cert_map[eqp_id] = c
                else:
                    new_prio = CertStatus.PRIORITY.get(
                        (c.status or "").lower(), 0
                    )
                    old_prio = CertStatus.PRIORITY.get(
                        (existing.status or "").lower(), 0
                    )
                    if new_prio > old_prio:
                        cert_map[eqp_id] = c

        except Exception as e:
            logger.error(
                "Exception fetching certificates for eqp_ids=%s: %s",
                eqp_ids, e, exc_info=True,
            )

        # ── Build response ────────────────────────────────────────────
        formatted_equipments: List[Dict[str, Any]] = []

        for row in rows:
            eq, inward, cust, job = row
            is_htw = self._is_htw_equipment(eq)
            cert   = cert_map.get(eq.inward_eqp_id)

            if is_htw:
                htw_devs = htw_dev_map.get(eq.inward_eqp_id, [])
                has_active_dev, dev_was_closed = self._check_htw_deviation_state(
                    htw_devs
                )
                result = self._determine_timeline_and_status(
                    equipment=eq,
                    inward=inward,
                    job=job,
                    ext_upload=None,
                    cert=cert,
                    has_active_deviation=has_active_dev,
                    deviation_was_closed=dev_was_closed,
                )
            else:
                ext_upload = ext_upload_map.get(eq.inward_eqp_id) or _UploadSentinel()

                has_ext_dev_record = eq.inward_eqp_id in ext_deviation_eqp_ids
                has_cert_doc       = bool(
                    getattr(ext_upload, "certificate_file_url", None)
                )

                has_active_ext_dev, ext_dev_resolved = (
                    self._check_external_deviation_state(
                        has_deviation_record=has_ext_dev_record,
                        has_certificate_uploaded=has_cert_doc,
                    )
                )
                result = self._determine_timeline_and_status(
                    equipment=eq,
                    inward=inward,
                    job=job,
                    ext_upload=ext_upload,
                    cert=cert,
                    has_active_ext_dev=has_active_ext_dev,
                    ext_dev_resolved=ext_dev_resolved,
                )

            entry: Dict[str, Any] = {
                "nepl_id":             eq.nepl_id,
                "inward_eqp_id":       eq.inward_eqp_id,
                "srf_no":              inward.srf_no,
                "customer_name":       cust.customer_details,
                "dc_number":           inward.customer_dc_no,
                "qty":                 1,
                "current_status":      eq.status or "received",
                "display_status":      result["display_status"],
                "timeline":            result["timeline"],
                "activity_log":        result["activity_log"],
                "expected_completion": "TBD",
            }
            if result.get("alert_message"):
                entry["alert_message"] = result["alert_message"]

            formatted_equipments.append(entry)

        return {
            "search_query": clean_query,
            "found_via":    found_via,
            "equipments":   formatted_equipments,
        }

    # ================================================================ #
    #  DIRECT ACCESS WRAPPERS                                           #
    # ================================================================ #

    def get_fir_for_direct_access(
        self, inward_id: int, access_token: Optional[str] = None
    ) -> InwardForCustomer:
        return self.get_fir_for_customer_review(inward_id, customer_id=None)

    def submit_remarks_direct_access(
        self,
        inward_id:    int,
        remarks_data: RemarksSubmissionRequest,
        access_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self.submit_customer_remarks(inward_id, remarks_data, customer_id=None)

    # ================================================================ #
    #  CUSTOMER DROPDOWN                                                #
    # ================================================================ #

    def get_all_customers_for_dropdown(self) -> List[Dict[str, Any]]:
        stmt = (
            select(
                Customer.customer_id,
                Customer.customer_details,
                Customer.contact_person,
                Customer.phone,
                Customer.email,
                Customer.ship_to_address,
                Customer.bill_to_address,
            )
            .where(Customer.is_active.is_(True))
            .order_by(Customer.customer_details)
        )
        return [
            {
                "customer_id":      c.customer_id,
                "customer_details": c.customer_details,
                "contact_person":   c.contact_person,
                "phone":            c.phone,
                "email":            c.email,
                "ship_to_address":  c.ship_to_address,
                "bill_to_address":  c.bill_to_address,
            }
            for c in self.db.execute(stmt).all()
        ]
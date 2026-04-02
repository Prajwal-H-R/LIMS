# backend/services/expiry_service.py

import logging
from datetime import date, timedelta, datetime
from sqlalchemy.orm import Session
from fastapi import BackgroundTasks

from backend import models
from backend.core.email import send_email_with_logging

logger = logging.getLogger(__name__)

# --- Custom Formatters for each table ---
def format_master_standard(item, display_name):
    nom = getattr(item, "nomenclature", "N/A")
    return f"[{display_name}] {nom}"

def format_uncertainty_ref(item, display_name):
    applied = getattr(item, "applied_torque", "N/A")
    indicated = getattr(item, "indicated_torque", "N/A")
    return f"[{display_name}] Applied Torque: {applied}, Indicated Torque: {indicated}"

def format_nomenclature_range(item, display_name):
    nom = getattr(item, "nomenclature", "N/A")
    return f"[{display_name}] {nom}"

def format_un_pg_master(item, display_name):
    set_pressure = getattr(item, "set_pressure_max", "N/A")
    uncertainty = getattr(item, "uncertainty_percent", "N/A")
    return f"[{display_name}] Set Pressure Max: {set_pressure}, Uncertainty %: {uncertainty}"

def format_pg_resolution(item, display_name):
    pressure = getattr(item, "pressure", "N/A")
    unit = getattr(item, "unit", "N/A")
    return f"[{display_name}] Pressure: {pressure}, Unit: {unit}"


# Configuration: (Model Class, Date Column Name, Display Name for Email, Formatter Function)
EXPIRY_CONFIG = [
    (models.HTWMasterStandard, "calibration_valid_upto", "Master Standard", format_master_standard),
    (models.HTWStandardUncertaintyReference, "valid_upto", "Uncertainty Ref", format_uncertainty_ref),
    (models.HTWNomenclatureRange, "valid_upto", "Nomenclature Range", format_nomenclature_range),
    (models.HTWUnPGMaster, "valid_upto", "UN PG Master", format_un_pg_master),
    (models.HTWPressureGaugeResolution, "valid_upto", "PG Resolution", format_pg_resolution)
]

class ExpiryService:
    
    @staticmethod
    async def process_and_notify_expiries(background_tasks: BackgroundTasks, db: Session):
        today = date.today()
        target_date = today + timedelta(days=7)
        
        # Lookback limit: Only show items that expired within the last 30 days. 
        # (Prevents daily spam of items that expired years ago).
        past_limit = today - timedelta(days=30) 
        
        today_start = datetime.combine(today, datetime.min.time())
        alert_subject = "⚠️ Alert: System Equipment Expiry Report"

        already_sent = db.query(models.Notification).filter(
            models.Notification.subject == alert_subject,
            models.Notification.created_at >= today_start
        ).first()

        combined_standards = []
        expired_records_to_deactivate = []

        # 1. Gather all data
        for model_class, date_col, display_name, formatter in EXPIRY_CONFIG:
            try:
                date_field = getattr(model_class, date_col)
                
                # FETCH RECORDS IGNORING `is_active` STATUS
                relevant_records = db.query(model_class).filter(
                    date_field <= target_date,
                    date_field >= past_limit  # <-- Delete this line if you want ALL historical expired items forever
                ).all()

                for item in relevant_records:
                    valid_date = getattr(item, date_col)
                    if not valid_date:
                        continue

                    # SAFE DATE COMPARISON
                    if isinstance(valid_date, datetime):
                        compare_date = valid_date.date()
                    else:
                        compare_date = valid_date

                    is_expired = compare_date < today
                    status_label = "🔴 EXPIRED" if is_expired else "🟡 EXPIRING SOON"
                    
                    formatted_nomenclature = formatter(item, display_name)
                    serial_no = getattr(item, "model_serial_no", getattr(item, "serial_no", "N/A"))
                    certificate_no = getattr(item, "certificate_no", "N/A")
                    
                    combined_standards.append({
                        "nomenclature": f"{status_label} | {formatted_nomenclature}",
                        "serial_no": serial_no,
                        "certificate_no": certificate_no,
                        "valid_upto": compare_date.strftime("%Y-%m-%d")
                    })
                    
                    # Only mark for deactivation if it is expired AND currently active
                    if is_expired and getattr(item, "is_active", False) == True:
                        expired_records_to_deactivate.append((item, display_name))

            except Exception as e:
                logger.error(f"Error checking expiries for {display_name}: {e}", exc_info=True)

        # 2. Queue the Email FIRST
        if not already_sent and combined_standards:
            admins = db.query(models.User).filter(
                models.User.role == 'admin',
                models.User.is_active == True
            ).all()
            
            if admins:
                for admin in admins:
                    template_body = {
                        "title": "Equipment Expiry Report",
                        "message": "The following items have either expired recently or will expire within the next 7 days. Expired items have been automatically deactivated in the system. Please arrange for recalibration.",
                        "standards": combined_standards, 
                        "admin_name": admin.full_name or admin.username
                    }

                    await send_email_with_logging(
                        background_tasks=background_tasks,
                        subject=alert_subject,
                        recipient=admin.email,
                        template_name="master_standard_expiry_alert.html", 
                        template_body=template_body,
                        db=db,
                        recipient_user_id=admin.user_id,
                        created_by="system"
                    )
                logger.info(f"Queued consolidated expiry alert emails for {len(admins)} admins.")
            else:
                logger.warning("No active admins found to notify.")
        elif already_sent:
            logger.info("Daily expiry notifications already sent today. Skipped email.")

        # 3. Deactivate expired records that are still marked Active
        if expired_records_to_deactivate:
            try:
                for item, display_name in expired_records_to_deactivate:
                    item.is_active = False
                    if hasattr(item, "updated_at"):
                        item.updated_at = datetime.now()
                    logger.info(f"Auto-expiring {display_name} ID {item.id}")
                
                db.commit()
            except Exception as e:
                db.rollback()
                logger.error(f"Error deactivating expired records: {e}")
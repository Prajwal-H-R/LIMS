import logging
from datetime import date, timedelta, datetime
from sqlalchemy.orm import Session
from sqlalchemy import desc
from fastapi import BackgroundTasks

from backend import models
from backend.core.email import send_email_with_logging

logger = logging.getLogger(__name__)

# --- Custom Formatters (Kept same as original) ---
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
        today_start = datetime.combine(today, datetime.min.time())
        
        # Thresholds
        seven_days_out = today + timedelta(days=7)
        forty_five_days_out = today + timedelta(days=45)
        past_limit = today - timedelta(days=30) 
        
        # Subjects to distinguish daily vs weekly logic in database
        urgent_subject = "⚠️ Alert: System Equipment Expiry Report (Urgent)"
        weekly_subject = "⚠️ Alert: System Equipment Expiry Report (Weekly Reminder)"

        # 1. Check if we've already sent the Daily/Urgent mail today
        already_sent_urgent_today = db.query(models.Notification).filter(
            models.Notification.subject == urgent_subject,
            models.Notification.created_at >= today_start
        ).first()

        # 2. Check when the last Weekly mail was sent (Looking back 7 days)
        seven_days_ago = today_start - timedelta(days=7)
        already_sent_weekly_this_week = db.query(models.Notification).filter(
            models.Notification.subject == weekly_subject,
            models.Notification.created_at >= seven_days_ago
        ).first()

        urgent_items = []      # < 7 days (Daily)
        weekly_items = []      # 8 - 45 days (Weekly)
        records_to_deactivate = []

        # Gather Data
        for model_class, date_col, display_name, formatter in EXPIRY_CONFIG:
            try:
                date_field = getattr(model_class, date_col)
                relevant_records = db.query(model_class).filter(
                    date_field <= forty_five_days_out,
                    date_field >= past_limit
                ).all()

                for item in relevant_records:
                    valid_date = getattr(item, date_col)
                    if not valid_date: continue
                    
                    compare_date = valid_date.date() if isinstance(valid_date, datetime) else valid_date
                    
                    # Prepare display data
                    formatted_nom = formatter(item, display_name)
                    serial_no = getattr(item, "model_serial_no", getattr(item, "serial_no", "N/A"))
                    cert_no = getattr(item, "certificate_no", "N/A")
                    
                    item_data = {
                        "serial_no": serial_no,
                        "certificate_no": cert_no,
                        "valid_upto": compare_date.strftime("%Y-%m-%d")
                    }

                    # Logic Separation
                    if compare_date < today:
                        item_data["nomenclature"] = f"🔴 EXPIRED | {formatted_nom}"
                        urgent_items.append(item_data)
                        if getattr(item, "is_active", False):
                            records_to_deactivate.append(item)
                    
                    elif compare_date <= seven_days_out:
                        item_data["nomenclature"] = f"🟡 EXPIRING SOON | {formatted_nom}"
                        urgent_items.append(item_data)
                    
                    elif compare_date <= forty_five_days_out:
                        item_data["nomenclature"] = f"🟡 EXPIRING SOON | {formatted_nom}"
                        weekly_items.append(item_data)

            except Exception as e:
                logger.error(f"Error checking {display_name}: {e}")

        # Fetch Admins
        admins = db.query(models.User).filter(models.User.role == 'admin', models.User.is_active == True).all()
        if not admins: return

        # SEND URGENT MAIL (Daily if items exist and not sent today)
        if urgent_items and not already_sent_urgent_today:
            await ExpiryService._send_to_admins(
                background_tasks, db, admins, urgent_subject, urgent_items,
                "The following items have expired or are expiring within 7 days. Please take immediate action."
            )

        # SEND WEEKLY MAIL (Weekly if items exist and no weekly mail sent in last 7 days)
        if weekly_items and not already_sent_weekly_this_week:
            await ExpiryService._send_to_admins(
                background_tasks, db, admins, weekly_subject, weekly_items,
                "Weekly Reminder: The following items are expiring within the next 45 days."
            )

        # Deactivate
        if records_to_deactivate:
            try:
                for item in records_to_deactivate:
                    item.is_active = False
                db.commit()
            except Exception as e:
                db.rollback()
                logger.error(f"Deactivation error: {e}")

    @staticmethod
    async def _send_to_admins(background_tasks, db, admins, subject, standards, message):
        for admin in admins:
            template_body = {
                "title": "Equipment Expiry Report",
                "message": message,
                "standards": standards, 
                "admin_name": admin.full_name or admin.username
            }
            await send_email_with_logging(
                background_tasks=background_tasks,
                subject=subject,
                recipient=admin.email,
                template_name="master_standard_expiry_alert.html", 
                template_body=template_body,
                db=db,
                recipient_user_id=admin.user_id,
                created_by="system"
            )
        logger.info(f"Notification sent: {subject}")
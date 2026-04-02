from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import date, datetime
from zoneinfo import ZoneInfo
 
from backend.db import get_db
from backend.license.license_models import LicenseMaster, LicenseAudit
from backend.license.license_crypto import verify_activation_key, sign_expiry
 
router = APIRouter(prefix="/api/license", tags=["License"])
 
 
@router.get("/status")
def license_status(db: Session = Depends(get_db)):
    lic = db.query(LicenseMaster).first()
    if not lic:
        raise HTTPException(500, "License not initialized")
 
    today = date.today()
    days_left = (lic.valid_until - today).days
 
    if today > lic.valid_until:
        return {
            "status": "EXPIRED",
            "valid_until": lic.valid_until,
            "message": f"License expired on {lic.valid_until.strftime('%d-%m-%Y')}",
        }
 
    if days_left <= 7:
        return {
            "status": "EXPIRING_SOON",
            "valid_until": lic.valid_until,
            "days_left": days_left,
            "message": f"Subscription expiring on {lic.valid_until.strftime('%d-%m-%Y')}",
        }
 
    return {
        "status": "ACTIVE",
        "valid_until": lic.valid_until,
    }
 
 
@router.post("/extend")
def extend_license(
    payload: dict,
    db: Session = Depends(get_db),
):
    activation_key = payload.get("activation_key")
    if not activation_key:
        raise HTTPException(400, "Activation key required")
 
    try:
        new_expiry = verify_activation_key(activation_key)
    except ValueError as e:
        raise HTTPException(400, str(e))
 
    lic = db.query(LicenseMaster).first()
    if not lic:
        raise HTTPException(500, "License not initialized")
 
    if new_expiry <= lic.valid_until:
        raise HTTPException(400, "New expiry must be later than current expiry")
 
    ist = ZoneInfo("Asia/Kolkata")
    extended_at_ist = datetime.now(ist)
 
    audit = LicenseAudit(
        old_valid_until=lic.valid_until,
        new_valid_until=new_expiry,
        extended_by="ACTIVATION_KEY",
        extended_at=extended_at_ist,
    )
 
    lic.valid_until = new_expiry
    lic.last_extended_by = "ACTIVATION_KEY"
    lic.last_extended_at = extended_at_ist
    lic.checksum = sign_expiry(new_expiry)
 
    db.add(audit)
    db.commit()
 
    return {
        "message": f"License extended successfully till {new_expiry.strftime('%d-%m-%Y')}",
        "valid_until": new_expiry,
    }
 
 
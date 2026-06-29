from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date, datetime
from zoneinfo import ZoneInfo
 
from backend.db import get_db
from backend.auth import get_current_user
from backend.license.license_models import LicenseMaster, LicenseAudit
from backend.license.license_crypto import verify_activation_key, sign_expiry
 
router = APIRouter(prefix="/api/license", tags=["License"])
 
 
@router.get("/status")
def license_status(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    lic = db.query(LicenseMaster).first()
    if not lic:
        raise HTTPException(500, "License not initialized")
 
    today = date.today()
    days_left = (lic.valid_until - today).days
 
    # Status threshold rule
    if today > lic.valid_until:
        computed_status = "EXPIRED"
    elif days_left <= 20:
        computed_status = "EXPIRING_SOON"
    else:
        computed_status = "ACTIVE"
 
    role = (getattr(current_user, "role", "") or "").lower()
 
    # Popup + restriction rules (role-based)
    show_popup = False
    create_inward_restricted = False
 
    if role == "customer":
        show_popup = False
        create_inward_restricted = False
    elif role == "engineer":
        show_popup = computed_status in {"EXPIRING_SOON", "EXPIRED"}
        create_inward_restricted = computed_status == "EXPIRED"
    elif role == "admin":
        show_popup = computed_status in {"EXPIRING_SOON", "EXPIRED"}
        create_inward_restricted = False
    else:
        # Default safe behavior
        show_popup = False
        create_inward_restricted = False
 
    resp = {
        "status": computed_status,
        "show_popup": show_popup,
        "valid_until": lic.valid_until,
        "restrictions": {
            "create_inward": create_inward_restricted
        },
    }
    # Keep days_left for UI if available
    resp["days_left"] = days_left
    return resp
 
 
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
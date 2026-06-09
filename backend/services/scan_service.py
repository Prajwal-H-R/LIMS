from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException

# Import your models
from backend.models.inward_equipments import InwardEquipment
from backend.models.inward import Inward
from backend.models.customers import Customer

def get_scan_details(db: Session, nepl_id: str):
    # Fetch equipment with all necessary parents and children eagerly loaded
    equipment = db.query(InwardEquipment).options(
        joinedload(InwardEquipment.inward).joinedload(Inward.customer),
        joinedload(InwardEquipment.srf_equipment),
        joinedload(InwardEquipment.jobs),
        joinedload(InwardEquipment.certificate)
    ).filter(InwardEquipment.nepl_id == nepl_id).first()

    if not equipment:
        raise HTTPException(status_code=404, detail=f"No equipment found with ID: {nepl_id}")

    inward = equipment.inward
    customer = inward.customer

    # Logic to determine workflow status
    has_inward = True # If we found the record, Inward is done
    has_srf = equipment.srf_equipment is not None
    has_job = len(equipment.jobs) > 0
    has_certificate = equipment.certificate is not None

    # Build Response
    return {
        "device_info": {
            "srf_number": inward.srf_no,
            "inward_date": inward.material_inward_date,
            "dc_number": inward.customer_dc_no,
            "dc_date": inward.customer_dc_date,
            "nepl_id": equipment.nepl_id
        },
        "customer_info": {
            "company_name": customer.customer_details,
            "contact_person": customer.contact_person,
            "phone": customer.phone,
            "address": customer.ship_to_address or "Address not available"
        },
        "equipment": {
            "id": equipment.nepl_id,
            "description": equipment.material_description,
            "make": equipment.make,
            "model": equipment.model,
            "range": equipment.range,
            "serial_no": equipment.serial_no or "-",
            "qty": equipment.quantity,
            "supplier": equipment.supplier or "-",
            "in_dc": equipment.in_dc or "-",
            "out_dc": equipment.out_dc or "-",
            "calib_by": equipment.calibration_by,
            "visual_status": equipment.visual_inspection_notes or "OK",
            "eng_remarks": equipment.engineer_remarks,
            "cust_remarks": equipment.customer_remarks
        },
        "status_flow": {
            "inward": has_inward,
            "srf": has_srf,
            "job": has_job,
            "certificate": has_certificate
        }
    }
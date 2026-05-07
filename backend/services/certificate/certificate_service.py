from datetime import date, datetime, timedelta
from typing import Optional, Dict, Any, List
import secrets
import logging  # Added for debugging
from sqlalchemy import text, or_  # Added or_
from sqlalchemy.orm import Session, joinedload, selectinload
from fastapi import HTTPException
 
from backend.models.certificate.certificate import HTWCertificate
from backend.services.certificate.certificate_assets_helper import get_certificate_asset_urls
from backend.models.htw.htw_job import HTWJob
from backend.models.htw.htw_job_standard_snapshot import HTWJobStandardSnapshot
from backend.models.inward import Inward
from backend.models.inward_equipments import InwardEquipment
from backend.models.htw.htw_uncertainty_budget import HTWUncertaintyBudget
from backend.models.htw.htw_pressure_gauge_resolution import HTWPressureGaugeResolution
from backend.services.htw import htw_repeatability_services as repeat_services
from backend.services.htw.htw_const_coverage_factor_service import get_active_coverage_factor_k
from backend.models.external_upload import ExternalUpload

# Set up logger
logger = logging.getLogger(__name__)
 
def _derive_certificate_no(nepl_id: str) -> str:
    """Derive certificate_no from NEPL ID. e.g. '25200-4' -> 'NEPL / C / 25200-4'"""
    if not nepl_id:
        return ""
    return f"NEPL / C / {nepl_id}"
 
 
def job_status_allows_certificate_generation(job_status: Optional[str]) -> bool:
    """True when calibration workflow is finished (in-tolerance, OOT, or generic Completed)."""
    s = (job_status or "").strip().lower()
    return s in ("calibrated", "completed - oot", "completed")
 
 
def _build_equipment_dict(equipment: InwardEquipment) -> Dict[str, Any]:
    """Convert InwardEquipment ORM to dict for mapping."""
    srf_eqp = equipment.srf_equipment if hasattr(equipment, "srf_equipment") else None
    unit = equipment.unit or (srf_eqp.unit if srf_eqp and srf_eqp.unit else "") or "Nm"
    mode_of_cal = (srf_eqp.mode_of_calibration if srf_eqp and srf_eqp.mode_of_calibration else "") or ""
    return {
        "inward_eqp_id": equipment.inward_eqp_id,
        "nepl_id": equipment.nepl_id or "",
        "material_description": equipment.material_description or "",
        "make": equipment.make or "",
        "model": equipment.model or "",
        "range": equipment.range or "",
        "unit": unit,
        "serial_no": equipment.serial_no or "",
        "calibration_by": equipment.calibration_by or "",
        "mode_of_calibration": mode_of_cal,
    }
 
 
def _build_standards_list(db: Session, job_id: int) -> List[Dict[str, Any]]:
    """Fetch standards from htw_job_standard_snapshot and return list of dicts."""
    standards = (
        db.query(HTWJobStandardSnapshot)
        .filter(HTWJobStandardSnapshot.job_id == job_id)
        .order_by(HTWJobStandardSnapshot.standard_order.asc())
        .all()
    )
    return [
        {
            "standard_order": s.standard_order,
            "nomenclature": s.nomenclature or "",
            "manufacturer": s.manufacturer or "",
            "model_serial_no": s.model_serial_no or "",
            "certificate_no": s.certificate_no or "",
            "traceable_to_lab": s.traceable_to_lab or "",
            "calibration_valid_upto": s.calibration_valid_upto,
            "uncertainty": float(s.uncertainty) if s.uncertainty is not None else None,
            "uncertainty_unit": s.uncertainty_unit or "",
        }
        for s in standards
    ]
 
 
def _map_standards_to_template(standards: List[Dict[str, Any]]) -> Dict[str, str]:
    """Map standards list to certificate template field names."""
    result = {}
    for i, std in enumerate(standards, start=1):
        prefix = f"standard{i}_"
        result[f"{prefix}nomenclature"] = std.get("nomenclature", "")
        result[f"{prefix}manufacturer"] = std.get("manufacturer", "")
        result[f"{prefix}model"] = std.get("model_serial_no", "")
        unc = std.get("uncertainty")
        unc_u = std.get("uncertainty_unit", "")
        result[f"{prefix}uncertainty"] = f"{unc} {unc_u}".strip() if unc is not None else ""
        result[f"{prefix}cert_no"] = std.get("certificate_no", "")
        valid = std.get("calibration_valid_upto")
        result[f"{prefix}valid_upto"] = valid.strftime("%d-%m-%Y") if valid else ""
        result[f"{prefix}traceability"] = std.get("traceable_to_lab", "")
    for i in range(1, 4):
        for key in ["nomenclature", "manufacturer", "model", "uncertainty", "cert_no", "valid_upto", "traceability"]:
            k = f"standard{i}_{key}"
            if k not in result:
                result[k] = ""
    return result
 
 
def _map_equipment_to_template(equipment: Dict[str, Any], customer: Any, inward: Inward) -> Dict[str, str]:
    """Map equipment + customer + inward to certificate template fields."""
    device_make_model = ""
    if equipment.get("make") and equipment.get("model"):
        device_make_model = f"{equipment['make']} / {equipment['model']}"
    elif equipment.get("make"):
        device_make_model = equipment["make"]
    elif equipment.get("model"):
        device_make_model = equipment["model"]
 
    customer_name = customer.customer_details if customer else ""
    customer_address = customer.bill_to_address if customer else ""
 
    ref_dc_no = inward.customer_dc_no or ""
    ref_date = inward.customer_dc_date or ""
    if ref_date:
        if hasattr(ref_date, "strftime"):
            ref_date = ref_date.strftime("%d-%m-%Y")
        else:
            ref_date = str(ref_date)
 
    # Manufacturer-specified primary unit for the tool (e.g. Nm, lbf·ft, kgf·m).
    units = equipment.get("unit", "") or "Nm"
    cal_mode = equipment.get("mode_of_calibration", "") or ""
    return {
        "device_nomenclature": equipment.get("material_description", ""),
        "device_make_model": device_make_model,
        "si_no": equipment.get("serial_no", ""),
        "nepl_id": equipment.get("nepl_id", ""),
        "torque_range": equipment.get("range", ""),
        "place_of_calibration": equipment.get("calibration_by", ""),
        "units_of_measurement": units,
        # Exposed separately so all Calibration Result tables can use the same dynamic unit
        # instead of hardcoding "Nm" in the templates.
        "torque_unit": units,
        "calibration_mode": cal_mode,
        "customer_name": customer_name,
        "customer_address": customer_address,
        "reference_dc_no": ref_dc_no,
        "reference_no_date": ref_date,
        "receipt_date": date.today().strftime("%d-%m-%Y"),
    }
 
 
def _map_repeatability(results: List[Dict]) -> List[Dict]:
    """Map repeatability API-style results to certificate format."""
    import math
    out = []
    for r in results:
        readings = r.get("stored_readings", [])
        if not readings:
            continue
        readings_float = [float(x) for x in readings if x is not None]
        if not readings_float:
            continue
        mean = sum(readings_float) / len(readings_float)
        var = sum((x - mean) ** 2 for x in readings_float) / len(readings_float)
        std = math.sqrt(var)
        pct = (std / mean * 100) if mean else 0
        out.append({
            "pressure": round(float(r.get("set_pressure", 0) or 0), 2),
            "target": round(float(r.get("set_torque", 0) or 0), 0),
            "readings": readings_float,
            "repeatability": round(std, 2),
            "repeatability_pct": round(pct, 2),
        })
    out.sort(key=lambda x: x["pressure"])
    return out
 
 
def _map_reproducibility(data: Dict) -> List[Dict]:
    if not data or data.get("status") != "success":
        return []
    target = float(data.get("set_torque_20", 0) or 0)
    err = float(data.get("error_due_to_reproducibility", 0) or 0)
    pct = (err / target * 100) if target else 0
    seqs = data.get("sequences", [])
    sm = {s.get("sequence_no"): float(s.get("mean_xr", 0) or 0) for s in seqs}
    return [{
        "target": round(target, 0),
        "series1": round(sm.get(1, 0), 2),
        "series2": round(sm.get(2, 0), 2),
        "series3": round(sm.get(3, 0), 2),
        "series4": round(sm.get(4, 0), 2),
        "error": round(err, 2),
        "error_pct": round(pct, 2),
    }]
 
 
def _map_output_drive(data: Dict) -> List[Dict]:
    if not data or data.get("status") not in ("success", "no_data"):
        return []
    target = float(data.get("set_torque", 0) or 0)
    err = float(data.get("error_value", 0) or 0)
    pct = (err / target * 100) if target else 0
    pos_map = {p.get("position_deg"): float(p.get("mean_value", 0) or 0) for p in data.get("positions", [])}
    return [{
        "target": round(target, 0),
        "pos0": round(pos_map.get(0, 0), 2),
        "pos90": round(pos_map.get(90, 0), 2),
        "pos180": round(pos_map.get(180, 0), 2),
        "pos270": round(pos_map.get(270, 0), 2),
        "error": round(err, 2),
        "error_pct": round(pct, 2),
    }]
 
 
def _map_drive_interface(data: Dict) -> List[Dict]:
    if not data or data.get("status") not in ("success", "no_data"):
        return []
    target = float(data.get("set_torque", 0) or 0)
    err = float(data.get("error_value", 0) or 0)
    pct = (err / target * 100) if target else 0
    pos_map = {p.get("position_deg"): float(p.get("mean_value", 0) or 0) for p in data.get("positions", [])}
    return [{
        "target": round(target, 0),
        "series1": round(pos_map.get(0, 0), 2),
        "series2": round(pos_map.get(90, 0), 2),
        "series3": round(pos_map.get(180, 0), 2),
        "series4": round(pos_map.get(270, 0), 2),
        "error": round(err, 2),
        "error_pct": round(pct, 2),
    }]
 
 
def _map_loading_point(data: Dict) -> List[Dict]:
    if not data or data.get("status") not in ("success", "no_data"):
        return []
    target = float(data.get("set_torque", 0) or 0)
    err = float(data.get("error_due_to_loading_point", 0) or data.get("error_value", 0) or 0)
    pos_map = {p.get("loading_position_mm"): float(p.get("mean_value", 0) or 0) for p in data.get("positions", [])}
    if err == 0 and -10 in pos_map and 10 in pos_map:
        err = abs(pos_map[-10] - pos_map[10])
    pct = (err / target * 100) if target else 0
    return [{
        "torque": round(target, 0),
        "position1": "-10mm",
        "mean1": round(pos_map.get(-10, 0), 2),
        "position2": "+10mm",
        "mean2": round(pos_map.get(10, 0), 2),
        "error": round(err, 2),
        "error_pct": round(pct, 2),
    }]
 
 
def _map_uncertainty_budget(budgets: List) -> List[Dict]:
    """Map HTWUncertaintyBudget to certificate template uncertainty_data."""
    out: List[Dict[str, Any]] = []
    permissible_deviation_pct = 4.0
    for b in budgets[:3]:
        avg = float(b.set_torque_ts) if b.set_torque_ts else 0
        mean_err_pct = float(b.mean_measurement_error or 0)  # Mean Value of the error in %
        result = "Pass" if abs(mean_err_pct) <= permissible_deviation_pct else "Fail"
        out.append({
            "calibration": round(avg, 0),
            "average": round(avg, 2),
            "error_pct": round(mean_err_pct, 4),
            "uncertainty_w": round(float(b.expanded_uncertainty or 0), 4),
            "max_error": round(float(b.max_device_error or 0), 4),
            "uncertainty_w_prime": round(float(b.final_wl or 0), 4),
            "permissible_deviation_iso_6789": "+-4",
            "result": result,
        })
 
    # Ensure the table renders exactly 3 rows/entries as per template requirement.
    while len(out) < 3:
        out.append({
            "calibration": "",
            "average": "",
            "error_pct": "",
            "uncertainty_w": "",
            "max_error": "",
            "uncertainty_w_prime": "",
            "permissible_deviation_iso_6789": "+-4",
            "result": "",
        })
    return out
 
 
def build_template_data(
    db: Session,
    job_id: int,
    certificate: Optional[HTWCertificate] = None,
    *,
    base_url: str | None = None,
    use_data_uris: bool = False,
) -> Dict[str, Any]:
    """
    Build full certificate template data from job and related tables.
    base_url: API base (e.g. http://localhost:8000) for preview. Ignored if use_data_uris=True.
    use_data_uris: If True, embed images as data URIs (for PDF). If False, use API URLs.
    """
    job = db.query(HTWJob).options(
        joinedload(HTWJob.equipment_rel).joinedload(InwardEquipment.inward).joinedload(Inward.customer),
        joinedload(HTWJob.equipment_rel).joinedload(InwardEquipment.srf_equipment),
        joinedload(HTWJob.inward_rel).joinedload(Inward.customer),
    ).filter(HTWJob.job_id == job_id).first()
 
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
 
    equipment = job.equipment_rel
    inward = job.inward_rel
    customer = inward.customer if inward else (equipment.inward.customer if equipment and equipment.inward else None)
 
    if not equipment or not inward:
        raise HTTPException(status_code=400, detail="Job has no linked equipment or inward")
 
    # --- Resolution Fetching Logic ---
    resolution_value = ""
    resolution_unit = ""
 
    if job.res_pressure:
        try:
            # 1. Try to treat res_pressure as an ID (int)
            # Use float() first to handle cases like "1.00" stored in string or float column
            res_id = int(float(job.res_pressure))
           
            res_obj = (
                db.query(HTWPressureGaugeResolution)
                .filter(HTWPressureGaugeResolution.id == res_id)
                .first()
            )
 
            if res_obj:
                # HTWPressureGaugeResolution stores the pressure value in `pressure`
                # and its unit in `unit`.
                resolution_value = str(res_obj.pressure)
                resolution_unit = res_obj.unit or ""
            else:
                # 2. If ID lookup fails, assume the value in job.res_pressure IS the value
                resolution_value = str(job.res_pressure)
                resolution_unit = "bar"  # Default unit if raw value is stored
        except (ValueError, TypeError):
            # 3. If conversion to int fails, treat as raw string value
            resolution_value = str(job.res_pressure)
            resolution_unit = "bar"
 
    eqp_dict = _build_equipment_dict(equipment)
    standards = _build_standards_list(db, job_id)
    std_map = _map_standards_to_template(standards)
    eqp_map = _map_equipment_to_template(eqp_dict, customer, inward)
 
    cal_date = job.date
    cal_date_str = cal_date.strftime("%d-%m-%Y") if cal_date else ""
    cert_no = certificate.certificate_no if certificate else _derive_certificate_no(eqp_dict.get("nepl_id", ""))
    rec_cal_due = certificate.recommended_cal_due_date if certificate else (cal_date + timedelta(days=365) if cal_date else None)
    rec_cal_str = rec_cal_due.strftime("%d-%m-%Y") if rec_cal_due else ""
 
    template_data = {
        "certificate_code": "",
        "certificate_no": cert_no,
        "calibration_date": cal_date_str,
        "nepl_id": eqp_dict.get("nepl_id", ""),
        "cal_due_date": rec_cal_str,
        "ulr_no": certificate.ulr_no if certificate else "",
        "issue_date": date.today().strftime("%d-%m-%Y"),
        "field_of_parameter": certificate.field_of_parameter if certificate else "",
        "item_status": (certificate.item_status or "Satisfactory") if certificate else "Satisfactory",
        "pressure_gauge_resolution": resolution_value,
        "pressure_gauge_unit": resolution_unit,
        "torque_range": f"{job.range_min}-{job.range_max}" if job.range_min is not None and job.range_max is not None else eqp_dict.get("range", ""),
        "calibration_procedure": "Done as per NEPL Ref: CP .No 02...",
        **eqp_map,
        # Make type/classification dynamic instead of hard-coded in the template
        "device_type": (getattr(job, "type", None) or "indicating").strip(),
        "device_classification": (getattr(job, "classification", None) or "Type I Class C").strip(),
        **std_map,
        "repeatability_data": [],
        "reproducability_data": [],
        "geometric_data": [],
        "interface_data": [],
        "loading_data": [],
        "uncertainty_data": [],
        "temperature": "",
        "humidity": "",
        "authorised_signatory": (certificate.authorised_signatory if certificate else None) or "Ramesh Ramakrishna",
        "coverage_factor_k": get_active_coverage_factor_k(db) or 2,
        "lab_unique_number": "",
        "show_statement_of_conformity_columns": bool(getattr(inward.srf, "statement_of_conformity", False)) if inward and inward.srf else False,
        **get_certificate_asset_urls(base_url=base_url, use_data_uris=use_data_uris),
    }
 
    rep_data = repeat_services.get_stored_repeatability(db, job_id)
    if rep_data.get("status") == "success" and rep_data.get("results"):
        template_data["repeatability_data"] = _map_repeatability(rep_data["results"])
 
    repro_data = repeat_services.get_stored_reproducibility(db, job_id)
    template_data["reproducability_data"] = _map_reproducibility(repro_data)
 
    out_drive = repeat_services.get_stored_output_drive(db, job_id)
    template_data["geometric_data"] = _map_output_drive(out_drive)
 
    drive_int = repeat_services.get_stored_drive_interface(db, job_id)
    template_data["interface_data"] = _map_drive_interface(drive_int)
 
    load_pt = repeat_services.get_stored_loading_point(db, job_id)
    template_data["loading_data"] = _map_loading_point(load_pt)
 
    budgets = db.query(HTWUncertaintyBudget).filter(HTWUncertaintyBudget.job_id == job_id).order_by(HTWUncertaintyBudget.step_percent).all()
    template_data["uncertainty_data"] = _map_uncertainty_budget(budgets)
 
    # If certificate persisted ISO 6789 conformity values, use them for deterministic rendering.
    if certificate:
        saved_perm = getattr(certificate, "permissible_deviation_iso_6789", None)
        saved_results = getattr(certificate, "iso_6789_results", None)
        if isinstance(saved_perm, list) and isinstance(saved_results, list):
            for idx, row in enumerate(template_data.get("uncertainty_data", [])):
                if idx < len(saved_perm) and saved_perm[idx] is not None:
                    row["permissible_deviation_iso_6789"] = saved_perm[idx]
                if idx < len(saved_results) and saved_results[idx] is not None:
                    row["result"] = saved_results[idx]
 
    # --- Lab Scope (lab_unique_number for text under right logo) ---
    try:
        # Use a minimal raw SQL query to avoid ORM mapping failures when optional
        # lab_scope columns differ across deployed database versions.
        row = db.execute(
            text("SELECT lab_unique_number FROM lab_scope WHERE is_active = true LIMIT 1")
        ).first()
        if row and row[0]:
            template_data["lab_unique_number"] = str(row[0])
    except Exception:
        # A DBAPI error here marks the current transaction as failed.
        # Roll back so subsequent queries in the same request can proceed.
        db.rollback()
        # Keep certificate preview resilient even if lab_scope schema differs.
        pass
 
    # --- Environment Data ---
    try:
        # Import from the correct module path inside the htw package
        from backend.services.htw.htw_job_environment_service import HTWJobEnvironmentService
        env_svc = HTWJobEnvironmentService(db)
        pre = env_svc._get_by_job_and_stage(job_id, "PRE")
        post = env_svc._get_by_job_and_stage(job_id, "POST")
        temps, hums = [], []
        if pre:
            temps.append(float(pre.ambient_temperature or 0))
            hums.append(float(pre.relative_humidity or 0))
        if post:
            temps.append(float(post.ambient_temperature or 0))
            hums.append(float(post.relative_humidity or 0))
        if temps:
            template_data["temperature"] = f"{sum(temps)/len(temps):.1f}"
        if hums:
            template_data["humidity"] = f"{int(round(sum(hums)/len(hums)))}"
    except (ImportError, Exception):
        # Silently ignore environment service errors (missing file/data)
        pass
 
    return template_data
 
 
# --- Certificate CRUD and workflow ---
 
def generate_certificate(db: Session, job_id: int, created_by: Optional[int] = None) -> HTWCertificate:
    """
    Step 1–2: Generate certificate (DRAFT).
    Creates htw_certificate with auto-filled data, status DRAFT.
    """
    job = db.query(HTWJob).options(
        joinedload(HTWJob.equipment_rel),
        joinedload(HTWJob.inward_rel),
    ).filter(HTWJob.job_id == job_id).first()
 
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
 
    job_status = (job.job_status or "").strip()
    if not job_status_allows_certificate_generation(job_status):
        raise HTTPException(
            status_code=400,
            detail=(
                "Certificate can only be generated when the calibration job is complete "
                "(Calibrated, Completed - OOT, or Completed). "
                f"Current status: {job_status or 'Not set'}."
            ),
        )
 
    equipment = job.equipment_rel
    if not equipment:
        raise HTTPException(status_code=400, detail="Job has no equipment")
 
    existing = db.query(HTWCertificate).filter(HTWCertificate.job_id == job_id).first()
 
    # Pre-compute ISO 6789 conformity values to persist into `htw_certificate`.
    budgets = db.query(HTWUncertaintyBudget).filter(HTWUncertaintyBudget.job_id == job_id).order_by(HTWUncertaintyBudget.step_percent).all()
    mapped_uncertainty_rows = _map_uncertainty_budget(budgets)
    permissible_arr = [row.get("permissible_deviation_iso_6789") for row in mapped_uncertainty_rows]
    results_arr = [row.get("result") for row in mapped_uncertainty_rows]
 
    if existing:
        if existing.status == "DRAFT":
            # If old rows exist before this feature, backfill the persisted values.
            if getattr(existing, "permissible_deviation_iso_6789", None) is None or getattr(existing, "iso_6789_results", None) is None:
                existing.permissible_deviation_iso_6789 = permissible_arr
                existing.iso_6789_results = results_arr
                db.commit()
                db.refresh(existing)
            return existing
        raise HTTPException(status_code=400, detail=f"Certificate already exists with status {existing.status}")
 
    cert_no = _derive_certificate_no(equipment.nepl_id or "")
    cal_date = job.date or date.today()
    default_due = cal_date + timedelta(days=365)
 
    cert = HTWCertificate(
        job_id=job_id,
        inward_id=job.inward_id,
        inward_eqp_id=job.inward_eqp_id,
        certificate_no=cert_no,
        date_of_calibration=cal_date,
        ulr_no=None,
        field_of_parameter=None,
        recommended_cal_due_date=default_due,
        item_status="Satisfactory",
        authorised_signatory=None,
        status="DRAFT",
        created_by=created_by,
        permissible_deviation_iso_6789=permissible_arr,
        iso_6789_results=results_arr,
    )
    db.add(cert)
    db.commit()
    db.refresh(cert)
    return cert
 
 
def update_certificate(db: Session, certificate_id: int, payload: Dict[str, Any]) -> HTWCertificate:
    """
    Step 3: Engineer/Admin updates mandatory fields.
    Only DRAFT or CREATED can be updated.
    """
    cert = db.query(HTWCertificate).filter(HTWCertificate.certificate_id == certificate_id).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    if cert.status not in ("DRAFT", "CREATED", "REWORK"):
        raise HTTPException(status_code=400, detail=f"Cannot update certificate in status {cert.status}")
 
    if "ulr_no" in payload and payload["ulr_no"] is not None:
        cert.ulr_no = payload["ulr_no"]
    if "field_of_parameter" in payload and payload["field_of_parameter"] is not None:
        cert.field_of_parameter = payload["field_of_parameter"]
    if "recommended_cal_due_date" in payload and payload["recommended_cal_due_date"] is not None:
        cert.recommended_cal_due_date = payload["recommended_cal_due_date"]
    if "item_status" in payload and payload["item_status"] is not None:
        cert.item_status = payload["item_status"]
    if cert.status == "CREATED" and "authorised_signatory" in payload and payload["authorised_signatory"] is not None:
        cert.authorised_signatory = payload["authorised_signatory"]
 
    db.commit()
    db.refresh(cert)
    return cert
 
 
def submit_for_approval(db: Session, certificate_id: int) -> HTWCertificate:
    """
    Step 4: Engineer submits for approval. DRAFT -> CREATED.
    """
    cert = db.query(HTWCertificate).filter(HTWCertificate.certificate_id == certificate_id).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    if cert.status != "DRAFT":
        raise HTTPException(status_code=400, detail=f"Only DRAFT certificates can be submitted. Current: {cert.status}")
 
    if not cert.ulr_no or not cert.field_of_parameter or not cert.recommended_cal_due_date:
        raise HTTPException(status_code=400, detail="ulr_no, field_of_parameter and recommended_cal_due_date are required before submit")
 
    cert.status = "CREATED"
    db.commit()
    db.refresh(cert)
    return cert
 
 
def approve_certificate(db: Session, certificate_id: int, authorised_signatory: str, approved_by: Optional[int] = None) -> HTWCertificate:
    """
    Step 5–6: Admin approves. CREATED -> APPROVED.
    """
    cert = db.query(HTWCertificate).filter(HTWCertificate.certificate_id == certificate_id).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    if cert.status != "CREATED":
        raise HTTPException(status_code=400, detail=f"Only CREATED certificates can be approved. Current: {cert.status}")
 
    cert.status = "APPROVED"
    cert.authorised_signatory = authorised_signatory
    cert.approved_by = approved_by
    cert.approved_at = datetime.utcnow()
    db.commit()
    db.refresh(cert)
    return cert
 
 
def rework_certificate(db: Session, certificate_id: int, rework_comment: str, approved_by: Optional[int] = None) -> HTWCertificate:
    """
    Admin sends certificate back for rework. CREATED -> REWORK.
    """
    cert = db.query(HTWCertificate).filter(HTWCertificate.certificate_id == certificate_id).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    if cert.status != "CREATED":
        raise HTTPException(status_code=400, detail=f"Only CREATED certificates can be sent for rework. Current: {cert.status}")
    if not rework_comment or not rework_comment.strip():
        raise HTTPException(status_code=400, detail="Rework comment is required")
 
    cert.status = "REWORK"
    cert.admin_rework_comment = rework_comment.strip()
    cert.approved_by = approved_by
    cert.approved_at = None
    db.commit()
    db.refresh(cert)
    return cert
 
 
def resubmit_for_approval(db: Session, certificate_id: int) -> HTWCertificate:
    """
    Engineer resubmits after rework. REWORK -> CREATED.
    """
    cert = db.query(HTWCertificate).filter(HTWCertificate.certificate_id == certificate_id).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    if cert.status != "REWORK":
        raise HTTPException(status_code=400, detail=f"Only REWORK certificates can be resubmitted. Current: {cert.status}")
 
    if not cert.ulr_no or not cert.field_of_parameter or not cert.recommended_cal_due_date:
        raise HTTPException(status_code=400, detail="ulr_no, field_of_parameter and recommended_cal_due_date are required before resubmit")
 
    cert.status = "CREATED"
    cert.admin_rework_comment = None
    db.commit()
    db.refresh(cert)
    return cert
 
 
def issue_certificate(db: Session, certificate_id: int) -> HTWCertificate:
    """
    Step 7: Issue certificate. APPROVED -> ISSUED.
    """
    cert = db.query(HTWCertificate).filter(HTWCertificate.certificate_id == certificate_id).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    if cert.status != "APPROVED":
        raise HTTPException(status_code=400, detail=f"Only APPROVED certificates can be issued. Current: {cert.status}")
 
    cert.status = "ISSUED"
    cert.issued_at = datetime.utcnow()
    db.commit()
    db.refresh(cert)
    return cert
 
 
def get_certificate_by_id(db: Session, certificate_id: int) -> Optional[HTWCertificate]:
    return db.query(HTWCertificate).filter(HTWCertificate.certificate_id == certificate_id).first()
 
 
def _ensure_qr_eligible(cert: HTWCertificate) -> None:
    if cert.status not in ("APPROVED", "ISSUED"):
        raise HTTPException(
            status_code=400,
            detail=f"QR can only be generated for APPROVED or ISSUED certificates. Current: {cert.status}",
        )
 
 
def upsert_certificate_qr(db: Session, certificate_id: int, qr_image_base64: str) -> HTWCertificate:
    cert = get_certificate_by_id(db, certificate_id)
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    _ensure_qr_eligible(cert)
    # Keep QR static once generated for a certificate/equipment.
    # Subsequent requests return existing QR without modifying token/image/timestamp.
    if cert.qr_image_base64:
        if not cert.qr_token:
            cert.qr_token = secrets.token_urlsafe(24)
            db.commit()
            db.refresh(cert)
        return cert
    if not qr_image_base64 or not qr_image_base64.strip():
        raise HTTPException(status_code=400, detail="QR image payload is required")
    if not cert.qr_token:
        cert.qr_token = secrets.token_urlsafe(24)
    cert.qr_image_base64 = qr_image_base64.strip()
    cert.qr_generated_at = datetime.utcnow()
    db.commit()
    db.refresh(cert)
    return cert
 
 
def bulk_upsert_certificate_qr(db: Session, items: List[Dict[str, Any]]) -> List[HTWCertificate]:
    out: List[HTWCertificate] = []
    for item in items:
        out.append(upsert_certificate_qr(db, item["certificate_id"], item["qr_image_base64"]))
    return out
 
 
def get_certificate_by_qr_token(db: Session, qr_token: str) -> Optional[HTWCertificate]:
    return db.query(HTWCertificate).filter(HTWCertificate.qr_token == qr_token).first()
 
 
def get_calibration_status(cert: HTWCertificate) -> str:
    if not cert.recommended_cal_due_date:
        return "Due date not available"
    today = date.today()
    if cert.recommended_cal_due_date < today:
        return "Calibration overdue"
    return "Calibration valid"
 
 
def _sanitize_filename_part(value: str) -> str:
    """Replace characters invalid in filenames with underscore; collapse spaces."""
    if not value or not isinstance(value, str):
        return "Unknown"
    invalid = r'/\:*?"<>|'
    s = value.strip()
    for c in invalid:
        s = s.replace(c, "_")
    s = "_".join(s.split())  # collapse whitespace to single underscore
    return s or "Unknown"
 
 
def get_certificate_pdf_filename(db: Session, certificate_id: int) -> str:
    """
    Return PDF filename as EquipmentType_Model_SerialNumber.pdf using the certificate's equipment.
    Falls back to certificate_no or cert_{id} if equipment is missing.
    """
    cert = get_certificate_by_id(db, certificate_id)
    if not cert:
        return f"cert_{certificate_id}.pdf"
    job = (
        db.query(HTWJob)
        .options(joinedload(HTWJob.equipment_rel))
        .filter(HTWJob.job_id == cert.job_id)
        .first()
    )
    if job and job.equipment_rel:
        eq = job.equipment_rel
        equipment_type = _sanitize_filename_part(eq.material_description)
        model = _sanitize_filename_part(eq.model)
        serial = _sanitize_filename_part(eq.serial_no)
        return f"{equipment_type}_{model}_{serial}.pdf"
    safe = (cert.certificate_no or f"cert_{certificate_id}").replace("/", "-").replace("\\", "-")
    return f"{safe}.pdf"
 
 
def list_certificates(
    db: Session,
    job_id: Optional[int] = None,
    inward_id: Optional[int] = None,
    status: Optional[str] = None,
) -> List[HTWCertificate]:
    q = db.query(HTWCertificate)
    if job_id:
        q = q.filter(HTWCertificate.job_id == job_id)
    if inward_id:
        q = q.filter(HTWCertificate.inward_id == inward_id)
    if status:
        q = q.filter(HTWCertificate.status == status)
    return q.order_by(HTWCertificate.created_at.desc()).all()
 
 
def list_certificates_with_context(
    db: Session,
    job_id: Optional[int] = None,
    inward_id: Optional[int] = None,
    status: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """List certificates with srf_no, nepl_id, material_description for SRF grouping."""
    certs = list_certificates(db, job_id=job_id, inward_id=inward_id, status=status)
    result = []
    for c in certs:
        srf_no = None
        nepl_id = None
        material_description = None
        if c.inward_id:
            inward = db.query(Inward).filter(Inward.inward_id == c.inward_id).first()
            if inward:
                srf_no = str(inward.srf_no) if inward.srf_no else None
        if c.inward_eqp_id:
            eq = db.query(InwardEquipment).filter(InwardEquipment.inward_eqp_id == c.inward_eqp_id).first()
            if eq:
                nepl_id = eq.nepl_id
                material_description = eq.material_description
        result.append({
            "certificate_id": c.certificate_id,
            "job_id": c.job_id,
            "inward_id": c.inward_id,
            "inward_eqp_id": c.inward_eqp_id,
            "certificate_no": c.certificate_no,
            "date_of_calibration": c.date_of_calibration,
            "ulr_no": c.ulr_no,
            "field_of_parameter": c.field_of_parameter,
            "recommended_cal_due_date": c.recommended_cal_due_date,
            "item_status": c.item_status or "Satisfactory",
            "authorised_signatory": c.authorised_signatory,
            "status": c.status,
            "created_by": c.created_by,
            "created_at": c.created_at,
            "approved_by": c.approved_by,
            "approved_at": c.approved_at,
            "issued_at": c.issued_at,
            "srf_no": srf_no,
            "nepl_id": nepl_id,
            "material_description": material_description,
        })
    return result
 
 
def list_certificates_for_customer(db: Session, customer_id: int) -> List[HTWCertificate]:
    """List ISSUED certificates for a customer (via inward.customer_id)."""
    return (
        db.query(HTWCertificate)
        .join(Inward, HTWCertificate.inward_id == Inward.inward_id)
        .filter(Inward.customer_id == customer_id)
        .filter(HTWCertificate.status == "ISSUED")
        .order_by(HTWCertificate.created_at.desc())
        .all()
    )
 
 
def get_certificate_for_customer(db: Session, certificate_id: int, customer_id: int) -> Optional[HTWCertificate]:
    """Get a certificate by ID only if it belongs to the customer and is ISSUED."""
    cert = (
        db.query(HTWCertificate)
        .join(Inward, HTWCertificate.inward_id == Inward.inward_id)
        .filter(HTWCertificate.certificate_id == certificate_id)
        .filter(Inward.customer_id == customer_id)
        .filter(HTWCertificate.status == "ISSUED")
        .first()
    )
    return cert
 
 
def list_srf_groups_with_eligible_equipment(db: Session) -> List[Dict[str, Any]]:
    """
    List SRFs (inwards) with all equipments eligible for certificate.
    Eligible = equipment has a calibration job (htw_job) in a finished state
    (Calibrated, Completed - OOT, or Completed).
    For each equipment, includes certificate if it exists.
    """
    from sqlalchemy.orm import joinedload
 
    inwards = (
        db.query(Inward)
        .options(joinedload(Inward.equipments))
        .filter(Inward.is_draft.is_(False))
        .order_by(Inward.created_at.desc())
        .all()
    )
    cert_by_job = {c.job_id: c for c in db.query(HTWCertificate).all()}
    job_by_eqp = {j.inward_eqp_id: j for j in db.query(HTWJob).all()}
 
    result = []
    for i in inwards:
        eligible = []
        for eq in (i.equipments or []):
            job = job_by_eqp.get(eq.inward_eqp_id)
            if not job:
                continue
            if not job_status_allows_certificate_generation(job.job_status):
                continue
            cert = cert_by_job.get(job.job_id) if job else None
            cal_date = job.date
            eligible.append({
                "inward_eqp_id": eq.inward_eqp_id,
                "nepl_id": eq.nepl_id or "",
                "material_description": eq.material_description or "",
                "make": eq.make or "",
                "model": eq.model or "",
                "serial_no": eq.serial_no or "",
                "job_id": job.job_id,
                "job_status": job.job_status or "",
                "calibration_date": cal_date.isoformat() if cal_date else None,
                "certificate": {
                    "certificate_id": cert.certificate_id,
                    "certificate_no": cert.certificate_no,
                    "date_of_calibration": cert.date_of_calibration.isoformat() if cert.date_of_calibration else None,
                    "ulr_no": cert.ulr_no,
                    "status": cert.status,
                    "job_id": cert.job_id,
                    "inward_id": cert.inward_id,
                    "inward_eqp_id": cert.inward_eqp_id,
                    "field_of_parameter": cert.field_of_parameter,
                    "recommended_cal_due_date": cert.recommended_cal_due_date.isoformat() if cert.recommended_cal_due_date else None,
                    "item_status": cert.item_status or "Satisfactory",
                    "authorised_signatory": cert.authorised_signatory,
                    "admin_rework_comment": getattr(cert, "admin_rework_comment", None) or "",
                    "qr_token": cert.qr_token if cert else None,
                    "qr_image_base64": cert.qr_image_base64 if cert else None,
                    "qr_generated_at": cert.qr_generated_at.isoformat() if cert and cert.qr_generated_at else None,
                } if cert else None,
            })
        if eligible:
            total_equipment = len(i.equipments or [])
            result.append({
                "inward_id": i.inward_id,
                "srf_no": str(i.srf_no) if i.srf_no else "",
                "customer_details": i.customer_details or "",
                "customer_dc_no": i.customer_dc_no or "",
                "total_equipment_count": total_equipment,
                "equipments": eligible,
            })
    return result

def get_customer_portal_certificates(db: Session, customer_id: int):
    logger.info(f"--- START get_customer_portal_certificates for customer_id: {customer_id} ---")
    
    # 1. Fetch System-Generated Certificates (ISSUED only)
    system_certs = (
        db.query(HTWCertificate)
        .join(Inward, HTWCertificate.inward_id == Inward.inward_id)
        .filter(Inward.customer_id == customer_id)
        .filter(HTWCertificate.status == "ISSUED")
        .all()
    )
    logger.info(f"System Certs Found: {len(system_certs)}")

    # 2. Fetch Manually Uploaded Certificates
    manual_uploads = (
        db.query(ExternalUpload, InwardEquipment, Inward)
        .join(InwardEquipment, ExternalUpload.inward_eqp_id == InwardEquipment.inward_eqp_id)
        .join(Inward, InwardEquipment.inward_id == Inward.inward_id)
        .filter(Inward.customer_id == customer_id)
        .filter(ExternalUpload.certificate_file_url != None)
        .all()
    )
    logger.info(f"Manual Uploads Found: {len(manual_uploads)}")

    results = []
    for cert in system_certs:
        results.append({
            "certificate_id": cert.certificate_id,
            "job_id": cert.job_id,
            "certificate_no": cert.certificate_no,
            "date_of_calibration": cert.date_of_calibration,
            "ulr_no": cert.ulr_no,
            "recommended_cal_due_date": cert.recommended_cal_due_date,
            "customer_dc_no": cert.inward_id,
            "is_external": False,
            "status": cert.status
        })

    for upload, eqp, inward in manual_uploads:
        logger.info(f"Mapping Manual Upload: ID={upload.id}, EqpID={upload.inward_eqp_id}, URL={upload.certificate_file_url}")
        results.append({
            "certificate_id": f"ext_{upload.id}",
            "job_id": inward.inward_id, 
            "certificate_no": upload.certificate_file_name or "Manual Upload",
            "date_of_calibration": eqp.created_at,
            "ulr_no": "—",
            "recommended_cal_due_date": None,
            "customer_dc_no": inward.customer_dc_no or inward.inward_id,
            "is_external": True,
            "certificate_file_url": upload.certificate_file_url,
            "certificate_file_name": upload.certificate_file_name,
            "status": "ISSUED"
        })

    logger.info(f"Total Results for Portal: {len(results)}")
    return results

def get_portal_certificates_combined(db: Session, customer_id: int):
    logger.info(f"--- START get_portal_certificates_combined for customer_id: {customer_id} ---")
    
    system_certs = (
        db.query(HTWCertificate, Inward.customer_dc_no)
        .join(Inward, HTWCertificate.inward_id == Inward.inward_id)
        .filter(Inward.customer_id == customer_id)
        .filter(HTWCertificate.status == "ISSUED")
        .all()
    )
    logger.info(f"System Certs Found: {len(system_certs)}")

    manual_uploads = (
        db.query(ExternalUpload, InwardEquipment, Inward)
        .join(InwardEquipment, ExternalUpload.inward_eqp_id == InwardEquipment.inward_eqp_id)
        .join(Inward, InwardEquipment.inward_id == Inward.inward_id)
        .filter(Inward.customer_id == customer_id)
        .filter(ExternalUpload.certificate_file_url != None)
        .all()
    )
    logger.info(f"Manual Uploads Found: {len(manual_uploads)}")

    combined_results = []
    for cert, dc_no in system_certs:
        combined_results.append({
            "certificate_id": cert.certificate_id,
            "job_id": cert.job_id,
            "inward_id": cert.inward_id,
            "certificate_no": cert.certificate_no,
            "date_of_calibration": cert.date_of_calibration.isoformat() if cert.date_of_calibration else None,
            "ulr_no": cert.ulr_no,
            "field_of_parameter": cert.field_of_parameter,
            "recommended_cal_due_date": cert.recommended_cal_due_date.isoformat() if cert.recommended_cal_due_date else None,
            "status": cert.status,
            "customer_dc_no": dc_no or str(cert.inward_id),
            "is_external": False
        })

    for upload, eqp, inward in manual_uploads:
        logger.info(f"Mapping Manual Upload (Combined): ID={upload.id}, URL={upload.certificate_file_url}")
        combined_results.append({
            "certificate_id": f"ext_{upload.id}",
            "job_id": inward.inward_id,
            "inward_id": inward.inward_id,
            "certificate_no": upload.certificate_file_name or "Manual Certificate",
            "date_of_calibration": upload.created_at.isoformat(),
            "ulr_no": "—",
            "field_of_parameter": "—",
            "recommended_cal_due_date": None,
            "status": "ISSUED",
            "customer_dc_no": inward.customer_dc_no or str(inward.inward_id),
            "is_external": True,
            "certificate_file_url": upload.certificate_file_url,
            "certificate_file_name": upload.certificate_file_name
        })

    combined_results.sort(key=lambda x: x['date_of_calibration'] or '', reverse=True)
    logger.info(f"Total Results: {len(combined_results)}")
    return combined_results

def list_certificates_with_external(db: Session, customer_id: Optional[int] = None, status: Optional[str] = None):
    logger.info(f"--- START list_certificates_with_external (Cust: {customer_id}, Stat: {status}) ---")
    
    query = db.query(HTWCertificate, Inward.customer_dc_no).join(Inward, HTWCertificate.inward_id == Inward.inward_id)
    if customer_id: query = query.filter(Inward.customer_id == customer_id)
    if status: query = query.filter(HTWCertificate.status == status)
    
    system_certs = query.all()
    logger.info(f"System Certs Query Count: {len(system_certs)}")

    ext_query = db.query(ExternalUpload, InwardEquipment, Inward).join(
        InwardEquipment, ExternalUpload.inward_eqp_id == InwardEquipment.inward_eqp_id
    ).join(
        Inward, InwardEquipment.inward_id == Inward.inward_id
    ).filter(ExternalUpload.certificate_file_url != None)

    if customer_id: ext_query = ext_query.filter(Inward.customer_id == customer_id)
    
    manual_certs = ext_query.all()
    logger.info(f"Manual Certs Query Count: {len(manual_certs)}")

    results = []
    for cert, dc_no in system_certs:
        results.append({
            "certificate_id": cert.certificate_id,
            "job_id": cert.job_id,
            "inward_id": cert.inward_id,
            "certificate_no": cert.certificate_no,
            "date_of_calibration": cert.date_of_calibration,
            "ulr_no": cert.ulr_no,
            "field_of_parameter": cert.field_of_parameter,
            "recommended_cal_due_date": cert.recommended_cal_due_date,
            "status": cert.status,
            "customer_dc_no": dc_no or str(cert.inward_id),
            "is_external": False
        })

    for upload, eqp, inward in manual_certs:
        logger.info(f"Mapping Manual (External): ID={upload.id}, URL={upload.certificate_file_url}")
        results.append({
            "certificate_id": f"ext_{upload.id}",
            "job_id": inward.inward_id,
            "inward_id": inward.inward_id,
            "certificate_no": upload.certificate_file_name or "MANUAL-CERT",
            "date_of_calibration": upload.created_at.date(), 
            "ulr_no": "—",
            "field_of_parameter": "—",
            "recommended_cal_due_date": None,
            "status": "ISSUED",
            "customer_dc_no": inward.customer_dc_no or str(inward.inward_id),
            "is_external": True,
            "certificate_file_url": upload.certificate_file_url,
            "certificate_file_name": upload.certificate_file_name
        })

    logger.info(f"Final Count Returning to Router: {len(results)}")
    return results
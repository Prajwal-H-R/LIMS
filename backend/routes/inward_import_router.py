# backend/routes/inward_import_router.py

import json
import logging
from typing import Any, Dict, List, Literal, Optional, Tuple

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend.auth import check_staff_role
from backend.db import get_db
from backend.schemas.inward_import_schemas import (
    ImportMetadataResponse,
    ImportValidationResponse,
    RevalidateRowsRequest,
)
from backend.schemas.user_schemas import User as UserSchema
from backend.services.inward_import_services import (
    MAX_IMPORT_ROWS,
    TEMPLATE_COLUMNS,
    InwardImportService,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/staff/inward-import", tags=["Inward Import"])


def _parse_json_string_list(raw: Optional[str], field_name: str) -> List[str]:
    if not raw or not raw.strip():
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=422, detail=f"{field_name} must be a valid JSON array."
        ) from exc
    if not isinstance(parsed, list):
        raise HTTPException(
            status_code=422, detail=f"{field_name} must be a JSON array."
        )
    return [str(item) for item in parsed if item is not None and str(item).strip()]


@router.get("/metadata", response_model=ImportMetadataResponse)
async def get_inward_import_metadata(
    known_materials: Optional[List[str]] = Query(None),
    configured_types: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
    current_user: UserSchema = Depends(check_staff_role),
):
    """
    Return copyable valid values from the system for the CSV Import Guide:
    - Material Descriptions (DB history + defaults + active flow configs)
    - Active Manufacturer Specs (Make -> Model -> Auto Range)
    - Calibration & Visual Inspection valid options
    """
    return InwardImportService(db).get_import_metadata(
        known_materials=known_materials,
        configured_types=configured_types,
    )


@router.get("/template")
async def download_inward_import_template(
    format: Literal["csv", "xlsx"] = Query("csv"),
    known_materials: Optional[List[str]] = Query(None),
    configured_types: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
    current_user: UserSchema = Depends(check_staff_role),
):
    """
    Download a ready-to-fill CSV or Excel (.xlsx) equipment import template.
    """
    service = InwardImportService(db)
    if format == "xlsx":
        stream = service.build_template_xlsx(
            known_materials=known_materials,
            configured_types=configured_types,
        )
        return StreamingResponse(
            stream,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": 'attachment; filename="inward_equipment_template.xlsx"'
            },
        )

    stream = service.build_template_csv(
        known_materials=known_materials,
        configured_types=configured_types,
    )
    return StreamingResponse(
        stream,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="inward_equipment_template.csv"'
        },
    )


@router.post("/validate", response_model=ImportValidationResponse)
async def validate_inward_import_file(
    file: UploadFile = File(...),
    known_materials: str = Form("[]"),
    configured_types: str = Form("[]"),
    db: Session = Depends(get_db),
    current_user: UserSchema = Depends(check_staff_role),
):
    """
    Parse and validate an uploaded CSV or XLSX file in memory without saving to DB.
    Returns row-by-row statuses, typo suggestions, missing dropdown items,
    and auto-populated Manufacturer Spec ranges for Hydraulic Torque Wrench.
    """
    known_list = _parse_json_string_list(known_materials, "known_materials")
    configured_list = _parse_json_string_list(configured_types, "configured_types")

    return await InwardImportService(db).validate_upload(
        file=file,
        known_materials=known_list,
        configured_types=configured_list,
    )


@router.post("/revalidate", response_model=ImportValidationResponse)
async def revalidate_inward_import_rows(
    payload: RevalidateRowsRequest,
    db: Session = Depends(get_db),
    current_user: UserSchema = Depends(check_staff_role),
):
    """
    Re-validate staged rows after inline user edits (typo fixes, Make/Model
    selection, or after manually adding a missing Material Description to the dropdown).
    """
    if len(payload.rows) > MAX_IMPORT_ROWS:
        raise HTTPException(
            status_code=422,
            detail=f"Cannot validate more than {MAX_IMPORT_ROWS} rows per inward.",
        )

    parsed_rows: List[Tuple[int, Dict[str, str]]] = []
    for idx, entry in enumerate(payload.rows, start=1):
        if not isinstance(entry, dict):
            continue
        raw_num = entry.get("row_number", idx + 1)
        try:
            row_number = int(raw_num)
        except (TypeError, ValueError):
            row_number = idx + 1

        raw_source = entry.get("raw") if isinstance(entry.get("raw"), dict) else entry
        row_dict: Dict[str, str] = {
            col: "" if raw_source.get(col) is None else str(raw_source.get(col))
            for col in TEMPLATE_COLUMNS
        }
        parsed_rows.append((row_number, row_dict))

    return InwardImportService(db).validate_rows(
        parsed_rows=parsed_rows,
        filename=payload.filename,
        file_type=payload.file_type,
        known_materials=payload.known_materials,
        configured_types=payload.configured_types,
    )

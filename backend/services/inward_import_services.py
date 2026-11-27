# backend/services/inward_import_services.py

import csv
import difflib
import io
import logging
import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import HTTPException, UploadFile
from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from backend.models.htw.htw_manufacturer_spec import HTWManufacturerSpec
from backend.models.inward_equipments import InwardEquipment
from backend.schemas.inward_import_schemas import (
    ImportFieldIssue,
    ImportMetadataResponse,
    ImportValidationResponse,
    ManufacturerSpecOption,
    ValidatedEquipmentPayload,
    ValidatedImportRow,
)

try:
    import openpyxl
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter
    from openpyxl.worksheet.datavalidation import DataValidation

    HAS_OPENPYXL = True
except ImportError:  # pragma: no cover
    HAS_OPENPYXL = False


logger = logging.getLogger(__name__)

MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024  # 2 MB
MAX_IMPORT_ROWS = 500

INITIAL_MATERIAL_DESCRIPTIONS: List[str] = [
    "Hydraulic Torque Wrench",
    "Pressure Gauge",
    "Temperature Gauge",
    "Vernier Caliper",
    "Micrometer",
]

# Matches InwardForm.tsx (`const isHydraulic = equipment.material_desc === "Hydraulic Torque Wrench"`)
SPEC_DRIVEN_MATERIALS: Set[str] = {"Hydraulic Torque Wrench"}

CALIBRATION_OPTIONS: List[str] = [
    "In House(Torque Lab)",
    "Outsource",
    "On-Site",
]

VISUAL_INSPECTION_OPTIONS: List[str] = ["OK", "Not OK"]

FUZZY_MATERIAL_CUTOFF = 0.78
FUZZY_SPEC_CUTOFF = 0.72

TEMPLATE_COLUMNS: List[str] = [
    "material_description",
    "make",
    "model",
    "range",
    "serial_no",
    "qty",
    "calibration_by",
    "supplier",
    "in_dc",
    "out_dc",
    "accessories_included",
    "visual_inspection",
    "engineer_remarks",
]

HEADER_ALIASES: Dict[str, Set[str]] = {
    "material_description": {
        "material_description",
        "material_desc",
        "material",
        "equipment",
        "equipment_name",
        "description",
    },
    "make": {"make", "manufacturer", "brand"},
    "model": {"model", "model_no", "model_number"},
    "range": {"range", "capacity", "torque_range"},
    "serial_no": {"serial_no", "serial_number", "serial"},
    "qty": {"qty", "quantity"},
    "calibration_by": {"calibration_by", "calibration", "calibration_type"},
    "supplier": {"supplier", "vendor"},
    "in_dc": {"in_dc", "inward_dc"},
    "out_dc": {"out_dc", "outward_dc"},
    "accessories_included": {"accessories_included", "accessories", "accessory"},
    "visual_inspection": {
        "visual_inspection",
        "visual_inspection_notes",
        "visual_status",
        "inspe_status",
        "visual",
    },
    "engineer_remarks": {
        "engineer_remarks",
        "eng_remarks",
        "remarks",
        "issue_remarks",
    },
}

CALIBRATION_SYNONYMS: Dict[str, str] = {
    "in house(torque lab)": "In House(Torque Lab)",
    "in house (torque lab)": "In House(Torque Lab)",
    "inhouse(torque lab)": "In House(Torque Lab)",
    "inhouse (torque lab)": "In House(Torque Lab)",
    "in-house(torque lab)": "In House(Torque Lab)",
    "in-house (torque lab)": "In House(Torque Lab)",
    "in house": "In House(Torque Lab)",
    "in-house": "In House(Torque Lab)",
    "inhouse": "In House(Torque Lab)",
    "torque lab": "In House(Torque Lab)",
    "outsource": "Outsource",
    "outsourced": "Outsource",
    "out source": "Outsource",
    "on-site": "On-Site",
    "onsite": "On-Site",
    "on site": "On-Site",
}

VISUAL_SYNONYMS: Dict[str, str] = {
    "ok": "OK",
    "okay": "OK",
    "not ok": "Not OK",
    "not_ok": "Not OK",
    "not-ok": "Not OK",
    "notok": "Not OK",
    "nok": "Not OK",
}

EXCEL_DATE_PATTERNS = [
    re.compile(r"^\d{4}-\d{2}-\d{2}$"),
    re.compile(r"^\d{1,2}-[A-Za-z]{3}$"),
    re.compile(r"^[A-Za-z]{3}-\d{1,2}$"),
]
SCIENTIFIC_NOTATION_PATTERN = re.compile(r"^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$")
PLACEHOLDER_SERIALS = {"na", "n/a", "-", "--", "nil", "none"}


def _norm_space(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def _norm_key(value: Any) -> str:
    return _norm_space(value).lower()


def _norm_alnum(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def _norm_header(header: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(header or "").strip().lower()).strip("_")


def _format_number_clean(val: Any) -> Optional[str]:
    if val is None:
        return None
    try:
        num = float(val)
        if num.is_integer():
            return str(int(num))
        return f"{num:.6f}".rstrip("0").rstrip(".")
    except (TypeError, ValueError):
        cleaned = _norm_space(val)
        return cleaned or None


def _format_spec_range(range_min: Any, range_max: Any) -> str:
    min_str = _format_number_clean(range_min)
    max_str = _format_number_clean(range_max)
    if min_str is not None and max_str is not None:
        return f"{min_str} - {max_str}"
    return ""


def _best_fuzzy_match(
    query: str, candidates: List[str], cutoff: float
) -> Optional[str]:
    q_norm = _norm_key(query)
    if not q_norm or not candidates:
        return None

    best_score = 0.0
    best_candidate: Optional[str] = None
    for candidate in candidates:
        score = difflib.SequenceMatcher(None, q_norm, _norm_key(candidate)).ratio()
        if score > best_score:
            best_score = score
            best_candidate = candidate

    if best_score >= cutoff:
        return best_candidate
    return None


def _detect_csv_delimiter(sample_line: str) -> str:
    # Count candidate delimiters outside quoted segments
    counts = {",": 0, ";": 0, "\t": 0}
    in_quotes = False
    for ch in sample_line:
        if ch == '"':
            in_quotes = not in_quotes
        elif not in_quotes and ch in counts:
            counts[ch] += 1
    if counts[","] > 0 and counts[","] >= counts[";"] and counts[","] >= counts["\t"]:
        return ","
    if counts[";"] > 0 and counts[";"] >= counts["\t"]:
        return ";"
    if counts["\t"] > 0:
        return "\t"
    return ","


class InwardImportService:
    def __init__(self, db: Session):
        self.db = db

    # ---------------------------------------------------------
    # Database Reference Lookups (Batch / Single-Pass)
    # ---------------------------------------------------------

    def _fetch_db_material_history(self) -> List[str]:
        try:
            stmt = (
                select(InwardEquipment.material_description)
                .where(InwardEquipment.material_description.is_not(None))
                .where(InwardEquipment.material_description != "")
                .distinct()
                .order_by(InwardEquipment.material_description)
            )
            rows = self.db.scalars(stmt).all()
            return [_norm_space(r) for r in rows if _norm_space(r)]
        except Exception as exc:
            logger.warning("Failed to fetch inward material history: %s", exc)
            return []

    def _fetch_active_flow_types(self) -> List[str]:
        """Safely read active equipment_type rows if flow_configs table exists."""
        try:
            bind = self.db.get_bind()
            if bind is None:
                return []
            db_inspector = inspect(bind)
            if not db_inspector.has_table("flow_configs"):
                return []
            cols = {c["name"] for c in db_inspector.get_columns("flow_configs")}
            if "equipment_type" not in cols:
                return []
            if "is_active" in cols:
                sql = text(
                    "SELECT equipment_type FROM flow_configs "
                    "WHERE is_active = true AND equipment_type IS NOT NULL"
                )
            else:
                sql = text(
                    "SELECT equipment_type FROM flow_configs "
                    "WHERE equipment_type IS NOT NULL"
                )
            rows = self.db.execute(sql).fetchall()
            return [_norm_space(r[0]) for r in rows if _norm_space(r[0])]
        except Exception as exc:
            logger.warning("Could not query flow_configs safely: %s", exc)
            return []

    def _fetch_active_manufacturer_specs(self) -> List[ManufacturerSpecOption]:
        rows = (
            self.db.query(HTWManufacturerSpec)
            .filter(HTWManufacturerSpec.is_active.is_(True))
            .order_by(HTWManufacturerSpec.make, HTWManufacturerSpec.model)
            .all()
        )
        specs: List[ManufacturerSpecOption] = []
        seen: Set[Tuple[str, str]] = set()
        for row in rows:
            make = _norm_space(row.make)
            model = _norm_space(row.model)
            if not make or not model:
                continue
            pair = (make, model)
            if pair in seen:
                continue
            seen.add(pair)
            unit = row.torque_unit or row.pressure_unit
            range_min = float(row.range_min) if row.range_min is not None else None
            range_max = float(row.range_max) if row.range_max is not None else None
            specs.append(
                ManufacturerSpecOption(
                    make=make,
                    model=model,
                    range_min=range_min,
                    range_max=range_max,
                    unit=unit,
                    range_text=_format_spec_range(row.range_min, row.range_max),
                )
            )
        return specs

    def _build_material_catalog(
        self,
        known_materials: Optional[List[str]] = None,
        configured_types_param: Optional[List[str]] = None,
    ) -> Tuple[List[str], List[str]]:
        db_flow_types = self._fetch_active_flow_types()
        db_history = self._fetch_db_material_history()

        configured_ordered: List[str] = []
        configured_by_norm: Dict[str, str] = {}
        for item in [*(configured_types_param or []), *db_flow_types]:
            cleaned = _norm_space(item)
            if not cleaned:
                continue
            nk = _norm_key(cleaned)
            if nk not in configured_by_norm:
                configured_by_norm[nk] = cleaned
                configured_ordered.append(cleaned)

        material_by_norm: Dict[str, str] = {}
        # Priority for canonical casing: INITIAL -> configured -> DB history -> frontend known_materials
        for source_list in (
            INITIAL_MATERIAL_DESCRIPTIONS,
            configured_ordered,
            db_history,
            known_materials or [],
        ):
            for item in source_list:
                cleaned = _norm_space(item)
                if not cleaned:
                    continue
                nk = _norm_key(cleaned)
                if nk not in material_by_norm:
                    material_by_norm[nk] = cleaned

        all_materials = sorted(material_by_norm.values(), key=lambda s: s.lower())
        all_configured = sorted(configured_by_norm.values(), key=lambda s: s.lower())
        return all_materials, all_configured

    # ---------------------------------------------------------
    # Metadata & Template Endpoints
    # ---------------------------------------------------------

    def get_import_metadata(
        self,
        known_materials: Optional[List[str]] = None,
        configured_types: Optional[List[str]] = None,
    ) -> ImportMetadataResponse:
        materials, resolved_configured = self._build_material_catalog(
            known_materials=known_materials,
            configured_types_param=configured_types,
        )
        specs = self._fetch_active_manufacturer_specs()

        models_by_make: Dict[str, List[ManufacturerSpecOption]] = {}
        for spec in specs:
            models_by_make.setdefault(spec.make, []).append(spec)

        makes = sorted(models_by_make.keys(), key=lambda s: s.lower())
        for make in makes:
            models_by_make[make].sort(key=lambda s: s.model.lower())

        return ImportMetadataResponse(
            material_descriptions=materials,
            configured_types=resolved_configured,
            spec_driven_materials=sorted(SPEC_DRIVEN_MATERIALS),
            calibration_options=CALIBRATION_OPTIONS,
            visual_inspection_options=VISUAL_INSPECTION_OPTIONS,
            makes=makes,
            models_by_make=models_by_make,
        )

    def build_template_csv(
        self,
        known_materials: Optional[List[str]] = None,
        configured_types: Optional[List[str]] = None,
    ) -> io.BytesIO:
        metadata = self.get_import_metadata(known_materials, configured_types)
        sample_make = metadata.makes[0] if metadata.makes else "ATLAS_COPCO"
        sample_model = (
            metadata.models_by_make[sample_make][0].model
            if metadata.makes and metadata.models_by_make.get(sample_make)
            else "ATLAS_COPCO / RT-10"
        )

        text_buf = io.StringIO()
        writer = csv.writer(text_buf)
        writer.writerow(TEMPLATE_COLUMNS)
        writer.writerow(
            [
                "Hydraulic Torque Wrench",
                sample_make,
                sample_model,
                "",
                "HTW-001",
                "1",
                "In House(Torque Lab)",
                "",
                "",
                "",
                "Carry Case",
                "OK",
                "",
            ]
        )
        writer.writerow(
            [
                "Pressure Gauge",
                "WIKA",
                "PG-232",
                "0 - 400 bar",
                "PG-0092",
                "2",
                "On-Site",
                "",
                "",
                "",
                "Protective Boot",
                "Not OK",
                "Glass slightly scratched",
            ]
        )
        # UTF-8 with BOM so Microsoft Excel opens cleanly with zero encoding garbling
        raw_bytes = ("\ufeff" + text_buf.getvalue()).encode("utf-8")
        return io.BytesIO(raw_bytes)

    def build_template_xlsx(
        self,
        known_materials: Optional[List[str]] = None,
        configured_types: Optional[List[str]] = None,
    ) -> io.BytesIO:
        if not HAS_OPENPYXL:
            raise HTTPException(
                status_code=500,
                detail="openpyxl is required on the server to generate Excel templates.",
            )

        metadata = self.get_import_metadata(known_materials, configured_types)
        sample_make = metadata.makes[0] if metadata.makes else "ATLAS_COPCO"
        sample_model = (
            metadata.models_by_make[sample_make][0].model
            if metadata.makes and metadata.models_by_make.get(sample_make)
            else "ATLAS_COPCO / RT-10"
        )

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Equipment_Import"
        ws.freeze_panes = "A2"

        header_fill = PatternFill(
            start_color="1E3A8A", end_color="1E3A8A", fill_type="solid"
        )
        header_font = Font(color="FFFFFF", bold=True, size=11)

        ws.append(TEMPLATE_COLUMNS)
        for col_idx, col_name in enumerate(TEMPLATE_COLUMNS, start=1):
            cell = ws.cell(row=1, column=col_idx)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")
            ws.column_dimensions[get_column_letter(col_idx)].width = max(
                18, len(col_name) + 6
            )

        ws.append(
            [
                "Hydraulic Torque Wrench",
                sample_make,
                sample_model,
                "",
                "HTW-001",
                1,
                "In House(Torque Lab)",
                "",
                "",
                "",
                "Carry Case",
                "OK",
                "",
            ]
        )
        ws.append(
            [
                "Pressure Gauge",
                "WIKA",
                "PG-232",
                "0 - 400 bar",
                "PG-0092",
                2,
                "On-Site",
                "",
                "",
                "",
                "Protective Boot",
                "Not OK",
                "Glass slightly scratched",
            ]
        )

        # Force Text format (@) on Range, Serial No, In DC, Out DC so Excel keeps leading zeros & "1-10"
        text_col_indices = [
            TEMPLATE_COLUMNS.index(col) + 1
            for col in ("range", "serial_no", "in_dc", "out_dc")
        ]
        for row_idx in range(2, MAX_IMPORT_ROWS + 2):
            for col_idx in text_col_indices:
                ws.cell(row=row_idx, column=col_idx).number_format = "@"

        # Reference Sheet for Excel Dropdowns & Copyable HTW Specs
        ref = wb.create_sheet(title="Valid_Values_Reference")
        ref_headers = [
            "Material Descriptions",
            "Calibration Options",
            "Visual Inspection",
            "HTW Makes",
            "HTW Spec Make",
            "HTW Spec Model",
            "HTW Auto Range",
        ]
        ref.append(ref_headers)
        for col_idx, h in enumerate(ref_headers, start=1):
            c = ref.cell(row=1, column=col_idx)
            c.fill = header_fill
            c.font = header_font
            ref.column_dimensions[get_column_letter(col_idx)].width = max(24, len(h) + 6)

        flat_specs: List[ManufacturerSpecOption] = []
        for make in metadata.makes:
            flat_specs.extend(metadata.models_by_make.get(make, []))

        max_ref_len = max(
            len(metadata.material_descriptions),
            len(CALIBRATION_OPTIONS),
            len(VISUAL_INSPECTION_OPTIONS),
            len(metadata.makes),
            len(flat_specs),
            1,
        )
        for idx in range(max_ref_len):
            spec_item = flat_specs[idx] if idx < len(flat_specs) else None
            ref.append(
                [
                    metadata.material_descriptions[idx]
                    if idx < len(metadata.material_descriptions)
                    else "",
                    CALIBRATION_OPTIONS[idx] if idx < len(CALIBRATION_OPTIONS) else "",
                    VISUAL_INSPECTION_OPTIONS[idx]
                    if idx < len(VISUAL_INSPECTION_OPTIONS)
                    else "",
                    metadata.makes[idx] if idx < len(metadata.makes) else "",
                    spec_item.make if spec_item else "",
                    spec_item.model if spec_item else "",
                    spec_item.range_text if spec_item else "",
                ]
            )

        # Attach Data Validations on Sheet 1
        max_row = MAX_IMPORT_ROWS + 1
        if metadata.material_descriptions:
            mat_end = len(metadata.material_descriptions) + 1
            dv_mat = DataValidation(
                type="list",
                formula1=f"=Valid_Values_Reference!$A$2:$A${mat_end}",
                allow_blank=False,
                errorStyle="warning",
                showErrorMessage=True,
                errorTitle="Material Not in List",
                error="Add missing materials manually in the Inward Form before importing.",
            )
            ws.add_data_validation(dv_mat)
            dv_mat.add(f"A2:A{max_row}")

        dv_cal = DataValidation(
            type="list",
            formula1=f"=Valid_Values_Reference!$B$2:$B${len(CALIBRATION_OPTIONS) + 1}",
            allow_blank=False,
            showErrorMessage=True,
            errorTitle="Invalid Calibration",
            error="Choose In House(Torque Lab), Outsource, or On-Site.",
        )
        ws.add_data_validation(dv_cal)
        dv_cal.add(f"G2:G{max_row}")

        dv_vis = DataValidation(
            type="list",
            formula1=f"=Valid_Values_Reference!$C$2:$C${len(VISUAL_INSPECTION_OPTIONS) + 1}",
            allow_blank=True,
            showErrorMessage=True,
            errorTitle="Invalid Visual Inspection",
            error="Choose OK or Not OK.",
        )
        ws.add_data_validation(dv_vis)
        dv_vis.add(f"L2:L{max_row}")

        output = io.BytesIO()
        wb.save(output)
        wb.close()
        output.seek(0)
        return output

    # ---------------------------------------------------------
    # File Parsing (CSV / XLSX)
    # ---------------------------------------------------------

    def _map_headers(
        self, raw_headers: List[str]
    ) -> Tuple[Dict[int, str], List[str]]:
        col_map: Dict[int, str] = {}
        mapped_fields: Set[str] = set()

        for idx, raw_header in enumerate(raw_headers):
            nh = _norm_header(raw_header)
            if not nh:
                continue
            for canonical, aliases in HEADER_ALIASES.items():
                if nh == canonical or nh in aliases:
                    if canonical not in mapped_fields:
                        col_map[idx] = canonical
                        mapped_fields.add(canonical)
                    break

        missing_required_headers: List[str] = []
        for req_col in ("material_description", "make", "model"):
            if req_col not in mapped_fields:
                missing_required_headers.append(req_col)

        return col_map, missing_required_headers

    def _parse_csv_bytes(
        self, raw_bytes: bytes
    ) -> Tuple[List[Tuple[int, Dict[str, str]]], List[str]]:
        text_content: Optional[str] = None
        for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
            try:
                text_content = raw_bytes.decode(encoding)
                break
            except UnicodeDecodeError:
                continue

        if text_content is None:
            return [], ["Could not decode CSV text. Please save the file as UTF-8 CSV."]

        lines = text_content.splitlines()
        first_non_empty_idx: Optional[int] = None
        for idx, line in enumerate(lines):
            if line.strip():
                first_non_empty_idx = idx
                break

        if first_non_empty_idx is None:
            return [], ["The uploaded CSV file is empty."]

        delimiter = _detect_csv_delimiter(lines[first_non_empty_idx])
        reader = csv.reader(io.StringIO(text_content), delimiter=delimiter)

        raw_rows: List[Tuple[int, List[str]]] = []
        for line_num, row_cells in enumerate(reader, start=1):
            if any(str(c).strip() for c in row_cells):
                raw_rows.append((line_num, row_cells))

        if not raw_rows:
            return [], ["The uploaded CSV file contains no header or data rows."]

        _, header_cells = raw_rows[0]
        col_map, missing_headers = self._map_headers(header_cells)
        if missing_headers:
            return [], [
                f"Missing required CSV column(s): {', '.join(missing_headers)}. "
                "Please use the provided CSV template."
            ]

        parsed_rows: List[Tuple[int, Dict[str, str]]] = []
        for line_num, row_cells in raw_rows[1:]:
            row_dict: Dict[str, str] = {col: "" for col in TEMPLATE_COLUMNS}
            has_any_value = False
            for col_idx, canonical in col_map.items():
                val = _norm_space(row_cells[col_idx]) if col_idx < len(row_cells) else ""
                if val:
                    has_any_value = True
                row_dict[canonical] = val
            if has_any_value:
                parsed_rows.append((line_num, row_dict))

        if not parsed_rows:
            return [], ["The CSV file has headers but contains 0 equipment rows."]

        return parsed_rows, []

    @staticmethod
    def _stringify_excel_cell(value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, bool):
            return "TRUE" if value else "FALSE"
        if isinstance(value, (datetime, date)):
            return value.strftime("%Y-%m-%d")
        if isinstance(value, int):
            return str(value)
        if isinstance(value, float):
            return _format_number_clean(value) or ""
        return _norm_space(value)

    def _parse_xlsx_bytes(
        self, raw_bytes: bytes
    ) -> Tuple[List[Tuple[int, Dict[str, str]]], List[str]]:
        if not HAS_OPENPYXL:
            return [], ["Server cannot read .xlsx files (openpyxl not installed). Please upload a .csv file."]

        try:
            wb = openpyxl.load_workbook(
                io.BytesIO(raw_bytes), read_only=True, data_only=True
            )
        except Exception as exc:
            logger.warning("Failed to open uploaded xlsx: %s", exc)
            return [], ["The uploaded Excel file is corrupted or unreadable."]

        try:
            ws = wb.active or wb.worksheets[0]
            header_cells: Optional[List[str]] = None
            col_map: Dict[int, str] = {}
            parsed_rows: List[Tuple[int, Dict[str, str]]] = []

            for line_num, row_values in enumerate(ws.iter_rows(values_only=True), start=1):
                str_cells = [self._stringify_excel_cell(v) for v in row_values]
                if not any(str_cells):
                    continue
                if header_cells is None:
                    header_cells = str_cells
                    col_map, missing_headers = self._map_headers(header_cells)
                    if missing_headers:
                        return [], [
                            f"Missing required Excel column(s): {', '.join(missing_headers)}. "
                            "Please use the provided template."
                        ]
                    continue

                row_dict: Dict[str, str] = {col: "" for col in TEMPLATE_COLUMNS}
                has_any_value = False
                for col_idx, canonical in col_map.items():
                    val = str_cells[col_idx] if col_idx < len(str_cells) else ""
                    if val:
                        has_any_value = True
                    row_dict[canonical] = val
                if has_any_value:
                    parsed_rows.append((line_num, row_dict))

            if header_cells is None:
                return [], ["The uploaded Excel file is empty."]
            if not parsed_rows:
                return [], ["The Excel file has headers but contains 0 equipment rows."]
            return parsed_rows, []
        finally:
            wb.close()

    # ---------------------------------------------------------
    # Core Validation Pipeline
    # ---------------------------------------------------------

    async def validate_upload(
        self,
        file: UploadFile,
        known_materials: Optional[List[str]] = None,
        configured_types: Optional[List[str]] = None,
    ) -> ImportValidationResponse:
        filename = (file.filename or "import.csv").strip()
        lower_name = filename.lower()

        if lower_name.endswith(".xlsx"):
            file_type = "xlsx"
        elif lower_name.endswith(".csv"):
            file_type = "csv"
        else:
            raise HTTPException(
                status_code=422,
                detail="Unsupported file format. Please upload a .csv or .xlsx file.",
            )

        raw_bytes = await file.read(MAX_IMPORT_FILE_BYTES + 1)
        if len(raw_bytes) > MAX_IMPORT_FILE_BYTES:
            raise HTTPException(
                status_code=413,
                detail="File exceeds the 2 MB upload limit.",
            )

        if file_type == "csv":
            parsed_rows, file_errors = self._parse_csv_bytes(raw_bytes)
        else:
            parsed_rows, file_errors = self._parse_xlsx_bytes(raw_bytes)

        if file_errors:
            return ImportValidationResponse(
                filename=filename,
                file_type=file_type,
                file_errors=file_errors,
                can_import=False,
            )

        if len(parsed_rows) > MAX_IMPORT_ROWS:
            return ImportValidationResponse(
                filename=filename,
                file_type=file_type,
                file_errors=[
                    f"File has {len(parsed_rows)} rows, exceeding the maximum of {MAX_IMPORT_ROWS} rows per inward."
                ],
                can_import=False,
            )

        return self.validate_rows(
            parsed_rows=parsed_rows,
            filename=filename,
            file_type=file_type,
            known_materials=known_materials,
            configured_types=configured_types,
        )

    def validate_rows(
        self,
        parsed_rows: List[Tuple[int, Dict[str, str]]],
        filename: str = "import.csv",
        file_type: str = "csv",
        known_materials: Optional[List[str]] = None,
        configured_types: Optional[List[str]] = None,
    ) -> ImportValidationResponse:
        materials, _ = self._build_material_catalog(
            known_materials=known_materials,
            configured_types_param=configured_types,
        )
        material_norm_map: Dict[str, str] = {_norm_key(m): m for m in materials}

        specs = self._fetch_active_manufacturer_specs()
        makes_by_norm: Dict[str, str] = {}
        makes_by_alnum: Dict[str, Set[str]] = {}
        specs_by_make: Dict[str, List[ManufacturerSpecOption]] = {}

        for spec in specs:
            makes_by_norm.setdefault(_norm_key(spec.make), spec.make)
            makes_by_alnum.setdefault(_norm_alnum(spec.make), set()).add(spec.make)
            specs_by_make.setdefault(spec.make, []).append(spec)

        all_makes = sorted(specs_by_make.keys(), key=lambda s: s.lower())
        models_by_make_str: Dict[str, List[str]] = {
            mk: [s.model for s in sp_list] for mk, sp_list in specs_by_make.items()
        }

        validated_rows: List[ValidatedImportRow] = []
        missing_materials_seen: Dict[str, str] = {}
        serial_occurrences: Dict[Tuple[str, str, str, str], List[int]] = {}
        resolved_htw_makes: Set[str] = set()

        for row_number, raw_row in parsed_rows:
            errors: List[ImportFieldIssue] = []
            warnings: List[ImportFieldIssue] = []

            raw_clean = {col: _norm_space(raw_row.get(col, "")) for col in TEMPLATE_COLUMNS}

            raw_mat = raw_clean["material_description"]
            raw_make = raw_clean["make"]
            raw_model = raw_clean["model"]
            raw_range = raw_clean["range"]
            raw_serial = raw_clean["serial_no"]
            raw_qty = raw_clean["qty"]
            raw_cal = raw_clean["calibration_by"]
            raw_supplier = raw_clean["supplier"]
            raw_in_dc = raw_clean["in_dc"]
            raw_out_dc = raw_clean["out_dc"]
            raw_accessories = raw_clean["accessories_included"]
            raw_visual = raw_clean["visual_inspection"]
            raw_remarks = raw_clean["engineer_remarks"]

            # 1. Validate Material Description against dropdown
            resolved_material = ""
            material_valid = False
            if not raw_mat:
                errors.append(
                    ImportFieldIssue(
                        field="material_description",
                        code="MATERIAL_REQUIRED",
                        message="Material Description is required.",
                    )
                )
            elif _norm_key(raw_mat) in material_norm_map:
                resolved_material = material_norm_map[_norm_key(raw_mat)]
                material_valid = True
            else:
                suggestion = _best_fuzzy_match(
                    raw_mat, materials, cutoff=FUZZY_MATERIAL_CUTOFF
                )
                if suggestion:
                    errors.append(
                        ImportFieldIssue(
                            field="material_description",
                            code="MATERIAL_TYPO",
                            message=(
                                f"'{raw_mat}' is not in the Material Description dropdown. "
                                f"Did you mean '{suggestion}'?"
                            ),
                            suggestion=suggestion,
                            can_add_material=True,
                        )
                    )
                else:
                    errors.append(
                        ImportFieldIssue(
                            field="material_description",
                            code="MATERIAL_NOT_FOUND",
                            message=(
                                f"'{raw_mat}' is not in the Material Description dropdown. "
                                "Add it to the dropdown manually before importing."
                            ),
                            can_add_material=True,
                        )
                    )
                missing_materials_seen.setdefault(_norm_key(raw_mat), raw_mat)
                resolved_material = raw_mat

            is_spec_driven = material_valid and (resolved_material in SPEC_DRIVEN_MATERIALS)

            # 2. Validate Make, Model & Range
            resolved_make = raw_make
            resolved_model = raw_model
            resolved_range = raw_range

            if is_spec_driven:
                # 2a. Spec-driven Make
                make_valid = False
                if not raw_make:
                    errors.append(
                        ImportFieldIssue(
                            field="make",
                            code="MAKE_REQUIRED",
                            message="Make is required for Hydraulic Torque Wrench.",
                            valid_options=all_makes,
                        )
                    )
                elif _norm_key(raw_make) in makes_by_norm:
                    resolved_make = makes_by_norm[_norm_key(raw_make)]
                    make_valid = True
                else:
                    alnum_matches = makes_by_alnum.get(_norm_alnum(raw_make), set())
                    if len(alnum_matches) == 1:
                        resolved_make = next(iter(alnum_matches))
                        make_valid = True
                    else:
                        make_suggestion = _best_fuzzy_match(
                            raw_make, all_makes, cutoff=FUZZY_SPEC_CUTOFF
                        )
                        msg = f"Make '{raw_make}' was not found in active Manufacturer Specs."
                        if make_suggestion:
                            msg += f" Did you mean '{make_suggestion}'?"
                        errors.append(
                            ImportFieldIssue(
                                field="make",
                                code="MAKE_NOT_FOUND",
                                message=msg,
                                suggestion=make_suggestion,
                                valid_options=all_makes,
                            )
                        )

                # 2b. Spec-driven Model (dependent on Make)
                matched_spec: Optional[ManufacturerSpecOption] = None
                if make_valid:
                    resolved_htw_makes.add(resolved_make)
                    make_specs = specs_by_make.get(resolved_make, [])
                    make_models = [s.model for s in make_specs]

                    if not raw_model:
                        errors.append(
                            ImportFieldIssue(
                                field="model",
                                code="MODEL_REQUIRED",
                                message=f"Model is required for Make '{resolved_make}'.",
                                valid_options=make_models,
                            )
                        )
                    else:
                        model_by_norm = {_norm_key(s.model): s for s in make_specs}
                        if _norm_key(raw_model) in model_by_norm:
                            matched_spec = model_by_norm[_norm_key(raw_model)]
                        else:
                            # Support suffix match e.g. "RT-10" matching "ATLAS_COPCO / RT-10"
                            suffix_matches: List[ManufacturerSpecOption] = []
                            raw_model_alnum = _norm_alnum(raw_model)
                            for s in make_specs:
                                tail = s.model.split("/")[-1].strip() if "/" in s.model else s.model
                                if (
                                    _norm_key(tail) == _norm_key(raw_model)
                                    or (raw_model_alnum and _norm_alnum(tail) == raw_model_alnum)
                                    or (raw_model_alnum and _norm_alnum(s.model) == raw_model_alnum)
                                ):
                                    suffix_matches.append(s)
                            if len(suffix_matches) == 1:
                                matched_spec = suffix_matches[0]
                                warnings.append(
                                    ImportFieldIssue(
                                        field="model",
                                        code="MODEL_NORMALIZED",
                                        message=f"Matched model '{raw_model}' to spec '{matched_spec.model}'.",
                                    )
                                )

                        if matched_spec is not None:
                            resolved_model = matched_spec.model
                        else:
                            model_suggestion = _best_fuzzy_match(
                                raw_model, make_models, cutoff=FUZZY_SPEC_CUTOFF
                            )
                            msg = (
                                f"Model '{raw_model}' is not registered for Make '{resolved_make}'."
                            )
                            if model_suggestion:
                                msg += f" Did you mean '{model_suggestion}'?"
                            errors.append(
                                ImportFieldIssue(
                                    field="model",
                                    code="MODEL_NOT_FOUND",
                                    message=msg,
                                    suggestion=model_suggestion,
                                    valid_options=make_models,
                                )
                            )
                else:
                    if not raw_model:
                        errors.append(
                            ImportFieldIssue(
                                field="model",
                                code="MODEL_REQUIRED",
                                message="Model is required.",
                            )
                        )

                # 2c. Spec-driven Range auto-population
                if matched_spec is not None:
                    if matched_spec.range_text:
                        resolved_range = matched_spec.range_text
                        if raw_range:
                            # Compare ignoring spacing around '-'
                            raw_cmp = re.sub(r"\s*-\s*", "-", raw_range)
                            spec_cmp = re.sub(r"\s*-\s*", "-", matched_spec.range_text)
                            if _norm_key(raw_cmp) != _norm_key(spec_cmp):
                                warnings.append(
                                    ImportFieldIssue(
                                        field="range",
                                        code="RANGE_OVERRIDDEN",
                                        message=(
                                            f"Range '{raw_range}' overridden with system spec "
                                            f"'{matched_spec.range_text}'."
                                        ),
                                    )
                                )
                    else:
                        resolved_range = ""
                        warnings.append(
                            ImportFieldIssue(
                                field="range",
                                code="SPEC_RANGE_MISSING",
                                message=(
                                    f"Spec '{resolved_make} / {resolved_model}' has no "
                                    "range_min/range_max configured in DB."
                                ),
                            )
                        )
            else:
                # Free-text Make / Model / Range (for non-HTW materials)
                if not raw_make:
                    errors.append(
                        ImportFieldIssue(
                            field="make",
                            code="MAKE_REQUIRED",
                            message="Make is required.",
                        )
                    )
                if not raw_model:
                    errors.append(
                        ImportFieldIssue(
                            field="model",
                            code="MODEL_REQUIRED",
                            message="Model is required.",
                        )
                    )
                if raw_range and any(p.match(raw_range) for p in EXCEL_DATE_PATTERNS):
                    warnings.append(
                        ImportFieldIssue(
                            field="range",
                            code="EXCEL_DATE_RANGE_WARNING",
                            message=(
                                f"Range '{raw_range}' looks like an Excel auto-converted date "
                                "(e.g. '1-10' became '10-Jan'). Verify before importing."
                            ),
                        )
                    )

            # 3. Serial No checks
            if raw_serial and SCIENTIFIC_NOTATION_PATTERN.match(raw_serial):
                warnings.append(
                    ImportFieldIssue(
                        field="serial_no",
                        code="EXCEL_SCIENTIFIC_SERIAL",
                        message=(
                            f"Serial No '{raw_serial}' looks like scientific notation from Excel. "
                            "Format the column as Text to preserve digits."
                        ),
                    )
                )

            # 4. Quantity validation
            resolved_qty = 1
            if not raw_qty:
                warnings.append(
                    ImportFieldIssue(
                        field="qty",
                        code="QTY_DEFAULTED",
                        message="Qty was blank and defaulted to 1.",
                    )
                )
            else:
                try:
                    qty_float = float(raw_qty)
                    if not qty_float.is_integer() or int(qty_float) < 1:
                        raise ValueError("Qty must be >= 1 integer")
                    resolved_qty = int(qty_float)
                except ValueError:
                    errors.append(
                        ImportFieldIssue(
                            field="qty",
                            code="INVALID_QTY",
                            message=f"Qty '{raw_qty}' must be a whole number >= 1.",
                        )
                    )

            # 5. Calibration By validation
            resolved_cal = "In House(Torque Lab)"
            if not raw_cal:
                warnings.append(
                    ImportFieldIssue(
                        field="calibration_by",
                        code="CALIBRATION_DEFAULTED",
                        message="Calibration was blank and defaulted to 'In House(Torque Lab)'.",
                    )
                )
            else:
                cal_key = _norm_key(raw_cal)
                if cal_key in CALIBRATION_SYNONYMS:
                    resolved_cal = CALIBRATION_SYNONYMS[cal_key]  # type: ignore[assignment]
                else:
                    cal_suggestion = _best_fuzzy_match(raw_cal, CALIBRATION_OPTIONS, cutoff=0.65)
                    msg = f"Calibration '{raw_cal}' must be one of: {', '.join(CALIBRATION_OPTIONS)}."
                    errors.append(
                        ImportFieldIssue(
                            field="calibration_by",
                            code="INVALID_CALIBRATION",
                            message=msg,
                            suggestion=cal_suggestion,
                            valid_options=CALIBRATION_OPTIONS,
                        )
                    )

            # 6. Outsource conditional fields
            resolved_supplier: Optional[str] = None
            resolved_in_dc: Optional[str] = None
            resolved_out_dc: Optional[str] = None
            if resolved_cal == "Outsource":
                resolved_supplier = raw_supplier
                resolved_in_dc = raw_in_dc
                resolved_out_dc = raw_out_dc
            elif raw_supplier or raw_in_dc or raw_out_dc:
                warnings.append(
                    ImportFieldIssue(
                        field="supplier",
                        code="OUTSOURCE_FIELDS_IGNORED",
                        message=(
                            "Supplier / In DC / Out DC are ignored because Calibration "
                            f"is '{resolved_cal}' (only used for 'Outsource')."
                        ),
                    )
                )

            # 7. Visual Inspection & Engineer Remarks
            resolved_visual = "OK"
            if raw_visual:
                vis_key = _norm_key(raw_visual)
                if vis_key in VISUAL_SYNONYMS:
                    resolved_visual = VISUAL_SYNONYMS[vis_key]  # type: ignore[assignment]
                else:
                    errors.append(
                        ImportFieldIssue(
                            field="visual_inspection",
                            code="INVALID_VISUAL_INSPECTION",
                            message="Visual Inspection must be 'OK' or 'Not OK'.",
                            valid_options=VISUAL_INSPECTION_OPTIONS,
                        )
                    )

            resolved_remarks = raw_remarks
            if resolved_visual == "OK" and raw_remarks:
                warnings.append(
                    ImportFieldIssue(
                        field="engineer_remarks",
                        code="REMARKS_ON_OK_ROW",
                        message=(
                            "Eng. Remarks are only shown when Visual Inspection is 'Not OK'. "
                            "Switch to 'Not OK' or remarks will be hidden on the form."
                        ),
                    )
                )

            # Track serial number duplicates across batch
            if raw_serial and _norm_key(raw_serial) not in PLACEHOLDER_SERIALS:
                dup_key = (
                    _norm_key(resolved_material),
                    _norm_key(resolved_make),
                    _norm_key(resolved_model),
                    _norm_key(raw_serial),
                )
                serial_occurrences.setdefault(dup_key, []).append(row_number)

            row_status = "error" if errors else ("warning" if warnings else "valid")

            payload = ValidatedEquipmentPayload(
                material_desc=resolved_material,
                make=resolved_make,
                model=resolved_model,
                range=resolved_range,
                serial_no=raw_serial,
                qty=resolved_qty,
                calibration_by=resolved_cal,  # type: ignore[arg-type]
                supplier=resolved_supplier,
                in_dc=resolved_in_dc,
                out_dc=resolved_out_dc,
                accessories_included=raw_accessories,
                inspe_status=resolved_visual,  # type: ignore[arg-type]
                engineer_remarks=resolved_remarks if resolved_visual == "Not OK" else "",
            )

            validated_rows.append(
                ValidatedImportRow(
                    row_number=row_number,
                    status=row_status,  # type: ignore[arg-type]
                    is_spec_driven=is_spec_driven,
                    raw=raw_clean,
                    data=payload,
                    errors=errors,
                    warnings=warnings,
                )
            )

        # Second pass: attach duplicate serial warnings
        for dup_key, row_nums in serial_occurrences.items():
            if len(row_nums) > 1:
                serial_label = dup_key[3]
                for row_obj in validated_rows:
                    if row_obj.row_number in row_nums:
                        others = [str(n) for n in row_nums if n != row_obj.row_number]
                        row_obj.warnings.append(
                            ImportFieldIssue(
                                field="serial_no",
                                code="DUPLICATE_SERIAL_NO",
                                message=(
                                    f"Duplicate Serial No '{row_obj.data.serial_no or serial_label}' "
                                    f"also appears in row(s): {', '.join(others)}."
                                ),
                            )
                        )
                        if row_obj.status == "valid":
                            row_obj.status = "warning"

        error_count = sum(1 for r in validated_rows if r.status == "error")
        warning_count = sum(1 for r in validated_rows if r.status == "warning")
        valid_count = sum(1 for r in validated_rows if r.status == "valid")

        return ImportValidationResponse(
            filename=filename,
            file_type=file_type,  # type: ignore[arg-type]
            total_rows=len(validated_rows),
            valid_count=valid_count,
            warning_count=warning_count,
            error_count=error_count,
            can_import=len(validated_rows) > 0 and error_count == 0,
            file_errors=[],
            missing_materials=sorted(missing_materials_seen.values(), key=lambda s: s.lower()),
            resolved_makes=sorted(resolved_htw_makes, key=lambda s: s.lower()),
            models_by_make=models_by_make_str,
            rows=validated_rows,
        )

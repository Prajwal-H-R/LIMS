// frontend/src/components/InwardImport/types.tsx

export type CalibrationByOption = 'In House(Torque Lab)' | 'Outsource' | 'On-Site';
export type VisualInspectionOption = 'OK' | 'Not OK';

export interface ManufacturerSpecOption {
  make: string;
  model: string;
  range_min: number | null;
  range_max: number | null;
  unit: string | null;
  range_text: string;
}

export interface ImportMetadataResponse {
  material_descriptions: string[];
  configured_types: string[];
  spec_driven_materials: string[];
  calibration_options: string[];
  visual_inspection_options: string[];
  makes: string[];
  models_by_make: Record<string, ManufacturerSpecOption[]>;
}

export interface ImportFieldIssue {
  field: string;
  code: string;
  message: string;
  suggestion?: string | null;
  valid_options: string[];
  can_add_material: boolean;
}

export interface ValidatedEquipmentPayload {
  material_desc: string;
  make: string;
  model: string;
  range: string;
  serial_no: string;
  qty: number;
  calibration_by: CalibrationByOption;
  supplier?: string | null;
  in_dc?: string | null;
  out_dc?: string | null;
  accessories_included: string;
  inspe_status: VisualInspectionOption;
  engineer_remarks: string;
}

export interface ValidatedImportRow {
  row_number: number;
  status: 'valid' | 'warning' | 'error';
  is_spec_driven: boolean;
  raw: Record<string, string>;
  data: ValidatedEquipmentPayload;
  errors: ImportFieldIssue[];
  warnings: ImportFieldIssue[];
}

export interface ImportValidationResponse {
  filename: string;
  file_type: 'csv' | 'xlsx';
  total_rows: number;
  valid_count: number;
  warning_count: number;
  error_count: number;
  can_import: boolean;
  file_errors: string[];
  missing_materials: string[];
  resolved_makes: string[];
  models_by_make: Record<string, string[]>;
  rows: ValidatedImportRow[];
}

export type ImportedEquipmentRow = ValidatedEquipmentPayload;

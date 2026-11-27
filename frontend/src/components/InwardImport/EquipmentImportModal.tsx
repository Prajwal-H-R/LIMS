// frontend/src/components/InwardImport/EquipmentImportModal.tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import { api, ENDPOINTS } from '../../api/config';
import { CsvBuildGuide } from './CsvBuildGuide';
import { ImportPreviewTable } from './ImportPreviewTable';
import {
  ImportedEquipmentRow,
  ImportMetadataResponse,
  ImportValidationResponse,
  ValidatedImportRow,
} from './types';

interface EquipmentImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  materialOptions: string[];
  configuredTypes: string[];
  hasExistingEquipment: boolean;
  onAddMaterialOption: (newMaterial: string) => void;
  onImport: (
    rows: ImportedEquipmentRow[],
    mode: 'replace' | 'append'
  ) => Promise<void> | void;
}

const INWARD_IMPORT_BASE = ENDPOINTS?.STAFF?.INWARDS
  ? ENDPOINTS.STAFF.INWARDS.replace(/\/inwards\/?$/, '/inward-import')
  : '/staff/inward-import';

export const EquipmentImportModal: React.FC<EquipmentImportModalProps> = ({
  isOpen,
  onClose,
  materialOptions,
  configuredTypes,
  hasExistingEquipment,
  onAddMaterialOption,
  onImport,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rawMetadata, setRawMetadata] = useState<ImportMetadataResponse | null>(null);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState<'csv' | 'xlsx' | null>(null);
  const [guideExpanded, setGuideExpanded] = useState(true);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [validation, setValidation] = useState<ImportValidationResponse | null>(null);
  const [importMode, setImportMode] = useState<'replace' | 'append'>(
    hasExistingEquipment ? 'append' : 'replace'
  );

  // Merge backend metadata with live session materialOptions & configuredTypes
  const mergedMetadata: ImportMetadataResponse | null = useMemo(() => {
    if (!rawMetadata) return null;
    const matMap = new Map<string, string>();
    [...rawMetadata.material_descriptions, ...materialOptions].forEach((m) => {
      const cleaned = m.trim();
      if (cleaned && !matMap.has(cleaned.toLowerCase())) {
        matMap.set(cleaned.toLowerCase(), cleaned);
      }
    });
    const cfgMap = new Map<string, string>();
    [...rawMetadata.configured_types, ...configuredTypes].forEach((c) => {
      const cleaned = c.trim();
      if (cleaned && !cfgMap.has(cleaned.toLowerCase())) {
        cfgMap.set(cleaned.toLowerCase(), cleaned);
      }
    });

    return {
      ...rawMetadata,
      material_descriptions: Array.from(matMap.values()).sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
      ),
      configured_types: Array.from(cfgMap.values()).sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
      ),
    };
  }, [rawMetadata, materialOptions, configuredTypes]);

  const fetchMetadata = useCallback(async () => {
    setLoadingMetadata(true);
    try {
      const res = await api.get<ImportMetadataResponse>(
        `${INWARD_IMPORT_BASE}/metadata`
      );
      setRawMetadata(res.data);
    } catch (err: any) {
      setApiError(
        err?.response?.data?.detail ||
          'Failed to load import reference data from server.'
      );
    } finally {
      setLoadingMetadata(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setApiError(null);
    setGuideExpanded(true);
    setImportMode(hasExistingEquipment ? 'append' : 'replace');
    void fetchMetadata();
  }, [isOpen, hasExistingEquipment, fetchMetadata]);

  const resetFileState = () => {
    setSelectedFile(null);
    setValidation(null);
    setApiError(null);
    setGuideExpanded(true);
  };

  const handleClose = () => {
    if (importing) return;
    resetFileState();
    onClose();
  };

  const handleDownloadTemplate = async (format: 'csv' | 'xlsx') => {
    setDownloadingTemplate(format);
    setApiError(null);
    try {
      const params = new URLSearchParams({ format });
      if (materialOptions.length <= 100) {
        materialOptions.forEach((m) => params.append('known_materials', m));
      }
      if (configuredTypes.length <= 50) {
        configuredTypes.forEach((c) => params.append('configured_types', c));
      }

      const res = await api.get(`${INWARD_IMPORT_BASE}/template`, {
        params,
        responseType: 'blob',
      });

      const blob = new Blob([res.data], {
        type:
          format === 'xlsx'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'text/csv;charset=utf-8;',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `inward_equipment_template.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setApiError(
        err?.response?.data?.detail ||
          `Failed to download ${format.toUpperCase()} template.`
      );
    } finally {
      setDownloadingTemplate(null);
    }
  };

  const validateFile = async (file: File, materialsOverride?: string[]) => {
    setSelectedFile(file);
    setValidating(true);
    setApiError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append(
        'known_materials',
        JSON.stringify(materialsOverride ?? materialOptions)
      );
      formData.append('configured_types', JSON.stringify(configuredTypes));

      const res = await api.post<ImportValidationResponse>(
        `${INWARD_IMPORT_BASE}/validate`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setValidation(res.data);
      if (res.data.rows.length > 0) {
        setGuideExpanded(false);
      }
    } catch (err: any) {
      setValidation(null);
      setApiError(
        err?.response?.data?.detail ||
          'Failed to parse or validate the uploaded file.'
      );
    } finally {
      setValidating(false);
    }
  };

  const revalidateRows = async (
    rowsToValidate: ValidatedImportRow[],
    materialsOverride?: string[]
  ) => {
    if (!validation) return;
    setValidating(true);
    setApiError(null);
    try {
      const res = await api.post<ImportValidationResponse>(
        `${INWARD_IMPORT_BASE}/revalidate`,
        {
          filename: validation.filename,
          file_type: validation.file_type,
          known_materials: materialsOverride ?? materialOptions,
          configured_types: configuredTypes,
          rows: rowsToValidate.map((r) => ({
            ...r.raw,
            row_number: r.row_number,
          })),
        }
      );
      setValidation(res.data);
    } catch (err: any) {
      setApiError(
        err?.response?.data?.detail || 'Failed to re-validate staged rows.'
      );
    } finally {
      setValidating(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      void validateFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void validateFile(file);
    }
  };

  const handlePatchRow = (rowNumber: number, patch: Record<string, string>) => {
    if (!validation) return;
    const updatedRows = validation.rows.map((r) =>
      r.row_number === rowNumber ? { ...r, raw: { ...r.raw, ...patch } } : r
    );
    void revalidateRows(updatedRows);
  };

  const handleRemoveRow = (rowNumber: number) => {
    if (!validation) return;
    const remaining = validation.rows.filter((r) => r.row_number !== rowNumber);
    if (remaining.length === 0) {
      resetFileState();
      return;
    }
    void revalidateRows(remaining);
  };

  const handleAddMissingMaterial = (newMaterial: string) => {
    const cleaned = newMaterial.trim();
    if (!cleaned) return;
    onAddMaterialOption(cleaned);

    const nextMaterials = Array.from(
      new Set([...materialOptions, cleaned])
    ).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    if (validation && validation.rows.length > 0) {
      void revalidateRows(validation.rows, nextMaterials);
    }
  };

  const handleConfirmImport = async () => {
    if (!validation || !validation.can_import || importing) return;
    setImporting(true);
    setApiError(null);
    try {
      const effectiveMode = hasExistingEquipment ? importMode : 'replace';
      await onImport(
        validation.rows.map((r) => r.data),
        effectiveMode
      );
      resetFileState();
      onClose();
    } catch (err: any) {
      setApiError(err?.message || 'Failed to populate equipment table.');
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  const rowCount = validation?.total_rows ?? 0;

  return createPortal(
    <div className="fixed inset-0 z-[99992] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* HEADER */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-4 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-xl text-white shadow-sm">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Import Equipment from CSV / Excel
              </h2>
              <p className="text-xs text-gray-500">
                All rows are validated before import. Attach photos manually afterward.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={importing}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200/70 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* TEMPLATE & FILE UPLOAD BAR */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`rounded-xl border-2 border-dashed p-3.5 transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-50/70'
                : 'border-gray-200 bg-gray-50/70'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={downloadingTemplate !== null}
                  onClick={() => void handleDownloadTemplate('csv')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-xs sm:text-sm font-medium shadow-sm disabled:opacity-50 transition-colors"
                >
                  {downloadingTemplate === 'csv' ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  <span>CSV Template</span>
                </button>

                <button
                  type="button"
                  disabled={downloadingTemplate !== null}
                  onClick={() => void handleDownloadTemplate('xlsx')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-xs sm:text-sm font-medium shadow-sm disabled:opacity-50 transition-colors"
                >
                  {downloadingTemplate === 'xlsx' ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <FileSpreadsheet size={14} className="text-blue-600" />
                  )}
                  <span>Excel (.xlsx) Template</span>
                </button>

                <button
                  type="button"
                  disabled={validating || importing}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-sm disabled:opacity-50 transition-colors"
                >
                  {validating ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Upload size={14} />
                  )}
                  <span>{selectedFile ? 'Change File' : 'Pick CSV / Excel File'}</span>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-500">
                {selectedFile ? (
                  <div className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-lg border border-gray-200">
                    <span className="font-semibold text-gray-700 truncate max-w-[200px]">
                      {selectedFile.name}
                    </span>
                    <button
                      type="button"
                      disabled={validating}
                      onClick={() => void validateFile(selectedFile)}
                      title="Re-validate file"
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <RefreshCw size={13} className={validating ? 'animate-spin' : ''} />
                    </button>
                  </div>
                ) : (
                  <span>Drop .csv or .xlsx here (max 2 MB, 500 rows)</span>
                )}
              </div>
            </div>

            {hasExistingEquipment && (
              <div className="mt-2.5 pt-2.5 border-t border-gray-200 flex flex-wrap items-center gap-4 text-xs text-gray-700">
                <span className="font-semibold">Import mode:</span>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="inwardImportMode"
                    checked={importMode === 'append'}
                    onChange={() => setImportMode('append')}
                  />
                  <span>Append to existing rows</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="inwardImportMode"
                    checked={importMode === 'replace'}
                    onChange={() => setImportMode('replace')}
                  />
                  <span>Replace existing rows</span>
                </label>
              </div>
            )}
          </div>

          {/* COLLAPSIBLE GUIDE + COPYABLE SYSTEM VALUES */}
          <CsvBuildGuide
            metadata={mergedMetadata}
            loading={loadingMetadata}
            isExpanded={guideExpanded}
            onToggleExpand={() => setGuideExpanded((prev) => !prev)}
          />

          {/* API / PARSE ERRORS */}
          {apiError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs sm:text-sm text-red-800">
              <AlertCircle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
              <div>{apiError}</div>
            </div>
          )}

          {validation?.file_errors && validation.file_errors.length > 0 && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 space-y-1 text-xs sm:text-sm text-red-800">
              <div className="font-bold flex items-center gap-2">
                <AlertCircle size={16} className="text-red-600" />
                <span>Could not process uploaded file</span>
              </div>
              <ul className="list-disc pl-6 text-xs space-y-0.5">
                {validation.file_errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* VALIDATED PREVIEW TABLE */}
          {validation && validation.rows.length > 0 && (
            <ImportPreviewTable
              validation={validation}
              metadata={mergedMetadata}
              busy={validating || importing}
              onPatchRow={handlePatchRow}
              onRemoveRow={handleRemoveRow}
              onAddMissingMaterial={handleAddMissingMaterial}
            />
          )}
        </div>

        {/* FOOTER */}
        <div className="px-6 py-3.5 border-t border-gray-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-gray-500">
            {validation && rowCount > 0 ? (
              validation.can_import ? (
                <span className="text-green-700 font-semibold">
                  All {rowCount} row(s) validated and ready to populate Equipment Details.
                </span>
              ) : (
                <span className="text-red-700 font-semibold">
                  Resolve {validation.error_count} error row(s) above before importing.
                </span>
              )
            ) : (
              <span>Upload a CSV or Excel file to validate and preview rows.</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleClose}
              disabled={importing}
              className="px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmImport()}
              disabled={!validation?.can_import || validating || importing}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:text-gray-500 text-white text-sm font-bold shadow-sm transition-colors"
            >
              {importing && <Loader2 size={15} className="animate-spin" />}
              <span>
                Import {rowCount} {rowCount === 1 ? 'item' : 'items'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

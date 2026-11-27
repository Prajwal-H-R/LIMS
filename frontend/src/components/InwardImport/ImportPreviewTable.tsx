// frontend/src/components/InwardImport/ImportPreviewTable.tsx

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  PackagePlus,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react';
import {
  ImportMetadataResponse,
  ImportValidationResponse,
  ValidatedImportRow,
} from './types';

interface ImportPreviewTableProps {
  validation: ImportValidationResponse;
  metadata: ImportMetadataResponse | null;
  busy: boolean;
  onPatchRow: (rowNumber: number, patch: Record<string, string>) => void;
  onRemoveRow: (rowNumber: number) => void;
  onAddMissingMaterial: (materialName: string) => void;
}

type StatusFilter = 'all' | 'error' | 'warning' | 'valid';

export const ImportPreviewTable: React.FC<ImportPreviewTableProps> = ({
  validation,
  metadata,
  busy,
  onPatchRow,
  onRemoveRow,
  onAddMissingMaterial,
}) => {
  const [filter, setFilter] = useState<StatusFilter>('all');

  const filteredRows = useMemo(() => {
    if (filter === 'all') return validation.rows;
    return validation.rows.filter((r) => r.status === filter);
  }, [validation.rows, filter]);

  const missingSummary = useMemo(() => {
    const typoSuggestions = new Map<string, string>();
    const purelyNew = new Set<string>();

    for (const row of validation.rows) {
      for (const err of row.errors) {
        if (err.field !== 'material_description') continue;
        const rawMat = (row.raw.material_description || '').trim();
        if (!rawMat) continue;
        if (err.code === 'MATERIAL_TYPO' && err.suggestion) {
          typoSuggestions.set(rawMat, err.suggestion);
        } else if (err.code === 'MATERIAL_NOT_FOUND') {
          purelyNew.add(rawMat);
        }
      }
    }

    return {
      typos: Array.from(typoSuggestions.entries()),
      newItems: Array.from(purelyNew),
    };
  }, [validation.rows]);

  const renderStatusBadge = (row: ValidatedImportRow) => {
    if (row.status === 'error') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700">
          <AlertCircle size={12} /> Error
        </span>
      );
    }
    if (row.status === 'warning') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
          <AlertTriangle size={12} /> Warning
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-100 text-green-700">
        <CheckCircle2 size={12} /> Ready
      </span>
    );
  };

  return (
    <div className="space-y-3">
      {/* SUMMARY & FILTER BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">
            Total: {validation.total_rows}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-green-50 text-green-700 border border-green-200">
            Valid: {validation.valid_count}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
            Warnings: {validation.warning_count}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200">
            Errors: {validation.error_count}
          </span>
        </div>

        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg text-xs font-medium">
          {(
            [
              { key: 'all', label: `All (${validation.total_rows})` },
              { key: 'error', label: `Errors (${validation.error_count})` },
              { key: 'warning', label: `Warnings (${validation.warning_count})` },
              { key: 'valid', label: `Ready (${validation.valid_count})` },
            ] as { key: StatusFilter; label: string }[]
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                filter === tab.key
                  ? 'bg-white text-gray-900 shadow-sm font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* MISSING MATERIALS / DROPDOWN RECOVERY BANNER */}
      {validation.missing_materials.length > 0 && (
        <div className="border border-amber-300 bg-amber-50 rounded-xl p-3.5 space-y-2">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-amber-900 space-y-1">
              <p className="font-bold text-sm">
                Material Description(s) missing from dropdown
              </p>
              <p>
                Import is all-or-nothing. Spelling mistakes should be fixed to an existing
                dropdown item; genuinely new equipment must be added manually to the dropdown
                before importing.
              </p>
            </div>
          </div>

          {missingSummary.newItems.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pl-7">
              <span className="text-xs font-semibold text-amber-900">
                Add new item to dropdown:
              </span>
              {missingSummary.newItems.map((mat) => (
                <button
                  key={mat}
                  type="button"
                  disabled={busy}
                  onClick={() => onAddMissingMaterial(mat)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold shadow-sm transition-colors"
                >
                  <PackagePlus size={13} />
                  <span>Add “{mat}”</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PREVIEW TABLE */}
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
        <div className="max-h-[340px] overflow-auto">
          <table className="w-full text-xs border-collapse min-w-[1050px]">
            <thead className="bg-slate-100 sticky top-0 z-10 text-gray-600 uppercase text-[11px]">
              <tr>
                <th className="p-2.5 border-b text-center w-14">Line</th>
                <th className="p-2.5 border-b text-left w-24">Status</th>
                <th className="p-2.5 border-b text-left min-w-[210px]">
                  Material Description
                </th>
                <th className="p-2.5 border-b text-left min-w-[150px]">Make</th>
                <th className="p-2.5 border-b text-left min-w-[170px]">Model</th>
                <th className="p-2.5 border-b text-left min-w-[140px]">Range</th>
                <th className="p-2.5 border-b text-left min-w-[110px]">Serial No</th>
                <th className="p-2.5 border-b text-center w-14">Qty</th>
                <th className="p-2.5 border-b text-left min-w-[150px]">Calibration</th>
                <th className="p-2.5 border-b text-left w-24">Visual</th>
                <th className="p-2.5 border-b text-left min-w-[260px]">
                  Issues & Quick Fixes
                </th>
                <th className="p-2.5 border-b text-center w-12">Skip</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRows.map((row) => {
                const matErr = row.errors.find((e) => e.field === 'material_description');
                const makeErr = row.errors.find((e) => e.field === 'make');
                const modelErr = row.errors.find((e) => e.field === 'model');
                const calErr = row.errors.find((e) => e.field === 'calibration_by');
                const remarksWarn = row.warnings.find((w) => w.code === 'REMARKS_ON_OK_ROW');

                const modelsForRowMake =
                  (metadata?.models_by_make?.[row.data.make] || []).map(
                    (item) => item.model
                  );

                return (
                  <tr
                    key={row.row_number}
                    className={
                      row.status === 'error'
                        ? 'bg-red-50/60'
                        : row.status === 'warning'
                        ? 'bg-amber-50/40'
                        : 'hover:bg-slate-50'
                    }
                  >
                    <td className="p-2.5 text-center font-mono text-gray-500 font-semibold">
                      {row.row_number}
                    </td>

                    <td className="p-2.5">{renderStatusBadge(row)}</td>

                    {/* MATERIAL DESCRIPTION */}
                    <td className="p-2.5">
                      {matErr ? (
                        <div className="space-y-1.5">
                          <div className="font-semibold text-red-700">
                            {row.raw.material_description || (
                              <span className="italic">(blank)</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {matErr.suggestion && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  onPatchRow(row.row_number, {
                                    material_description: matErr.suggestion!,
                                  })
                                }
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-600 hover:bg-green-700 text-white text-[11px] font-semibold"
                              >
                                <Sparkles size={11} /> Fix to “{matErr.suggestion}”
                              </button>
                            )}
                            {matErr.can_add_material &&
                              row.raw.material_description?.trim() && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    onAddMissingMaterial(
                                      row.raw.material_description.trim()
                                    )
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold"
                                >
                                  <PackagePlus size={11} /> Add to Dropdown
                                </button>
                              )}
                          </div>
                          {metadata?.material_descriptions?.length ? (
                            <select
                              disabled={busy}
                              value=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  onPatchRow(row.row_number, {
                                    material_description: e.target.value,
                                  });
                                }
                              }}
                              className="w-full px-2 py-1 border border-red-300 rounded bg-white text-[11px]"
                            >
                              <option value="">Or pick existing material...</option>
                              {metadata.material_descriptions.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 font-semibold text-gray-900">
                          <span>{row.data.material_desc}</span>
                          {row.is_spec_driven && (
                            <span
                              title="Spec-driven Make, Model & Auto-Range"
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px]"
                            >
                              <Star size={10} className="fill-amber-500 text-amber-500" />
                              Spec
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* MAKE */}
                    <td className="p-2.5">
                      {makeErr ? (
                        <div className="space-y-1">
                          <div className="font-medium text-red-700">
                            {row.raw.make || <span className="italic">(blank)</span>}
                          </div>
                          {makeErr.suggestion && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                onPatchRow(row.row_number, { make: makeErr.suggestion! })
                              }
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-600 hover:bg-green-700 text-white text-[11px] font-semibold"
                            >
                              <Sparkles size={11} /> Fix to “{makeErr.suggestion}”
                            </button>
                          )}
                          {row.is_spec_driven && (metadata?.makes?.length || 0) > 0 && (
                            <select
                              disabled={busy}
                              value=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  onPatchRow(row.row_number, { make: e.target.value });
                                }
                              }}
                              className="w-full px-2 py-1 border border-red-300 rounded bg-white text-[11px]"
                            >
                              <option value="">Select valid Make...</option>
                              {metadata!.makes.map((mk) => (
                                <option key={mk} value={mk}>
                                  {mk}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-800">{row.data.make}</span>
                      )}
                    </td>

                    {/* MODEL */}
                    <td className="p-2.5">
                      {modelErr ? (
                        <div className="space-y-1">
                          <div className="font-medium text-red-700">
                            {row.raw.model || <span className="italic">(blank)</span>}
                          </div>
                          {modelErr.suggestion && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                onPatchRow(row.row_number, { model: modelErr.suggestion! })
                              }
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-600 hover:bg-green-700 text-white text-[11px] font-semibold"
                            >
                              <Sparkles size={11} /> Fix to “{modelErr.suggestion}”
                            </button>
                          )}
                          {row.is_spec_driven && modelsForRowMake.length > 0 && (
                            <select
                              disabled={busy}
                              value=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  onPatchRow(row.row_number, { model: e.target.value });
                                }
                              }}
                              className="w-full px-2 py-1 border border-red-300 rounded bg-white text-[11px]"
                            >
                              <option value="">Select valid Model...</option>
                              {modelsForRowMake.map((mdl) => (
                                <option key={mdl} value={mdl}>
                                  {mdl}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-800">{row.data.model}</span>
                      )}
                    </td>

                    {/* RANGE */}
                    <td className="p-2.5">
                      {row.is_spec_driven && row.data.range ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-800 font-medium">
                          {row.data.range}
                          <span className="text-[10px] text-blue-600">(Auto)</span>
                        </span>
                      ) : (
                        <span className="text-gray-700">{row.data.range || '—'}</span>
                      )}
                    </td>

                    {/* SERIAL NO */}
                    <td className="p-2.5 font-mono text-gray-700">
                      {row.data.serial_no || '—'}
                    </td>

                    {/* QTY */}
                    <td className="p-2.5 text-center font-semibold">
                      {row.data.qty}
                    </td>

                    {/* CALIBRATION */}
                    <td className="p-2.5">
                      {calErr ? (
                        <select
                          disabled={busy}
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              onPatchRow(row.row_number, {
                                calibration_by: e.target.value,
                              });
                            }
                          }}
                          className="w-full px-2 py-1 border border-red-300 rounded bg-white text-[11px]"
                        >
                          <option value="">Pick Calibration...</option>
                          {(metadata?.calibration_options || []).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div>
                          <span className="text-gray-800">{row.data.calibration_by}</span>
                          {row.data.calibration_by === 'Outsource' &&
                            row.data.supplier && (
                              <div className="text-[10px] text-gray-500">
                                Supplier: {row.data.supplier}
                              </div>
                            )}
                        </div>
                      )}
                    </td>

                    {/* VISUAL */}
                    <td className="p-2.5">
                      <span
                        className={`px-2 py-0.5 rounded font-medium ${
                          row.data.inspe_status === 'Not OK'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {row.data.inspe_status}
                      </span>
                    </td>

                    {/* ISSUES & ACTIONS */}
                    <td className="p-2.5 space-y-1">
                      {row.errors.map((err, idx) => (
                        <div key={`e-${idx}`} className="text-red-700 leading-snug">
                          • {err.message}
                        </div>
                      ))}
                      {row.warnings.map((warn, idx) => (
                        <div key={`w-${idx}`} className="text-amber-700 leading-snug">
                          • {warn.message}
                        </div>
                      ))}
                      {remarksWarn && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            onPatchRow(row.row_number, { visual_inspection: 'Not OK' })
                          }
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold"
                        >
                          Switch Visual to “Not OK”
                        </button>
                      )}
                      {row.errors.length === 0 && row.warnings.length === 0 && (
                        <span className="text-gray-400">Ready to import</span>
                      )}
                    </td>

                    {/* REMOVE ROW */}
                    <td className="p-2.5 text-center">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onRemoveRow(row.row_number)}
                        title="Remove this row from import batch"
                        className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={12} className="p-6 text-center text-gray-400 italic">
                    No rows match the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

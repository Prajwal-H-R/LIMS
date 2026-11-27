// frontend/src/components/InwardImport/CsvBuildGuide.tsx

import React, { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  HelpCircle,
  Search,
  Star,
} from 'lucide-react';
import { ImportMetadataResponse } from './types';

interface CsvBuildGuideProps {
  metadata: ImportMetadataResponse | null;
  loading: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

const REQUIRED_COLUMNS = [
  'material_description',
  'make',
  'model',
  'qty',
  'calibration_by',
];

const OPTIONAL_COLUMNS = [
  'range',
  'serial_no',
  'supplier',
  'in_dc',
  'out_dc',
  'accessories_included',
  'visual_inspection',
  'engineer_remarks',
];

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to textarea copy below
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export const CsvBuildGuide: React.FC<CsvBuildGuideProps> = ({
  metadata,
  loading,
  isExpanded,
  onToggleExpand,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [materialSearch, setMaterialSearch] = useState('');
  const [selectedMake, setSelectedMake] = useState<string>('');

  const activeMake = useMemo(() => {
    if (!metadata?.makes.length) return '';
    if (selectedMake && metadata.makes.includes(selectedMake)) return selectedMake;
    return metadata.makes[0];
  }, [metadata, selectedMake]);

  const filteredMaterials = useMemo(() => {
    const list = metadata?.material_descriptions || [];
    if (!materialSearch.trim()) return list;
    const q = materialSearch.toLowerCase();
    return list.filter((m) => m.toLowerCase().includes(q));
  }, [metadata, materialSearch]);

  const activeMakeModels = useMemo(() => {
    if (!metadata || !activeMake) return [];
    return metadata.models_by_make[activeMake] || [];
  }, [metadata, activeMake]);

  const exampleCsv = useMemo(() => {
    const sampleMake = metadata?.makes?.[0] || 'ATLAS_COPCO';
    const sampleModel =
      metadata?.models_by_make?.[sampleMake]?.[0]?.model ||
      'ATLAS_COPCO / RT-10';

    return [
      'material_description,make,model,range,serial_no,qty,calibration_by,supplier,in_dc,out_dc,accessories_included,visual_inspection,engineer_remarks',
      `Hydraulic Torque Wrench,${sampleMake},${sampleModel},,HTW-001,1,In House(Torque Lab),,,,Carry Case,OK,`,
    ].join('\n');
  }, [metadata]);

  const handleCopy = async (key: string, textToCopy: string) => {
    const ok = await copyTextToClipboard(textToCopy);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1400);
    }
  };

  const CopyChip: React.FC<{
    copyId: string;
    label: string;
    valueToCopy?: string;
    highlight?: boolean;
    badge?: string;
    onExtraClick?: () => void;
    active?: boolean;
  }> = ({
    copyId,
    label,
    valueToCopy,
    highlight,
    badge,
    onExtraClick,
    active,
  }) => {
    const isCopied = copiedKey === copyId;
    return (
      <button
        type="button"
        onClick={() => {
          void handleCopy(copyId, valueToCopy ?? label);
          onExtraClick?.();
        }}
        title={`Copy "${valueToCopy ?? label}"`}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium transition-all ${
          isCopied
            ? 'bg-green-50 border-green-400 text-green-700'
            : active
            ? 'bg-blue-50 border-blue-400 text-blue-700 ring-1 ring-blue-100'
            : highlight
            ? 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
            : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-blue-300'
        }`}
      >
        {isCopied ? (
          <Check size={11} className="text-green-600 flex-shrink-0" />
        ) : (
          <Copy size={11} className="text-gray-400 flex-shrink-0" />
        )}
        <span className="truncate max-w-[200px]">{label}</span>
        {highlight && (
          <Star size={10} className="fill-amber-500 text-amber-500 flex-shrink-0" />
        )}
        {badge && (
          <span className="px-1 py-0 text-[10px] rounded bg-slate-100 text-slate-600">
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="border border-gray-200 rounded-xl bg-slate-50/60 overflow-hidden">
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-slate-100/70 transition-colors"
      >
        <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-800">
          <HelpCircle size={15} className="text-blue-600" />
          <span>How to build the CSV</span>
          <span className="text-xs font-normal text-gray-500 hidden sm:inline">
            — click any chip to copy exact system values
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp size={16} className="text-gray-500" />
        ) : (
          <ChevronDown size={16} className="text-gray-500" />
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-3.5 pt-2.5 border-t border-gray-200 space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* LEFT: COMPACT COLUMNS & RULES */}
            <div className="lg:col-span-5 space-y-2.5">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                  Required Columns
                </div>
                <div className="flex flex-wrap items-center gap-1 mb-1.5">
                  {REQUIRED_COLUMNS.map((col) => (
                    <span
                      key={col}
                      className="px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-800 font-mono text-[11px] font-semibold"
                    >
                      {col}
                    </span>
                  ))}
                  {/* <span className="text-[11px] text-gray-500 font-medium ml-0.5">
                    required
                  </span> */}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                  Optional Columns
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {OPTIONAL_COLUMNS.map((col) => (
                    <span
                      key={col}
                      className="px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200 text-gray-600 font-mono text-[11px]"
                    >
                      {col}
                    </span>
                  ))}
                  {/* <span className="text-[11px] text-gray-500 font-medium ml-0.5">
                    optional
                  </span> */}
                </div>
              </div>

              <p className="text-xs text-gray-600 leading-relaxed">
                For <strong className="text-amber-800">Hydraulic Torque Wrench ★</strong>,
                leave <code className="bg-gray-100 px-1 rounded text-[11px]">range</code>{' '}
                blank (auto-fills from specs). Other materials take free-text Make/Model/Range.
                Outsource fields apply only to{' '}
                <code className="bg-gray-100 px-1 rounded text-[11px]">Outsource</code>, and
                unlisted materials must be added to the dropdown before import.
              </p>
            </div>

            {/* RIGHT: COPYABLE SYSTEM VALUES */}
            <div className="lg:col-span-7 space-y-2.5">
              {loading && !metadata ? (
                <div className="text-xs text-gray-500 py-3">
                  Loading valid values...
                </div>
              ) : (
                <>
                  {/* Calibration & Visual in one compact row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <div className="text-[11px] font-semibold text-gray-500 mb-1">
                        Calibration
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(metadata?.calibration_options || []).map((opt) => (
                          <CopyChip key={opt} copyId={`cal-${opt}`} label={opt} />
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold text-gray-500 mb-1">
                        Visual inspection
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(metadata?.visual_inspection_options || []).map((opt) => (
                          <CopyChip key={opt} copyId={`vis-${opt}`} label={opt} />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Material Descriptions */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] font-semibold text-gray-500">
                        Material descriptions ({filteredMaterials.length})
                      </span>
                      {(metadata?.material_descriptions.length || 0) > 8 && (
                        <div className="relative">
                          <Search
                            size={11}
                            className="absolute left-2 top-1.5 text-gray-400"
                          />
                          <input
                            type="text"
                            value={materialSearch}
                            onChange={(e) => setMaterialSearch(e.target.value)}
                            placeholder="Filter..."
                            className="pl-6 pr-2 py-0.5 w-32 text-[11px] border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto pr-1">
                      {filteredMaterials.map((mat) => {
                        const isConfigured =
                          metadata?.configured_types.includes(mat) ||
                          metadata?.spec_driven_materials.includes(mat);
                        return (
                          <CopyChip
                            key={mat}
                            copyId={`mat-${mat}`}
                            label={mat}
                            highlight={isConfigured}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* HTW System Specs */}
                  <div className="bg-white border border-gray-200 rounded-lg p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-gray-700">
                        Hydraulic Torque Wrench — Makes & Models ({metadata?.makes.length || 0})
                      </span>
                    </div>

                    {metadata?.makes.length ? (
                      <>
                        <div className="flex flex-wrap gap-1">
                          {metadata.makes.map((make) => (
                            <CopyChip
                              key={make}
                              copyId={`make-${make}`}
                              label={make}
                              active={activeMake === make}
                              onExtraClick={() => setSelectedMake(make)}
                            />
                          ))}
                        </div>

                        {activeMake && (
                          <div className="pt-1.5 border-t border-gray-100 flex flex-wrap gap-1 max-h-16 overflow-y-auto pr-1">
                            {activeMakeModels.map((spec) => (
                              <CopyChip
                                key={`${spec.make}-${spec.model}`}
                                copyId={`model-${spec.make}-${spec.model}`}
                                label={spec.model}
                                valueToCopy={spec.model}
                                badge={spec.range_text || undefined}
                              />
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-[11px] text-amber-700">
                        No active Manufacturer Specs found.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* COMPACT EXAMPLE */}
          <div className="pt-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Example Row
              </span>
              <button
                type="button"
                onClick={() => void handleCopy('example-csv', exampleCsv)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700"
              >
                {copiedKey === 'example-csv' ? (
                  <>
                    <Check size={11} /> Copied
                  </>
                ) : (
                  <>
                    <Copy size={11} /> Copy
                  </>
                )}
              </button>
            </div>
            <pre className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-[11px] font-mono text-gray-600 overflow-x-auto leading-snug">
              {exampleCsv}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

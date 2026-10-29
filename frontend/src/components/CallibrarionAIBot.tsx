// src/components/CalibrationAIBot.tsx
import React, { useEffect, useState } from "react";
import {
  Bot,
  Zap,
  Play,
  RotateCcw,
  Settings,
  Sparkles,
  ChevronDown,
  ChevronUp,
  X,
  FlaskConical,
  Copy,
  Activity,
  Gauge,
  Anchor,
  PlayCircle,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
export interface SectionBotHandle {
  getRows: () => Array<{
    set_torque: number;
    readingCount: number;
    rowIndex: number;
  }>;
  applyReadings: (
    data: Array<{ rowIndex: number; readings: string[] }>
  ) => void;
  clearReadings: () => void;
}

export interface ReadingProfile {
  name: string;
  shortDesc: string;
  color: string;
  icon: React.ReactNode;
  generator: (setTorque: number, readingIndex: number) => number;
}

export interface SectionConfig {
  id: string;
  label: string;
  icon: React.ReactNode;
  stepId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// READING PROFILES
// ─────────────────────────────────────────────────────────────────────────────
export const READING_PROFILES: Record<string, ReadingProfile> = {
  ideal: {
    name: "Ideal Pass",
    shortDesc: "±1% deviation — guaranteed PASS",
    color: "green",
    icon: <Sparkles className="w-3 h-3" />,
    generator: (setTorque) => {
      const dev = (Math.random() - 0.5) * 0.02 * setTorque;
      return Number((setTorque + dev).toFixed(3));
    },
  },
  borderline: {
    name: "Borderline",
    shortDesc: "±3.5–4% — edge condition test",
    color: "yellow",
    icon: <FlaskConical className="w-3 h-3" />,
    generator: (setTorque) => {
      const sign = Math.random() > 0.5 ? 1 : -1;
      const dev = sign * (0.035 + Math.random() * 0.005) * setTorque;
      return Number((setTorque + dev).toFixed(3));
    },
  },
  fail: {
    name: "Fail Scenario",
    shortDesc: "Beyond ±4% — guaranteed FAIL",
    color: "red",
    icon: <Zap className="w-3 h-3" />,
    generator: (setTorque) => {
      const sign = Math.random() > 0.5 ? 1 : -1;
      const dev = sign * (0.05 + Math.random() * 0.03) * setTorque;
      return Number((setTorque + dev).toFixed(3));
    },
  },
  incremental: {
    name: "Incremental Drift",
    shortDesc: "Slight upward drift per reading",
    color: "blue",
    icon: <Settings className="w-3 h-3" />,
    generator: (setTorque, idx) => {
      const base = -0.01 * setTorque;
      const step = idx * 0.005 * setTorque;
      return Number((setTorque + base + step).toFixed(3));
    },
  },
  consistent: {
    name: "High Precision",
    shortDesc: "Near-identical readings ±0.1%",
    color: "purple",
    icon: <Copy className="w-3 h-3" />,
    generator: (setTorque) => {
      const dev = (Math.random() - 0.5) * 0.002 * setTorque;
      return Number((setTorque + dev).toFixed(3));
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION CONFIGS — matches STEPS in CalibrationPage
// ─────────────────────────────────────────────────────────────────────────────
export const SECTION_CONFIGS: SectionConfig[] = [
  {
    id: "repeatability",
    label: "Repeatability",
    icon: <Activity className="w-3 h-3" />,
    stepId: "A",
  },
  {
    id: "reproducibility",
    label: "Reproducibility",
    icon: <Gauge className="w-3 h-3" />,
    stepId: "B",
  },
  {
    id: "outputDrive",
    label: "Output Drive",
    icon: <Zap className="w-3 h-3" />,
    stepId: "C",
  },
  {
    id: "driveInterface",
    label: "Drive Interface",
    icon: <Anchor className="w-3 h-3" />,
    stepId: "D",
  },
  {
    id: "loadingPoint",
    label: "Loading Point",
    icon: <PlayCircle className="w-3 h-3" />,
    stepId: "E",
  },
];



// ─────────────────────────────────────────────────────────────────────────────
// JSON INPUT HELPERS
// Accepts a single-section payload or one combined object keyed by section ID.
// The matrices are converted to the row orientation expected by each section's
// existing SectionBotHandle. Those section components still calculate means,
// errors and auto-save exactly as they do for manual input.
// ─────────────────────────────────────────────────────────────────────────────
type JsonObject = Record<string, unknown>;
type AppliedReadingRow = { rowIndex: number; readings: string[] };

const SECTION_KEY_ALIASES: Record<string, string> = {
  repeatability: "repeatability",
  reproducibility: "reproducibility",
  outputdrive: "outputDrive",
  driveinterface: "driveInterface",
  loadingpoint: "loadingPoint",
};

const canonicalSectionId = (key: string): string | undefined =>
  SECTION_KEY_ALIASES[key.toLowerCase().replace(/[^a-z]/g, "")];

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const numericCellToString = (value: unknown, location: string): string => {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && value.trim() === "") ||
    !Number.isFinite(Number(value))
  ) {
    throw new Error(`${location} must be a finite number.`);
  }
  return String(value).trim();
};

const readNumericMatrix = (
  value: unknown,
  expectedColumns: number,
  label: string,
  expectedRows?: number
): string[][] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty 2D array.`);
  }
  if (expectedRows !== undefined && value.length !== expectedRows) {
    throw new Error(`${label} must contain exactly ${expectedRows} rows; received ${value.length}.`);
  }
  return value.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== expectedColumns) {
      const actual = Array.isArray(row) ? row.length : "a non-array value";
      throw new Error(
        `${label}[${rowIndex}] must contain ${expectedColumns} values; received ${actual}.`
      );
    }
    return row.map((cell, columnIndex) =>
      numericCellToString(cell, `${label}[${rowIndex}][${columnIndex}]`)
    );
  });
};

const validateOptionalColumns = (
  payload: JsonObject,
  expectedCount: number,
  sectionLabel: string
) => {
  if (payload.columns === undefined) return;
  if (!Array.isArray(payload.columns) || payload.columns.length !== expectedCount) {
    throw new Error(
      `${sectionLabel}.columns must contain ${expectedCount} labels.`
    );
  }
};

const transposeMatrix = (matrix: string[][]): string[][] =>
  matrix[0].map((_, columnIndex) =>
    matrix.map((row) => row[columnIndex])
  );

const flattenValues = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) return [value];
  return value.reduce<unknown[]>(
    (all, child) => all.concat(flattenValues(child)),
    []
  );
};

const inferSingleSection = (
  payload: JsonObject,
  fallbackSectionId: string
): string => {
  if (payload.positions !== undefined) return "loadingPoint";

  if (Array.isArray(payload.columns)) {
    const labels = payload.columns.map((item) => String(item).trim().toUpperCase());
    if (labels.length > 0 && labels.every((label) => /^S\d+$/.test(label))) {
      return "repeatability";
    }
    if (labels.join(",") === "I,II,III,IV") return "reproducibility";
    if (labels.some((label) => label.includes("°"))) {
      if (fallbackSectionId === "outputDrive" || fallbackSectionId === "driveInterface") {
        return fallbackSectionId;
      }
      throw new Error(
        "This angle-based JSON can be used for Output Drive or Drive Interface. Choose the target section from the dropdown first."
      );
    }
  }

  return fallbackSectionId;
};

const convertSectionPayload = (
  sectionId: string,
  payloadValue: unknown,
  availableRows: number
): AppliedReadingRow[] => {
  if (!isJsonObject(payloadValue)) {
    throw new Error(`${SECTION_CONFIGS.find((section) => section.id === sectionId)?.label ?? sectionId} must be a JSON object.`);
  }
  const payload = payloadValue;
  const label = SECTION_CONFIGS.find((section) => section.id === sectionId)?.label ?? sectionId;

  if (sectionId === "repeatability") {
    validateOptionalColumns(payload, 5, label);
    const matrix = readNumericMatrix(payload.data, 5, `${label}.data`);
    if (matrix.length > availableRows) {
      throw new Error(`${label} contains ${matrix.length} data rows but only ${availableRows} table rows are available.`);
    }
    return matrix.map((readings, rowIndex) => ({ rowIndex, readings }));
  }

  if (sectionId === "reproducibility") {
    validateOptionalColumns(payload, 4, label);
    // Input rows are reading rounds; columns are sequences I, II, III and IV.
    const matrix = readNumericMatrix(payload.data, 4, `${label}.data`, 5);
    if (availableRows < 4) {
      throw new Error(`${label} needs four sequence rows, but only ${availableRows} table rows are available.`);
    }
    return transposeMatrix(matrix).map((readings, rowIndex) => ({ rowIndex, readings }));
  }

  if (sectionId === "outputDrive" || sectionId === "driveInterface") {
    validateOptionalColumns(payload, 4, label);
    // Input rows are the 10 reading rounds; columns are the four angles.
    const matrix = readNumericMatrix(payload.data, 4, `${label}.data`, 10);
    if (availableRows < 4) {
      throw new Error(`${label} needs four angle rows, but only ${availableRows} table rows are available.`);
    }
    return transposeMatrix(matrix).map((readings, rowIndex) => ({ rowIndex, readings }));
  }

  if (sectionId === "loadingPoint") {
    const positions = payload.positions;
    if (!isJsonObject(positions)) {
      throw new Error(`${label}.positions must be an object with "-10mm" and "+10mm" keys.`);
    }
    validateOptionalColumns(payload, 5, label);

    const positionEntries = Object.entries(positions);
    const negativeEntry = positionEntries.find(([key]) =>
      /negative|minus/i.test(key) || Number.parseFloat(key) < 0
    );
    const positiveEntry = positionEntries.find(([key]) =>
      /positive|plus/i.test(key) || Number.parseFloat(key) > 0
    );
    if (!negativeEntry || !positiveEntry) {
      throw new Error(`${label}.positions must include a negative position (e.g. "-10mm") and a positive position (e.g. "+10mm").`);
    }
    if (availableRows < 2) {
      throw new Error(`${label} needs two position rows, but only ${availableRows} table rows are available.`);
    }

    const toTenReadings = (raw: unknown, positionLabel: string): string[] => {
      const flattened = flattenValues(raw);
      if (flattened.length !== 10) {
        throw new Error(`${label}.positions["${positionLabel}"] must contain 10 readings (for example, two rows of five).`);
      }
      return flattened.map((cell, index) =>
        numericCellToString(cell, `${label}.positions["${positionLabel}"][${index}]`)
      );
    };

    return [
      { rowIndex: 0, readings: toTenReadings(negativeEntry[1], negativeEntry[0]) },
      { rowIndex: 1, readings: toTenReadings(positiveEntry[1], positiveEntry[0]) },
    ];
  }

  throw new Error(`Unsupported calibration section: ${sectionId}.`);
};

// ─────────────────────────────────────────────────────────────────────────────
// COLOR MAP
// ─────────────────────────────────────────────────────────────────────────────
const profileColors: Record<
  string,
  { border: string; bg: string; text: string; dot: string }
> = {
  green: {
    border: "border-green-300",
    bg: "bg-green-50",
    text: "text-green-700",
    dot: "bg-green-500",
  },
  yellow: {
    border: "border-yellow-300",
    bg: "bg-yellow-50",
    text: "text-yellow-700",
    dot: "bg-yellow-500",
  },
  red: {
    border: "border-red-300",
    bg: "bg-red-50",
    text: "text-red-700",
    dot: "bg-red-500",
  },
  blue: {
    border: "border-blue-300",
    bg: "bg-blue-50",
    text: "text-blue-700",
    dot: "bg-blue-500",
  },
  purple: {
    border: "border-purple-300",
    bg: "bg-purple-50",
    text: "text-purple-700",
    dot: "bg-purple-500",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────────────────────────────────────────
interface CalibrationAIBotProps {
  sectionRefs: Partial<Record<string, React.RefObject<SectionBotHandle>>>;
  activeStepId: string;
  isVisible: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const CalibrationAIBot: React.FC<CalibrationAIBotProps> = ({
  sectionRefs,
  activeStepId,
  isVisible,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFilling, setIsFilling] = useState(false);
  const [fillProgress, setFillProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState("ideal");
  const [fillDelay, setFillDelay] = useState(60);
  const [enabledSections, setEnabledSections] = useState<Record<string, boolean>>({
    repeatability: true,
    reproducibility: true,
    outputDrive: true,
    driveInterface: true,
    loadingPoint: true,
  });
  const [jsonInput, setJsonInput] = useState("");
  const [jsonStatusMsg, setJsonStatusMsg] = useState<string | null>(null);
  const [jsonTargetSection, setJsonTargetSection] = useState(
    SECTION_CONFIGS.find((section) => section.stepId === activeStepId)?.id ?? "repeatability"
  );

  useEffect(() => {
    const activeSection = SECTION_CONFIGS.find((section) => section.stepId === activeStepId);
    if (activeSection) setJsonTargetSection(activeSection.id);
  }, [activeStepId]);

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

  const generateReadings = (
    rows: Array<{
      set_torque: number;
      readingCount: number;
      rowIndex: number;
    }>
  ): Array<{ rowIndex: number; readings: string[] }> => {
    const profile = READING_PROFILES[selectedProfile];

    return rows
      .filter((r) => r.set_torque !== 0)
      .map((row) => ({
        rowIndex: row.rowIndex,
        readings: Array.from({ length: row.readingCount }, (_, i) =>
          profile.generator(row.set_torque, i).toString()
        ),
      }));
  };

  const getActiveSections = () =>
    SECTION_CONFIGS.filter(
      (cfg) => enabledSections[cfg.id] && sectionRefs[cfg.id]?.current
    );

  const currentSectionLabel =
    SECTION_CONFIGS.find((c) => c.stepId === activeStepId)?.label ?? null;
  const profile = READING_PROFILES[selectedProfile];
  const colors = profileColors[profile.color];
  const readySections = SECTION_CONFIGS.filter(
    (c) => !!sectionRefs[c.id]?.current
  ).length;


  // ── JSON Fill ─────────────────────────────────────────────────────────────
  const handleApplyJson = () => {
    setJsonStatusMsg(null);
    if (isFilling) return;
    if (!jsonInput.trim()) {
      setJsonStatusMsg("Paste calibration JSON first.");
      return;
    }

    try {
      const parsed: unknown = JSON.parse(jsonInput);
      if (!isJsonObject(parsed)) {
        throw new Error("The JSON root must be an object.");
      }

      const combinedEntries = Object.entries(parsed)
        .map(([key, value]) => ({ sectionId: canonicalSectionId(key), value, key }))
        .filter((entry): entry is { sectionId: string; value: unknown; key: string } => !!entry.sectionId);

      const requested: Array<{ sectionId: string; payload: unknown }> =
        combinedEntries.length > 0
          ? combinedEntries.map((entry) => ({ sectionId: entry.sectionId, payload: entry.value }))
          : [{
              sectionId: inferSingleSection(parsed, jsonTargetSection),
              payload: parsed,
            }];

      const seenSections = new Set<string>();
      for (const item of requested) {
        if (seenSections.has(item.sectionId)) {
          throw new Error(`The JSON contains more than one key for ${item.sectionId}. Keep one section key only.`);
        }
        seenSections.add(item.sectionId);
      }

      // Preflight every section before updating any cells, so invalid JSON or a
      // section that is not mounted cannot cause a half-applied multi-section fill.
      const prepared: Array<{
        sectionId: string;
        label: string;
        ref: SectionBotHandle;
        rows: AppliedReadingRow[];
      }> = requested.map((item) => {
        const section = SECTION_CONFIGS.find((candidate) => candidate.id === item.sectionId);
        if (!section) throw new Error(`Unknown section "${item.sectionId}".`);
        const ref = sectionRefs[item.sectionId]?.current;
        if (!ref) {
          throw new Error(
            `${section.label} is not mounted right now. No cells were changed. Open/mount that section (or keep all five section components mounted in CalibrationPage) and try again.`
          );
        }
        return {
          sectionId: item.sectionId,
          label: section.label,
          ref,
          rows: convertSectionPayload(item.sectionId, item.payload, ref.getRows().length),
        };
      });

      let filledCells = 0;
      prepared.forEach((item) => {
        item.ref.applyReadings(item.rows);
        filledCells += item.rows.reduce((sum, row) => sum + row.readings.length, 0);
      });

      const sectionNames = prepared.map((item) => item.label).join(", ");
      setJsonStatusMsg(
        `✅ Filled ${filledCells} cells across ${prepared.length} section(s): ${sectionNames}. Existing calculations and auto-save are preserved.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to parse calibration JSON.";
      setJsonStatusMsg(`❌ ${message}`);
    }
  };

  // Hide in production / when invisible
  if (import.meta.env.PROD) return null;
  if (!isVisible) return null;

  // ── Animated Fill ──────────────────────────────────────────────────────────
  const handleAnimatedFill = async () => {
    setIsFilling(true);
    setFillProgress(0);
    setStatusMsg(null);

    const activeSections = getActiveSections();
    if (activeSections.length === 0) {
      setStatusMsg("⚠️ No sections available. Navigate to a calibration tab.");
      setIsFilling(false);
      return;
    }

    let totalReadings = 0;
    let filledCount = 0;

    activeSections.forEach((cfg) => {
      const ref = sectionRefs[cfg.id]?.current;
      if (!ref) return;
      ref.getRows().forEach((r) => {
        totalReadings += r.readingCount;
      });
    });

    try {
      for (const cfg of activeSections) {
        const ref = sectionRefs[cfg.id]?.current;
        if (!ref) continue;

        const rows = ref.getRows();
        const generated = generateReadings(rows);

        for (const item of generated) {
          for (let rIdx = 0; rIdx < item.readings.length; rIdx++) {
            ref.applyReadings([
              {
                rowIndex: item.rowIndex,
                readings: item.readings.map((v, i) => (i <= rIdx ? v : "")),
              },
            ]);

            filledCount++;
            setFillProgress(
              Math.round((filledCount / Math.max(totalReadings, 1)) * 100)
            );

            if (fillDelay > 0) {
              await sleep(fillDelay);
            }
          }
          ref.applyReadings([item]);
        }
      }

      setStatusMsg(
        `✅ Filled ${filledCount} readings across ${activeSections.length} section(s)`
      );
    } catch (e) {
      setStatusMsg("❌ Error during fill. Check console.");
      console.error("[CalBot]", e);
    } finally {
      setIsFilling(false);
      setFillProgress(100);
    }
  };

  // ── Instant Fill ───────────────────────────────────────────────────────────
  const handleInstantFill = () => {
    setStatusMsg(null);

    const activeSections = getActiveSections();
    let totalFilled = 0;

    activeSections.forEach((cfg) => {
      const ref = sectionRefs[cfg.id]?.current;
      if (!ref) return;

      const generated = generateReadings(ref.getRows());
      ref.applyReadings(generated);
      generated.forEach((g) => {
        totalFilled += g.readings.length;
      });
    });

    if (totalFilled === 0) {
      setStatusMsg("⚠️ No data found. Navigate to a calibration tab first.");
      return;
    }

    setStatusMsg(`⚡ Instantly filled ${totalFilled} readings`);
  };

  // ── Fill Current Section Only ──────────────────────────────────────────────
  const handleFillCurrentSection = () => {
    setStatusMsg(null);

    const cfg = SECTION_CONFIGS.find((c) => c.stepId === activeStepId);
    if (!cfg) {
      setStatusMsg("⚠️ Current tab has no fillable readings.");
      return;
    }

    const ref = sectionRefs[cfg.id]?.current;
    if (!ref) {
      setStatusMsg("⚠️ Section not mounted yet. Navigate to this tab.");
      return;
    }

    const generated = generateReadings(ref.getRows());
    ref.applyReadings(generated);

    const count = generated.reduce((sum, g) => sum + g.readings.length, 0);
    setStatusMsg(
      count > 0
        ? `⚡ Filled ${cfg.label}: ${count} readings`
        : `⚠️ No rows with set torque found in ${cfg.label}`
    );
  };

  // ── Clear All ──────────────────────────────────────────────────────────────
  const handleClearAll = () => {
    SECTION_CONFIGS.forEach((cfg) => {
      sectionRefs[cfg.id]?.current?.clearReadings();
    });
    setStatusMsg("🗑️ All readings cleared");
  };

  // ── Clear Current ──────────────────────────────────────────────────────────
  const handleClearCurrent = () => {
    const cfg = SECTION_CONFIGS.find((c) => c.stepId === activeStepId);
    if (!cfg) return;

    const ref = sectionRefs[cfg.id]?.current;
    if (ref) {
      ref.clearReadings();
      setStatusMsg(`🗑️ Cleared ${cfg.label}`);
    } else {
      setStatusMsg("⚠️ Section not mounted yet.");
    }
  };

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <div className="fixed right-3 top-1/2 -translate-y-1/2 z-[100] group">
          <button
            onClick={() => setIsOpen(true)}
            title="Cal-Bot AI — Dev Tool"
            className="relative w-10 h-10 rounded-full
                       bg-gradient-to-br from-violet-600 to-indigo-700
                       text-white shadow-md shadow-violet-300/40
                       hover:shadow-lg hover:shadow-violet-400/50
                       hover:scale-105 transition-all duration-200
                       flex items-center justify-center
                       border-2 border-white/80"
          >
            <Bot className="w-4 h-4" />
            <span
              className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5
                         bg-green-400 rounded-full border border-white
                         animate-pulse"
            />
          </button>

          <div
            className="absolute right-12 top-1/2 -translate-y-1/2
                       bg-gray-900 text-white text-[10px] font-semibold
                       px-2.5 py-1 rounded-md whitespace-nowrap
                       opacity-0 group-hover:opacity-100
                       translate-x-2 group-hover:translate-x-0
                       transition-all duration-200 pointer-events-none
                       shadow-lg"
          >
            Cal-Bot AI
            <span className="block text-[8px] text-violet-300 font-normal">
              Dev Tool · Click to open
            </span>
          </div>
        </div>
      )}

      {/* Bot Panel */}
      {isOpen && (
        <div
          className="fixed right-3 top-1/2 -translate-y-1/2 z-[100]
                     w-[360px] max-h-[85vh] bg-white rounded-xl shadow-2xl
                     border border-gray-200 overflow-hidden flex flex-col
                     animate-in slide-in-from-right-4 duration-300"
        >
          {/* Header */}
          <div
            className="flex-shrink-0 bg-gradient-to-r from-violet-600 to-indigo-700
                       px-3 py-2.5 flex items-center justify-between"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-7 h-7 bg-white/20 rounded-lg
                           flex items-center justify-center flex-shrink-0"
              >
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-white font-bold text-xs">Cal-Bot AI</h3>
                  <span
                    className="text-[8px] font-bold bg-white/20
                               text-white px-1 py-0.5 rounded-full
                               uppercase tracking-wider"
                  >
                    DEV
                  </span>
                </div>
                <p className="text-violet-200 text-[9px] truncate">
                  {currentSectionLabel
                    ? `${currentSectionLabel} · ${readySections}/5 ready`
                    : `${readySections}/5 sections ready`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button
                onClick={() => setIsExpanded((p) => !p)}
                title="Toggle advanced options"
                className="text-white/70 hover:text-white p-1
                           rounded-md hover:bg-white/10 transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronUp className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Close Cal-Bot"
                className="text-white/70 hover:text-white p-1
                           rounded-md hover:bg-white/10 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          {isFilling && (
            <div className="h-1 bg-gray-200 flex-shrink-0">
              <div
                className="h-full bg-gradient-to-r from-violet-500
                           to-indigo-500 transition-all duration-300"
                style={{ width: `${fillProgress}%` }}
              />
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {/* JSON Input / Direct Cell Fill */}
            <section className="rounded-lg border border-violet-200 bg-violet-50/70 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold text-violet-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Copy className="w-3 h-3" /> JSON Cell Fill
                </p>
                <span className="text-[8px] font-semibold text-violet-700 bg-white px-1.5 py-0.5 rounded border border-violet-100">
                  5 sections
                </span>
              </div>

              <label className="block text-[9px] font-semibold text-gray-600" htmlFor="calbot-json-target">
                Target for a single-section JSON
              </label>
              <select
                id="calbot-json-target"
                value={jsonTargetSection}
                onChange={(event) => setJsonTargetSection(event.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-[10px] text-gray-800 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-300"
              >
                {SECTION_CONFIGS.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.label}
                  </option>
                ))}
              </select>

              <textarea
                value={jsonInput}
                onChange={(event) => {
                  setJsonInput(event.target.value);
                  setJsonStatusMsg(null);
                }}
                rows={7}
                spellCheck={false}
                placeholder={'Paste a single section object, or a combined object like:\n{\n  "repeatability": { "unit": "Nm", "columns": ["S1", "S2", "S3", "S4", "S5"], "data": [[4000, 4005, 4003, 4008, 4010]] },\n  "loadingPoint": { "unit": "Nm", "columns": ["1", "2", "3", "4", "5"], "positions": { "-10mm": [[4008, 4007, 4005, 4010, 4007], [4006, 4010, 4003, 4003, 4007]], "+10mm": [[4007, 4004, 4009, 4009, 4010], [4003, 4000, 4009, 4001, 4001]] } }\n}'}
                className="w-full resize-y rounded-md border border-gray-300 bg-white p-2 font-mono text-[9px] leading-4 text-gray-800 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-300"
              />

              <p className="text-[9px] leading-4 text-gray-600">
                Paste one section's JSON, or wrap multiple payloads in keys: <code>repeatability</code>, <code>reproducibility</code>, <code>outputDrive</code>, <code>driveInterface</code>, and <code>loadingPoint</code>. Matrices are oriented for the matching table automatically.
              </p>

              <div className="flex gap-1.5">
                <button
                  onClick={handleApplyJson}
                  disabled={isFilling || !jsonInput.trim()}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-violet-600 px-2 py-2 text-[10px] font-bold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                >
                  <Play className="w-3 h-3" />
                  Apply JSON to Cells
                </button>
                <button
                  onClick={() => {
                    setJsonInput("");
                    setJsonStatusMsg(null);
                  }}
                  disabled={isFilling || !jsonInput}
                  className="rounded-md border border-gray-300 bg-white px-2.5 py-2 text-[10px] font-semibold text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Clear
                </button>
              </div>

              {jsonStatusMsg && (
                <div
                  role="status"
                  className={`rounded-md border px-2 py-1.5 text-[9px] leading-4 font-medium break-words ${
                    jsonStatusMsg.startsWith("✅")
                      ? "border-green-200 bg-green-50 text-green-800"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  {jsonStatusMsg}
                </div>
              )}
            </section>

            {/* Generated Reading Profiles (existing functionality) */}
            <div className="border-t border-gray-200 pt-2">
            <div>
              <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                Reading Profile
              </p>

              <div className="grid grid-cols-1 gap-1">
                {Object.entries(READING_PROFILES).map(([key, p]) => {
                  const c = profileColors[p.color];
                  const isSelected = selectedProfile === key;

                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedProfile(key)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md border text-left transition-all
                        ${
                          isSelected
                            ? `${c.border} ${c.bg}`
                            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                        }`}
                    >
                      <span className={isSelected ? c.text : "text-gray-400"}>
                        {p.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div
                          className={`text-[11px] font-bold ${
                            isSelected ? c.text : "text-gray-700"
                          }`}
                        >
                          {p.name}
                        </div>
                        <div className="text-[9px] text-gray-500 truncate">
                          {p.shortDesc}
                        </div>
                      </div>
                      {isSelected && (
                        <div
                          className={`w-1.5 h-1.5 rounded-full ${c.dot} flex-shrink-0`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            </div>

            {/* Advanced Options */}
            {isExpanded && (
              <>
                {/* Section Toggles */}
                <div className="border-t pt-2.5">
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                    Target Sections (for "Fill All")
                  </p>

                  <div className="grid grid-cols-2 gap-1">
                    {SECTION_CONFIGS.map((cfg) => {
                      const hasRef = !!sectionRefs[cfg.id]?.current;
                      const enabled = enabledSections[cfg.id];

                      return (
                        <label
                          key={cfg.id}
                          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md border cursor-pointer text-[10px] transition-all select-none
                            ${
                              !hasRef
                                ? "opacity-40 cursor-not-allowed"
                                : enabled
                                ? "border-green-300 bg-green-50"
                                : "border-gray-200 bg-gray-50"
                            }`}
                        >
                          <input
                            type="checkbox"
                            checked={enabled}
                            disabled={!hasRef}
                            onChange={() =>
                              setEnabledSections((prev) => ({
                                ...prev,
                                [cfg.id]: !prev[cfg.id],
                              }))
                            }
                            className="w-3 h-3 rounded text-green-600"
                          />
                          <span className="text-gray-500 flex-shrink-0">
                            {cfg.icon}
                          </span>
                          <span
                            className={`font-medium truncate ${
                              enabled ? "text-gray-800" : "text-gray-500"
                            }`}
                          >
                            {cfg.label}
                          </span>
                          {cfg.stepId === activeStepId && (
                            <span
                              className="ml-auto text-[8px] font-bold bg-blue-100 text-blue-600 px-1 rounded flex-shrink-0"
                            >
                              NOW
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Fill Speed */}
                <div className="border-t pt-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                      Fill Speed
                    </p>
                    <span className="text-[9px] text-gray-500 font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                      {fillDelay === 0 ? "Instant" : `${fillDelay}ms`}
                    </span>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={300}
                    step={10}
                    value={fillDelay}
                    onChange={(e) => setFillDelay(Number(e.target.value))}
                    className="w-full h-1 bg-gray-200 rounded-full accent-violet-600 cursor-pointer"
                  />
                  <div className="flex justify-between mt-0.5">
                    <span className="text-[8px] text-gray-400">Fast</span>
                    <span className="text-[8px] text-gray-400">Slow</span>
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="border-t pt-2.5">
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                    Status
                  </p>

                  <div className="grid grid-cols-3 gap-1.5 bg-gradient-to-r from-violet-50 to-indigo-50 rounded-md p-2 border border-violet-100">
                    <div className="text-center">
                      <div className="text-sm font-black text-violet-700">
                        {readySections}/5
                      </div>
                      <div className="text-[8px] text-violet-500">Ready</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-sm font-black ${colors.text}`}>
                        {profile.name.split(" ")[0]}
                      </div>
                      <div className="text-[8px] text-gray-500">Mode</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-black text-gray-700">
                        {fillDelay === 0 ? "⚡" : `${fillDelay}ms`}
                      </div>
                      <div className="text-[8px] text-gray-500">Speed</div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Status Message */}
            {statusMsg && (
              <div
                className="text-[10px] px-2 py-1.5 rounded-md bg-gray-50
                           border border-gray-200 text-gray-700
                           font-medium animate-in fade-in duration-200"
              >
                {statusMsg}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex-shrink-0 p-2.5 space-y-1.5 border-t border-gray-100 bg-white">
            {currentSectionLabel && (
              <button
                onClick={handleFillCurrentSection}
                disabled={isFilling}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-md font-semibold text-[11px] hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Zap className="w-3 h-3" />
                Fill "{currentSectionLabel}" Only
              </button>
            )}

            <div className="flex gap-1.5">
              <button
                onClick={handleAnimatedFill}
                disabled={isFilling}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-md font-bold text-xs hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                {isFilling ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {fillProgress}%
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3" />
                    Fill All
                  </>
                )}
              </button>

              <button
                onClick={handleInstantFill}
                disabled={isFilling}
                title="Instant fill — no animation"
                className="flex items-center justify-center px-2.5 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-md font-bold hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Zap className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex gap-1.5">
              {currentSectionLabel && (
                <button
                  onClick={handleClearCurrent}
                  disabled={isFilling}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-gray-50 text-gray-600 border border-gray-200 rounded-md font-medium text-[10px] hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200 disabled:opacity-50 transition-all"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  Clear Current
                </button>
              )}

              <button
                onClick={handleClearAll}
                disabled={isFilling}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-gray-50 text-gray-600 border border-gray-200 rounded-md font-medium text-[10px] hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50 transition-all"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                Clear All
              </button>
            </div>

            <p className="text-[8px] text-gray-400 text-center pt-0.5">
              🔧 Dev-only · Hidden in production
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default CalibrationAIBot;
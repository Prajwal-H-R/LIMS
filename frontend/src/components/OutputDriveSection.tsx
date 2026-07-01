// import React, { useState, useEffect, useRef } from "react";
// import { api, ENDPOINTS } from "../api/config";
// import { Loader2, CheckCircle2, AlertCircle, Cloud, Trash2 } from "lucide-react";
// import useDebounce from "../hooks/useDebounce"; 

// interface OutputDriveSectionProps {
//   jobId: number;
// }

// interface GeometricRowData {
//   position_deg: number;
//   readings: string[]; 
//   mean_value: number | null;
// }

// interface OutputDriveResponse {
//   job_id: number;
//   status: string;
//   set_torque: number;
//   error_value: number; // b_out
//   torque_unit: string;
//   positions: {
//     position_deg: number;
//     readings: number[];
//     mean_value: number;
//   }[];
// }

// const OutputDriveSection: React.FC<OutputDriveSectionProps> = ({ jobId }) => {
//   // --- STATE ---
//   const [loading, setLoading] = useState(false);
//   const [dataLoaded, setDataLoaded] = useState(false);
  
//   const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
//   const [lastSaved, setLastSaved] = useState<Date | null>(null);
//   const lastSavedPayload = useRef<string | null>(null);

//   const [tableData, setTableData] = useState<GeometricRowData[]>([
//     { position_deg: 0, readings: Array(10).fill(""), mean_value: null },
//     { position_deg: 90, readings: Array(10).fill(""), mean_value: null },
//     { position_deg: 180, readings: Array(10).fill(""), mean_value: null },
//     { position_deg: 270, readings: Array(10).fill(""), mean_value: null },
//   ]);

//   const [meta, setMeta] = useState({ set_torque: 0, error_value: 0, torque_unit: "-" });

//   const debouncedReadings = useDebounce(
//     tableData.map(r => ({
//       position_deg: r.position_deg,
//       readings: r.readings
//     })),
//     1000
//   );

//   const hasUserEdited = useRef(false);

//   // --- 1. INITIAL FETCH ---
//   useEffect(() => {
//     const init = async () => {
//       if (!jobId) return;
//       setLoading(true);
//       try {
//         const res = await api.get<OutputDriveResponse>(`${ENDPOINTS.HTW_CALCULATIONS.OUTPUT_DRIVE}/${jobId}`);
        
//         let currentData = [
//             { position_deg: 0, readings: Array(10).fill(""), mean_value: null },
//             { position_deg: 90, readings: Array(10).fill(""), mean_value: null },
//             { position_deg: 180, readings: Array(10).fill(""), mean_value: null },
//             { position_deg: 270, readings: Array(10).fill(""), mean_value: null },
//         ] as GeometricRowData[];

//         if (res.data.status === "success" && res.data.positions.length > 0) {
//             const mapped = res.data.positions.map((p) => ({
//                 position_deg: p.position_deg,
//                 readings: p.readings.map(String),
//                 mean_value: p.mean_value
//             }));
            
//             currentData = [0, 90, 180, 270].map(deg => 
//                 mapped.find((d) => d.position_deg === deg) || 
//                 { position_deg: deg, readings: Array(10).fill(""), mean_value: null }
//             );
            
//             setMeta({ 
//                 set_torque: res.data.set_torque, 
//                 error_value: res.data.error_value, 
//                 torque_unit: res.data.torque_unit || "-" 
//             });
//         } else {
//              setMeta(prev => ({ ...prev, set_torque: res.data.set_torque, torque_unit: res.data.torque_unit || "-" }));
//         }

//         setTableData(currentData);

//         // --- SYNC REFERENCE TO PREVENT IMMEDIATE SAVE ---
//         const initialPayload = {
//             job_id: jobId,
//             positions: currentData.map(r => ({
//                 position_deg: r.position_deg,
//                 readings: r.readings.map(v => (v === "" || isNaN(Number(v))) ? 0 : Number(v))
//             }))
//         };
//         lastSavedPayload.current = JSON.stringify(initialPayload);
        
//         // RESET EDIT FLAG: Ensure we don't save just because we loaded data
//         hasUserEdited.current = false;

//         setDataLoaded(true);

//       } catch (err) { 
//           console.error(err); 
//       } finally { 
//           setLoading(false); 
//       }
//     };
//     init();
//   }, [jobId]);

//   // --- 2. AUTO-SAVE EFFECT (DRAFT MODE) ---
//   useEffect(() => {
//     // 1. Safety Checks
//     if (!dataLoaded) return;

//     // 2. STRICT GUARD: Stop save if user has not edited
//     // This prevents overwriting data with zeros on mount
//     if (!hasUserEdited.current) return;

//     const performAutoSave = async () => {
//       try {
//         setSaveStatus("saving");

//         // 3. Construct Payload
//         const payload = {
//           job_id: jobId,
//           positions: debouncedReadings.map(r => ({
//             position_deg: r.position_deg,
//             readings: r.readings.map(v => (v === "" || isNaN(Number(v))) ? 0 : Number(v))
//           }))
//         };

//         // 4. Prevent Duplicate Saves
//         const payloadString = JSON.stringify(payload);
//         if (payloadString === lastSavedPayload.current) {
//           setSaveStatus("saved");
//           return; 
//         }

//         // 5. POST to DRAFT endpoint
//         const res = await api.post<OutputDriveResponse>(
//           "/htw-calculations/output-drive/draft",
//           payload
//         );

//         setMeta({
//           set_torque: res.data.set_torque,
//           error_value: res.data.error_value,
//           torque_unit: res.data.torque_unit || "-"
//         });
        
//         lastSavedPayload.current = payloadString;
//         setSaveStatus("saved");
//         setLastSaved(new Date());
//       } catch (err) {
//         console.error("Auto-save failed", err);
//         setSaveStatus("error");
//       }
//     };

//     performAutoSave();
//   }, [debouncedReadings, jobId, dataLoaded]);

//   // --- 3. HANDLERS ---
//   const handleReadingChange = (rowIdx: number, readIdx: number, val: string) => {
//     if (!/^\d*\.?\d*$/.test(val)) return;
    
//     // FLAG THE EDIT
//     hasUserEdited.current = true;
    
//     setSaveStatus("idle");

//     setTableData(prev => {
//         const newData = [...prev];
//         const row = { ...newData[rowIdx] };
//         row.readings = [...row.readings];
//         row.readings[readIdx] = val;
        
//         // Local Mean Calc (Instant UI feedback)
//         const nums = row.readings.filter(r => r !== "" && !isNaN(Number(r))).map(Number);
//         row.mean_value = nums.length === 10 ? nums.reduce((a, b) => a + b, 0) / 10 : null;
//         newData[rowIdx] = row;
        
//         // Local Error Calc (Instant UI feedback)
//         const means = newData.map(r => r.mean_value).filter((m): m is number => m !== null);
//         if (means.length === 4) {
//              setMeta(m => ({ ...m, error_value: Math.max(...means) - Math.min(...means) }));
//         }

//         return newData;
//     });
//   };

//   const handleClear = async () => {
//     if (!window.confirm("Clear all readings?")) return;
    
//     hasUserEdited.current = true; // Clearing is an edit
//     setSaveStatus("idle");

//     setTableData(prev =>
//       prev.map(r => ({
//         ...r,
//         readings: Array(10).fill(""),
//         mean_value: null
//       }))
//     );
//     setMeta(m => ({ ...m, error_value: 0 }));
//   };

//   if (loading) return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-purple-600"/></div>;

//   return (
//     // REMOVED "animate-in fade-in duration-500" to stop movement
//     <div className="flex flex-col w-full bg-white border border-gray-200 rounded-xl shadow-sm p-4 mt-6">
        
//         {/* Header */}
//         <div className="mb-4 flex justify-between items-center">
//             <h2 className="text-sm font-bold text-black uppercase tracking-tight border-l-4 border-purple-500 pl-2">
//                 C. Variation due to geometric effect of the output drive (b<sub>out</sub>)
//             </h2>
            
//             {/* Status Indicator */}
//             <div className="flex items-center gap-2 text-xs font-medium">
//                 {saveStatus === "saving" && (
//                     <span className="text-blue-600 flex items-center gap-1">
//                         <Loader2 className="h-3 w-3 animate-spin" /> Saving...
//                     </span>
//                 )}
//                 {saveStatus === "saved" && (
//                     <span className="text-green-600 flex items-center gap-1 transition-opacity duration-1000">
//                         <CheckCircle2 className="h-3 w-3" /> Saved 
//                         <span className="text-gray-400 text-[10px] ml-1">
//                             {lastSaved?.toLocaleTimeString()}
//                         </span>
//                     </span>
//                 )}
//                 {saveStatus === "error" && (
//                     <span className="text-red-600 flex items-center gap-1">
//                         <AlertCircle className="h-3 w-3" /> Save Failed
//                     </span>
//                 )}
//                 {saveStatus === "idle" && (
//                     <span className="text-gray-400 flex items-center gap-1">
//                         <Cloud className="h-3 w-3" /> Up to date
//                     </span>
//                 )}
//             </div>
//         </div>

//         {/* --- SCROLLABLE CONTAINER --- */}
//         <div className="overflow-x-auto rounded-lg border border-gray-400 shadow-inner">
//             <table className="w-full min-w-[1100px] border-collapse">
//                 <thead>
//                     <tr className="bg-gray-100 text-[11px] font-bold text-gray-800 border-b border-gray-400 text-center">
//                         <th className="border-r border-gray-400 p-2 w-[100px] sticky left-0 bg-gray-100 z-10 shadow-sm">Set Torque<br/>({meta.torque_unit})</th>
//                         <th className="border-r border-gray-400 p-2 w-[80px] sticky left-[100px] bg-gray-100 z-10 shadow-sm">Position</th>
                        
//                         <th colSpan={10} className="border-r border-gray-400 p-2 bg-green-50 text-green-900">
//                             Indicated Readings 1 - 10 ({meta.torque_unit})
//                         </th>
//                         <th className="p-2 w-[100px] bg-yellow-50 text-yellow-900">Mean Value</th>
//                     </tr>
//                 </thead>
//                 <tbody>
//                     {tableData.map((row, index) => (
//                         <tr key={row.position_deg} className="border-b border-gray-300 hover:bg-gray-50">
//                             {/* Merged Set Torque Cell - Sticky */}
//                             {index === 0 && (
//                                 <td rowSpan={4} className="border-r border-gray-400 p-2 font-bold text-center text-gray-900 bg-white align-middle text-lg sticky left-0 z-10 shadow-sm">
//                                     {meta.set_torque}
//                                 </td>
//                             )}
                            
//                             {/* Position Cell - Sticky */}
//                             <td className={`border-r border-gray-400 p-2 font-bold text-center text-gray-700 bg-gray-50 text-xs sticky left-[100px] z-10 shadow-sm ${index === 0 ? "top-[40px]" : ""}`}>
//                                 {row.position_deg}°
//                             </td>

//                             {/* Scrollable Readings */}
//                             {row.readings.map((val, cIdx) => (
//                                 <td key={cIdx} className="border-r border-gray-200 p-0 w-[60px] relative min-w-[60px]">
//                                     <input 
//                                         type="text" 
//                                         value={val} 
//                                         onChange={(e) => handleReadingChange(index, cIdx, e.target.value)} 
//                                         className="w-full h-full p-2 text-center text-xs font-medium focus:outline-none bg-transparent text-gray-800 focus:bg-blue-50 focus:ring-2 focus:ring-blue-400 inset-0" 
//                                         placeholder="-"
//                                     />
//                                 </td>
//                             ))}

//                             {/* Mean Value */}
//                             <td className="border-l border-gray-400 p-2 font-bold text-center text-gray-900 bg-yellow-50 text-sm min-w-[80px]">
//                                 {row.mean_value !== null ? row.mean_value.toFixed(2) : "-"}
//                             </td>
//                         </tr>
//                     ))}
                    
//                     {/* Footer Row */}
//                     <tr className="bg-purple-50 border-t-2 border-purple-200">
//                         {/* Sticky footer cells to align with left columns */}
//                         <td colSpan={2} className="sticky left-0 bg-purple-50 z-10"></td>
                        
//                         <td colSpan={11} className="p-4 text-center">
//                             <div className="flex items-center justify-center gap-4 text-purple-900">
//                                 <span className="text-sm font-bold uppercase tracking-wide">Error due to output drive (b<sub>out</sub>):</span>
//                                 <span className="text-2xl font-mono font-bold bg-white px-4 py-1 rounded border border-purple-200 shadow-sm">{meta.error_value.toFixed(2)}</span>
//                                 <span className="text-xs font-bold opacity-70">{meta.torque_unit}</span>
//                             </div>
//                         </td>
//                     </tr>
//                 </tbody>
//             </table>
//         </div>

//         {/* Footer Actions */}
//         <div className="flex justify-between items-center mt-4">
//              <div className="flex gap-2">
//                 {tableData.some(r => r.readings.some(v => v !== "")) && (
//                     <button onClick={handleClear} className="px-3 py-1.5 text-xs text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 rounded-md flex gap-2 items-center"><Trash2 className="h-3 w-3"/> Clear</button>
//                 )}
//              </div>
//              <div className="text-[10px] text-gray-400 italic">
//                 Changes save automatically
//              </div>
//         </div>
//     </div>
//   );
// };

// export default OutputDriveSection;
//// src/components/OutputDriveSection.tsx
import React, {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
  useMemo,
} from "react";
import { api, ENDPOINTS } from "../api/config";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Cloud,
  Trash2,
} from "lucide-react";
import useDebounce from "../hooks/useDebounce";
import { SectionBotHandle } from "../components/CallibrarionAIBot";

// ─────────────────────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────────────────────
interface OutputDriveSectionProps {
  jobId: number;
}

interface GeometricRowData {
  position_deg: number;
  readings: string[];
  mean_value: number | null;
}

interface OutputDriveResponse {
  job_id: number;
  status: string;
  set_torque: number;
  error_value: number; // b_out
  torque_unit: string;
  positions: {
    position_deg: number;
    readings: number[];
    mean_value: number;
  }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const POSITIONS = [0, 90, 180, 270] as const;

const buildDefaultRows = (): GeometricRowData[] =>
  POSITIONS.map((deg) => ({
    position_deg: deg,
    readings: Array(10).fill(""),
    mean_value: null,
  }));

const calcMean = (readings: string[]): number | null => {
  const nums = readings
    .filter((r) => r !== "" && !isNaN(Number(r)))
    .map(Number);
  return nums.length === 10 ? nums.reduce((a, b) => a + b, 0) / 10 : null;
};

const calcBOut = (rows: GeometricRowData[]): number => {
  const means = rows
    .map((r) => r.mean_value)
    .filter((m): m is number => m !== null);
  return means.length === 4 ? Math.max(...means) - Math.min(...means) : 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT — forwardRef for CalBot
// ─────────────────────────────────────────────────────────────────────────────
const OutputDriveSection = forwardRef<
  SectionBotHandle,
  OutputDriveSectionProps
>(({ jobId }, ref) => {
  // ── State ──────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [tableData, setTableData] = useState<GeometricRowData[]>(
    buildDefaultRows()
  );
  const [meta, setMeta] = useState({
    set_torque: 0,
    error_value: 0,
    torque_unit: "-",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isFormInvalid = useMemo(() => Object.keys(errors).length > 0, [errors]);
  const lastSavedPayload = useRef<string | null>(null);
  const hasUserEdited = useRef(false);

  const debouncedReadings = useDebounce(
    tableData.map((r) => ({
      position_deg: r.position_deg,
      readings: r.readings,
    })),
    1000
  );

  // ── Validation Logic ───────────────────────────────────────────────────────
  const MAX_INPUT_VALUE = 9999;
  const validateInput = (value: string): string | null => {
    if (value.trim() === "") return "Value cannot be empty.";
    if (value.endsWith(".")) return "Invalid number.";
    const num = Number(value);
    if (isNaN(num) || !isFinite(num)) return "Invalid numeric value.";
    if (num > MAX_INPUT_VALUE) return `Value cannot be greater than ${MAX_INPUT_VALUE}.`;
    return null;
  };

  useEffect(() => {
    const newErrors: Record<string, string> = {};
    if (dataLoaded) {
      tableData.forEach((row, rowIndex) => {
        const hasAnyInputInRow = row.readings.some((r) => r.trim() !== "");
        row.readings.forEach((reading, rIndex) => {
          const error = validateInput(reading);
          if (error && error !== "Value cannot be empty.") {
            newErrors[`${rowIndex}-${rIndex}`] = error;
          } else if (hasAnyInputInRow && reading.trim() === "") {
            newErrors[`${rowIndex}-${rIndex}`] = "Value cannot be empty.";
          }
        });
      });
    }
    setErrors(newErrors);
  }, [tableData, dataLoaded]);

  const clearAllReadings = () => {
    hasUserEdited.current = true;
    setSaveStatus("idle");
    setTableData(buildDefaultRows());
    setMeta((m) => ({ ...m, error_value: 0 }));
  };

  // ── Bot Handle ─────────────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    getRows: () =>
      tableData.map((row, rowIndex) => ({
        set_torque: meta.set_torque,
        readingCount: 10,
        rowIndex,
      })),

    applyReadings: (data) => {
      hasUserEdited.current = true;
      setSaveStatus("idle");
      setTableData((prev) => {
        const next = [...prev];
        data.forEach(({ rowIndex, readings }) => {
          if (rowIndex >= next.length) return;
          const row = { ...next[rowIndex] };
          row.readings = Array.from({ length: 10 }, (_, i) => readings[i] ?? "");
          row.mean_value = calcMean(row.readings);
          next[rowIndex] = row;
        });
        setMeta((m) => ({ ...m, error_value: calcBOut(next) }));
        return next;
      });
    },

    clearReadings: clearAllReadings,
  }));

  // ── 1. Initial Fetch ───────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      if (!jobId) return;
      setLoading(true);
      try {
        const res = await api.get<OutputDriveResponse>(
          `${ENDPOINTS.HTW_CALCULATIONS.OUTPUT_DRIVE}/${jobId}`
        );
        let currentData = buildDefaultRows();
        if (res.data.status === "success" && res.data.positions.length > 0) {
          const mapped = res.data.positions.map((p) => ({
            position_deg: p.position_deg,
            readings: p.readings.map(v => String(v) === "0" ? "" : String(v)),
            mean_value: p.mean_value,
          }));
          currentData = POSITIONS.map(
            (deg) => mapped.find((d) => d.position_deg === deg) || {
                position_deg: deg,
                readings: Array(10).fill(""),
                mean_value: null,
              }
          );
          setMeta({
            set_torque: res.data.set_torque,
            error_value: res.data.error_value,
            torque_unit: res.data.torque_unit || "-",
          });
        } else {
          setMeta((prev) => ({
            ...prev,
            set_torque: res.data.set_torque,
            torque_unit: res.data.torque_unit || "-",
          }));
        }
        setTableData(currentData);
        lastSavedPayload.current = JSON.stringify({
          job_id: jobId,
          positions: currentData.map((r) => ({
            position_deg: r.position_deg,
            readings: r.readings.map((v) => (v === "" || isNaN(Number(v)) ? 0 : Number(v))),
          })),
        });
        hasUserEdited.current = false;
        setDataLoaded(true);
      } catch (err) {
        console.error("OutputDrive fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [jobId]);

  // ── 2. Auto-Save ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!dataLoaded || !hasUserEdited.current || isFormInvalid) {
        setSaveStatus("idle");
        return;
    }
    const performAutoSave = async () => {
      const payload = {
        job_id: jobId,
        positions: debouncedReadings.map((r) => ({
          position_deg: r.position_deg,
          readings: r.readings.map((v) => (v === "" || isNaN(Number(v)) ? 0 : Number(v))),
        })),
      };
      const payloadString = JSON.stringify(payload);
      if (payloadString === lastSavedPayload.current) {
        setSaveStatus("saved");
        return;
      }
      setSaveStatus("saving");
      try {
        const res = await api.post<OutputDriveResponse>("/htw-calculations/output-drive/draft", payload);
        setMeta({
          set_torque: res.data.set_torque,
          error_value: res.data.error_value,
          torque_unit: res.data.torque_unit || "-",
        });
        lastSavedPayload.current = payloadString;
        setSaveStatus("saved");
      } catch (err) {
        console.error("OutputDrive auto-save failed:", err);
        setSaveStatus("error");
      }
    };
    performAutoSave();
  }, [debouncedReadings, jobId, dataLoaded, isFormInvalid]);

  // ── 3. Handlers ────────────────────────────────────────────────────────────
  const handleReadingChange = (rowIdx: number, readIdx: number, val: string) => {
    if (val !== "" && !/^\d*\.?\d*$/.test(val)) return;
    hasUserEdited.current = true;
    setSaveStatus("idle");
    setTableData((prev) => {
      const next = [...prev];
      const row = { ...next[rowIdx] };
      row.readings = [...row.readings];
      row.readings[readIdx] = val;
      row.mean_value = calcMean(row.readings);
      next[rowIdx] = row;
      setMeta((m) => ({ ...m, error_value: calcBOut(next) }));
      return next;
    });
  };

  const handleClearClick = () => {
    if (!window.confirm("Clear all readings?")) return;
    clearAllReadings();
  };

  if (loading) return (
    <div className="p-8 text-center flex justify-center items-center h-48 bg-white border border-gray-200 rounded-xl mt-6">
      <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
    </div>
  );

  return (
    <div className="flex flex-col w-full bg-white border border-gray-200 rounded-xl shadow-sm p-4 mt-6 animate-in fade-in duration-500">
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-sm font-bold text-black uppercase tracking-tight border-l-4 border-purple-500 pl-2">
          C. Variation due to geometric effect of the output drive (b<sub>out</sub>)
        </h2>
        <div className="flex items-center gap-2 text-xs font-medium min-w-[80px] justify-end">
          {saveStatus === "saving" && <span className="text-blue-600 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Saving...</span>}
          {saveStatus === "saved" && !isFormInvalid && <span className="text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Saved</span>}
          {saveStatus === "error" && <span className="text-red-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Error</span>}
          {(saveStatus === "idle" || (saveStatus === "saved" && isFormInvalid)) && <span className="text-gray-400 flex items-center gap-1"><Cloud className="h-3 w-3" /> Synced</span>}
        </div>
      </div>

      {isFormInvalid && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-3 text-sm text-yellow-800">
          <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
          <span>Some fields are incomplete or have errors. Please review the highlighted cells.</span>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-400">
        <table className="w-full min-w-[1100px] border-collapse">
          <thead>
            <tr className="bg-gray-100 text-[11px] font-bold text-gray-800 border-b border-gray-400 text-center uppercase">
              <th className="border-r border-gray-400 p-2 w-[100px] sticky left-0 bg-gray-100 z-10 shadow-sm">
                Set Torque<br />({meta.torque_unit})
              </th>
              <th className="border-r border-gray-400 p-2 w-[80px] sticky left-[100px] bg-gray-100 z-10 shadow-sm">
                Position
              </th>
              <th colSpan={10} className="border-r border-gray-400 p-2 bg-green-50 text-green-900">
                Indicated Readings 1 - 10 ({meta.torque_unit})
              </th>
              <th className="p-2 w-[100px] bg-yellow-50 text-yellow-900">
                Mean Value
              </th>
            </tr>
          </thead>
          <tbody>
            {tableData.map((row, index) => (
              <tr key={row.position_deg} className="border-b border-gray-300 hover:bg-gray-50 group">
                {index === 0 && (
                  <td rowSpan={4} className="border-r border-gray-400 p-2 font-bold text-center text-gray-900 bg-white align-middle text-lg sticky left-0 z-10 shadow-sm">
                    {meta.set_torque || "-"}
                  </td>
                )}
                <td className="border-r border-gray-400 p-2 font-bold text-center text-gray-700 bg-gray-50 text-xs sticky left-[100px] z-10 shadow-sm">
                  {row.position_deg}°
                </td>
                {row.readings.map((val, cIdx) => (
                  <td key={cIdx} className="border-r border-gray-200 p-0 w-[60px] relative">
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => handleReadingChange(index, cIdx, e.target.value)}
                      className={`w-full h-full p-2 text-center text-xs font-medium focus:outline-none bg-transparent text-gray-800 focus:bg-blue-50 focus:ring-2 focus:ring-inset focus:ring-blue-400 ${
                        errors[`${index}-${cIdx}`] ? "ring-2 ring-inset ring-red-500" : ""
                      }`}
                      placeholder="-"
                    />
                  </td>
                ))}
                <td className="border-l border-gray-400 p-2 font-bold text-center text-gray-900 bg-yellow-50 text-sm">
                  {row.mean_value !== null ? row.mean_value.toFixed(2) : "-"}
                </td>
              </tr>
            ))}
            <tr className="bg-purple-50 border-t-2 border-purple-200">
              <td colSpan={2} className="sticky left-0 bg-purple-50 z-10" />
              <td colSpan={11} className="p-4 text-center">
                <div className="flex items-center justify-center gap-4 text-purple-900">
                  <span className="text-sm font-bold uppercase tracking-wide">
                    Error due to output drive (b<sub>out</sub>):
                  </span>
                  <span className="text-2xl font-mono font-bold bg-white px-4 py-1 rounded border border-purple-200 shadow-sm">
                    {meta.error_value.toFixed(2)}
                  </span>
                  <span className="text-xs font-bold opacity-70">{meta.torque_unit}</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center mt-4">
        <button
          onClick={handleClearClick}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors"
        >
          <Trash2 className="h-3 w-3" /> Clear All
        </button>
        <div className="text-[10px] text-gray-400 italic text-right">
          Changes save automatically
        </div>
      </div>
    </div>
  );
});

OutputDriveSection.displayName = "OutputDriveSection";
export default OutputDriveSection;
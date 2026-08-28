// import React, { useState, useEffect, useRef } from "react";
// import { api, ENDPOINTS } from "../api/config";
// import { Loader2, CheckCircle2, AlertCircle, Cloud, Trash2 } from "lucide-react";
// import useDebounce from "../hooks/useDebounce"; 

// interface ReproducibilitySectionProps {
//   jobId: number;
//   torqueUnit?: string; 
// }

// interface SequenceRowData {
//   sequence_no: number;
//   readings: string[]; // 5 readings per row
//   mean_xr: number | null;
// }

// interface ReproducibilityResponse {
//   job_id: number;
//   status: string;
//   set_torque_20: number;
//   error_due_to_reproducibility: number; // b_rep
//   torque_unit?: string; 
//   unit?: string;
//   pressure_unit?: string;
//   sequences: {
//     sequence_no: number;
//     readings: number[];
//     mean_xr: number;
//   }[];
// }

// // --- Skeleton Component ---
// const ReproducibilitySkeleton: React.FC = () => {
//   return (
//     <div className="flex flex-col w-full bg-white border border-gray-200 rounded-xl shadow-sm p-4 mt-6 animate-pulse">
//       {/* Header Skeleton */}
//       <div className="mb-4 flex justify-between items-center">
//         <div className="h-6 w-1/3 bg-gray-200 rounded"></div>
//         <div className="h-4 w-20 bg-gray-200 rounded"></div>
//       </div>

//       {/* Table Skeleton */}
//       <div className="overflow-x-auto rounded-lg border border-gray-300">
//         <div className="w-full min-w-[700px]">
//           {/* Table Head */}
//           <div className="flex bg-gray-100 border-b border-gray-300 p-2">
//             <div className="w-[100px] h-4 bg-gray-300 rounded mr-2"></div>
//             <div className="w-[50px] h-4 bg-gray-300 rounded mr-2"></div>
//             <div className="flex-1 h-4 bg-gray-200 rounded mr-2"></div>
//             <div className="w-[100px] h-4 bg-gray-300 rounded"></div>
//           </div>
          
//           {/* Table Body - 4 Rows */}
//           {[1, 2, 3, 4].map((i) => (
//             <div key={i} className="flex border-b border-gray-100 p-2 items-center">
//               <div className="w-[100px] h-8 bg-gray-200 rounded mr-2"></div>
//               <div className="w-[50px] h-6 bg-gray-200 rounded mr-2"></div>
//               <div className="flex-1 flex gap-2 mr-2">
//                  {[...Array(5)].map((_, j) => (
//                     <div key={j} className="h-8 w-full bg-gray-100 rounded"></div>
//                  ))}
//               </div>
//               <div className="w-[100px] h-8 bg-gray-200 rounded"></div>
//             </div>
//           ))}
          
//           {/* Footer Row */}
//           <div className="bg-indigo-50 border-t-2 border-indigo-100 p-4 flex justify-center items-center gap-4">
//              <div className="h-4 w-48 bg-gray-300 rounded"></div>
//              <div className="h-8 w-24 bg-white rounded border border-gray-200"></div>
//           </div>
//         </div>
//       </div>
      
//       {/* Footer Actions Skeleton */}
//       <div className="mt-2 flex justify-end">
//          <div className="h-3 w-32 bg-gray-200 rounded"></div>
//       </div>
//     </div>
//   );
// };

// // --- Main Component ---
// const ReproducibilitySection: React.FC<ReproducibilitySectionProps> = ({ jobId, torqueUnit }) => {
//   // --- STATE ---
//   const [loading, setLoading] = useState(false); 
//   const [dataLoaded, setDataLoaded] = useState(false);
  
//   // Auto-Save Status
//   const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
//   const [lastSaved, setLastSaved] = useState<Date | null>(null);
//   const lastSavedPayload = useRef<string | null>(null);

//   // Table Data
//   const [tableData, setTableData] = useState<SequenceRowData[]>([
//     { sequence_no: 1, readings: Array(5).fill(""), mean_xr: null },
//     { sequence_no: 2, readings: Array(5).fill(""), mean_xr: null },
//     { sequence_no: 3, readings: Array(5).fill(""), mean_xr: null },
//     { sequence_no: 4, readings: Array(5).fill(""), mean_xr: null },
//   ]);

//   const [meta, setMeta] = useState({ 
//     set_torque: 0, 
//     b_rep: 0, 
//     unit: torqueUnit || "Nm" 
//   });

//   const sequenceLabels = ["I", "II", "III", "IV"];

//   // --- DEBOUNCE SETUP ---
//   const debouncedTableData = useDebounce(tableData, 1000);
//   const hasUserEdited = useRef(false);
  
//   // --- 1. INITIAL FETCH ---
//   useEffect(() => {
//     const init = async () => {
//       if (!jobId) return;
//       setLoading(true);

//       try {
//         const res = await api.get<ReproducibilityResponse>(ENDPOINTS.HTW_REPRODUCIBILITY.GET(jobId));
        
//         // Prepare default structure
//         let currentData = [
//           { sequence_no: 1, readings: Array(5).fill(""), mean_xr: null },
//           { sequence_no: 2, readings: Array(5).fill(""), mean_xr: null },
//           { sequence_no: 3, readings: Array(5).fill(""), mean_xr: null },
//           { sequence_no: 4, readings: Array(5).fill(""), mean_xr: null },
//         ] as SequenceRowData[];

//         // Extract Unit
//         const backendUnit = res.data.torque_unit || res.data.unit || res.data.pressure_unit || torqueUnit || "Nm";

//         if (res.data.status === "success" || res.data.status === "no_data") {
//             // Map sequences
//             if (res.data.sequences && res.data.sequences.length > 0) {
//                 currentData = currentData.map(def => {
//                     const found = res.data.sequences.find(s => s.sequence_no === def.sequence_no);
//                     return found ? {
//                         sequence_no: found.sequence_no,
//                         readings: found.readings.map(String),
//                         mean_xr: found.mean_xr
//                     } : def;
//                 });
//             }

//             setMeta({
//                 set_torque: res.data.set_torque_20,
//                 b_rep: res.data.error_due_to_reproducibility,
//                 unit: backendUnit
//             });
//         }

//         setTableData(currentData);

//         // Sync Reference to prevent immediate auto-save
//         const initialPayload = JSON.stringify({
//           job_id: jobId,
//           torque_unit: backendUnit,
//           sequences: currentData.map(s => ({
//             sequence_no: s.sequence_no,
//             readings: s.readings.map(r => (r === "" || isNaN(Number(r))) ? 0 : Number(r))
//           }))
//         });
//         lastSavedPayload.current = initialPayload;

//         // Reset edit flag because this is data from DB
//         hasUserEdited.current = false;
//         setDataLoaded(true);

//       } catch (err) {
//         console.error("Failed to fetch reproducibility", err);
//       } finally {
//         setLoading(false);
//       }
//     };

//     init();
//   }, [jobId, torqueUnit]);

//   // --- 2. AUTO-SAVE EFFECT ---
//   useEffect(() => {
//     // 1. Safety Checks
//     if (!dataLoaded) return;
    
//     // 2. Strict Guard: Stop save if user has not edited
//     if (!hasUserEdited.current) return;

//     const performAutoSave = async () => {
//       const payload = {
//         job_id: jobId,
//         torque_unit: meta.unit,
//         sequences: debouncedTableData.map(s => ({
//           sequence_no: s.sequence_no,
//           readings: s.readings.map(r => (r === "" || isNaN(Number(r)) ? 0 : Number(r)))
//         }))
//       };

//       const payloadString = JSON.stringify(payload);
      
//       // 3. Prevent Duplicate Saves
//       if (payloadString === lastSavedPayload.current) {
//         setSaveStatus("saved");
//         return;
//       }

//       setSaveStatus("saving");

//       try {
//         const res = await api.post<ReproducibilityResponse>(
//           "/htw-calculations/reproducibility/draft", 
//           payload
//         );

//         // Update meta with backend calculations
//         const backendUnit = res.data.torque_unit || res.data.unit || meta.unit;
//         setMeta({
//             set_torque: res.data.set_torque_20,
//             b_rep: res.data.error_due_to_reproducibility,
//             unit: backendUnit
//         });

//         // Update Reference
//         lastSavedPayload.current = payloadString;
//         setSaveStatus("saved");
//         setLastSaved(new Date());
//       } catch (err) {
//         console.error("Auto-save failed", err);
//         setSaveStatus("error");
//       }
//     };

//     performAutoSave();
//   }, [debouncedTableData, jobId, dataLoaded, meta.unit]);

//   // --- 3. HANDLERS ---
//   const handleReadingChange = (rowIdx: number, readIdx: number, value: string) => {
//     if (!/^\d*\.?\d*$/.test(value)) return;

//     hasUserEdited.current = true;
//     setSaveStatus("idle");

//     setTableData(prev => {
//       const newData = [...prev];
//       const row = { ...newData[rowIdx] };
//       row.readings = [...row.readings];
//       row.readings[readIdx] = value;

//       // Local Mean Calculation
//       const validNums = row.readings.filter(v => v !== "" && !isNaN(Number(v))).map(Number);
      
//       // Calculate mean if we have valid numbers (usually requires 5, but partial calc allows UI feedback)
//       row.mean_xr = validNums.length === 5
//           ? validNums.reduce((a, b) => a + b, 0) / 5
//           : null;

//       newData[rowIdx] = row;

//       // Local b_rep Calculation (Max Mean - Min Mean)
//       const allMeans = newData.map(s => s.mean_xr).filter((m): m is number => m !== null);
//       if (allMeans.length >= 2) {
//         const minMean = Math.min(...allMeans);
//         const maxMean = Math.max(...allMeans);
//         setMeta(m => ({ ...m, b_rep: maxMean - minMean }));
//       } else {
//         setMeta(m => ({ ...m, b_rep: 0 }));
//       }

//       return newData;
//     });
//   };

//   const handleClear = () => {
//     if (window.confirm("Clear all reproducibility readings?")) {
//       hasUserEdited.current = true;
//       setSaveStatus("idle");

//       setTableData(prev => prev.map(s => ({
//           ...s,
//           readings: Array(5).fill(""),
//           mean_xr: null
//         }))
//       );
//       setMeta(m => ({ ...m, b_rep: 0 }));
//     }
//   };

//   // --- STYLES ---
//   const thBase = "border border-gray-300 px-2 py-2 font-bold text-center align-middle bg-gray-100 text-gray-700 text-xs";
//   const thUnit = "border border-gray-300 px-1 py-1 font-bold text-center align-middle bg-blue-50 text-blue-800 text-[10px]";
//   const tdBase = "border border-gray-300 px-2 py-2 text-center align-middle text-gray-800 font-medium text-sm";
//   const inputCell = "border border-gray-300 p-0 h-9 w-[80px] md:w-auto relative";

//   // --- RENDER ---
//   if (loading && !dataLoaded) {
//     return <ReproducibilitySkeleton />;
//   }

//   return (
//     <>
//     {/* Removed 'animate-in fade-in' to prevent movement */}
//     <div className="flex flex-col w-full bg-white border border-gray-200 rounded-xl shadow-sm p-4 mt-6">
      
//       {/* HEADER */}
//       <div className="mb-4 flex justify-between items-center">
//         <h2 className="text-sm font-bold text-black uppercase tracking-tight border-l-4 border-orange-500 pl-2">
//             B. Reproducibility
//         </h2>
        
//         {/* Status Indicator */}
//         <div className="flex items-center gap-2 text-xs font-medium">
//             {saveStatus === "saving" && (
//                 <span className="text-blue-600 flex items-center gap-1">
//                     <Loader2 className="h-3 w-3 animate-spin" /> Saving...
//                 </span>
//             )}
//             {saveStatus === "saved" && (
//                 <span className="text-green-600 flex items-center gap-1 transition-opacity duration-1000">
//                     <CheckCircle2 className="h-3 w-3" /> Saved 
//                     <span className="text-gray-400 text-[10px] ml-1">
//                         {lastSaved?.toLocaleTimeString()}
//                     </span>
//                 </span>
//             )}
//             {saveStatus === "error" && (
//                 <span className="text-red-600 flex items-center gap-1">
//                     <AlertCircle className="h-3 w-3" /> Save Failed
//                 </span>
//             )}
//             {saveStatus === "idle" && (
//                 <span className="text-gray-400 flex items-center gap-1">
//                     <Cloud className="h-3 w-3" /> Up to date
//                 </span>
//             )}
//         </div>
//       </div>

//       {/* TABLE */}
//       <div className="overflow-x-auto rounded-lg border border-gray-300">
//         <table className="w-full min-w-[700px] border-collapse">
//           <thead>
//             <tr>
//               <th rowSpan={2} className={`${thBase} w-[100px]`}>Set Torque</th>
//               <th rowSpan={2} className={`${thBase} w-[50px]`}>Seq</th>
//               <th colSpan={5} className={thBase}>Indicated Readings</th>
//               <th rowSpan={2} className={`${thBase} w-[100px]`}>Mean X̄r</th>
//             </tr>
//             <tr>
//                {/* Reading Headers 1-5 */}
//                {[1, 2, 3, 4, 5].map(num => (
//                  <th key={num} className={thBase}>{num}</th>
//                ))}
//             </tr>
//             {/* Unit Row */}
//             <tr className="border-b border-gray-300">
//               <th className={thUnit}>{meta.unit}</th>
//               <th className={thUnit}>-</th>
//               {[1, 2, 3, 4, 5].map(num => (
//                  <th key={num} className={thUnit}>{meta.unit}</th>
//                ))}
//               <th className={thUnit}>{meta.unit}</th>
//             </tr>
//           </thead>
//           <tbody>
//             {tableData.map((row, rowIdx) => (
//               <tr key={row.sequence_no} className="hover:bg-gray-50 transition-colors">
                
//                 {/* SET TORQUE (Merged Cell - Dynamic RowSpan) */}
//                 {rowIdx === 0 && (
//                   <td rowSpan={tableData.length} className={`${tdBase} bg-gray-50 font-bold text-lg text-gray-700 border-r border-gray-300`}>
//                     {meta.set_torque || "-"}
//                   </td>
//                 )}

//                 {/* SEQUENCE LABEL */}
//                 <td className={`${tdBase} bg-gray-100 font-bold text-xs`}>
//                     {sequenceLabels[rowIdx]}
//                 </td>

//                 {/* READINGS INPUTS */}
//                 {row.readings.map((reading, readIdx) => (
//                     <td key={readIdx} className={inputCell}>
//                         <input
//                             type="text"
//                             value={reading}
//                             onChange={(e) => handleReadingChange(rowIdx, readIdx, e.target.value)}
//                             className="w-full h-full text-center text-xs font-medium focus:outline-none bg-white text-black hover:bg-gray-50 focus:bg-blue-50 focus:text-blue-900 placeholder-gray-200"
//                             placeholder="-"
//                         />
//                     </td>
//                 ))}

//                 {/* ROW MEAN */}
//                 <td className={`${tdBase} font-bold bg-gray-50`}>
//                   {row.mean_xr !== null ? row.mean_xr.toFixed(2) : "-"}
//                 </td>
//               </tr>
//             ))}

            
//             <tr className="bg-indigo-50 border-t-2 border-indigo-200">
//               <td colSpan={2} className="sticky left-0 bg-indigo-50 z-10"></td>
//               <td colSpan={11} className="p-4 text-center">
//                 <div className="flex items-center justify-center gap-4 text-indigo-900">
//                   <span className="text-sm font-bold uppercase tracking-wide">Error due to Reproducibility (b<sub>rep</sub>):</span>
//                   <span className="text-2xl font-mono font-bold bg-white px-4 py-1 rounded border border-indigo-200 shadow-sm">{meta.b_rep.toFixed(2)}</span>
//                   <span className="text-xs font-bold opacity-70">{meta.unit}</span>
//                 </div>
//               </td>
//             </tr>
//           </tbody>
//         </table>
//       </div>

//       {/* FOOTER ACTIONS */}
//       <div className="flex justify-between items-center mt-3 h-8">
//          <div>
//             {tableData.some(s => s.readings.some(r => r !== "")) && (
//                  <button 
//                     onClick={handleClear}
//                     className="flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
//                 >
//                     <Trash2 className="h-3 w-3" /> Clear
//                 </button>
//             )}
//          </div>
//          <div className="text-[10px] text-gray-400 italic">
//             Changes save automatically
//          </div>
//       </div>
//     </div>
    
//     <div className="flex items-center justify-center gap-4 my-8 opacity-50">
//         <div className="h-px bg-gray-300 flex-1"></div>
//         <div className="text-[10px] text-gray-400 font-medium uppercase tracking-widest">End of Section B</div>
//         <div className="h-px bg-gray-300 flex-1"></div>
//     </div>
//     </>
//   );
// };

// export default ReproducibilitySection;
// src/components/ReproducibilitySection.tsx
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
interface ReproducibilitySectionProps {
  jobId: number;
  torqueUnit?: string;
}

interface SequenceRowData {
  sequence_no: number;
  readings: string[]; // 5 readings per row
  mean_xr: number | null;
}

interface ReproducibilityResponse {
  job_id: number;
  status: string;
  set_torque_20: number;
  error_due_to_reproducibility: number; // b_rep
  torque_unit?: string;
  unit?: string;
  pressure_unit?: string;
  sequences: {
    sequence_no: number;
    readings: number[];
    mean_xr: number;
  }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const SEQUENCE_COUNT = 4;

const buildDefaultRows = (): SequenceRowData[] =>
  Array.from({ length: SEQUENCE_COUNT }, (_, i) => ({
    sequence_no: i + 1,
    readings: Array(5).fill(""),
    mean_xr: null,
  }));

const calcMean5 = (readings: string[]): number | null => {
  const nums = readings
    .filter((v) => v !== "" && !isNaN(Number(v)))
    .map(Number);
  return nums.length === 5 ? nums.reduce((a, b) => a + b, 0) / 5 : null;
};

const calcBRep = (rows: SequenceRowData[]): number => {
  const means = rows
    .map((r) => r.mean_xr)
    .filter((m): m is number => m !== null);
  if (means.length < 2) return 0;
  return Math.max(...means) - Math.min(...means);
};

const SEQUENCE_LABELS = ["I", "II", "III", "IV"];

// ─────────────────────────────────────────────────────────────────────────────
// SKELETON
// ─────────────────────────────────────────────────────────────────────────────
const ReproducibilitySkeleton: React.FC = () => (
  <div className="flex flex-col w-full bg-white border border-gray-200 rounded-xl shadow-sm p-4 mt-6 animate-pulse">
    <div className="mb-4 flex justify-between items-center">
      <div className="h-6 w-1/3 bg-gray-200 rounded" />
      <div className="h-4 w-20 bg-gray-200 rounded" />
    </div>
    <div className="overflow-x-auto rounded-lg border border-gray-300">
      <div className="w-full min-w-[700px]">
        <div className="flex bg-gray-100 border-b border-gray-300 p-2">
          <div className="w-[100px] h-4 bg-gray-300 rounded mr-2" />
          <div className="w-[50px] h-4 bg-gray-300 rounded mr-2" />
          <div className="flex-1 h-4 bg-gray-200 rounded mr-2" />
          <div className="w-[100px] h-4 bg-gray-300 rounded" />
        </div>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex border-b border-gray-100 p-2 items-center"
          >
            <div className="w-[100px] h-8 bg-gray-200 rounded mr-2" />
            <div className="w-[50px] h-6 bg-gray-200 rounded mr-2" />
            <div className="flex-1 flex gap-2 mr-2">
              {[...Array(5)].map((_, j) => (
                <div key={j} className="h-8 w-full bg-gray-100 rounded" />
              ))}
            </div>
            <div className="w-[100px] h-8 bg-gray-200 rounded" />
          </div>
        ))}
        <div className="bg-indigo-50 border-t-2 border-indigo-100 p-4 flex justify-center items-center gap-4">
          <div className="h-4 w-48 bg-gray-300 rounded" />
          <div className="h-8 w-24 bg-white rounded border border-gray-200" />
        </div>
      </div>
    </div>
    <div className="mt-2 flex justify-end">
      <div className="h-3 w-32 bg-gray-200 rounded" />
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT — forwardRef for CalBot
// ─────────────────────────────────────────────────────────────────────────────
const ReproducibilitySection = forwardRef<
  SectionBotHandle,
  ReproducibilitySectionProps
>(({ jobId, torqueUnit }, ref) => {
  // ── State ──────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [tableData, setTableData] = useState<SequenceRowData[]>(
    buildDefaultRows()
  );
  const [meta, setMeta] = useState({
    set_torque: 0,
    b_rep: 0,
    unit: torqueUnit || "Nm",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isFormInvalid = useMemo(() => Object.keys(errors).length > 0, [errors]);

  const lastSavedPayload = useRef<string | null>(null);
  const hasUserEdited = useRef(false);
  const debouncedTableData = useDebounce(tableData, 1000);

  // ── Validation Logic ───────────────────────────────────────────────────────
  const MAX_INPUT_VALUE = 99999;
  const validateInput = (value: string): string | null => {
    if (value.trim() === "") {
      return "Value cannot be empty.";
    }
    if (value.endsWith(".")) {
      return "Invalid number.";
    }
    const num = Number(value);
    if (isNaN(num) || !isFinite(num)) {
      return "Invalid numeric value.";
    }
    if (num > MAX_INPUT_VALUE) {
      return `Value cannot be greater than ${MAX_INPUT_VALUE}.`;
    }
    return null;
  };

  useEffect(() => {
    const newErrors: Record<string, string> = {};
    if (dataLoaded) {
      tableData.forEach((row, rowIndex) => {
        const hasAnyInputInRow = row.readings.some((r) => r.trim() !== "");

        row.readings.forEach((reading, rIndex) => {
          const error = validateInput(reading);

          // An actual data error (format, range) is always an error to display.
          if (error && error !== "Value cannot be empty.") {
            newErrors[`${rowIndex}-${rIndex}`] = error;
          }
          // An empty cell is only an error if other cells in the same row have been filled.
          else if (hasAnyInputInRow && reading.trim() === "") {
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
    setMeta((m) => ({ ...m, b_rep: 0 }));
  };

  // ── Bot Handle ─────────────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    getRows: () =>
      tableData.map((row, rowIndex) => ({
        set_torque: meta.set_torque,
        readingCount: 5,
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
          row.readings = Array.from(
            { length: 5 },
            (_, i) => readings[i] ?? ""
          );
          row.mean_xr = calcMean5(row.readings);
          next[rowIndex] = row;
        });
        setMeta((m) => ({ ...m, b_rep: calcBRep(next) }));
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
        const res = await api.get<ReproducibilityResponse>(
          ENDPOINTS.HTW_REPRODUCIBILITY.GET(jobId)
        );

        let currentData = buildDefaultRows();

        const backendUnit =
          res.data.torque_unit ||
          res.data.unit ||
          res.data.pressure_unit ||
          torqueUnit ||
          "Nm";

        if (
          res.data.status === "success" ||
          res.data.status === "no_data"
        ) {
          if (res.data.sequences && res.data.sequences.length > 0) {
            currentData = currentData.map((def) => {
              const found = res.data.sequences.find(
                (s) => s.sequence_no === def.sequence_no
              );
              return found
                ? {
                    sequence_no: found.sequence_no,
                    readings: found.readings.map(v => String(v) === "0" ? "" : String(v)),
                    mean_xr: found.mean_xr,
                  }
                : def;
            });
          }

          setMeta({
            set_torque: res.data.set_torque_20,
            b_rep: res.data.error_due_to_reproducibility,
            unit: backendUnit,
          });
        }

        setTableData(currentData);
        lastSavedPayload.current = JSON.stringify({
          job_id: jobId,
          torque_unit: backendUnit,
          sequences: currentData.map((s) => ({
            sequence_no: s.sequence_no,
            readings: s.readings.map((r) =>
              r === "" || isNaN(Number(r)) ? 0 : Number(r)
            ),
          })),
        });

        hasUserEdited.current = false;
        setDataLoaded(true);
      } catch (err) {
        console.error("Reproducibility fetch failed:", err);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [jobId, torqueUnit]);

  // ── 2. Auto-Save ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!dataLoaded || !hasUserEdited.current || isFormInvalid) {
      setSaveStatus("idle");
      return;
    }

    const performAutoSave = async () => {
      const payload = {
        job_id: jobId,
        torque_unit: meta.unit,
        sequences: debouncedTableData.map((s) => ({
          sequence_no: s.sequence_no,
          readings: s.readings.map((r) =>
            r === "" || isNaN(Number(r)) ? 0 : Number(r)
          ),
        })),
      };

      const payloadString = JSON.stringify(payload);
      if (payloadString === lastSavedPayload.current) {
        setSaveStatus("saved");
        return;
      }

      setSaveStatus("saving");

      try {
        const res = await api.post<ReproducibilityResponse>(
          "/htw-calculations/reproducibility/draft",
          payload
        );

        const backendUnit =
          res.data.torque_unit || res.data.unit || meta.unit;

        setMeta({
          set_torque: res.data.set_torque_20,
          b_rep: res.data.error_due_to_reproducibility,
          unit: backendUnit,
        });

        lastSavedPayload.current = payloadString;
        setSaveStatus("saved");
      } catch (err) {
        console.error("Reproducibility auto-save failed:", err);
        setSaveStatus("error");
      }
    };

    performAutoSave();
  }, [debouncedTableData, jobId, dataLoaded, meta.unit, isFormInvalid]);

  // ── 3. Handlers ────────────────────────────────────────────────────────────
  const handleReadingChange = (
    rowIdx: number,
    readIdx: number,
    value: string
  ) => {
    if (value !== "" && !/^\d*\.?\d*$/.test(value)) return;

    hasUserEdited.current = true;
    setSaveStatus("idle");

    setTableData((prev) => {
      const next = [...prev];
      const row = { ...next[rowIdx] };
      row.readings = [...row.readings];
      row.readings[readIdx] = value;
      row.mean_xr = calcMean5(row.readings);
      next[rowIdx] = row;

      setMeta((m) => ({ ...m, b_rep: calcBRep(next) }));
      return next;
    });
  };

  const handleClearClick = () => {
    if (!window.confirm("Clear all reproducibility readings?")) return;
    clearAllReadings();
  };

  // ── Style helpers ──────────────────────────────────────────────────────────
  const thBase =
    "border border-gray-300 px-2 py-2 font-bold text-center align-middle bg-gray-100 text-gray-700 text-xs";
  const thUnit =
    "border border-gray-300 px-1 py-1 font-bold text-center align-middle bg-blue-50 text-blue-800 text-[10px]";
  const tdBase =
    "border border-gray-300 px-2 py-2 text-center align-middle text-gray-800 font-medium text-sm";
  const inputCell =
    "border border-gray-300 p-0 h-9 w-[80px] md:w-auto relative";

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading && !dataLoaded) return <ReproducibilitySkeleton />;

  return (
    <>
      <div className="flex flex-col w-full bg-white border border-gray-200 rounded-xl shadow-sm p-4 mt-6">
        {/* Header */}
        <div className="mb-4 flex justify-between items-center">
          <h2 className="text-sm font-bold text-black uppercase tracking-tight border-l-4 border-orange-500 pl-2">
            B. Reproducibility
          </h2>

          <div className="flex items-center gap-2 text-xs font-medium min-w-[80px] justify-end">
            {saveStatus === "saving" && (
              <span className="text-blue-600 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving...
              </span>
            )}
            {saveStatus === "saved" && !isFormInvalid && (
              <span className="text-green-600 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Saved
              </span>
            )}
            {saveStatus === "error" && (
              <span className="text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Error
              </span>
            )}
            {(saveStatus === "idle" || (saveStatus === "saved" && isFormInvalid)) && (
              <span className="text-gray-400 flex items-center gap-1">
                <Cloud className="h-3 w-3" /> Synced
              </span>
            )}
          </div>
        </div>

        {isFormInvalid && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-3 text-sm text-yellow-800">
            <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
            <span>
              Some fields are incomplete or have errors. Please review the
              highlighted cells.
            </span>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-gray-300">
          <table className="w-full min-w-[700px] border-collapse">
            <thead>
              <tr>
                <th rowSpan={2} className={`${thBase} w-[100px]`}>
                  Set Torque
                </th>
                <th rowSpan={2} className={`${thBase} w-[50px]`}>
                  Seq
                </th>
                <th colSpan={5} className={thBase}>
                  Indicated Readings
                </th>
                <th rowSpan={2} className={`${thBase} w-[100px]`}>
                  Mean X̄r
                </th>
              </tr>
              <tr>
                {[1, 2, 3, 4, 5].map((num) => (
                  <th key={num} className={thBase}>
                    {num}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-gray-300">
                <th className={thUnit}>{meta.unit}</th>
                <th className={thUnit}>-</th>
                {[1, 2, 3, 4, 5].map((num) => (
                  <th key={num} className={thUnit}>
                    {meta.unit}
                  </th>
                ))}
                <th className={thUnit}>{meta.unit}</th>
              </tr>
            </thead>
            <tbody>
              {tableData.map((row, rowIdx) => (
                <tr
                  key={row.sequence_no}
                  className="hover:bg-gray-50 transition-colors"
                >
                  {rowIdx === 0 && (
                    <td
                      rowSpan={tableData.length}
                      className={`${tdBase} bg-gray-50 font-bold text-lg text-gray-700 border-r border-gray-300`}
                    >
                      {meta.set_torque || "-"}
                    </td>
                  )}

                  <td className={`${tdBase} bg-gray-100 font-bold text-xs`}>
                    {SEQUENCE_LABELS[rowIdx]}
                  </td>

                  {row.readings.map((reading, readIdx) => (
                    <td key={readIdx} className={inputCell}>
                      <input
                        type="text"
                        value={reading}
                        onChange={(e) =>
                          handleReadingChange(rowIdx, readIdx, e.target.value)
                        }
                        className={`w-full h-full text-center text-xs font-medium focus:outline-none bg-white text-black hover:bg-gray-50 focus:bg-blue-50 focus:text-blue-900 placeholder-gray-400 ${
                          errors[`${rowIdx}-${readIdx}`]
                            ? "ring-2 ring-inset ring-red-500"
                            : "focus:ring-2 focus:ring-inset focus:ring-blue-400"
                        }`}
                        placeholder="-"
                      />
                    </td>
                  ))}

                  <td className={`${tdBase} font-bold bg-gray-50`}>
                    {row.mean_xr !== null ? row.mean_xr.toFixed(2) : "-"}
                  </td>
                </tr>
              ))}

              <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                <td
                  colSpan={2}
                  className="sticky left-0 bg-indigo-50 z-10"
                />
                <td colSpan={11} className="p-4 text-center">
                  <div className="flex items-center justify-center gap-4 text-indigo-900">
                    <span className="text-sm font-bold uppercase tracking-wide">
                      Error due to Reproducibility (b<sub>rep</sub>):
                    </span>
                    <span className="text-2xl font-mono font-bold bg-white px-4 py-1 rounded border border-indigo-200 shadow-sm">
                      {meta.b_rep.toFixed(2)}
                    </span>
                    <span className="text-xs font-bold opacity-70">
                      {meta.unit}
                    </span>
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
            <Trash2 className="w-3.5 h-3.5" />
            Clear All
          </button>
          <div className="text-[10px] text-gray-400 italic text-right">
            Changes save automatically
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 my-8 opacity-50">
        <div className="h-px bg-gray-300 flex-1" />
        <div className="text-[10px] text-gray-400 font-medium uppercase tracking-widest">
          End of Section B
        </div>
        <div className="h-px bg-gray-300 flex-1" />
      </div>
    </>
  );
});

ReproducibilitySection.displayName = "ReproducibilitySection";
export default ReproducibilitySection;
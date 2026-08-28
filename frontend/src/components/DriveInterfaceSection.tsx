// import React, { useState, useEffect, useRef } from "react";
// import { api, ENDPOINTS } from "../api/config";
// import { Loader2, CheckCircle2, AlertCircle, Cloud, Trash2 } from "lucide-react";
// import useDebounce from "../hooks/useDebounce"; 

// interface DriveInterfaceSectionProps {
//   jobId: number;
// }

// interface GeometricRowData {
//   position_deg: number;
//   readings: string[]; // 10 readings per row
//   mean_value: number | null;
// }

// interface DriveInterfaceResponse {
//   job_id: number;
//   status: string;
//   set_torque: number;
//   error_value: number; // b_int
//   torque_unit: string;
//   positions: {
//     position_deg: number;
//     readings: number[];
//     mean_value: number;
//   }[];
// }

// // --- Skeleton Component ---
// const DriveInterfaceSkeleton: React.FC = () => {
//   return (
//     <div className="flex flex-col w-full bg-white border border-gray-200 rounded-xl shadow-sm p-4 mt-6 animate-pulse">
//       {/* Header Skeleton */}
//       <div className="mb-4 flex justify-between items-center">
//         <div className="h-6 w-1/3 bg-gray-200 rounded"></div>
//         <div className="h-4 w-20 bg-gray-200 rounded"></div>
//       </div>

//       {/* Table Skeleton */}
//       <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-inner">
//         <div className="w-full min-w-[1100px]">
//           {/* Table Head */}
//           <div className="flex bg-gray-100 border-b border-gray-300 p-2">
//             <div className="w-[100px] h-4 bg-gray-300 rounded mr-2"></div>
//             <div className="w-[80px] h-4 bg-gray-300 rounded mr-2"></div>
//             <div className="flex-1 h-4 bg-gray-200 rounded mr-2"></div>
//             <div className="w-[100px] h-4 bg-gray-300 rounded"></div>
//           </div>
          
//           {/* Table Body - 4 Rows */}
//           {[1, 2, 3, 4].map((i) => (
//             <div key={i} className="flex border-b border-gray-100 p-2 items-center">
//               <div className="w-[100px] h-8 bg-gray-200 rounded mr-2"></div>
//               <div className="w-[80px] h-6 bg-gray-200 rounded mr-2"></div>
//               <div className="flex-1 flex gap-2 mr-2">
//                  {[...Array(10)].map((_, j) => (
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
//       <div className="flex justify-between items-center mt-4">
//         <div className="h-8 w-20 bg-gray-200 rounded"></div>
//         <div className="h-3 w-32 bg-gray-200 rounded"></div>
//       </div>
//     </div>
//   );
// };

// // --- Main Component ---
// const DriveInterfaceSection: React.FC<DriveInterfaceSectionProps> = ({ jobId }) => {
//   // --- STATE ---
//   const [loading, setLoading] = useState(false);
//   const [dataLoaded, setDataLoaded] = useState(false); 
  
//   // Auto-Save Status
//   const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
//   const [lastSaved, setLastSaved] = useState<Date | null>(null);
  
//   // Ref to track the exact JSON string of the last successful save/fetch
//   const lastSavedPayload = useRef<string | null>(null);
  
//   // Ref to track if the user has actually typed anything
//   const hasUserEdited = useRef(false);

//   // Table data
//   const [tableData, setTableData] = useState<GeometricRowData[]>([
//     { position_deg: 0, readings: Array(10).fill(""), mean_value: null },
//     { position_deg: 90, readings: Array(10).fill(""), mean_value: null },
//     { position_deg: 180, readings: Array(10).fill(""), mean_value: null },
//     { position_deg: 270, readings: Array(10).fill(""), mean_value: null },
//   ]);

//   const [meta, setMeta] = useState({ set_torque: 0, error_value: 0, torque_unit: "-" });

//   // --- DEBOUNCE SETUP ---
//   // Wait 1 second after typing stops before updating `debouncedTableData`
//   const debouncedTableData = useDebounce(tableData, 1000);

//   // --- 1. INITIAL FETCH ---
//   useEffect(() => {
//     const fetchData = async () => {
//       if (!jobId) return;
//       setLoading(true);
//       try {
//         const res = await api.get<DriveInterfaceResponse>(`${ENDPOINTS.HTW_CALCULATIONS.DRIVE_INTERFACE}/${jobId}`);
        
//         let currentData = [
//           { position_deg: 0, readings: Array(10).fill(""), mean_value: null },
//           { position_deg: 90, readings: Array(10).fill(""), mean_value: null },
//           { position_deg: 180, readings: Array(10).fill(""), mean_value: null },
//           { position_deg: 270, readings: Array(10).fill(""), mean_value: null },
//         ] as GeometricRowData[];

//         if (res.data.status === "success" && res.data.positions.length > 0) {
//           const mappedData = res.data.positions.map(p => ({
//             position_deg: p.position_deg,
//             readings: p.readings.map(String),
//             mean_value: p.mean_value
//           }));

//           currentData = [0, 90, 180, 270].map(deg =>
//             mappedData.find(d => d.position_deg === deg) || { position_deg: deg, readings: Array(10).fill(""), mean_value: null }
//           );
//         }

//         // Update Meta (This gets the Set Torque dynamically from the backend logic we fixed)
//         setMeta({
//           set_torque: res.data.set_torque,
//           error_value: res.data.error_value,
//           torque_unit: res.data.torque_unit || "-"
//         });

//         setTableData(currentData);

//         // --- CRITICAL: SYNC REFERENCE TO PREVENT IMMEDIATE SAVE ---
//         const initialPayload = { 
//           job_id: jobId, 
//           positions: currentData.map(r => ({
//             position_deg: r.position_deg,
//             readings: r.readings.map(v => (v === "" || isNaN(Number(v))) ? 0 : Number(v))
//           }))
//         };
//         lastSavedPayload.current = JSON.stringify(initialPayload);
        
//         // Reset the edit flag because this is data from DB, not user
//         hasUserEdited.current = false;
        
//         setDataLoaded(true);

//       } catch (err) {
//         console.error("Fetch Error:", err);
//       } finally {
//         setLoading(false);
//       }
//     };
//     fetchData();
//   }, [jobId]);

//   // --- 2. AUTO-SAVE EFFECT ---
//   useEffect(() => {
//     // 1. Safety Checks
//     if (!dataLoaded) return;
    
//     // *** CRITICAL FIX: STOP SAVE IF USER HAS NOT EDITED ***
//     // This prevents the component from saving "zeros" just because it mounted.
//     if (!hasUserEdited.current) return;

//     const performAutoSave = async () => {
//       // 2. Construct Payload (Convert "" to 0)
//       const payload = { 
//         job_id: jobId, 
//         positions: debouncedTableData.map(r => ({
//           position_deg: r.position_deg,
//           readings: r.readings.map(v => (v === "" || isNaN(Number(v))) ? 0 : Number(v))
//         }))
//       };

//       // 3. Prevent Duplicate Saves (Check if data actually changed from last DB state)
//       const payloadString = JSON.stringify(payload);
//       if (payloadString === lastSavedPayload.current) {
//         return; 
//       }

//       setSaveStatus("saving");

//       try {
//         // --- CALL DRAFT ENDPOINT ---
//         const res = await api.post<DriveInterfaceResponse>(
//           "/htw-calculations/drive-interface/draft", 
//           payload
//         );

//         // 4. Update Meta (Backend Calculations like b_int)
//         setMeta({
//           set_torque: res.data.set_torque,
//           error_value: res.data.error_value,
//           torque_unit: res.data.torque_unit || "-"
//         });

//         // 5. Update Reference
//         lastSavedPayload.current = payloadString;
//         setSaveStatus("saved");
//         setLastSaved(new Date());
        
//         // Note: We do NOT reset hasUserEdited here. 
//         // We keep it true so subsequent edits continue to save.
//       } catch (err) {
//         console.error("Auto-save failed", err);
//         setSaveStatus("error");
//       }
//     };

//     performAutoSave();
//   }, [debouncedTableData, jobId, dataLoaded]);

//   // --- 3. HANDLERS ---
//   const handleReadingChange = (rowIdx: number, readIdx: number, val: string) => {
//     // Only allow numbers and decimal
//     if (!/^\d*\.?\d*$/.test(val)) return;
    
//     // FLAG THE EDIT
//     hasUserEdited.current = true;
    
//     setSaveStatus("idle");

//     setTableData(prev => {
//       const newData = [...prev];
//       const row = { ...newData[rowIdx] };
//       row.readings = [...row.readings];
//       row.readings[readIdx] = val;

//       // Instant UI Mean Calculation (for responsiveness)
//       const nums = row.readings.filter(r => r !== "" && !isNaN(Number(r))).map(Number);
//       row.mean_value = nums.length === 10 ? nums.reduce((a, b) => a + b, 0) / 10 : null;

//       newData[rowIdx] = row;

//       // Instant UI Error (b_int) Calculation
//       const means = newData.map(r => r.mean_value).filter((m): m is number => m !== null);
//       if (means.length === 4) {
//         // Simple client-side calc while waiting for backend
//         setMeta(m => ({ ...m, error_value: Math.max(...means) - Math.min(...means) }));
//       }

//       return newData;
//     });
//   };

//   const handleClear = () => {
//     if (window.confirm("Clear all readings?")) {
//       hasUserEdited.current = true; // Clearing is an edit
//       setSaveStatus("idle");
//       setTableData(prev => prev.map(r => ({ ...r, readings: Array(10).fill(""), mean_value: null })));
//       setMeta(m => ({ ...m, error_value: 0 }));
//     }
//   };

//   if (loading) return <DriveInterfaceSkeleton />;

//   return (
//     <div className="flex flex-col w-full animate-in fade-in duration-500 bg-white border border-gray-200 rounded-xl shadow-sm p-4 mt-6">
//       {/* Header */}
//       <div className="mb-4 flex justify-between items-center">
//         <h2 className="text-sm font-bold text-black uppercase tracking-tight border-l-4 border-indigo-500 pl-2">
//           D. Variation due to geometric effect of the drive interface (b<sub>int</sub>)
//         </h2>

//         {/* Status */}
//         <div className="flex items-center gap-2 text-xs font-medium">
//           {saveStatus === "saving" && (
//             <span className="text-blue-600 flex items-center gap-1">
//               <Loader2 className="h-3 w-3 animate-spin" /> Saving...
//             </span>
//           )}
//           {saveStatus === "saved" && (
//             <span className="text-green-600 flex items-center gap-1 transition-opacity duration-1000">
//               <CheckCircle2 className="h-3 w-3" /> Saved 
//               <span className="text-gray-400 text-[10px] ml-1">{lastSaved?.toLocaleTimeString()}</span>
//             </span>
//           )}
//           {saveStatus === "error" && (
//             <span className="text-red-600 flex items-center gap-1">
//               <AlertCircle className="h-3 w-3" /> Save Failed
//             </span>
//           )}
//           {saveStatus === "idle" && (
//             <span className="text-gray-400 flex items-center gap-1">
//               <Cloud className="h-3 w-3" /> Up to date
//             </span>
//           )}
//         </div>
//       </div>

//       {/* Table */}
//       <div className="overflow-x-auto rounded-lg border border-gray-400 shadow-inner">
//         <table className="w-full min-w-[1100px] border-collapse">
//           <thead>
//             <tr className="bg-gray-100 text-[11px] font-bold text-gray-800 border-b border-gray-400 text-center">
//               <th className="border-r border-gray-400 p-2 w-[100px] sticky left-0 bg-gray-100 z-10 shadow-sm">Set Torque<br/>({meta.torque_unit})</th>
//               <th className="border-r border-gray-400 p-2 w-[80px] sticky left-[100px] bg-gray-100 z-10 shadow-sm">Position</th>
//               <th colSpan={10} className="border-r border-gray-400 p-2 bg-green-50 text-green-900">Indicated Readings 1-10 ({meta.torque_unit})</th>
//               <th className="p-2 w-[100px] bg-yellow-50 text-yellow-900">Mean Value</th>
//             </tr>
//           </thead>
//           <tbody>
//             {tableData.map((row, index) => (
//               <tr key={row.position_deg} className="border-b border-gray-300 hover:bg-gray-50">
//                 {index === 0 && (
//                   <td rowSpan={4} className="border-r border-gray-400 p-2 font-bold text-center text-gray-900 bg-white align-middle text-lg sticky left-0 z-10 shadow-sm">
//                     {meta.set_torque}
//                   </td>
//                 )}
//                 <td className={`border-r border-gray-400 p-2 font-bold text-center text-gray-700 bg-gray-50 text-xs sticky left-[100px] z-10 shadow-sm`}>
//                   {row.position_deg}°
//                 </td>
//                 {row.readings.map((val, cIdx) => (
//                   <td key={cIdx} className="border-r border-gray-200 p-0 w-[60px] relative min-w-[60px]">
//                     <input 
//                       type="text"
//                       value={val}
//                       onChange={e => handleReadingChange(index, cIdx, e.target.value)}
//                       className="w-full h-full p-2 text-center text-xs font-medium focus:outline-none bg-transparent text-gray-800 focus:bg-blue-50 focus:ring-2 focus:ring-blue-400 inset-0"
//                       placeholder="-"
//                     />
//                   </td>
//                 ))}
//                 <td className="border-l border-gray-400 p-2 font-bold text-center text-gray-900 bg-yellow-50 text-sm min-w-[80px]">
//                   {row.mean_value !== null ? row.mean_value.toFixed(2) : "-"}
//                 </td>
//               </tr>
//             ))}

//             {/* Footer Row for b_int */}
//             <tr className="bg-indigo-50 border-t-2 border-indigo-200">
//               <td colSpan={2} className="sticky left-0 bg-indigo-50 z-10"></td>
//               <td colSpan={11} className="p-4 text-center">
//                 <div className="flex items-center justify-center gap-4 text-indigo-900">
//                   <span className="text-sm font-bold uppercase tracking-wide">Error due to drive interface (b<sub>int</sub>):</span>
//                   <span className="text-2xl font-mono font-bold bg-white px-4 py-1 rounded border border-indigo-200 shadow-sm">{meta.error_value.toFixed(2)}</span>
//                   <span className="text-xs font-bold opacity-70">{meta.torque_unit}</span>
//                 </div>
//               </td>
//             </tr>
//           </tbody>
//         </table>
//       </div>

//       {/* Footer Actions */}
//       <div className="flex justify-between items-center mt-4">
//         <div className="flex gap-2">
//           {tableData.some(r => r.readings.some(v => v !== "")) && (
//             <button onClick={handleClear} className="px-3 py-1.5 text-xs text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 rounded-md flex gap-2 items-center">
//               <Trash2 className="h-3 w-3"/> Clear
//             </button>
//           )}
//         </div>
//         <div className="text-[10px] text-gray-400 italic">Changes save automatically</div>
//       </div>
//     </div>
//   );
// };

// export default DriveInterfaceSection;

// src/components/DriveInterfaceSection.tsx
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
interface DriveInterfaceSectionProps {
  jobId: number;
}

interface GeometricRowData {
  position_deg: number;
  readings: string[]; // 10 readings per row
  mean_value: number | null;
}

interface DriveInterfaceResponse {
  job_id: number;
  status: string;
  set_torque: number;
  error_value: number; // b_int
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

const calcBInt = (rows: GeometricRowData[]): number => {
  const means = rows
    .map((r) => r.mean_value)
    .filter((m): m is number => m !== null);
  return means.length === 4 ? Math.max(...means) - Math.min(...means) : 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// SKELETON
// ─────────────────────────────────────────────────────────────────────────────
const DriveInterfaceSkeleton: React.FC = () => (
  <div className="flex flex-col w-full bg-white border border-gray-200 rounded-xl shadow-sm p-4 mt-6 animate-pulse">
    <div className="mb-4 flex justify-between items-center">
      <div className="h-6 w-1/3 bg-gray-200 rounded" />
      <div className="h-4 w-20 bg-gray-200 rounded" />
    </div>
    <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-inner">
      <div className="w-full min-w-[1100px]">
        <div className="flex bg-gray-100 border-b border-gray-300 p-2">
          <div className="w-[100px] h-4 bg-gray-300 rounded mr-2" />
          <div className="w-[80px] h-4 bg-gray-300 rounded mr-2" />
          <div className="flex-1 h-4 bg-gray-200 rounded mr-2" />
          <div className="w-[100px] h-4 bg-gray-300 rounded" />
        </div>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex border-b border-gray-100 p-2 items-center"
          >
            <div className="w-[100px] h-8 bg-gray-200 rounded mr-2" />
            <div className="w-[80px] h-6 bg-gray-200 rounded mr-2" />
            <div className="flex-1 flex gap-2 mr-2">
              {[...Array(10)].map((_, j) => (
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
    <div className="flex justify-between items-center mt-4">
      <div className="h-8 w-20 bg-gray-200 rounded" />
      <div className="h-3 w-32 bg-gray-200 rounded" />
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT — forwardRef for CalBot
// ─────────────────────────────────────────────────────────────────────────────
const DriveInterfaceSection = forwardRef<
  SectionBotHandle,
  DriveInterfaceSectionProps
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

  const debouncedTableData = useDebounce(tableData, 1000);

  // ── Validation Logic ───────────────────────────────────────────────────────
  const MAX_INPUT_VALUE = 99999;
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
        setMeta((m) => ({ ...m, error_value: calcBInt(next) }));
        return next;
      });
    },
    
    clearReadings: clearAllReadings,
  }));

  // ── 1. Initial Fetch ───────────────────────────────────────────────────────
  useEffect(() => {
    const fetchData = async () => {
      if (!jobId) return;
      setLoading(true);
      try {
        const res = await api.get<DriveInterfaceResponse>(`${ENDPOINTS.HTW_CALCULATIONS.DRIVE_INTERFACE}/${jobId}`);
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
        }
        setMeta({
          set_torque: res.data.set_torque,
          error_value: res.data.error_value,
          torque_unit: res.data.torque_unit || "-",
        });
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
        console.error("DriveInterface fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
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
        positions: debouncedTableData.map((r) => ({
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
        const res = await api.post<DriveInterfaceResponse>("/htw-calculations/drive-interface/draft", payload);
        setMeta({
          set_torque: res.data.set_torque,
          error_value: res.data.error_value,
          torque_unit: res.data.torque_unit || "-",
        });
        lastSavedPayload.current = payloadString;
        setSaveStatus("saved");
      } catch (err) {
        console.error("DriveInterface auto-save failed:", err);
        setSaveStatus("error");
      }
    };
    performAutoSave();
  }, [debouncedTableData, jobId, dataLoaded, isFormInvalid]);

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
      setMeta((m) => ({ ...m, error_value: calcBInt(next) }));
      return next;
    });
  };

  const handleClearClick = () => {
    if (!window.confirm("Clear all readings?")) return;
    clearAllReadings();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return <DriveInterfaceSkeleton />;

  return (
    <div className="flex flex-col w-full animate-in fade-in duration-500 bg-white border border-gray-200 rounded-xl shadow-sm p-4 mt-6">
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-sm font-bold text-black uppercase tracking-tight border-l-4 border-indigo-500 pl-2">
          D. Variation due to geometric effect of the drive interface (b<sub>int</sub>)
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
                Indicated Readings 1-10 ({meta.torque_unit})
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
            <tr className="bg-indigo-50 border-t-2 border-indigo-200">
              <td colSpan={2} className="sticky left-0 bg-indigo-50 z-10" />
              <td colSpan={11} className="p-4 text-center">
                <div className="flex items-center justify-center gap-4 text-indigo-900">
                  <span className="text-sm font-bold uppercase tracking-wide">
                    Error due to drive interface (b<sub>int</sub>):
                  </span>
                  <span className="text-2xl font-mono font-bold bg-white px-4 py-1 rounded border border-indigo-200 shadow-sm">
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

DriveInterfaceSection.displayName = "DriveInterfaceSection";
export default DriveInterfaceSection;
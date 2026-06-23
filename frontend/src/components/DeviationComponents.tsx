import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ChevronLeft, ChevronRight, Loader2, Eye, Save, FileText,
  Paperclip, ExternalLink, EyeOff, Search, AlertTriangle,
  Activity
} from "lucide-react";
import { api, ENDPOINTS } from "../api/config";

// --- INTERFACES ---
export interface DeviationDetailResponse {
  deviation_id: number;
  inward_id?: number | null;
  inward_eqp_id: number;
  srf_no?: string | null;
  customer_dc_no?: string | null;
  customer_dc_date?: string | null;
  customer_details?: string | null;
  nepl_id?: string | null;
  make?: string | null;
  model?: string | null;
  serial_no?: string | null;
  job_id?: number | null;
  repeatability_id?: number | null;
  step_percent?: number | null;
  set_torque?: number | null;
  corrected_mean?: number | null;
  deviation_percent?: number | null;
  certificate_id?: number | null;
  status: string;
  calibration_status?: string | null;
  tool_status?: string | null;
  engineer_remarks?: string | null;
  customer_decision?: string | null;
  report?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  hide_customer_visibility?: boolean;
  deviation_type?: string | null;
  attachments: {
    id: number;
    file_name: string;
    file_type?: string | null;
    file_url: string;
    created_at: string;
  }[];
  oot_steps?: {
    step_percent?: number | null;
    set_torque?: number | null;
    corrected_mean?: number | null;
    deviation_percent?: number | null;
  }[];
}

// Represents the flat paginated record from the backend
export interface PaginatedDeviationItem {
  deviation_id: number;
  inward_eqp_id: number;
  nepl_id: string;
  srf_no: string;
  customer_name: string;
  deviation_type: string;
  report_date: string | null;
  hide_customer_visibility: boolean;
  status: string;
}

// --- HELPER FUNCTIONS ---
const formatCalibrationStatus = (value?: string | null) => {
  if (!value) return "Not Available";
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

const formatDcDate = (value?: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const ALL_STAFF_DEVIATIONS_ENDPOINT = "/deviations/all-staff";


// ============================================================
// LIGHTNING-FAST PAGINATED DEVIATION LIST PAGE
// ============================================================
export const DeviationPage: React.FC = () => {
  const navigate = useNavigate();

  // Tab State
  const [activeTab, setActiveTab] = useState<"OOT" | "MANUAL">("OOT");

  // Server-Side Data State
  const [items, setItems] = useState<PaginatedDeviationItem[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isFetchingData, setIsFetchingData] = useState(false);
  const [showLoaderOverlay, setShowLoaderOverlay] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination & Search State
  const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 1000];
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1); 
  const [limit, setLimit] = useState(100); // Default to 100

  // 1. Smooth Loading Overlay
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isFetchingData && !loading) {
      timer = setTimeout(() => setShowLoaderOverlay(true), 200);
    } else {
      setShowLoaderOverlay(false);
    }
    return () => clearTimeout(timer);
  }, [isFetchingData, loading]);

  // 2. Debounce Search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (debouncedSearch !== searchTerm) {
        setDebouncedSearch(searchTerm);
        setCurrentPage(1); // Reset page on new search
      }
    }, 400); 
    return () => clearTimeout(timer);
  }, [searchTerm, debouncedSearch]);

  // 3. Main Data Fetcher
  const fetchPageData = useCallback(async () => {
    setIsFetchingData(true);
    setError(null);

    try {
      const params = {
        skip: (currentPage - 1) * limit,
        limit: limit,
        search: debouncedSearch || undefined,
        deviation_type: activeTab
      };

      const res = await api.get<any>(ALL_STAFF_DEVIATIONS_ENDPOINT, { params });
      
      setItems(res.data.items || []);
      setTotalRecords(res.data.total || 0);

    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to load deviations.");
    } finally {
      setIsFetchingData(false);
      setLoading(false);
    }
  }, [currentPage, limit, debouncedSearch, activeTab]);

  // 4. Trigger Fetch
  useEffect(() => {
    fetchPageData();
  }, [fetchPageData]);

  // Server-Side Pagination Math
  const totalPages = Math.max(1, Math.ceil(totalRecords / limit));
  const startRecord = totalRecords === 0 ? 0 : ((currentPage - 1) * limit) + 1;
  const endRecord = Math.min(currentPage * limit, totalRecords);

  // Reusable Pagination Controls
  const PaginationControls = () => (
    <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-200 shadow-sm">
      <button
        disabled={currentPage === 1 || isFetchingData}
        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
        className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
      >
        <ChevronLeft size={16} /> Prev
      </button>
      <div className="px-4 py-1.5 text-sm font-bold text-gray-700 min-w-[100px] text-center">
        Page {currentPage} <span className="text-gray-400 font-medium">of {totalPages}</span>
      </div>
      <button
        disabled={currentPage === totalPages || isFetchingData || totalRecords === 0}
        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
        className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
      >
        Next <ChevronRight size={16} />
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header Title Area */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-50 text-red-600 rounded-xl shadow-sm border border-red-100">
              <AlertTriangle size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
                Deviations Management
              </h2>
              <p className="text-gray-500 text-sm mt-1">
                Track and resolve OOT and Not Calibrated records.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate("/engineer")}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm shadow-sm transition-colors"
          >
            <ChevronLeft size={16} /> Dashboard
          </button>
        </div>

        {/* Master Container */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden relative z-0">
          
          {/* Tabs */}
          <div className="bg-gray-50 border-b border-gray-200 flex space-x-1 overflow-x-auto px-2 pt-2 shrink-0">
            <button
              onClick={() => { setActiveTab("OOT"); setCurrentPage(1); }}
              className={`flex items-center gap-2 px-5 py-3 font-medium text-sm rounded-t-lg transition-all ${
                activeTab === "OOT" ? "bg-white border-t border-x border-gray-200 shadow-sm text-red-600" : "text-gray-500 hover:bg-gray-200"
              }`}
            >
              Deviation - OOT
              {activeTab === "OOT" && <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-800">{totalRecords}</span>}
            </button>
            <button
              onClick={() => { setActiveTab("MANUAL"); setCurrentPage(1); }}
              className={`flex items-center gap-2 px-5 py-3 font-medium text-sm rounded-t-lg transition-all ${
                activeTab === "MANUAL" ? "bg-white border-t border-x border-gray-200 shadow-sm text-gray-800" : "text-gray-500 hover:bg-gray-200"
              }`}
            >
              Deviation - NC (Manual)
              {activeTab === "MANUAL" && <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-800">{totalRecords}</span>}
            </button>
          </div>

          {/* Top Toolbar (Search & Controls) */}
          <div className="bg-white px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4 z-10 relative shrink-0">
            <div className="relative w-full sm:max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <Search size={16} />
              </div>
              <input
                type="text"
                placeholder="Search by NEPL ID, SRF, or Customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-full text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm outline-none transition-shadow"
              />
            </div>

            <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
              <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:inline">Records:</span>
                  <select 
                      value={limit} 
                      onChange={(e) => {
                          setLimit(Number(e.target.value));
                          setCurrentPage(1);
                      }}
                      className="border border-gray-300 rounded-lg text-sm px-3 py-2 focus:ring-2 focus:ring-blue-500 bg-white font-bold text-gray-700 shadow-sm outline-none cursor-pointer"
                  >
                      {PAGE_SIZE_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                  </select>
              </div>
              <div className="hidden lg:block">
                <PaginationControls />
              </div>
            </div>
          </div>

          {/* Table Body Area */}
          <div className="relative min-h-[400px] bg-white p-4 sm:p-6">
              
              {showLoaderOverlay && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/50 backdrop-blur-[2px] transition-all duration-300">
                   <Loader2 className="w-10 h-10 animate-spin text-blue-600 shadow-sm rounded-full mb-3" />
                   <p className="text-sm font-bold text-blue-800 bg-white/90 px-4 py-1.5 rounded-full shadow-sm border border-blue-100">
                     Loading Records...
                   </p>
                </div>
              )}

              {error && !isFetchingData && (
                 <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm mb-4">
                   {error}
                 </div>
              )}

              {items.length === 0 && !isFetchingData && !error ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-12">
                      <div className="inline-flex items-center justify-center p-4 bg-gray-50 rounded-full mb-4">
                          <Activity className="h-10 w-10 text-gray-300" />
                      </div>
                      <h3 className="text-lg font-medium text-gray-900">No records found</h3>
                      <p className="text-gray-500 mt-1 max-w-sm mx-auto">Try adjusting your search criteria.</p>
                  </div>
              ) : (
                  <div className="space-y-3">
                      {items.map((item) => (
                        <div
                          key={item.deviation_id}
                          onClick={() => navigate(`/engineer/deviations/${item.deviation_id}`)}
                          className="flex items-center justify-between p-5 bg-white hover:bg-blue-50 border border-gray-200 rounded-xl transition-all cursor-pointer group shadow-sm hover:shadow-md"
                        >
                          <div className="flex items-start gap-4">
                            <div className={`mt-1 p-2.5 rounded-full transition-colors ${
                              item.status.toUpperCase() === "CLOSED" ? "bg-green-50 text-green-600 group-hover:bg-green-100" : "bg-amber-50 text-amber-600 group-hover:bg-amber-100"
                            }`}>
                              <AlertTriangle size={20} />
                            </div>
                            <div>
                              <p className="font-bold text-lg text-gray-800 group-hover:text-blue-700 transition-colors">
                                NEPL ID: {item.nepl_id || "N/A"}
                              </p>
                              <p className="text-sm text-gray-500 mt-1 font-medium">
                                SRF: <span className="font-semibold text-gray-700">{item.srf_no || "N/A"}</span> 
                                <span className="mx-2 text-gray-300">|</span> 
                                {item.customer_name || "N/A"}
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                                  item.status.toUpperCase() === "CLOSED" ? "bg-green-100 text-green-800 border-green-200" : "bg-amber-100 text-amber-800 border-amber-200"
                                }`}>
                                  {item.status.toUpperCase()}
                                </span>
                                {item.deviation_type === "OOT" && (
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                                    !item.hide_customer_visibility ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"
                                  }`}>
                                    {item.hide_customer_visibility ? "Hidden" : "Visible to Customer"}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-blue-600 transform group-hover:translate-x-1 transition-all" />
                        </div>
                      ))}
                  </div>
              )}
          </div>

          {/* Bottom Pagination Footer */}
{totalRecords > 0 && (
   <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex flex-col sm:flex-row items-center justify-between z-10 relative gap-4">
      <span className="text-sm text-gray-600 font-medium">
        Showing <span className="font-bold">{startRecord}</span> to{' '}
        <span className="font-bold">{endRecord}</span> of{' '}
        <span className="font-bold">{totalRecords}</span> records
      </span>
      <PaginationControls />
   </div>
 )}
           
        </div>
      </div>
    </div>
  );
};

// ============================================================
// DEVIATION DETAIL PAGE (Untouched Functionality, UI Cleaned)
// ============================================================
export const DeviationDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { deviationId } = useParams<{ deviationId: string }>();
  const [loading, setLoading] = useState(true);
  const [savingRemarks, setSavingRemarks] = useState(false);
  const [closingDeviation, setClosingDeviation] = useState(false);
  const [terminatingDeviationJob, setTerminatingDeviationJob] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<DeviationDetailResponse | null>(null);
  const [engineerRemarksInput, setEngineerRemarksInput] = useState("");
  const [togglingVisibility, setTogglingVisibility] = useState(false);

  const isExternalRecord = deviationId ? Number(deviationId) < 0 : false;

  const getFileFullUrl = (url: string) => {
    if (!url) return "#";
    if (url.startsWith("http")) return url;
    const host = api.defaults.baseURL?.split("/api")[0] || "";
    return `${host}${url}`;
  };

    useEffect(() => {
    const loadDetail = async () => {
      if (!deviationId) {
        setError("Deviation ID is missing.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const id = Number(deviationId);
        let res;
        
        // --- THIS IF/ELSE FIXES THE 404 ERROR ---
        if (id < 0) {
          // It's an External Deviation
          res = await api.get<DeviationDetailResponse>(`/external-deviations/${Math.abs(id)}`);
        } else {
          // It's an Internal Deviation
          res = await api.get<DeviationDetailResponse>(ENDPOINTS.STAFF_DEVIATIONS.DETAIL(id));
        }

        setDetail(res.data);
        setEngineerRemarksInput(res.data.engineer_remarks || "");
      } catch (e: any) {
        setError(e?.response?.data?.detail || "Failed to load deviation record.");
      } finally {
        setLoading(false);
      }
    };
    loadDetail();
  }, [deviationId]);

  const saveEngineerRemarks = async () => {
    if (!detail || !deviationId) return;
    setSavingRemarks(true);
    setError(null);
    try {
      let response;
      const payload = { engineer_remarks: engineerRemarksInput };
      const id = Number(deviationId);

      if (isExternalRecord) {
        response = await api.patch<DeviationDetailResponse>(`/external-deviations/${Math.abs(id)}`, payload);
      } else {
        response = await api.patch<DeviationDetailResponse>(ENDPOINTS.STAFF_DEVIATIONS.UPDATE_ENGINEER_REMARKS(id), payload);
      }

      setDetail(response.data);
      setEngineerRemarksInput(response.data.engineer_remarks || "");
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to save engineer remarks.");
    } finally {
      setSavingRemarks(false);
    }
  };

  const closeDeviationRecord = async () => {
    if (!detail) return;
    setClosingDeviation(true);
    setError(null);
    try {
      const res = await api.patch<DeviationDetailResponse>(ENDPOINTS.STAFF_DEVIATIONS.CLOSE(detail.deviation_id));
      setDetail(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to close deviation.");
    } finally {
      setClosingDeviation(false);
    }
  };

  const terminateDeviationJob = async () => {
    if (!detail) return;
    setTerminatingDeviationJob(true);
    setError(null);
    try {
      const res = await api.patch<DeviationDetailResponse>(ENDPOINTS.STAFF_DEVIATIONS.TERMINATE_JOB(detail.deviation_id));
      setDetail(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to terminate linked job.");
    } finally {
      setTerminatingDeviationJob(false);
    }
  };

  const isCurrentlyVisible = () => {
    if (!detail) return false;
    if (!isExternalRecord && detail.deviation_type === "MANUAL") return true;
    return detail.hide_customer_visibility === false;
  };

  const toggleCustomerVisibility = async () => {
    if (!detail || !deviationId) return;
    setTogglingVisibility(true);
    setError(null);

    try {
      const id = Number(deviationId);
      const nextHideValue = !detail.hide_customer_visibility;
      const payload = { hide_customer_visibility: nextHideValue };

      let response;
      if (isExternalRecord) {
        response = await api.patch(`/external-deviations/${Math.abs(id)}`, payload);
      } else {
        response = await api.patch(`/deviations/${id}/visibility`, payload);
      }
      setDetail(response.data);
    } catch (e: any) {
      setError("Failed to update visibility settings.");
    } finally {
      setTogglingVisibility(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between mb-6 bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Deviation Record</h2>
          <button
            onClick={() => navigate("/engineer/deviations")}
            className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm transition-all shadow-sm"
          >
            <ChevronLeft size={16} /> Back to Deviations
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 text-blue-600 text-sm py-16 bg-white rounded-2xl shadow-sm border border-gray-200">
            <Loader2 className="h-6 w-6 animate-spin" /> Loading record...
          </div>
        )}

        {!loading && error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 font-medium">
            <AlertTriangle className="inline mr-2 h-5 w-5" /> {error}
          </div>
        )}

        {!loading && !error && detail && (
          <div className="space-y-5 text-sm">
            {/* Actions & Visibility */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
              <div>
                <h3 className="font-bold text-gray-900 text-base">Actions & Visibility</h3>
                <div className="mt-1 flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${isCurrentlyVisible() ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Status: {isCurrentlyVisible() ? "Visible to Customer" : "Hidden from Customer"}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                {(isExternalRecord || detail.deviation_type === "OOT") && (
                  <button
                    disabled={togglingVisibility}
                    onClick={toggleCustomerVisibility}
                    className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all shadow-sm ${
                      isCurrentlyVisible()
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                        : "bg-slate-800 text-white border border-slate-900 hover:bg-slate-900"
                    }`}
                  >
                    {togglingVisibility ? <Loader2 className="h-4 w-4 animate-spin" /> : isCurrentlyVisible() ? <><EyeOff size={16} /> Hide</> : <><Eye size={16} /> Show</>}
                  </button>
                )}

                {!isExternalRecord && (
                  <>
                    <button
                      disabled={closingDeviation || (detail.status || "").toUpperCase() === "CLOSED"}
                      onClick={closeDeviationRecord}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white border border-gray-300 text-gray-900 text-sm font-bold hover:bg-gray-50 disabled:opacity-50 transition-all shadow-sm"
                    >
                      {closingDeviation ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {(detail.status || "").toUpperCase() === "CLOSED" ? "Record Closed" : "Close Record"}
                    </button>

                    <button
                      disabled={terminatingDeviationJob}
                      onClick={terminateDeviationJob}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm font-bold hover:bg-red-100 disabled:opacity-50 transition-all shadow-sm"
                    >
                      {terminatingDeviationJob ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Terminate Job
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">DC Details</p>
                <p className="text-sm font-bold text-gray-900">No: {detail.customer_dc_no || "—"}</p>
                <p className="text-sm font-medium text-gray-600 mt-1">Date: {formatDcDate(detail.customer_dc_date)}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">Status</p>
                <span className={`inline-flex text-xs px-3 py-1 rounded-full font-bold border tracking-wide uppercase ${
                    (detail.status || "").toUpperCase() === "CLOSED" ? "bg-green-50 text-green-700 border-green-200" 
                    : (detail.status || "").toUpperCase() === "IN_PROGRESS" ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-amber-50 text-amber-700 border-amber-200"
                  }`}>
                  {detail.status || "OPEN"}
                </span>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
                  {isExternalRecord ? "Tool Status" : "Calibration status"}
                </p>
                <span className={`inline-flex text-xs px-3 py-1 rounded-full font-bold border tracking-wide ${
                    (detail.tool_status || detail.calibration_status || "").toLowerCase().includes("calibrated") ||
                    (detail.tool_status || detail.calibration_status || "").toLowerCase().includes("ok")
                      ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-100 text-gray-700 border-gray-200"
                  }`}>
                  {formatCalibrationStatus(isExternalRecord ? detail.tool_status : detail.calibration_status)}
                </span>
              </div>
            </div>

            {/* Details Panel */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div><span className="text-gray-500 font-medium">SRF</span><br/><span className="font-bold text-gray-900 text-base">{detail.srf_no || "—"}</span></div>
                <div><span className="text-gray-500 font-medium">NEPL ID</span><br/><span className="font-bold text-blue-600 font-mono text-base">{detail.nepl_id || "—"}</span></div>
                <div><span className="text-gray-500 font-medium">Report date</span><br/><span className="font-bold text-gray-900 text-base">{detail.report ? formatDcDate(detail.report) : "—"}</span></div>
              </div>

              {/* THIS IS THE UPDATED CONDITIONAL CHECK */}
              {detail.deviation_type === "OOT" && (detail.oot_steps?.length || 0) > 0 && (
                <div className="mt-6 border border-gray-200 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                     <p className="text-gray-700 text-xs font-bold uppercase tracking-wide">OOT Steps</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-white border-b border-gray-100">
                      <tr className="text-left text-gray-500">
                        <th className="px-4 py-3 font-semibold">Step %</th>
                        <th className="px-4 py-3 font-semibold">Deviation %</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-50">
                      {detail.oot_steps?.map((step, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-3 font-medium text-gray-800">{step.step_percent ?? "—"}</td>
                          <td className="px-4 py-3 font-bold text-red-600">{step.deviation_percent ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Customer & Equipment */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">Customer</p>
                <p className="text-base font-bold text-gray-900">{detail.customer_details || "—"}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">Equipment</p>
                <p className="text-base font-bold text-gray-900">{[detail.make, detail.model, detail.serial_no].filter(Boolean).join(" · ") || "—"}</p>
              </div>
            </div>

            {/* Engineer Remarks */}
            <div className="rounded-2xl border border-blue-100 bg-blue-50/30 p-5 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-blue-800 font-bold mb-2">Engineer remarks</p>
              <textarea
                className="w-full border border-gray-300 rounded-xl p-3 text-sm min-h-[120px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm outline-none"
                placeholder="Add engineer remarks for this deviation..."
                value={engineerRemarksInput}
                onChange={(e) => setEngineerRemarksInput(e.target.value)}
              />
              <div className="pt-3 flex justify-end">
                <button
                  disabled={savingRemarks}
                  onClick={saveEngineerRemarks}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-60 shadow-sm transition-colors"
                >
                  {savingRemarks ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={16} />} Save remarks
                </button>
              </div>
            </div>

            {/* Customer Decision */}
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-amber-800 font-bold mb-2">Customer decision</p>
              <div className="text-gray-800 font-medium whitespace-pre-wrap bg-white border border-amber-100 rounded-xl p-4 min-h-[60px] shadow-sm">
                {detail.customer_decision || <span className="text-gray-400 italic">No decision provided yet.</span>}
              </div>
            </div>

            {/* Attachments */}
            {detail.attachments && detail.attachments.length > 0 && (
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Paperclip size={18} className="text-gray-400" />
                  <p className="text-gray-800 font-bold">Evidence & Attachments</p>
                  <span className="ml-auto text-xs font-bold bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full border border-blue-100">
                    {detail.attachments.length} File(s)
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {detail.attachments.map((a) => (
                    <a
                      key={a.id}
                      href={getFileFullUrl(a.file_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-blue-50 hover:border-blue-200 transition-all group shadow-sm"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="p-2.5 bg-white rounded-lg border border-gray-200 text-blue-500 shadow-sm">
                          <FileText size={18} />
                        </div>
                        <div className="flex flex-col overflow-hidden">
                          <span className="text-sm font-bold text-gray-800 truncate group-hover:text-blue-700">{a.file_name}</span>
                          {a.file_type && <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mt-0.5">{a.file_type.split("/")[1] || a.file_type}</span>}
                        </div>
                      </div>
                      <ExternalLink size={16} className="text-gray-400 group-hover:text-blue-600 flex-shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { 
  Download, 
  ArrowLeft, 
  Search, 
  Loader2, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  CheckSquare, 
  Square,
  FileText
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, ENDPOINTS } from "../api/config";

// --- Interfaces ---
interface ExportInwardItem {
  inward_id: number;
  srf_no: string;
  customer_details?: string;
  status: string;
  received_by?: string;
  updated_at?: string | null;
  equipment_count: number;
  calibration_frequency?: string | null;
  statement_of_conformity?: boolean | null;
  ref_iso_is_doc?: boolean | null;
  ref_manufacturer_manual?: boolean | null;
  ref_customer_requirement?: boolean | null;
  turnaround_time?: number | null;
  remarks?: string | null;
}

// --- Helpers ---
const formatDateForInput = (value: Date) => value.toISOString().split("T")[0];

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return "—";
  return parsedDate.toLocaleString();
};

export const ExportInwardPage: React.FC = () => {
  const navigate = useNavigate();

  // --- Date Filters ---
  const [startDate, setStartDate] = useState(() => {
    const defaultStart = new Date();
    defaultStart.setDate(defaultStart.getDate() - 30);
    return formatDateForInput(defaultStart);
  });
  const [endDate, setEndDate] = useState(() => formatDateForInput(new Date()));
  const [debouncedStartDate, setDebouncedStartDate] = useState(startDate);
  const [debouncedEndDate, setDebouncedEndDate] = useState(endDate);

  // --- Pagination & Search State ---
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState<number>(0);
  const [limit, setLimit] = useState<number>(100);
  const [serverTotalCount, setServerTotalCount] = useState(0);
  const [isServerPaginated, setIsServerPaginated] = useState(false);

  // --- Data State ---
  const [exportInwards, setExportInwards] = useState<ExportInwardItem[]>([]);
  const [selectedInwards, setSelectedInwards] = useState<Set<number>>(new Set());

  // --- Loading & Action States ---
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isFetchingData, setIsFetchingData] = useState(false);
  const [showLoaderOverlay, setShowLoaderOverlay] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<number | null>(null);
  const [batchExporting, setBatchExporting] = useState(false);

  // --- Smooth Loading Overlay Effect ---
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isFetchingData && !isInitialLoad) {
      timer = setTimeout(() => setShowLoaderOverlay(true), 200);
    } else {
      setShowLoaderOverlay(false);
    }
    return () => clearTimeout(timer);
  }, [isFetchingData, isInitialLoad]);

  // --- Debounce Search & Dates ---
  useEffect(() => {
    const handler = setTimeout(() => {
      if (debouncedSearch !== searchTerm || debouncedStartDate !== startDate || debouncedEndDate !== endDate) {
        setDebouncedSearch(searchTerm);
        setDebouncedStartDate(startDate);
        setDebouncedEndDate(endDate);
        setPage(0); // Reset to page 1
      }
    }, 400);
    return () => clearTimeout(handler);
  }, [searchTerm, startDate, endDate, debouncedSearch, debouncedStartDate, debouncedEndDate]);

  // --- Handle Limit Change ---
  const handleLimitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLimit(Number(e.target.value));
    setPage(0);
  };

  // --- Fetch Data ---
  const fetchExportInwards = useCallback(async () => {
    setIsFetchingData(true);
    setExportError(null);
    try {
      if (debouncedStartDate && debouncedEndDate && new Date(debouncedStartDate) > new Date(debouncedEndDate)) {
        throw new Error("Start date cannot be after end date.");
      }

      const params: any = { skip: page * limit, limit };
      if (debouncedSearch) params.search = debouncedSearch;
      if (debouncedStartDate) params.start_date = debouncedStartDate;
      if (debouncedEndDate) params.end_date = debouncedEndDate;

      const response = await api.get<any>(ENDPOINTS.STAFF.INWARDS_EXPORTABLE, { params });
      
      // ✅ SMART FETCH: Handles both paginated backends and flat array fallbacks
      if (response.data && typeof response.data === 'object' && 'total_count' in response.data) {
        setExportInwards(response.data.inwards || response.data.items || []);
        setServerTotalCount(response.data.total_count || 0);
        setIsServerPaginated(true);
      } else {
        const data = Array.isArray(response.data) ? response.data : response.data.data || [];
        setExportInwards(data);
        setIsServerPaginated(false);
      }
    } catch (error) {
      console.error("Error fetching inwards for export:", error);
      const message = error instanceof Error ? error.message : "An unknown error occurred.";
      setExportError(`Failed to load inward records: ${message}`);
    } finally {
      setIsFetchingData(false);
      setIsInitialLoad(false);
    }
  }, [page, limit, debouncedSearch, debouncedStartDate, debouncedEndDate]);

  useEffect(() => {
    fetchExportInwards();
  }, [fetchExportInwards]);

  // --- Fallback Client-Side Processing (if backend sends everything) ---
  const filteredInwards = useMemo(() => {
    if (isServerPaginated) return exportInwards;
    let result = exportInwards;
    
    if (debouncedSearch) {
      const lower = debouncedSearch.toLowerCase();
      result = result.filter(i => 
        i.srf_no.toLowerCase().includes(lower) || 
        (i.customer_details && i.customer_details.toLowerCase().includes(lower))
      );
    }
    
    if (debouncedStartDate) {
      result = result.filter(i => i.updated_at && new Date(i.updated_at) >= new Date(debouncedStartDate));
    }
    if (debouncedEndDate) {
      const end = new Date(debouncedEndDate);
      end.setHours(23, 59, 59, 999);
      result = result.filter(i => i.updated_at && new Date(i.updated_at) <= end);
    }
    
    return result;
  }, [exportInwards, debouncedSearch, debouncedStartDate, debouncedEndDate, isServerPaginated]);

  const actualTotalCount = isServerPaginated ? serverTotalCount : filteredInwards.length;
  const totalPages = Math.max(1, Math.ceil(actualTotalCount / limit));
  const hasNextPage = page < totalPages - 1;
  const hasPrevPage = page > 0;

  const displayedInwards = useMemo(() => {
    if (isServerPaginated) return filteredInwards;
    const start = page * limit;
    return filteredInwards.slice(start, start + limit);
  }, [filteredInwards, page, limit, isServerPaginated]);

  // --- Selection Handlers ---
  const handleToggleSelection = useCallback((inwardId: number) => {
    setSelectedInwards((previous) => {
      const next = new Set(previous);
      if (next.has(inwardId)) next.delete(inwardId);
      else next.add(inwardId);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (displayedInwards.length === 0) return;
    const displayedIds = displayedInwards.map(i => i.inward_id);
    const allDisplayedSelected = displayedIds.every(id => selectedInwards.has(id));
    
    setSelectedInwards(prev => {
      const next = new Set(prev);
      if (allDisplayedSelected) {
        displayedIds.forEach(id => next.delete(id));
      } else {
        displayedIds.forEach(id => next.add(id));
      }
      return next;
    });
  }, [displayedInwards, selectedInwards]);

  const allSelected = displayedInwards.length > 0 && displayedInwards.every(item => selectedInwards.has(item.inward_id));
  const selectedCount = selectedInwards.size;

  const resetDateFilters = useCallback(() => {
    const defaultStart = new Date();
    defaultStart.setDate(defaultStart.getDate() - 30);
    setStartDate(formatDateForInput(defaultStart));
    setEndDate(formatDateForInput(new Date()));
    setSearchTerm("");
    setPage(0);
  }, []);

  // --- Formatting Helpers ---
  const boolToText = useCallback((value?: boolean | null) => {
    if (value === true) return "Yes";
    if (value === false) return "No";
    return "—";
  }, []);

  const formatTurnaround = useCallback((value?: number | null) => {
    if (value == null) return "—";
    return `${value} day${value === 1 ? "" : "s"}`;
  }, []);

  const getDecisionRuleLabels = useCallback((item: ExportInwardItem): string[] => {
    const labels: string[] = [];
    if (item.ref_iso_is_doc) labels.push("ISO/IS Doc");
    if (item.ref_manufacturer_manual) labels.push("Manufacturer Manual");
    if (item.ref_customer_requirement) labels.push("Customer Requirement");
    return labels;
  }, []);

  // --- Export Handlers ---
  const handleExport = useCallback(async (inwardId: number, srfNo: string) => {
    try {
      setExportError(null);
      setExportingId(inwardId);
      const response = await api.get(ENDPOINTS.STAFF.INWARD_EXPORT(inwardId), {
        responseType: "blob",
      });

      const blob = new Blob([response.data], {
        type: response.headers["content-type"] || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeSrf = srfNo ? srfNo.replace(/[^a-zA-Z0-9-_]/g, "_") : `${inwardId}`;
      link.href = url;
      link.download = `inward_${safeSrf}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setExportError("Failed to export the inward record. Please try again.");
    } finally {
      setExportingId(null);
    }
  }, []);

  const handleBatchExport = useCallback(async () => {
    if (batchExporting || selectedCount === 0) return;
    const inwardIds = Array.from(selectedInwards);

    try {
      setExportError(null);
      setBatchExporting(true);
      const response = await api.post(
        ENDPOINTS.STAFF.INWARD_EXPORT_BATCH,
        { inward_ids: inwardIds },
        { responseType: "blob" }
      );

      const blob = new Blob([response.data], {
        type: response.headers["content-type"] || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      link.href = url;
      link.download = `inwards_export_${timestamp}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setSelectedInwards(new Set()); // Reset selections on success
    } catch (error) {
      setExportError("Failed to export the selected inward records. Please try again.");
    } finally {
      setBatchExporting(false);
    }
  }, [batchExporting, selectedInwards, selectedCount]);

  // --- Reusable Pagination Controls ---
  const PaginationControls = () => (
    <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-200 shadow-sm">
      <button
        disabled={!hasPrevPage || isFetchingData}
        onClick={() => setPage((p) => p - 1)}
        className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft size={16} /> Prev
      </button>
      
      <div className="px-4 py-1.5 text-sm font-bold text-gray-700 min-w-[100px] text-center">
        Page {page + 1} <span className="text-gray-400 font-medium">of {totalPages || 1}</span>
      </div>
      
      <button
        disabled={!hasNextPage || isFetchingData}
        onClick={() => setPage((p) => p + 1)}
        className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Next <ChevronRight size={16} />
      </button>
    </div>
  );

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 sm:p-8 animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b pb-6 mb-6 gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg">
            <Download className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Export Inward Records</h1>
            <p className="mt-1 text-gray-600 text-sm">
              Filter and export finalized inward records to Excel.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate("/engineer")}
          className="flex items-center space-x-2 px-4 py-2.5 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-semibold text-sm transition-colors"
        >
          <ArrowLeft size={18} />
          <span>Back to Dashboard</span>
        </button>
      </div>

      {/* Filter & Controls Panel */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200 shadow-sm space-y-4">
        
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          {/* Search Box */}
          <div className="relative w-full md:w-1/2">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search by SRF No. or Customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all outline-none text-sm"
            />
            {isFetchingData && !isInitialLoad && debouncedSearch !== searchTerm && (
              <Loader2 className="absolute right-3 top-2.5 text-blue-500 animate-spin" size={18} />
            )}
          </div>

          {/* Top Pagination & Selected Count */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 w-full md:w-auto">
            {selectedCount > 0 && (
              <span className="text-sm font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 border border-blue-200 rounded-lg shadow-sm">
                {selectedCount} Selected
              </span>
            )}
            <PaginationControls />
          </div>
        </div>

        {/* Date Ranges & Actions */}
        <div className="flex flex-col md:flex-row items-end gap-4 justify-between border-t border-gray-200 pt-4">
          <div className="flex flex-wrap items-end gap-3 w-full md:w-auto">
            <div className="flex flex-col">
              <label htmlFor="export-start-date" className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                From Date
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <input
                  id="export-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                  max={endDate || undefined}
                />
              </div>
            </div>
            <div className="flex flex-col">
              <label htmlFor="export-end-date" className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                To Date
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <input
                  id="export-end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                  min={startDate || undefined}
                  max={formatDateForInput(new Date())}
                />
              </div>
            </div>
            <button
              onClick={resetDateFilters}
              className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 font-semibold text-sm shadow-sm transition-colors"
            >
              Reset Filters
            </button>
            <div className="flex items-center gap-2 ml-2">
              <span className="text-sm text-gray-500 font-medium">Rows:</span>
              <select
                value={limit}
                onChange={handleLimitChange}
                disabled={isFetchingData}
                className="border border-gray-300 bg-white rounded-lg px-2 py-1.5 text-sm font-bold text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm cursor-pointer disabled:opacity-50"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={500}>500</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleBatchExport}
            disabled={selectedCount === 0 || batchExporting || isFetchingData}
            className="flex items-center justify-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-400 w-full md:w-auto"
          >
            {batchExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Batch Export {selectedCount > 0 ? `(${selectedCount})` : ""}
          </button>
        </div>
      </div>

      {exportError && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex justify-between items-center">
          <span>{exportError}</span>
          <button onClick={fetchExportInwards} className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 font-bold">Retry</button>
        </div>
      )}

      {/* Table Area */}
      <div className="overflow-x-auto border rounded-lg bg-white shadow-sm relative min-h-[400px]">
        
        {/* Overlay Spinner */}
        {showLoaderOverlay && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/50 backdrop-blur-[2px] transition-all duration-300 rounded-lg">
            <Loader2 className="w-10 h-10 animate-spin text-blue-600 shadow-sm rounded-full mb-3" />
            <p className="text-sm font-bold text-blue-800 bg-white/90 px-4 py-1.5 rounded-full shadow-sm border border-blue-100">
              Loading Data...
            </p>
          </div>
        )}

        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="p-4 w-10 text-center">
                 <button 
                  onClick={handleSelectAll}
                  className="text-gray-600 hover:text-blue-600 focus:outline-none"
                  disabled={isFetchingData || displayedInwards.length === 0}
                 >
                   {displayedInwards.length > 0 && allSelected && !isFetchingData ? (
                     <CheckSquare size={20} className="text-blue-600" />
                   ) : (
                     <Square size={20} />
                   )}
                 </button>
              </th>
              <th className="p-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wide">SRF No.</th>
              <th className="p-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wide">Customer</th>
              <th className="p-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wide">Received By</th>
              
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            
            {/* Skeleton Loading on Initial Render */}
            {isInitialLoad ? (
              [...Array(limit > 10 ? 10 : limit)].map((_, i) => (
                <tr key={`skeleton-${i}`} className="animate-pulse">
                  <td className="p-4 text-center"><div className="w-5 h-5 bg-gray-200 rounded mx-auto" /></td>
                  <td className="p-4"><div className="w-24 h-4 bg-gray-200 rounded" /></td>
                  <td className="p-4"><div className="w-32 h-4 bg-gray-200 rounded" /></td>
                  <td className="p-4"><div className="w-20 h-4 bg-gray-200 rounded" /></td>
              
                </tr>
              ))
            ) : displayedInwards.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-16 text-center text-gray-500">
                  <div className="flex flex-col items-center">
                    <FileText size={48} className="text-gray-300 mb-4" />
                    <span className="text-lg font-medium text-gray-900">No exportable records found</span>
                    <p className="text-sm text-gray-500 mt-1">Try adjusting your search or date filters.</p>
                  </div>
                </td>
              </tr>
            ) : (
              displayedInwards.map((item) => {
                const isSelected = selectedInwards.has(item.inward_id);
                return (
                  <tr key={item.inward_id} className={`hover:bg-blue-50/50 transition-colors ${isSelected ? "bg-blue-50" : ""}`}>
                    <td className="p-4 text-center">
                      <button onClick={() => handleToggleSelection(item.inward_id)} className="focus:outline-none">
                        {isSelected ? <CheckSquare size={20} className="text-blue-600" /> : <Square size={20} className="text-gray-400 hover:text-gray-600" />}
                      </button>
                    </td>
                    <td className="p-4 font-mono font-bold text-blue-600">{item.srf_no}</td>
                    <td className="p-4 text-gray-800 font-medium line-clamp-2" title={item.customer_details}>{item.customer_details || "—"}</td>
                    <td className="p-4 text-gray-600">{item.received_by || "—"}</td>
                    
                    <td className="p-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleExport(item.inward_id, item.srf_no)}
                        disabled={exportingId === item.inward_id || batchExporting}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {exportingId === item.inward_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        Export
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom Pagination Controls */}
      <div className="mt-6 flex justify-center w-full">
        <PaginationControls />
      </div>

    </div>
  );
};

export default ExportInwardPage;
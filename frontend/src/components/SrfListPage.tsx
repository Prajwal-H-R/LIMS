import React, { useEffect, useState, useCallback } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom"; 
import { 
  FileText, Inbox, ChevronRight, ChevronLeft, ArrowLeft, Clock, 
  Edit3, Download, Search, X, Loader2, Filter, AlertTriangle 
} from "lucide-react";
import { api, ENDPOINTS } from "../api/config";

// --- Interfaces ---
interface WorkItem {
  id: number;
  type: "inward" | "srf";
  displayNumber: string;
  customer_name: string | null;
  date: string;
  status: string;
  isDraft: boolean;
}

const STATUS_KEYS = {
  PENDING: "pending_creation",
  REVIEW: "customer_review",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

type StatusKey = (typeof STATUS_KEYS)[keyof typeof STATUS_KEYS];

// --- Main Component ---
export const SrfListPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Tab State
  const [activeTab, setActiveTab] = useState<StatusKey>(() => {
    const state = location.state as { activeTab?: StatusKey } | null;
    return state?.activeTab || STATUS_KEYS.PENDING;
  });

  // Data State (Server-Side)
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  
  // Tab Counts State
  const [tabCounts, setTabCounts] = useState<Record<StatusKey, number>>({
    pending_creation: 0,
    customer_review: 0,
    approved: 0,
    rejected: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Search State
  const [showFilters, setShowFilters] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  
  // Pagination & Search State
  const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 500];
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1); 
  const [limit, setLimit] = useState(100);

  // Loading Overlays
  const [isFetchingData, setIsFetchingData] = useState(false);
  const [showLoaderOverlay, setShowLoaderOverlay] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // 1. Debounce Search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (debouncedSearch !== searchTerm) {
        setDebouncedSearch(searchTerm);
        setCurrentPage(1); // Reset page on new search
      }
    }, 400); 
    return () => clearTimeout(timer);
  }, [searchTerm, debouncedSearch]);

  // 2. Smooth Loading Overlay
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isFetchingData && !loading) {
      timer = setTimeout(() => setShowLoaderOverlay(true), 200);
    } else {
      setShowLoaderOverlay(false);
    }
    return () => clearTimeout(timer);
  }, [isFetchingData, loading]);

  // 3. Central Data Fetcher (Hits the optimized /work-items endpoint)
  const fetchPageData = useCallback(async () => {
    setIsFetchingData(true);
    setError(null);

    try {
      const params = {
        skip: (currentPage - 1) * limit,
        limit: limit,
        tab_status: activeTab,
        search: debouncedSearch || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      };

      const basePath = ENDPOINTS.SRFS.endsWith('/') ? ENDPOINTS.SRFS.slice(0, -1) : ENDPOINTS.SRFS;
      const response = await api.get<any>(`${basePath}/work-items`, { params });

      setWorkItems(response.data.items || []);
      setTotalRecords(response.data.total || 0);

    } catch (err: any) {
      console.error("Failed to fetch data:", err);
      setError(err.response?.data?.detail || err.message || "Could not load data.");
    } finally {
      setIsFetchingData(false);
      setLoading(false);
    }
  }, [currentPage, limit, activeTab, debouncedSearch, startDate, endDate]);

  // 4. Fetch Tab Counts (Runs when filters change)
  const fetchTabCounts = useCallback(async () => {
    try {
      const params = {
        search: debouncedSearch || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      };

      const basePath = ENDPOINTS.SRFS.endsWith('/') ? ENDPOINTS.SRFS.slice(0, -1) : ENDPOINTS.SRFS;
      const response = await api.get(`${basePath}/work-items/counts`, { params });
      
      setTabCounts(response.data);
    } catch (err) {
      console.error("Failed to fetch tab counts", err);
    }
  }, [debouncedSearch, startDate, endDate]);
  
  // 5. Trigger Data Fetch whenever filters, page, or tab changes
  useEffect(() => {
    fetchPageData();
  }, [fetchPageData]);

  // 6. Trigger Count Fetch whenever filters change
  useEffect(() => {
    fetchTabCounts();
  }, [fetchTabCounts]);

  // Server-Side Pagination Math
  const totalPages = Math.max(1, Math.ceil(totalRecords / limit));
  const startRecord = totalRecords === 0 ? 0 : ((currentPage - 1) * limit) + 1;
  const endRecord = Math.min(currentPage * limit, totalRecords);

  // Handlers
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      if (debouncedSearch) params.append("search", debouncedSearch);
      
      let endpoint = "";
      const basePath = ENDPOINTS.SRFS.endsWith('/') ? ENDPOINTS.SRFS.slice(0, -1) : ENDPOINTS.SRFS;
      
      if (activeTab === STATUS_KEYS.PENDING) {
        endpoint = `${basePath}/export/pending?${params.toString()}`;
      } else {
        endpoint = `${basePath}/export/${activeTab}?${params.toString()}`;
      }
      
      const response = await api.get(endpoint, { responseType: "blob" });
      
      const blob = new Blob([response.data], {
        type: response.headers["content-type"] || 
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
      link.href = url;
      link.download = `srf_${activeTab}_export_${timestamp}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export:", error);
      alert("Failed to export data. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };
  
  const resetFilters = () => {
    setStartDate("");
    setEndDate("");
    setSearchTerm("");
    setCurrentPage(1);
  };
  
  const hasActiveFilters = startDate || endDate || debouncedSearch;
 
  // Constants
  const statuses: StatusKey[] = [
    STATUS_KEYS.PENDING,
    STATUS_KEYS.REVIEW,
    STATUS_KEYS.APPROVED,
    STATUS_KEYS.REJECTED,
  ];

  const statusLabels: Record<StatusKey, string> = {
    [STATUS_KEYS.PENDING]: "Pending SRF Creation",
    [STATUS_KEYS.REVIEW]: "Customer Review Pending",
    [STATUS_KEYS.APPROVED]: "Approved",
    [STATUS_KEYS.REJECTED]: "Rejected",
  };
 
  const tabColors: Record<StatusKey, string> = {
    [STATUS_KEYS.PENDING]: "text-yellow-600 border-yellow-500",
    [STATUS_KEYS.REVIEW]: "text-blue-600 border-blue-500",
    [STATUS_KEYS.APPROVED]: "text-green-600 border-green-500",
    [STATUS_KEYS.REJECTED]: "text-red-600 border-red-500",
  };

  // Reusable Pagination Controls
  const PaginationControls = () => (
    <div className="flex justify-center w-full sm:w-auto">
        <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-200 shadow-sm">
          <button
            disabled={currentPage === 1 || isFetchingData}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={16} /> Prev
          </button>
          
          <div className="px-4 py-1.5 text-sm font-bold text-gray-700 min-w-[100px] text-center">
            Page {currentPage} <span className="text-gray-400 font-medium">of {totalPages}</span>
          </div>
          
          <button
            disabled={currentPage === totalPages || isFetchingData || totalRecords === 0}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
    </div>
  );

  // Render Skeleton Initial Load
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8 animate-pulse">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex items-center justify-between">
            <div className="h-10 w-48 bg-gray-200 rounded"></div>
            <div className="h-10 w-32 bg-gray-200 rounded-lg"></div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <div className="h-10 w-full bg-gray-100 rounded-lg mb-6"></div>
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-20 w-full bg-gray-50 border border-gray-200 rounded-xl"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
 
  // Render Error
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-red-50">
        <div className="text-center text-red-600 bg-white p-6 rounded-xl shadow-md border border-red-200">
          <AlertTriangle className="h-10 w-10 mx-auto mb-2 opacity-80" />
          <p className="font-semibold">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg text-sm font-bold transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
 
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
       
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-3 rounded-xl shadow-lg text-white">
              <FileText className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                SRF Management
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Create new SRFs and track the status of existing ones.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/engineer")}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm shadow-sm transition-colors"
          >
            <ArrowLeft size={16} />
            <span>Back to Dashboard</span>
          </button>
        </div>

        {/* Master Container (Natural Scrolling) */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col relative z-0">
          
          {/* Tabs */}
          <div className="bg-gray-50 border-b border-gray-200 flex space-x-1 overflow-x-auto px-2 pt-2 shrink-0">
            {statuses.map((status) => {
              const isActive = activeTab === status;
              return (
                <button
                  key={status}
                  onClick={() => {
                    setActiveTab(status);
                    setCurrentPage(1); 
                  }}
                  className={`flex items-center gap-2 px-5 py-3 font-medium text-sm rounded-t-lg transition-all whitespace-nowrap ${
                    isActive
                      ? `bg-white border-t border-x border-gray-200 shadow-sm ${tabColors[status]} z-10`
                      : "text-gray-500 hover:bg-gray-200 border-transparent"
                  }`}
                >
                  {statusLabels[status]}
                  <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                    isActive ? 'bg-gray-100 text-gray-800' : 'bg-gray-200/50 text-gray-500'
                  }`}>
                    {tabCounts[status] ?? 0}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Top Toolbar (Search, Filter, Export) */}
          <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white z-10 relative shrink-0">
            <div className="relative w-full sm:max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by SRF No or Customer..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm shadow-sm outline-none transition-shadow bg-white"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                  onClick={() => setShowFilters(!showFilters)} 
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border transition-colors shadow-sm ${
                    (showFilters || startDate || endDate) 
                      ? 'bg-blue-50 border-blue-200 text-blue-700' 
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
              >
                  <Filter className="h-4 w-4" /> Filters
              </button>
              
              <button
                onClick={handleExport}
                disabled={isExporting || totalRecords === 0}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed shadow-sm transition-colors"
              >
                <Download className="h-4 w-4" />
                {isExporting ? "Exporting..." : "Export"}
              </button>
            </div>
          </div>

          {/* Expandable Filters */}
          {(showFilters || startDate || endDate) && (
            <div className="px-5 py-4 bg-gray-50 border-b border-gray-100 flex flex-wrap items-end gap-4 z-10 relative shrink-0">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Start Date</label>
                    <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }} className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">End Date</label>
                    <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }} className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                {(startDate || endDate || debouncedSearch) && (
                    <button onClick={resetFilters} className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1 font-medium border border-transparent hover:border-red-100">
                        <X className="h-4 w-4" /> Clear All
                    </button>
                )}
            </div>
          )}

          {/* Top Pagination Controls */}
          <div className="px-6 py-4 border-b border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4 bg-white z-10 relative shrink-0">
             <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
                 <span className="text-xs text-gray-500 font-bold uppercase tracking-wider hidden sm:inline">Records:</span>
                 <select 
                      value={limit} 
                      onChange={(e) => {
                          setLimit(Number(e.target.value));
                          setCurrentPage(1);
                      }}
                      className="border border-gray-300 rounded-lg text-sm px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white cursor-pointer font-bold text-gray-700 shadow-sm outline-none"
                  >
                      {PAGE_SIZE_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                 </select>
             </div>
             
             <div className="hidden sm:block">
               <PaginationControls />
             </div>
          </div>

          {/* Table Body Area */}
          <div className="relative min-h-[400px] bg-white p-4 sm:p-6 flex-1">
              
              {/* Overlay that sits ON TOP of the list to prevent unmounting lag */}
              {showLoaderOverlay && (
                 <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/50 backdrop-blur-[2px] transition-all duration-300">
                    <Loader2 className="w-10 h-10 animate-spin text-blue-600 shadow-sm rounded-full mb-3" />
                    <p className="text-sm font-bold text-blue-800 bg-white/90 px-4 py-1.5 rounded-full shadow-sm border border-blue-100">
                      Loading Items...
                    </p>
                 </div>
              )}

              {workItems.length === 0 && !isFetchingData ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-16">
                  <div className="inline-flex items-center justify-center p-5 bg-gray-50 rounded-full mb-4 border border-gray-100">
                      <Inbox className="h-10 w-10 text-gray-300" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900">No Items Found</h3>
                  <p className="text-gray-500 mt-1 max-w-sm mx-auto">
                    There are no records matching your search in{" "}
                    <span className="font-medium text-gray-700">{statusLabels[activeTab]}</span>.
                  </p>
                  {hasActiveFilters && (
                      <button onClick={resetFilters} className="mt-4 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-semibold hover:bg-blue-100 transition-colors">
                          Clear Search & Filters
                      </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {workItems.map((item) => (
                    <Link
                      key={`${item.type}-${item.id}`}
                      to={
                        item.type === "inward"
                          ? `/engineer/srfs/new-${item.id}`
                          : `/engineer/srfs/${item.id}`
                      }
                      state={{ activeTab }}
                      className="flex items-center justify-between p-5 bg-white hover:bg-blue-50 border border-gray-200 rounded-xl transition-all duration-200 group shadow-sm hover:shadow-md cursor-pointer"
                    >
                      <div className="flex items-start gap-4">
                        <div className="mt-1">
                          {item.isDraft ? (
                             <div title="Draft in Progress" className="bg-yellow-50 p-2.5 rounded-full text-yellow-600 border border-yellow-100 group-hover:bg-yellow-100 transition-colors">
                                <Edit3 size={20} />
                             </div>
                          ) : (
                             <div title="New Request" className="bg-blue-50 p-2.5 rounded-full text-blue-600 border border-blue-100 group-hover:bg-blue-100 transition-colors">
                                <Clock size={20} />
                             </div>
                          )}
                        </div>
                       
                        <div>
                          <div className="flex items-center gap-3 flex-wrap">
                              <p className="font-bold text-lg text-gray-800 group-hover:text-blue-700 transition-colors">
                                {item.displayNumber}
                              </p>
                              {item.isDraft && (
                                  <span className="bg-yellow-50 text-yellow-700 border border-yellow-200 text-[11px] px-2.5 py-0.5 rounded-md font-bold uppercase tracking-wide">
                                      Draft
                                  </span>
                              )}
                          </div>
                          <p className="text-sm text-gray-500 mt-1 font-medium">
                            <span className="text-gray-700">{item.customer_name || "N/A"}</span> 
                            <span className="mx-2 text-gray-300">|</span> 
                            Date: {item.date ? new Date(item.date).toLocaleDateString() : 'N/A'}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-blue-600 transform group-hover:translate-x-1 transition-all flex-shrink-0 ml-2" />
                    </Link>
                  ))}
                </div>
              )}
          </div>

          {/* Bottom Pagination Footer */}
          {totalRecords > 0 && (
             <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex flex-col sm:flex-row items-center justify-between z-10 relative shrink-0 gap-4">
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
 
export default SrfListPage;
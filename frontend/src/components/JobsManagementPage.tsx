import React, { useEffect, useState, useMemo, useCallback } from "react";
import { api, ENDPOINTS } from "../api/config";
import {
  Loader2,
  ClipboardList,
  ArrowLeft,
  Package,
  FileText,
  Calendar,
  User,
  AlertCircle,
  Play,
  Calculator,
  Clock,
  Activity,
  CheckCircle2,
  XCircle,
  Edit,
  Search,
  Filter,
  X,
  ChevronRight,
  ChevronLeft,
  Ban,
  Lock,
  AlertTriangle
} from "lucide-react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";

// --- Interfaces ---
interface InwardJob {
  inward_id: number;
  srf_no: string;
  customer_dc_no: string;
  customer_dc_date: string | null;
  status: string;
  pending_count: number;
  in_progress_count: number;
  completed_count: number;
}

interface InwardEquipment {
  inward_eqp_id: number;
  nepl_id: string;
  material_description: string;
  make: string;
  model: string;
  serial_no: string;
  quantity: number;
  accessories_included: string | null;
  visual_inspection_notes: string | null;
  status?: string | null;
  job_id?: number | null;      
  job_status?: string | null;  
}

interface InwardDetailResponse {
  inward_id: number;
  srf_no: string;
  material_inward_date: string;
  customer_dc_no: string;
  customer_dc_date: string;
  customer_details: string;
  inward_srf_flag: boolean;
  equipments: InwardEquipment[];
}

interface HtwJobResponse {
  job_id: number;
  inward_eqp_id: number;
  job_status: string;
}

interface ExpiryCheckResponse {
    message: string;
    affected_tables: string[];
}

interface FlowConfig {
  equipment_type: string;
  is_active: boolean;
}

type EquipmentTab = "pending" | "in_progress" | "completed" | "terminated";

// --- Skeleton Components ---
const JobListSkeleton: React.FC = () => {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center justify-between p-5 bg-white border border-gray-200 rounded-xl animate-pulse">
          <div className="flex items-start gap-4 w-full">
            <div className="mt-1 h-10 w-10 bg-gray-200 rounded-full flex-shrink-0"></div>
            <div className="w-full">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-6 w-32 bg-gray-300 rounded"></div>
                <div className="h-5 w-24 bg-gray-200 rounded-full"></div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-4 w-24 bg-gray-200 rounded"></div>
                <div className="h-4 w-4 bg-gray-200 rounded-full"></div>
                <div className="h-4 w-32 bg-gray-200 rounded"></div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const JobDetailSkeleton: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8 animate-pulse">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-8 w-48 bg-gray-300 rounded"></div>
              <div className="h-6 w-24 bg-gray-200 rounded-full"></div>
            </div>
            <div className="h-4 w-32 bg-gray-200 rounded"></div>
          </div>
          <div className="h-10 w-32 bg-gray-200 rounded-lg"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex items-start gap-3">
              <div className="h-10 w-10 bg-gray-200 rounded-xl flex-shrink-0"></div>
              <div className="w-full">
                <div className="h-3 w-20 bg-gray-200 rounded mb-2"></div>
                <div className="h-5 w-3/4 bg-gray-300 rounded mb-1"></div>
              </div>
            </div>
          ))}
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-4 space-y-4">
             {[1, 2, 3, 4].map(row => (
               <div key={row} className="flex gap-4 items-center">
                 <div className="h-4 w-24 bg-gray-200 rounded"></div>
                 <div className="h-4 w-48 bg-gray-200 rounded"></div>
                 <div className="h-8 w-32 bg-gray-200 rounded ml-auto"></div>
               </div>
             ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Main Component ---
const JobsManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL Params Routing State
  const activeJobId = searchParams.get("jobId") ? Number(searchParams.get("jobId")) : null;
  const activeDetailTab = (searchParams.get("tab") as EquipmentTab) || "pending";
  const viewMode = activeJobId ? "detail" : "list";

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const [selectedJob, setSelectedJob] = useState<InwardDetailResponse | null>(null);

  const [jobs, setJobs] = useState<InwardJob[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [expiredStandards, setExpiredStandards] = useState<string[]>([]);
  const [systemDrivenTypes, setSystemDrivenTypes] = useState<string[]>([]);

  // --- Smooth Pagination & Search State ---
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  
  const [currentPage, setCurrentPage] = useState(1); 
  const [limit, setLimit] = useState(100);
  const [serverTotalCount, setServerTotalCount] = useState(0);
  const [isServerPaginated, setIsServerPaginated] = useState(false);

  const [isFetchingData, setIsFetchingData] = useState(false);
  const [showLoaderOverlay, setShowLoaderOverlay] = useState(false);

  // 1. Debounce Search Term
  useEffect(() => {
    const timer = setTimeout(() => {
      if (debouncedSearch !== searchTerm) {
        setDebouncedSearch(searchTerm);
        setCurrentPage(1); // Reset page on new search
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm, debouncedSearch]);

  // 2. Smooth Loading Overlay
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isFetchingData) {
      timer = setTimeout(() => setShowLoaderOverlay(true), 200);
    } else {
      setShowLoaderOverlay(false);
    }
    return () => clearTimeout(timer);
  }, [isFetchingData]);

  // 3. Mount Calls
  useEffect(() => {
    fetchSystemDrivenTypes();
    checkExpiry();
  }, []);

  // 4. Fetch Trigger
  useEffect(() => {
    if (!activeJobId) {
      fetchJobs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, limit, debouncedSearch, filterStartDate, filterEndDate]);

  const fetchSystemDrivenTypes = async () => {
    try {
      const res = await api.get<FlowConfig[]>('/flow-configs');
      const activeTypes = res.data.filter(c => c.is_active).map(c => c.equipment_type.toLowerCase().trim());
      setSystemDrivenTypes(activeTypes);
    } catch (error) {}
  };

  const checkExpiry = async () => {
    try {
        const todayStr = new Date().toISOString().split('T')[0];
        const res = await api.post<ExpiryCheckResponse>('/calibration/check-expiry', { reference_date: todayStr });
        if (res.data?.affected_tables) setExpiredStandards(res.data.affected_tables);
    } catch (error) {}
  };

  // Route Handling
  useEffect(() => {
    const state = location.state as { viewJobId?: number; activeTab?: EquipmentTab } | null;
    if (state?.viewJobId) {
        setSearchParams({ jobId: state.viewJobId.toString(), tab: state.activeTab || "pending" });
        window.history.replaceState({}, document.title);
    }
  }, [location, setSearchParams]);

  // Detail View Data Fetcher
  useEffect(() => {
    if (activeJobId && (!selectedJob || selectedJob.inward_id !== activeJobId) && systemDrivenTypes.length > 0) {
        fetchJobDetails(activeJobId);
    } else if (!activeJobId) {
        setSelectedJob(null);
    }
  }, [activeJobId, systemDrivenTypes]);

  // ✅ SMART FETCH FUNCTION
  const fetchJobs = useCallback(async () => {
    try {
      setIsFetchingData(true);
      setErrorMsg(null);
      
      const skip = (currentPage - 1) * limit;
      const params: any = { skip, limit };

      if (debouncedSearch) params.search = debouncedSearch;
      if (filterStartDate) params.start_date = filterStartDate;
      if (filterEndDate) params.end_date = filterEndDate;

      const res = await api.get<any>('/flow-configs/system-driven-jobs', { params });
      
      if (res.data && typeof res.data === 'object' && 'total_count' in res.data) {
          // Backend is paginated
          setJobs(res.data.jobs || []);
          setServerTotalCount(res.data.total_count || 0);
          setIsServerPaginated(true);
      } else {
          // Backend returned EVERYTHING. Frontend pagination takes over.
          const data = Array.isArray(res.data) ? res.data : (res.data as any).data || [];
          setJobs(data);
          setIsServerPaginated(false);
      }
    } catch (error) {
      setErrorMsg("Failed to load jobs list.");
    } finally {
      setIsFetchingData(false);
    }
  }, [currentPage, limit, debouncedSearch, filterStartDate, filterEndDate]);

  const fetchJobDetails = async (id: number) => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const url = `${ENDPOINTS.STAFF.INWARDS}/${id}`;
      
      const res = await api.get<InwardDetailResponse>(url);
      const inwardData = res.data;

      if (inwardData.equipments) {
        const filteredEquipmentList = inwardData.equipments.filter(eq =>
          systemDrivenTypes.includes(eq.material_description.toLowerCase().trim())
        );
        inwardData.equipments = filteredEquipmentList;
      }
      
      if (inwardData.equipments && inwardData.equipments.length > 0) {
        const enrichedEquipments = await Promise.all(
            inwardData.equipments.map(async (eq) => {
                try {
                    const jobRes = await api.get<HtwJobResponse[]>(`/htw-jobs/`, { params: { inward_eqp_id: eq.inward_eqp_id } });
                    const jobData = jobRes.data.length > 0 ? jobRes.data[0] : null;
                    return { ...eq, job_id: jobData?.job_id, job_status: jobData?.job_status };
                } catch (err) {
                    return { ...eq, job_id: null, job_status: null };
                }
            })
        );
        inwardData.equipments = enrichedEquipments;
      }

      if (!inwardData.inward_srf_flag && !searchParams.get("tab")) {
          setSearchParams({ jobId: id.toString(), tab: "terminated" });
      }

      setSelectedJob(inwardData);
    } catch (error: any) {
      setErrorMsg("Could not load details.");
    } finally {
      setLoading(false);
    }
  };

  const getEquipmentCategory = (item: InwardEquipment): EquipmentTab | null => {
    if (selectedJob?.inward_srf_flag) return "terminated";
    if ((item.status || "").toLowerCase() === "pending") return null; 
    if (!item.job_id) return "pending";
    const jobStatus = (item.job_status || "").toLowerCase();
    if (jobStatus.includes("term") || jobStatus.includes("cancel") || jobStatus.includes("reject")) return "terminated";
    if (jobStatus.includes("complete") || jobStatus.includes("calibrated") || jobStatus.includes("done")) return "completed";
    return "in_progress";
  };

  const handleOpenJob = (id: number | undefined) => {
    if (id) {
        setSearchParams({ jobId: id.toString(), tab: "pending" });
    }
  };

  const handleTabChange = (tab: EquipmentTab) => {
      if (activeJobId) {
          setSearchParams({ jobId: activeJobId.toString(), tab: tab });
      }
  };

  const handleBackToList = () => {
    setSearchParams({}); // Clears URL routing params to go back to list
  };

  const handleStartCalibration = (inwardId: number, equipmentId: number) => {
    if (expiredStandards.length > 0) return;
    navigate(`/engineer/calibration/${inwardId}/${equipmentId}`, {
        state: { viewJobId: inwardId, activeTab: activeDetailTab } 
    });
  };

  const handleViewUncertaintyBudget = async (inwardId: number, equipmentId: number) => {
    try {
      setVerifyingId(equipmentId);
      await api.get(`/uncertainty/budget`, { params: { inward_eqp_id: equipmentId } });
      navigate(`/engineer/uncertainty-budget/${inwardId}/${equipmentId}`, {
          state: { viewJobId: inwardId, activeTab: activeDetailTab }
      });
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
          alert("Budget not calculated yet. Please finish calibration first.");
      } else {
          alert("Failed to retrieve budget details.");
      }
    } finally {
      setVerifyingId(null);
    }
  };

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-GB", { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const getStatusConfig = (status: string | null | undefined) => {
    const s = (status || "").toLowerCase();
    if (s.includes("complete") || s.includes("calibrated")) return { iconBg: "bg-green-100", iconText: "text-green-600", badge: "bg-green-50 text-green-700 border-green-200", icon: CheckCircle2 };
    if (s.includes("progress")) return { iconBg: "bg-blue-100", iconText: "text-blue-600", badge: "bg-blue-50 text-blue-700 border-blue-200", icon: Activity };
    if (s.includes("term") || s.includes("cancel")) return { iconBg: "bg-red-100", iconText: "text-red-600", badge: "bg-red-50 text-red-700 border-red-200", icon: XCircle };
    return { iconBg: "bg-teal-100", iconText: "text-teal-600", badge: "bg-gray-100 text-gray-600 border-gray-200", icon: Clock };
  };

  // ---------------------------------------------------------
  // ✅ DATA SLICING & MATH
  // ---------------------------------------------------------
  const filteredJobs = useMemo(() => {
    let result = jobs;
    if (!isServerPaginated && debouncedSearch) {
      const lowerTerm = debouncedSearch.toLowerCase();
      result = result.filter(job => job.srf_no.toLowerCase().includes(lowerTerm) || job.customer_dc_no.toLowerCase().includes(lowerTerm));
    }
    if (!isServerPaginated && filterStartDate) {
      result = result.filter(job => job.customer_dc_date && new Date(job.customer_dc_date) >= new Date(filterStartDate));
    }
    if (!isServerPaginated && filterEndDate) {
      result = result.filter(job => job.customer_dc_date && new Date(job.customer_dc_date) <= new Date(filterEndDate));
    }
    return result;
  }, [jobs, debouncedSearch, filterStartDate, filterEndDate, isServerPaginated]);

  const actualTotalCount = isServerPaginated ? serverTotalCount : filteredJobs.length;
  const totalPages = Math.max(1, Math.ceil(actualTotalCount / limit));
  const startRecord = actualTotalCount === 0 ? 0 : ((currentPage - 1) * limit) + 1;
  const endRecord = Math.min(currentPage * limit, actualTotalCount);

  const displayedJobs = useMemo(() => {
    if (isServerPaginated) return filteredJobs;
    const skip = (currentPage - 1) * limit;
    return filteredJobs.slice(skip, skip + limit);
  }, [filteredJobs, currentPage, limit, isServerPaginated]);

  const isStandardsExpired = expiredStandards.length > 0;

  // --- Reusable Pagination Controls ---
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
            disabled={currentPage === totalPages || isFetchingData || actualTotalCount === 0}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
    </div>
  );

  // =========================================================
  // DETAIL VIEW
  // =========================================================
  if (viewMode === "detail") {
    if (loading || !selectedJob) {
        return <JobDetailSkeleton />;
    }
    const filteredEquipments = (selectedJob.equipments || []).filter(eq => getEquipmentCategory(eq) === activeDetailTab);
    const counts = {
        pending: (selectedJob.equipments || []).filter(e => getEquipmentCategory(e) === "pending").length,
        in_progress: (selectedJob.equipments || []).filter(e => getEquipmentCategory(e) === "in_progress").length,
        completed: (selectedJob.equipments || []).filter(e => getEquipmentCategory(e) === "completed").length,
        terminated: (selectedJob.equipments || []).filter(e => getEquipmentCategory(e) === "terminated").length,
    };

    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-gray-900">Job Details</h1>
                        {selectedJob.inward_srf_flag && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                                <Ban className="h-3.5 w-3.5" />Terminated
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 text-gray-500 text-sm mt-1">
                        <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-700 border border-gray-200">
                            SRF: {selectedJob.srf_no}
                        </span>
                    </div>
                </div>
                <button onClick={handleBackToList} className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm">
                    <ArrowLeft className="h-4 w-4" />
                    <span>Back to List</span>
                </button>
            </div>
            {isStandardsExpired && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 shadow-sm animate-fade-in">
                    <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                    <div>
                        <h3 className="font-bold text-red-900 text-sm">Action Restricted: Master Standards Expired</h3>
                        <p className="text-red-700 text-xs mt-1">
                            New jobs cannot be started or updated because master standards have expired. You may only view the Uncertainty Budget for existing records. Please contact the administrator.
                        </p>
                    </div>
                </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
                    <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl"><User className="h-5 w-5" /></div>
                    <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</p>
                        <p className="font-medium text-gray-900 mt-1">{selectedJob.customer_details}</p>
                    </div>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
                    <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl"><FileText className="h-5 w-5" /></div>
                    <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">DC Details</p>
                        <p className="font-medium text-gray-900 mt-1">{selectedJob.customer_dc_no}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{formatDate(selectedJob.customer_dc_date)}</p>
                    </div>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
                    <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-teal-50 text-teal-600 rounded-xl"><Calendar className="h-5 w-5" /></div>
                    <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Inward Date</p>
                        <p className="font-medium text-gray-900 mt-1">{formatDate(selectedJob.material_inward_date)}</p>
                    </div>
                    </div>
                </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-gray-50 border-b border-gray-200 p-2">
                    <div className="flex space-x-1 overflow-x-auto">
                        <button onClick={() => handleTabChange("pending")} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeDetailTab === "pending" ? "bg-white text-gray-900 shadow-sm border border-gray-200" : "text-gray-500 hover:bg-gray-200"}`}>
                            <Clock className="h-4 w-4" /> Pending <span className="ml-1 bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full text-xs">{counts.pending}</span>
                        </button>
                        <button onClick={() => handleTabChange("in_progress")} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeDetailTab === "in_progress" ? "bg-white text-blue-700 shadow-sm border border-gray-200" : "text-gray-500 hover:bg-gray-200"}`}>
                            <Activity className="h-4 w-4" /> In Progress <span className="ml-1 bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs">{counts.in_progress}</span>
                        </button>
                        <button onClick={() => handleTabChange("completed")} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeDetailTab === "completed" || "Completed - OOT" ? "bg-white text-green-700 shadow-sm border border-gray-200" : "text-gray-500 hover:bg-gray-200"}`}>
                            <CheckCircle2 className="h-4 w-4" /> Completed <span className="ml-1 bg-green-100 text-green-800 px-2 py-0.5 rounded-full text-xs">{counts.completed}</span>
                        </button>
                        <button onClick={() => handleTabChange("terminated")} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeDetailTab === "terminated" ? "bg-white text-red-700 shadow-sm border border-gray-200" : "text-gray-500 hover:bg-gray-200"}`}>
                            <XCircle className="h-4 w-4" /> Terminated <span className="ml-1 bg-red-100 text-red-800 px-2 py-0.5 rounded-full text-xs">{counts.terminated}</span>
                        </button>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                    <thead>
                        <tr className="bg-gray-50/50 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-200">
                        <th className="px-6 py-4 font-semibold">NEPL ID</th>
                        <th className="px-6 py-4 font-semibold">Description</th>
                        <th className="px-6 py-4 font-semibold">Make/Model</th>
                        <th className="px-6 py-4 font-semibold">Serial No</th>
                        <th className="px-6 py-4 font-semibold">Job Status</th>
                        <th className="px-6 py-4 font-semibold text-center w-48">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                        {filteredEquipments.length > 0 ? (
                            filteredEquipments.map((item) => {
                                const displayStatus = selectedJob.inward_srf_flag ? "Terminated" : (item.job_status || "Not Started");
                                const statusConfig = getStatusConfig(selectedJob.inward_srf_flag ? "terminated" : item.job_status);
                                
                                // Check if the item is terminated (either entire SRF is terminated, or item is in terminated tab)
                                const isItemTerminated = selectedJob.inward_srf_flag || activeDetailTab === "terminated";

                                return (
                                <tr key={item.inward_eqp_id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 font-medium text-blue-600 align-top">{item.nepl_id}</td>
                                    <td className="px-6 py-4 text-gray-900 align-top">{item.material_description}</td>
                                    <td className="px-6 py-4 text-gray-700 align-top"><div className="font-medium text-gray-900">{item.make}</div><div className="text-gray-500 text-xs">{item.model}</div></td>
                                    <td className="px-6 py-4 text-gray-600 font-mono align-top">{item.serial_no}</td>
                                    <td className="px-6 py-4 align-top">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${statusConfig.badge}`}>
                                            {displayStatus}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center align-middle">
                                        <div className="flex flex-col gap-2 w-full">
                                            {isItemTerminated ? (
                                                <span className="text-xs text-red-500 italic flex items-center justify-center gap-1 font-semibold">
                                                    <Ban className="h-3.5 w-3.5" /> Action Disabled
                                                </span>
                                            ) : (
                                                <>
                                                    {!item.job_id && (
                                                        <button 
                                                            onClick={() => !isStandardsExpired && handleStartCalibration(selectedJob.inward_id, item.inward_eqp_id)} 
                                                            disabled={isStandardsExpired}
                                                            className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg shadow-sm w-full transition-colors ${isStandardsExpired ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                                                            {isStandardsExpired ? <Lock className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />} Start Job
                                                        </button>
                                                    )}
                                                    {item.job_id && activeDetailTab === 'in_progress' && (
                                                        <button 
                                                            onClick={() => !isStandardsExpired && handleStartCalibration(selectedJob.inward_id, item.inward_eqp_id)} 
                                                            disabled={isStandardsExpired}
                                                            className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg shadow-sm w-full transition-colors ${isStandardsExpired ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                                                            {isStandardsExpired ? <Lock className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />} Resume
                                                        </button>
                                                    )}
                                                    {item.job_id && activeDetailTab === 'completed' && (
                                                        <button 
                                                            onClick={() => !isStandardsExpired && handleStartCalibration(selectedJob.inward_id, item.inward_eqp_id)} 
                                                            disabled={isStandardsExpired}
                                                            className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg shadow-sm w-full transition-colors ${isStandardsExpired ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200' : 'bg-amber-600 text-white hover:bg-amber-700'}`}>
                                                            {isStandardsExpired ? <Lock className="h-3.5 w-3.5" /> : <Edit className="h-3.5 w-3.5" />} Edit Data
                                                        </button>
                                                    )}
                                                    {item.job_id && (
                                                        <button 
                                                            onClick={() => handleViewUncertaintyBudget(selectedJob.inward_id, item.inward_eqp_id)} 
                                                            disabled={verifyingId === item.inward_eqp_id} 
                                                            className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white text-blue-600 text-xs font-semibold rounded-lg hover:bg-blue-50 border border-blue-200 transition-colors shadow-sm w-full ${verifyingId === item.inward_eqp_id ? 'opacity-70 cursor-wait' : ''}`}>
                                                            {verifyingId === item.inward_eqp_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calculator className="h-3.5 w-3.5" />} Budget
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                                )
                            })
                        ) : (
                            <tr><td colSpan={6} className="px-6 py-16 text-center"><div className="flex flex-col items-center justify-center text-gray-400"><Package className="h-10 w-10 mb-3 opacity-30" /><p>No equipments found in <strong>{activeDetailTab.replace('_', ' ')}</strong> state.</p></div></td></tr>
                        )}
                    </tbody>
                    </table>
                </div>
            </div>
        </div>
      </div>
    );
  }

  // =========================================================
  // LIST VIEW
  // =========================================================
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header Title Area */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-teal-50 text-teal-600 rounded-xl border border-teal-100 shadow-sm">
              <ClipboardList className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Jobs Management</h2>
              <p className="text-gray-500 text-sm mt-1">Overview of Inwards, SRFs, and Customer DCs</p>
            </div>
          </div>
          <button type="button" onClick={() => navigate("/engineer")} className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm transition-all shadow-sm">
            <ArrowLeft size={16} />
            <span>Back to Dashboard</span>
          </button>
        </div>

        {/* Master Container for Search, Pagination, and List */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col relative z-0">
           
           {/* Top Search & Filter Actions */}
           <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-50/50 z-10 relative">
              <div className="relative max-w-md w-full">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-4 w-4 text-gray-400" />
                  </div>
                  <input 
                      type="text" 
                      value={searchTerm} 
                      onChange={(e) => setSearchTerm(e.target.value)} 
                      placeholder="Search by SRF or DC No..." 
                      className="pl-10 pr-4 py-2.5 w-full border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-shadow bg-white outline-none" 
                  />
              </div>
              <div className="flex items-center gap-2">
                  <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border transition-colors ${(showFilters || filterStartDate || filterEndDate) ? 'bg-teal-50 border-teal-200 text-teal-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                      <Filter className="h-4 w-4" /> Filters
                  </button>
              </div>
           </div>

           {/* Expandable Filter Box */}
           {(showFilters || filterStartDate || filterEndDate) && (
              <div className="px-5 py-4 bg-gray-50 border-b border-gray-100 flex flex-wrap items-end gap-4 z-10 relative">
                  <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">DC Start Date</label>
                      <input type="date" value={filterStartDate} onChange={(e) => { setFilterStartDate(e.target.value); setCurrentPage(1); }} className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none" />
                  </div>
                  <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">DC End Date</label>
                      <input type="date" value={filterEndDate} onChange={(e) => { setFilterEndDate(e.target.value); setCurrentPage(1); }} className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none" />
                  </div>
                  {(filterStartDate || filterEndDate) && (
                      <button onClick={() => { setFilterStartDate(""); setFilterEndDate(""); setCurrentPage(1); }} className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1">
                          <X className="h-4 w-4" /> Clear
                      </button>
                  )}
              </div>
           )}

           {/* TOP PAGINATION CONTROLS */}
           <div className="px-6 py-4 border-b border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4 bg-white z-10 relative">
               <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                   <div className="flex items-center gap-2">
                       <span className="text-xs text-gray-500 font-bold uppercase tracking-wider hidden sm:inline">Records:</span>
                       <select 
                            value={limit} 
                            onChange={(e) => {
                                setLimit(Number(e.target.value));
                                setCurrentPage(1);
                            }}
                            className="border border-gray-300 rounded-lg text-sm px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white cursor-pointer font-bold text-gray-700 shadow-sm outline-none"
                        >
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                            <option value={500}>500</option>
                       </select>
                   </div>
               </div>
               
               <div className="hidden sm:block">
                 <PaginationControls />
               </div>
           </div>

           {errorMsg && (
              <div className="m-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700 z-10 relative">
                  <AlertCircle className="h-5 w-5" /> <span>{errorMsg}</span>
              </div>
           )}

           {/* ── Table Body ── */}
           <div className="relative min-h-[400px] bg-white p-4 sm:p-6 flex-1">
               {/* Overlay that sits ON TOP of the list to prevent unmounting lag */}
               {showLoaderOverlay && (
                 <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/50 backdrop-blur-[2px] transition-all duration-300">
                    <Loader2 className="w-10 h-10 animate-spin text-teal-600 shadow-sm rounded-full mb-3" />
                    <p className="text-sm font-bold text-teal-800 bg-white/90 px-4 py-1.5 rounded-full shadow-sm border border-teal-100">
                      Loading Jobs...
                    </p>
                 </div>
               )}

                {displayedJobs.length === 0 && !isFetchingData ? (
                    <div className="text-center py-16">
                        <div className="inline-flex items-center justify-center p-4 bg-gray-50 rounded-full mb-4">
                            <Package className="h-10 w-10 text-gray-300" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900">No jobs found</h3>
                        <p className="text-gray-500 mt-1 max-w-sm mx-auto">No jobs match your search criteria.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {displayedJobs.map((job) => {
                            const config = getStatusConfig(job.status);
                            return (
                                <div 
                                  key={job.inward_id} 
                                  onClick={() => handleOpenJob(job.inward_id)} 
                                  className="flex items-center justify-between p-5 bg-white hover:bg-blue-50 border border-gray-200 rounded-xl transition-all cursor-pointer group shadow-sm hover:shadow-md"
                                >
                                    <div className="flex items-start gap-4">
                                        <div className={`mt-1 p-2.5 rounded-full transition-colors ${config.iconBg} ${config.iconText}`}>
                                            <config.icon size={20} />
                                        </div>
                                        <div>
                                            <p className="font-bold text-lg text-gray-800 group-hover:text-blue-700 transition-colors">
                                                SRF No: {job.srf_no || "N/A"}
                                            </p>
                                            <div className="text-sm text-gray-500 mt-1 font-medium flex items-center flex-wrap gap-y-2">
                                                <span className="text-gray-700">DC: {job.customer_dc_no || "N/A"}</span>
                                                <span className="mx-2 text-gray-300">|</span>
                                                <span>Received: {formatDate(job.customer_dc_date)}</span>
                                                <span className="mx-2 hidden sm:inline text-gray-300">|</span>
                                                
                                                {/* Compact Inline Badges */}
                                                <div className="flex items-center gap-2 sm:ml-1 w-full sm:w-auto">
                                                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold tracking-wide border bg-gray-50 text-gray-600 border-gray-200">
                                                        Pending: {job.pending_count}
                                                    </span>
                                                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold tracking-wide border bg-blue-50 text-blue-600 border-blue-200">
                                                        In Progress: {job.in_progress_count}
                                                    </span>
                                                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold tracking-wide border bg-green-50 text-green-600 border-green-200">
                                                        Completed: {job.completed_count}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-blue-600 transform group-hover:translate-x-1 transition-all flex-shrink-0 ml-2" />
                                </div>
                            );
                        })}
                    </div>
                )}
           </div>

           {/* BOTTOM PAGINATION CONTROLS */}
           {actualTotalCount > 0 && (
             <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex flex-col sm:flex-row items-center justify-between z-10 relative shrink-0 gap-4">
                <span className="text-sm text-gray-600 font-medium">
                  Showing <span className="font-bold">{startRecord}</span> to{' '}
                  <span className="font-bold">{endRecord}</span> of{' '}
                  <span className="font-bold">{actualTotalCount}</span> records
                </span>
                
                <PaginationControls />
             </div>
           )}

        </div>
      </div>
    </div>
  );
};

export default JobsManagementPage;
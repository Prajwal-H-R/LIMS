import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Eye, 
  Edit, 
  Printer, 
  Search, 
  Calendar, 
  Building, 
  FileText,
  Loader2,
  ArrowLeft,
  Filter,
  SortAsc,
  SortDesc,
  Download,
  FileDown, 
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { api, ENDPOINTS } from "../api/config";
import { InwardDetail } from "../types/inward";
import { generateStandardInwardPDF } from '../utils/InwardPDFHelper';

interface PaginatedResponse {
  total_count: number;
  inwards: InwardDetail[];
}

export const ViewUpdateInward: React.FC = () => {
  const navigate = useNavigate();
  
  // --- Data & Pagination State ---
  const [inwards, setInwards] = useState<InwardDetail[]>([]);
  const [filteredInwards, setFilteredInwards] = useState<InwardDetail[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  
  // Refined Loading States
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isFetchingData, setIsFetchingData] = useState(false);
  const [showLoaderOverlay, setShowLoaderOverlay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [page, setPage] = useState<number>(0);
  const [limit, setLimit] = useState<number>(100);

  // --- Filter/Sort States ---
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState<keyof InwardDetail>("material_inward_date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  
  // Date filters sent to backend
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [debouncedStartDate, setDebouncedStartDate] = useState("");
  const [debouncedEndDate, setDebouncedEndDate] = useState("");
  
  // --- Action States ---
  const [isExporting, setIsExporting] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

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
      setDebouncedSearch(searchTerm);
      setDebouncedStartDate(startDate);
      setDebouncedEndDate(endDate);
      setPage(0); // Reset page to 0 on new search
    }, 400);

    return () => clearTimeout(handler);
  }, [searchTerm, startDate, endDate]);

  // --- Handle Limit Change ---
  const handleLimitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLimit(Number(e.target.value));
    setPage(0); 
  };

  // --- Handle Status Change ---
  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value);
    setPage(0); 
  };

  // --- Server-Side Fetch ---
  const fetchInwards = useCallback(async () => {
    setIsFetchingData(true);
    setError(null);
    try {
      const response = await api.get<PaginatedResponse>(ENDPOINTS.STAFF.INWARDS, {
        params: {
          skip: page * limit,
          limit: limit,
          search: debouncedSearch || undefined,
          start_date: debouncedStartDate || undefined,
          end_date: debouncedEndDate || undefined,
          status: statusFilter !== "all" ? statusFilter : undefined,
        }
      });
      setInwards(response.data.inwards);
      setTotalCount(response.data.total_count);
    } catch (error) {
      console.error("Error fetching inwards:", error);
      setError("Failed to load inward records. Please try again.");
    } finally {
      setIsFetchingData(false);
      setIsInitialLoad(false); 
    }
  }, [page, limit, debouncedSearch, debouncedStartDate, debouncedEndDate, statusFilter]);

  useEffect(() => {
    fetchInwards();
  }, [fetchInwards]);

  // --- Frontend Sort (Applies to current fetched chunk) ---
  useEffect(() => {
    let filtered = [...inwards];
    
    // Local Sort Logic
    filtered.sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];

      if (aValue == null) return 1;
      if (bValue == null) return -1;

      let comparison = 0;
      if (sortField === 'material_inward_date') {
        comparison = new Date(aValue as string).getTime() - new Date(bValue as string).getTime();
      } else {
        if (aValue < bValue) comparison = -1;
        else if (aValue > bValue) comparison = 1;
      }

      return sortOrder === 'desc' ? comparison * -1 : comparison;
    });

    setFilteredInwards(filtered);
  }, [inwards, sortField, sortOrder]);


  // --- Selection Handlers ---
  const handleSelectAll = () => {
    if (selectedIds.length === filteredInwards.length && filteredInwards.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredInwards.map(i => i.inward_id));
    }
  };

  const handleSelectRow = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(selectedId => selectedId !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  // --- Action Handlers (PDF & Excel) ---
  const handleDownloadSelectedPDFs = async () => {
    if (selectedIds.length === 0) {
      alert("Please select at least one record to download.");
      return;
    }

    setIsDownloadingPdf(true);
    
    try {
      for (const id of selectedIds) {
        try {
          const response = await api.get<InwardDetail>(`${ENDPOINTS.STAFF.INWARDS}/${id}`);
          const fullInwardData = response.data;

          if (fullInwardData) {
            const customerData = (fullInwardData as any).customer;
            const pdfFormData = {
              srf_no: fullInwardData.srf_no,
              material_inward_date: fullInwardData.material_inward_date,
              receiver: fullInwardData.receiver || '',
              customer_details: fullInwardData.customer_details,
              customer_dc_no: (fullInwardData as any).customer_dc_no || '',
              customer_dc_date: (fullInwardData as any).customer_dc_date || '',
              contact_person: customerData?.contact_person || '',
              phone: customerData?.phone || '',
              email: customerData?.email || '',
              ship_to_address: customerData?.ship_to_address || '',
              bill_to_address: customerData?.bill_to_address || ''
            };

            const formattedEquipment = (fullInwardData.equipments || []).map((eq: any, index: number) => ({
              nepl_id: `${fullInwardData.srf_no}-${index + 1}`,
              material_desc: eq.material_description,
              make: eq.make,
              model: eq.model,
              serial_no: eq.serial_no,
              range: eq.range,
              qty: eq.quantity, 
              supplier: eq.supplier,
              in_dc: eq.in_dc,
              out_dc: eq.out_dc,
              calibration_by: eq.calibration_by,
              nextage_ref: eq.nextage_contract_reference,
              accessories_included: eq.accessories_included,
              inspe_status: eq.visual_inspection_notes, 
              engineer_remarks: eq.engineer_remarks,
              remarks_and_decision: eq.customer_remarks
            }));

            generateStandardInwardPDF(pdfFormData, formattedEquipment);
            await new Promise(resolve => setTimeout(resolve, 800));
          }
        } catch (err) {
          console.error(`Failed to fetch/generate PDF for ID ${id}`, err);
        }
      }
    } catch (error) {
      console.error("Batch download error:", error);
      alert("An error occurred while processing downloads.");
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleExportToExcel = async () => {
    if (selectedIds.length === 0) {
      alert("Please select at least one record to export.");
      return;
    }

    setIsExporting(true);
    try {
      const response = await api.post(
        ENDPOINTS.STAFF.INWARD_EXPORT_BATCH_INWARD_ONLY,
        { inward_ids: selectedIds },
        { responseType: "blob" }
      );

      const blob = new Blob([response.data], {
        type: response.headers["content-type"] || 
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
      link.href = url;
      link.download = `inwards_export_${timestamp}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export inwards:", error);
      alert("Failed to export inwards. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  // --- Navigation Handlers ---
  const handleSort = (field: keyof InwardDetail) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const handleViewInward = (inwardId: number) => navigate(`/engineer/view-inward/${inwardId}`);
  const handleEditInward = (inwardId: number) => navigate(`/engineer/edit-inward/${inwardId}`);
  const handlePrintStickers = (inwardId: number) => navigate(`/engineer/print-stickers/${inwardId}`);

  // --- UI Helpers ---
  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "created": return "bg-blue-100 text-blue-800";
      case "updated": return "bg-purple-100 text-purple-800";
      case "in_progress": return "bg-yellow-100 text-yellow-800";
      case "reviewed": return "bg-green-100 text-green-800";
      case "cancelled": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const SortIcon = ({ field }: { field: keyof InwardDetail }) => {
    if (sortField !== field) return <SortAsc className="w-4 h-4 text-gray-400" />;
    return sortOrder === "asc" ? 
      <SortAsc className="w-4 h-4 text-blue-600" /> : 
      <SortDesc className="w-4 h-4 text-blue-600" />;
  };

  // Pagination Values
  const totalPages = Math.ceil(totalCount / limit);
  const hasNextPage = page < totalPages - 1;
  const hasPrevPage = page > 0;

  // --- RENDER ---
  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b pb-4 mb-6 gap-4">
        <div className="flex items-center space-x-4">
          <FileText className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">View & Update Inward</h1>
            <p className="text-gray-600">Manage existing inward records</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/engineer')}
            className="flex items-center space-x-2 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-semibold transition-colors"
          >
            <ArrowLeft size={20} />
            <span>Back to Dashboard</span>
          </button>
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search by SRF, Customer or DC No..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all outline-none"
            />
            {isFetchingData && !isInitialLoad && debouncedSearch !== searchTerm && (
              <Loader2 className="absolute right-3 top-2.5 text-blue-500 animate-spin" size={18} />
            )}
          </div>
          
          {/* Global Status Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <select
              value={statusFilter}
              onChange={handleStatusChange}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 appearance-none outline-none font-medium"
            >
              <option value="all">All Status</option>
              <option value="created">Created</option>
              <option value="updated">Updated</option>
              <option value="reviewed">Reviewed</option>
              <option value="srf_created">SRF Created</option>
            </select>
          </div>

          {/* TOP PAGINATION CONTROLS (Exact Match to Bottom) */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3">
            {selectedIds.length > 0 && (
              <span className="text-sm font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                {selectedIds.length} Selected
              </span>
            )}
            
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
          </div>
        </div>

        {/* Date Range & Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportToExcel}
              disabled={isExporting || selectedIds.length === 0 || isFetchingData}
              className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold text-sm transition-colors"
              title="Select checkboxes to export to Excel"
            >
              {isExporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
              <span>Excel {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}</span>
            </button>

            <button
              onClick={handleDownloadSelectedPDFs}
              disabled={isDownloadingPdf || selectedIds.length === 0 || isFetchingData}
              className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold text-sm transition-colors"
              title="Select checkboxes to download multiple PDFs"
            >
              {isDownloadingPdf ? <Loader2 className="animate-spin" size={16} /> : <FileDown size={16} />}
              <span>PDF {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}</span>
            </button>

            {(startDate || endDate || statusFilter !== 'all') && (
              <button
                onClick={() => { setStartDate(""); setEndDate(""); setStatusFilter("all"); setPage(0); }}
                className="px-3 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-semibold text-sm transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Records per page selector (Placed directly below Dates) */}
        <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
          <span className="text-sm text-gray-500 font-medium ml-1">Records per page:</span>
          <select
            value={limit}
            onChange={handleLimitChange}
            disabled={isFetchingData}
            className="border border-gray-300 bg-white rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm cursor-pointer disabled:opacity-50"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={500}>500</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={fetchInwards} className="bg-red-600 text-white px-3 py-1 rounded-lg text-sm hover:bg-red-700">Retry</button>
        </div>
      )}

      {/* Table Area (Contains Overlay and Table) */}
      <div className="overflow-x-auto border rounded-lg bg-white shadow-sm relative min-h-[400px]">
        
        {/* OVERLAY SPINNER (Shows during search/pagination, hides original data) */}
        {showLoaderOverlay && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/50 backdrop-blur-[2px] transition-all duration-300 rounded-lg">
            <Loader2 className="w-10 h-10 animate-spin text-blue-600 shadow-sm rounded-full mb-3" />
            <p className="text-sm font-bold text-blue-800 bg-white/90 px-4 py-1.5 rounded-full shadow-sm border border-blue-100">
              Loading Data...
            </p>
          </div>
        )}

        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-4 w-10 text-center">
                 <button 
                  onClick={handleSelectAll}
                  className="text-gray-600 hover:text-blue-600 focus:outline-none"
                  disabled={isFetchingData}
                 >
                   {filteredInwards.length > 0 && selectedIds.length === filteredInwards.length && !isFetchingData ? (
                     <CheckSquare size={20} className="text-blue-600" />
                   ) : (
                     <Square size={20} />
                   )}
                 </button>
              </th>
              <th className="p-4 text-left text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleSort("srf_no")}>
                <div className="flex items-center gap-2">SRF No <SortIcon field="srf_no" /></div>
              </th>
              <th className="p-4 text-left text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleSort("material_inward_date")}>
                <div className="flex items-center gap-2">Date <SortIcon field="material_inward_date" /></div>
              </th>
              <th className="p-4 text-left text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleSort("customer_details")}>
                <div className="flex items-center gap-2">Customer <SortIcon field="customer_details" /></div>
              </th>
              <th className="p-4 text-left text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleSort("customer_dc_no")}>
                <div className="flex items-center gap-2">DC Number <SortIcon field="customer_dc_no" /></div>
              </th>
              <th className="p-4 text-center text-xs font-semibold text-gray-600 uppercase">Qty</th>
              <th className="p-4 text-left text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleSort("status")}>
                <div className="flex items-center gap-2">Status <SortIcon field="status" /></div>
              </th>
              <th className="p-4 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {/* SKELETONS ONLY FOR THE VERY FIRST LOAD */}
            {isInitialLoad ? (
              [...Array(limit > 10 ? 10 : limit)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="p-4 text-center"><div className="w-5 h-5 bg-gray-200 rounded mx-auto" /></td>
                  <td className="p-4"><div className="w-24 h-4 bg-gray-200 rounded" /></td>
                  <td className="p-4"><div className="w-20 h-4 bg-gray-200 rounded" /></td>
                  <td className="p-4"><div className="w-48 h-4 bg-gray-200 rounded" /></td>
                  <td className="p-4"><div className="w-24 h-4 bg-gray-200 rounded" /></td>
                  <td className="p-4"><div className="w-8 h-6 bg-gray-200 rounded-full mx-auto" /></td>
                  <td className="p-4"><div className="w-20 h-6 bg-gray-200 rounded-full" /></td>
                  <td className="p-4 flex justify-center gap-2">
                    <div className="w-8 h-8 bg-gray-200 rounded-full" />
                    <div className="w-8 h-8 bg-gray-200 rounded-full" />
                  </td>
                </tr>
              ))
            ) : filteredInwards.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-12 text-center text-gray-500">
                  <div className="flex flex-col items-center">
                    <Search size={40} className="text-gray-300 mb-3" />
                    <span className="text-lg">No records match your search criteria</span>
                  </div>
                </td>
              </tr>
            ) : (
              filteredInwards.map((inward) => {
                const isSelected = selectedIds.includes(inward.inward_id);
                return (
                  <tr key={inward.inward_id} className={`hover:bg-blue-50/50 transition-colors ${isSelected ? 'bg-blue-50' : ''}`}>
                    <td className="p-4 text-center">
                      <button onClick={() => handleSelectRow(inward.inward_id)} className="focus:outline-none">
                        {isSelected ? <CheckSquare size={20} className="text-blue-600" /> : <Square size={20} className="text-gray-400 hover:text-gray-600" />}
                      </button>
                    </td>
                    <td className="p-4"><div className="font-mono font-bold text-blue-600">{inward.srf_no}</div></td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span className="font-medium text-gray-600">{new Date(inward.material_inward_date).toLocaleDateString()}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-start gap-2">
                        <Building className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                        <span className="text-gray-800 line-clamp-2" title={inward.customer_details}>{inward.customer_details.split('\n')[0]}</span>
                      </div>
                    </td>
                    <td className="p-4"><span className="text-gray-600 font-medium">{(inward as any).customer_dc_no || "-"}</span></td>
                    <td className="p-4 text-center">
                      <span className="text-xs font-bold px-2 py-1 rounded bg-gray-100 text-gray-700 border">
                        {inward.equipments ? inward.equipments.length : 0}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold capitalize ${getStatusColor(inward.status)}`}>
                        {inward.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => handleViewInward(inward.inward_id)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors" title="View Inward">
                          <Eye size={18} />
                        </button>
                        <button onClick={() => handleEditInward(inward.inward_id)} className="p-2 text-gray-500 hover:text-amber-600 hover:bg-amber-100 rounded-lg transition-colors" title="Edit Inward">
                          <Edit size={18} />
                        </button>
                        <button onClick={() => handlePrintStickers(inward.inward_id)} className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-100 rounded-lg transition-colors" title="Print Stickers">
                          <Printer size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom Pagination Controls (Mirrored from top) */}
      <div className="mt-6 flex justify-center w-full">
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
      </div>
    </div>
  );
};

export default ViewUpdateInward;
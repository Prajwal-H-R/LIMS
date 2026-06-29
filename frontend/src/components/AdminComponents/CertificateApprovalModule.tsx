import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { 
  Award, Eye, CheckCircle, Send, Loader2, X, FileText, Search, ArrowLeft, 
  Download, RotateCcw, ChevronRight, Package, ChevronDown, ChevronUp, Printer,
  ChevronLeft
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api, ENDPOINTS } from '../../api/config';
import { CustomerCertificatePrintView } from '../CustomerCertificatePrintView';

// --- Types ---

interface Certificate {
  certificate_id: number;
  job_id: number;
  inward_id: number | null;
  inward_eqp_id: number | null;
  certificate_no: string;
  date_of_calibration: string;
  ulr_no: string | null;
  field_of_parameter: string | null;
  recommended_cal_due_date: string | null;
  authorised_signatory: string | null;
  status: string;
  created_at: string | null;
  srf_no?: string | null;
  nepl_id?: string | null;
  material_description?: string | null;
}

interface SrfGroupEquipment {
  inward_eqp_id: number;
  nepl_id: string;
  material_description: string;
  make?: string;
  model?: string;
  serial_no?: string;
  job_id: number;
  job_status: string;
  calibration_date: string | null;
  certificate: Certificate | null;
}

interface SrfGroup {
  inward_id: number;
  srf_no: string;
  customer_details?: string;
  customer_dc_no?: string;
  customer_dc_date?: string;
  total_equipment_count?: number;
  equipments: SrfGroupEquipment[];
  filteredCerts: Certificate[]; // Added for rendering mapping
}

const SECTION_KEYS = {
  PENDING: 'CREATED',
  READY: 'APPROVED',
  ISSUED: 'ISSUED',
} as const;

type SectionKey = (typeof SECTION_KEYS)[keyof typeof SECTION_KEYS];

const SECTION_LABELS: Record<SectionKey, string> = {
  [SECTION_KEYS.PENDING]: 'Pending Approval',
  [SECTION_KEYS.READY]: 'Ready to Issue',
  [SECTION_KEYS.ISSUED]: 'Issued',
};

const SECTION_COLORS: Record<SectionKey, string> = {
  [SECTION_KEYS.PENDING]: 'text-blue-600 border-blue-500',
  [SECTION_KEYS.READY]: 'text-emerald-600 border-emerald-500',
  [SECTION_KEYS.ISSUED]: 'text-green-600 border-green-500',
};

// --- Skeleton ---

const CertificateListSkeleton = () => (
  <div className="space-y-4">
    {[1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="flex items-center justify-between p-5 bg-white border border-gray-200 rounded-xl animate-pulse">
        <div className="flex items-start gap-4 w-full">
          <div className="mt-1 h-10 w-10 bg-gray-200 rounded-full flex-shrink-0" />
          <div className="w-full">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-6 w-40 bg-gray-300 rounded" />
              <div className="h-5 w-24 bg-gray-200 rounded-full" />
            </div>
            <div className="h-4 w-56 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

// --- Main Component ---

export const CertificateApprovalModule: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Navigation / View State
  const [activeTab, setActiveTab] = useState<SectionKey>(() => {
    const s = searchParams.get('section');
    if (s === 'ready' || s === 'issued') return s === 'ready' ? SECTION_KEYS.READY : SECTION_KEYS.ISSUED;
    return SECTION_KEYS.PENDING;
  });

  // Smooth Server-Side Pagination & Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1); 
  const [limit, setLimit] = useState(100);
  const [totalCount, setTotalCount] = useState(0); // Store server's total count

  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingData, setIsFetchingData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data State
  const [displayedGroups, setDisplayedGroups] = useState<SrfGroup[]>([]);
  const [expandedSrfs, setExpandedSrfs] = useState<Set<string>>(new Set());

  // Modals & Action State
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showReworkModal, setShowReworkModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadCertData, setDownloadCertData] = useState<{ id: number; no: string | null } | null>(null);
  const [includeLetterhead, setIncludeLetterhead] = useState(true);
  
  const [selectedCertificate, setSelectedCertificate] = useState<Certificate | null>(null);
  const [authorisedSignatory, setAuthorisedSignatory] = useState('');
  const [reworkComment, setReworkComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Bulk Actions
  const [selectedForBulkDownload, setSelectedForBulkDownload] = useState<Set<number>>(new Set());
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [showBulkDownloadModal, setShowBulkDownloadModal] = useState(false);
  const [bulkIncludeLetterhead, setBulkIncludeLetterhead] = useState(true);
  const [selectedForApproval, setSelectedForApproval] = useState<Set<number>>(new Set());
  const [showApproveAllModal, setShowApproveAllModal] = useState(false);
  const [approveAllCerts, setApproveAllCerts] = useState<Certificate[]>([]);

  // 1. Debounce Search to prevent freezing the UI or spamming the server
  useEffect(() => {
    const timer = setTimeout(() => {
      if (debouncedSearch !== searchTerm) {
        setDebouncedSearch(searchTerm);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm, debouncedSearch]);

  // Reset page to 1 when any filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, debouncedSearch, startDate, endDate, limit]);

  // 2. High-Speed Server-Side Fetch Function
  const fetchData = useCallback(async () => {
    try {
      setIsFetchingData(true);
      setError(null);
      
      const params: any = { 
        skip: (currentPage - 1) * limit,
        limit: limit,
        status: activeTab, // Server directly handles tab filtering
      };

      if (debouncedSearch) params.search = debouncedSearch;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const res = await api.get<any>(ENDPOINTS.CERTIFICATES.SRF_GROUPS, { params });
      
      // Ensure smooth mapping to match UI requirements
      const rawData = res.data?.items ? res.data.items : (Array.isArray(res.data) ? res.data : []);
      const totalRecords = res.data?.total_count || 0;

      // Map out certificates for easy UI access (Backend already did the strict filtering)
      const mappedGroups = rawData.map((group: any) => ({
        ...group,
        filteredCerts: (group.equipments || [])
          .map((eq: any) => eq.certificate)
          .filter((c: any) => c !== null)
      }));
      
      setDisplayedGroups(mappedGroups);
      setTotalCount(totalRecords);
      setExpandedSrfs(new Set(mappedGroups.map((g: any) => g.srf_no)));
    } catch (err: any) {
      console.error("Failed to fetch data:", err);
      setError(err.response?.data?.detail || "Failed to load records.");
    } finally {
      setIsFetchingData(false);
      setIsLoading(false);
    }
  }, [currentPage, limit, activeTab, debouncedSearch, startDate, endDate]);

  // Fetch data cleanly whenever dependencies change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const hasActiveFilters = !!searchTerm || !!startDate || !!endDate;
  
  // Calculate ACCURATE pagination states
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const startRecord = totalCount === 0 ? 0 : ((currentPage - 1) * limit) + 1;
  const endRecord = Math.min(currentPage * limit, totalCount);

  const formatDate = (d?: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const resetFilters = () => {
    setSearchTerm('');
    setStartDate('');
    setEndDate('');
  };

  const toggleSrf = (key: string) => {
    setExpandedSrfs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // --- Actions ---

  const handleOpenApprove = (cert: Certificate) => {
    setSelectedCertificate(cert);
    setAuthorisedSignatory(cert.authorised_signatory || 'Ramesh Ramakrishna');
    setShowApproveModal(true);
  };

  const handleOpenRework = (cert: Certificate) => {
    setSelectedCertificate(cert);
    setReworkComment('');
    setShowReworkModal(true);
  };

  const handleApprove = async () => {
    if (!selectedCertificate || !authorisedSignatory.trim()) { toast.error('Enter Authorised Signatory name.'); return; }
    setIsSubmitting(true);
    try {
      await api.post(ENDPOINTS.CERTIFICATES.APPROVE(selectedCertificate.certificate_id), { authorised_signatory: authorisedSignatory.trim() });
      setShowApproveModal(false); setSelectedCertificate(null); setAuthorisedSignatory('');
      toast.success("Certificate Approved");
      fetchData();
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Failed to approve.'); } finally { setIsSubmitting(false); }
  };

  const handleRework = async () => {
    if (!selectedCertificate || !reworkComment.trim()) { toast.error('Enter a rework comment.'); return; }
    setIsSubmitting(true);
    try {
      await api.post(ENDPOINTS.CERTIFICATES.REWORK(selectedCertificate.certificate_id), { rework_comment: reworkComment.trim() });
      setShowReworkModal(false); setSelectedCertificate(null); setReworkComment('');
      toast.success("Sent for Rework");
      fetchData();
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Failed to send for rework.'); } finally { setIsSubmitting(false); }
  };

  const handleIssue = async (cert: Certificate) => {
    if (!confirm('Issue this certificate? It will become visible in Customer Portal.')) return;
    setIsSubmitting(true);
    try {
      await api.post(ENDPOINTS.CERTIFICATES.ISSUE(cert.certificate_id));
      toast.success("Certificate Issued");
      fetchData();
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Failed to issue.'); } finally { setIsSubmitting(false); }
  };

  const handleApproveSelectedForSrf = (certs: Certificate[]) => {
    const toApprove = certs.filter((c) => selectedForApproval.has(c.certificate_id));
    if (toApprove.length === 0) return;
    setApproveAllCerts(toApprove);
    setAuthorisedSignatory(toApprove[0]?.authorised_signatory || 'Ramesh Ramakrishna');
    setShowApproveAllModal(true);
  };

  const handleApproveAllForSrf = (certs: Certificate[]) => {
    setApproveAllCerts(certs);
    setAuthorisedSignatory(certs[0]?.authorised_signatory || 'Ramesh Ramakrishna');
    setShowApproveAllModal(true);
  };

  const handleConfirmApproveAll = async () => {
    if (!authorisedSignatory.trim() || approveAllCerts.length === 0) return;
    setIsSubmitting(true);
    try {
      for (const cert of approveAllCerts) {
        await api.post(ENDPOINTS.CERTIFICATES.APPROVE(cert.certificate_id), { authorised_signatory: authorisedSignatory.trim() });
      }
      setShowApproveAllModal(false); setApproveAllCerts([]); setAuthorisedSignatory('');
      toast.success("Certificates Approved");
      fetchData();
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Failed to approve.'); } finally { setIsSubmitting(false); }
  };

  const handleIssueAllForSrf = async (certs: Certificate[]) => {
    if (certs.length === 0) return;
    if (!confirm(`Issue all ${certs.length} certificate(s) in this SRF?`)) return;
    setIsSubmitting(true);
    try {
      for (const cert of certs) {
        await api.post(ENDPOINTS.CERTIFICATES.ISSUE(cert.certificate_id));
      }
      toast.success("Certificates Issued");
      fetchData();
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Failed to issue.'); } finally { setIsSubmitting(false); }
  };

  const toggleApprovalSelection = (certId: number) => {
    setSelectedForApproval((prev) => { const next = new Set(prev); if (next.has(certId)) next.delete(certId); else next.add(certId); return next; });
  };
  const toggleSrfApprovalSelection = (certs: Certificate[]) => {
    const ids = certs.map((c) => c.certificate_id);
    const allSelected = ids.every((id) => selectedForApproval.has(id));
    setSelectedForApproval((prev) => { const next = new Set(prev); if (allSelected) ids.forEach((id) => next.delete(id)); else ids.forEach((id) => next.add(id)); return next; });
  };

  const isBulkDownloadTab = activeTab === SECTION_KEYS.READY || activeTab === SECTION_KEYS.ISSUED;
  // Select all based ONLY on currently paginated (visible) rows
  const bulkCertIds = displayedGroups.flatMap((g) => g.filteredCerts.map((c) => c.certificate_id));

  const toggleBulkSelection = (certId: number) => {
    setSelectedForBulkDownload((prev) => { const next = new Set(prev); if (next.has(certId)) next.delete(certId); else next.add(certId); return next; });
  };
  const toggleSrfSelection = (certs: Certificate[]) => {
    const ids = certs.map((c) => c.certificate_id);
    const allSelected = ids.every((id) => selectedForBulkDownload.has(id));
    setSelectedForBulkDownload((prev) => { const next = new Set(prev); if (allSelected) ids.forEach((id) => next.delete(id)); else ids.forEach((id) => next.add(id)); return next; });
  };
  const toggleBulkSelectAll = () => {
    if (bulkCertIds.length === 0) return;
    const allSelected = bulkCertIds.every((id) => selectedForBulkDownload.has(id));
    if (allSelected) setSelectedForBulkDownload(new Set()); else setSelectedForBulkDownload(new Set(bulkCertIds));
  };

  const handleInitiateDownload = (cert: Certificate) => {
    setDownloadCertData({ id: cert.certificate_id, no: cert.certificate_no });
    setIncludeLetterhead(true); setShowDownloadModal(true);
  };
  const handleConfirmDownload = async () => {
    if (!downloadCertData) return;
    const noHeaderFooter = !includeLetterhead;
    try {
      const url = `${ENDPOINTS.CERTIFICATES.DOWNLOAD_PDF(downloadCertData.id)}${noHeaderFooter ? '?no_header_footer=true' : ''}`;
      const res = await api.get(url, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const filename = res.headers?.['content-disposition']?.match(/filename="?([^";\n]+)"?/)?.[1] || `certificate_${downloadCertData.no || downloadCertData.id}.pdf`.replace(/\//g, '-');
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; link.click(); URL.revokeObjectURL(link.href);
      setShowDownloadModal(false); setDownloadCertData(null);
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Failed to download PDF.'); }
  };

  const handleBulkDownloadClick = () => {
    if (selectedForBulkDownload.size === 0) return;
    setBulkIncludeLetterhead(includeLetterhead); setShowBulkDownloadModal(true);
  };
  const handleConfirmBulkDownload = async () => {
    setBulkDownloading(true);
    try {
      const res = await api.post(ENDPOINTS.CERTIFICATES.DOWNLOAD_BULK_PDF, { certificate_ids: Array.from(selectedForBulkDownload), no_header_footer: !bulkIncludeLetterhead }, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/zip' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'certificates.zip'; link.click(); URL.revokeObjectURL(link.href);
      setShowBulkDownloadModal(false);
      toast.success(`Downloaded ${selectedForBulkDownload.size} certificates.`);
    } catch (err: any) { toast.error(err.response?.data instanceof Blob ? 'Bulk download failed.' : err.response?.data?.detail || 'Bulk download failed.'); } finally { setBulkDownloading(false); }
  };

  const handleOpenPreview = async (cert: Certificate) => {
    setSelectedCertificate(cert); setShowPreviewModal(true); setPreviewLoading(true); setPreviewData(null);
    try {
      const res = await api.get(ENDPOINTS.CERTIFICATES.PREVIEW(cert.certificate_id));
      setPreviewData(res.data);
    } catch (err) { } finally { setPreviewLoading(false); }
  };

  const handleBackToDashboard = () => { setSearchParams({ section: 'dashboard' }); };

  const renderCertificateCard = (cert: Certificate, type: 'approve' | 'issue' | 'issued', bulk?: { selected: boolean; onToggle: () => void }) => (
    <div key={cert.certificate_id} className="flex items-center justify-between p-5 bg-white hover:bg-blue-50 border border-gray-200 rounded-xl transition-all duration-200 group shadow-sm">
      {bulk && (
        <div className="flex-shrink-0 pr-3">
          <label className="flex items-center cursor-pointer">
            <input type="checkbox" checked={bulk.selected} onChange={bulk.onToggle} className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
          </label>
        </div>
      )}
      <div className="flex items-start gap-4 flex-1 min-w-0">
        <div className="mt-1 flex-shrink-0">
          <div className="p-2 rounded-full bg-blue-100 text-blue-600"><FileText size={20} /></div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="font-semibold text-lg text-gray-800">{cert.certificate_no || `CERT-${cert.certificate_id}`}</p>
            {cert.srf_no && <span className="text-sm text-gray-500 font-mono bg-gray-100 px-2 py-0.5 rounded border border-gray-200">SRF: {cert.srf_no}</span>}
          </div>
          <p className="text-sm text-gray-600 mt-1">
            {cert.material_description && <span className="block text-gray-700 font-medium">{cert.nepl_id} - {cert.material_description}</span>}
            Job #{cert.job_id} • Cal: {formatDate(cert.date_of_calibration)}
            {cert.ulr_no && <> • ULR: <span className="font-mono text-indigo-700">{cert.ulr_no}</span></>}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-4">
        <button onClick={() => handleOpenPreview(cert)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Preview"><Eye className="h-4 w-4" /></button>
        <button onClick={() => handleInitiateDownload(cert)} className="p-2 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Download PDF"><Download className="h-4 w-4" /></button>
        {type === 'approve' && (
          <>
            <button onClick={() => handleOpenRework(cert)} disabled={isSubmitting} className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-800 border border-amber-200 text-sm font-medium rounded-lg hover:bg-amber-200 disabled:opacity-50"><RotateCcw className="h-4 w-4" /> Rework</button>
            <button onClick={() => handleOpenApprove(cert)} disabled={isSubmitting} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-sm">{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />} Approve</button>
          </>
        )}
        {type === 'issue' && (
          <button onClick={() => handleIssue(cert)} disabled={isSubmitting} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 shadow-sm">{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Issue</button>
        )}
        {type === 'issued' && <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-blue-600 transition-colors" />}
      </div>
    </div>
  );

  // Pagination Controls
  const PaginationControls = () => (
    <div className="flex justify-center w-full sm:w-auto">
        <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-200 shadow-sm">
          <button disabled={currentPage === 1 || isFetchingData} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"><ChevronLeft size={16} /> Prev</button>
          <div className="px-4 py-1.5 text-sm font-bold text-gray-700 min-w-[100px] text-center">Page {currentPage} <span className="text-gray-400 font-medium">of {totalPages}</span></div>
          <button disabled={currentPage >= totalPages || isFetchingData || totalCount === 0} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Next <ChevronRight size={16} /></button>
        </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-200">
        
        {/* Header */}
        <div className="flex items-center justify-between gap-4 p-8 border-b border-gray-200">
          <div className="flex items-center gap-4">
            <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 shadow-sm"><Award className="h-8 w-8 text-blue-600" /></div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Certificate Approval</h1>
              <p className="text-sm text-gray-500 mt-1">Approve, rework, or issue calibration certificates.</p>
            </div>
          </div>
          <button type="button" onClick={handleBackToDashboard} className="flex-shrink-0 flex items-center space-x-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:text-gray-900 font-medium text-sm transition-all shadow-sm">
            <ArrowLeft size={16} /><span>Back to Dashboard</span>
          </button>
        </div>

        {/* Tabs & Bulk Action */}
        <div className="px-8 pt-6 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200">
          <div className="flex flex-wrap gap-2">
            {([SECTION_KEYS.PENDING, SECTION_KEYS.READY, SECTION_KEYS.ISSUED] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => { setSelectedForBulkDownload(new Set()); setSelectedForApproval(new Set()); setActiveTab(tab); }}
                className={`px-5 py-3 font-semibold text-sm rounded-t-lg border-b-2 transition-all duration-200 ${activeTab === tab ? `${SECTION_COLORS[tab]} bg-gray-50` : 'text-gray-500 border-transparent hover:text-blue-600 hover:bg-gray-50'}`}
              >
                {SECTION_LABELS[tab]}
              </button>
            ))}
          </div>
          {isBulkDownloadTab && (
            <button onClick={handleBulkDownloadClick} disabled={bulkDownloading || selectedForBulkDownload.size === 0} className="mb-2 flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:pointer-events-none shadow-sm whitespace-nowrap">
              {bulkDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download selected ({selectedForBulkDownload.size}) as ZIP
            </button>
          )}
        </div>

        {/* Filters & Pagination Top */}
        <div className="p-6 bg-gray-50/50 border-b border-gray-100 flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-bold text-gray-700 mb-1">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search by certificate no, ULR, SRF, job ID..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm" />
              </div>
            </div>
            <div className="flex gap-3">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Start Date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-4 py-2.5 bg-white border border-gray-300 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">End Date</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-4 py-2.5 bg-white border border-gray-300 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm" />
              </div>
            </div>
            <div className="flex gap-2 items-center pb-1">
              {isBulkDownloadTab && totalCount > 0 && (
                <label className="flex items-center gap-2 cursor-pointer bg-white border border-gray-300 px-3 py-2 rounded-lg shadow-sm">
                  <input type="checkbox" checked={bulkCertIds.length > 0 && bulkCertIds.every((id) => selectedForBulkDownload.has(id))} onChange={toggleBulkSelectAll} className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
                  <span className="text-sm font-bold text-gray-700">Select all visible</span>
                </label>
              )}
              {hasActiveFilters && <button onClick={resetFilters} className="px-4 py-2 text-sm font-bold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 shadow-sm"><X className="h-4 w-4" /> Clear</button>}
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-2 border-t border-gray-200 mt-2">
            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
              <span className="text-xs text-gray-500 font-bold uppercase tracking-wider hidden sm:inline">Records / Page:</span>
              <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); }} className="border border-gray-300 rounded-lg text-sm px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white cursor-pointer font-bold text-gray-700 shadow-sm outline-none">
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <PaginationControls />
          </div>
        </div>

        {/* List Section */}
        <div className="p-6 bg-white min-h-[400px]">
          {error && <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-lg border border-red-200">{error}</div>}

          {isLoading || isFetchingData ? (
            <CertificateListSkeleton />
          ) : displayedGroups.length > 0 ? (
            <div className="space-y-4">
              {displayedGroups.map((group) => {
                const srfKey = group.srf_no;
                const certs = group.filteredCerts;
                const isExpanded = expandedSrfs.has(srfKey);
                const actionType = activeTab === SECTION_KEYS.PENDING ? 'approve' : activeTab === SECTION_KEYS.READY ? 'issue' : 'issued';
                
                return (
                  <div key={srfKey} className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="w-full flex items-center gap-3 p-4 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 transition-colors">
                      {(isBulkDownloadTab || activeTab === SECTION_KEYS.PENDING) && (
                        <div className="flex-shrink-0 ml-1" onClick={(e) => e.stopPropagation()}>
                          <label className="flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={activeTab === SECTION_KEYS.PENDING ? certs.length > 0 && certs.every((c) => selectedForApproval.has(c.certificate_id)) : certs.length > 0 && certs.every((c) => selectedForBulkDownload.has(c.certificate_id))}
                              onChange={() => activeTab === SECTION_KEYS.PENDING ? toggleSrfApprovalSelection(certs) : toggleSrfSelection(certs)}
                              className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                            />
                          </label>
                        </div>
                      )}
                      <button type="button" onClick={() => toggleSrf(srfKey)} className="flex-1 flex items-center justify-between text-left min-w-0">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600"><Package className="h-5 w-5" /></div>
                          <div>
                            <p className="font-bold text-lg text-gray-900">SRF No: {srfKey}</p>
                            <p className="text-sm text-gray-500 font-medium">{certs.length} certificate{certs.length !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                        {isExpanded ? <ChevronUp className="h-5 w-5 text-gray-500 flex-shrink-0" /> : <ChevronDown className="h-5 w-5 text-gray-500 flex-shrink-0" />}
                      </button>
                      {activeTab === SECTION_KEYS.PENDING && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); const sel = certs.filter((c) => selectedForApproval.has(c.certificate_id)); if (sel.length > 0) handleApproveSelectedForSrf(certs); else handleApproveAllForSrf(certs); }}
                          disabled={isSubmitting}
                          className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-sm"
                        >
                          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                          {certs.some((c) => selectedForApproval.has(c.certificate_id)) ? `Approve selected (${certs.filter((c) => selectedForApproval.has(c.certificate_id)).length})` : 'Approve all'}
                        </button>
                      )}
                      {activeTab === SECTION_KEYS.READY && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); handleIssueAllForSrf(certs); }} disabled={isSubmitting} className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50 shadow-sm">
                          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Issue all
                        </button>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="p-4 bg-gray-50/30 space-y-3">
                        {certs.map((cert) => renderCertificateCard(cert, actionType, activeTab === SECTION_KEYS.PENDING ? { selected: selectedForApproval.has(cert.certificate_id), onToggle: () => toggleApprovalSelection(cert.certificate_id) } : isBulkDownloadTab ? { selected: selectedForBulkDownload.has(cert.certificate_id), onToggle: () => toggleBulkSelection(cert.certificate_id) } : undefined))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-24">
              <FileText className="h-16 w-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-xl font-bold text-gray-800">No Certificates Found</h3>
              <p className="text-gray-500 mt-2 max-w-md mx-auto">There are no matching certificates under <span className="font-semibold text-gray-700">{SECTION_LABELS[activeTab]}</span>.</p>
            </div>
          )}
        </div>
        
        {/* Pagination Bottom */}
        {totalCount > 0 && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-b-2xl">
             <span className="text-sm text-gray-600 font-medium">
               Showing <span className="font-bold">{startRecord}</span> to <span className="font-bold">{endRecord}</span> of <span className="font-bold">{totalCount}</span> SRFs
             </span>
             <PaginationControls />
          </div>
        )}
      </div>

      {/* --- MODALS --- */}

      {/* Approve all (SRF) Modal */}
      {showApproveAllModal && approveAllCerts.length > 0 && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full animate-in zoom-in-95">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">Approve all in SRF</h2>
              <button onClick={() => { setShowApproveAllModal(false); setApproveAllCerts([]); }} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">Approve all <strong>{approveAllCerts.length}</strong> certificate(s) in this SRF with the same authorised signatory.</p>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Authorised Signatory *</label>
                <input type="text" value={authorisedSignatory} onChange={(e) => setAuthorisedSignatory(e.target.value)} placeholder="e.g. John Doe" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => { setShowApproveAllModal(false); setApproveAllCerts([]); }} className="flex-1 py-2.5 border border-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleConfirmApproveAll} disabled={isSubmitting || !authorisedSignatory.trim()} className="flex-1 py-2.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />} Approve ({approveAllCerts.length})
                </button>
              </div>
            </div>
          </div>
        </div>, document.body
      )}

      {/* Approve Modal */}
      {showApproveModal && selectedCertificate && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full animate-in zoom-in-95">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">Approve Certificate</h2>
              <button onClick={() => { setShowApproveModal(false); setSelectedCertificate(null); setAuthorisedSignatory(''); }} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">Certificate <span className="font-mono font-bold">{selectedCertificate.certificate_no}</span></p>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Authorised Signatory *</label>
                <input type="text" value={authorisedSignatory} onChange={(e) => setAuthorisedSignatory(e.target.value)} placeholder="e.g. John Doe" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => { setShowApproveModal(false); setSelectedCertificate(null); setAuthorisedSignatory(''); }} className="flex-1 py-2.5 border border-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleApprove} disabled={isSubmitting || !authorisedSignatory.trim()} className="flex-1 py-2.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />} Approve
                </button>
              </div>
            </div>
          </div>
        </div>, document.body
      )}

      {/* Rework Modal */}
      {showReworkModal && selectedCertificate && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full animate-in zoom-in-95">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">Send for Rework</h2>
              <button onClick={() => { setShowReworkModal(false); setSelectedCertificate(null); setReworkComment(''); }} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">Certificate <span className="font-mono font-bold">{selectedCertificate.certificate_no}</span></p>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Rework Comment *</label>
                <textarea value={reworkComment} onChange={(e) => setReworkComment(e.target.value)} placeholder="Please detail the requested changes..." rows={4} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 resize-none outline-none" />
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => { setShowReworkModal(false); setSelectedCertificate(null); setReworkComment(''); }} className="flex-1 py-2.5 border border-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleRework} disabled={isSubmitting || !reworkComment.trim()} className="flex-1 py-2.5 bg-amber-600 text-white font-bold rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Send Rework
                </button>
              </div>
            </div>
          </div>
        </div>, document.body
      )}

      {/* Download Modals */}
      {showDownloadModal && downloadCertData && createPortal(
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 animate-in zoom-in-95">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Download Certificate</h3>
            <p className="text-sm text-gray-500 mb-6">Choose how you want to export certificate <strong>{downloadCertData.no || downloadCertData.id}</strong>.</p>
            <label className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors mb-6">
              <div className="relative flex items-center">
                <input type="checkbox" className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500" checked={includeLetterhead} onChange={(e) => setIncludeLetterhead(e.target.checked)} />
              </div>
              <div className="flex-1">
                <span className="font-bold text-gray-900 block">Include Letterhead</span>
                <span className="text-xs text-gray-500">Header logo and footer details</span>
              </div>
              <Printer className="h-5 w-5 text-gray-400" />
            </label>
            <div className="flex gap-3">
              <button onClick={() => { setShowDownloadModal(false); setDownloadCertData(null); }} className="flex-1 py-2.5 text-gray-700 font-bold bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleConfirmDownload} className="flex-1 py-2.5 text-white font-bold bg-green-600 hover:bg-green-700 rounded-lg transition-colors flex items-center justify-center gap-2">
                <Download className="h-4 w-4" /> Download
              </button>
            </div>
          </div>
        </div>, document.body
      )}

      {showBulkDownloadModal && createPortal(
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 animate-in zoom-in-95">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Download as ZIP</h3>
            <p className="text-sm text-gray-500 mb-6">Download <strong>{selectedForBulkDownload.size}</strong> certificate(s) as a ZIP file.</p>
            <label className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors mb-6">
              <div className="relative flex items-center">
                <input type="checkbox" className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500" checked={bulkIncludeLetterhead} onChange={(e) => setBulkIncludeLetterhead(e.target.checked)} />
              </div>
              <div className="flex-1">
                <span className="font-bold text-gray-900 block">Include Letterhead</span>
                <span className="text-xs text-gray-500">Header logo and footer details</span>
              </div>
              <Printer className="h-5 w-5 text-gray-400" />
            </label>
            <div className="flex gap-3">
              <button onClick={() => setShowBulkDownloadModal(false)} className="flex-1 py-2.5 text-gray-700 font-bold bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleConfirmBulkDownload} disabled={bulkDownloading} className="flex-1 py-2.5 text-white font-bold bg-green-600 hover:bg-green-700 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                {bulkDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download
              </button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* Preview Modal */}
      {showPreviewModal && selectedCertificate && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/50 p-4 pt-8 overflow-y-auto backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[calc(100vh-4rem)] overflow-hidden flex flex-col flex-shrink-0 my-4 animate-in zoom-in-95">
            <div className="flex-shrink-0 flex items-center justify-between p-4 border-b bg-gray-50">
              <button onClick={() => { setShowPreviewModal(false); setSelectedCertificate(null); setPreviewData(null); }} className="inline-flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors font-bold">
                <ArrowLeft className="h-5 w-5" /> Back
              </button>
              <h3 className="text-lg font-bold text-gray-900">Certificate Preview</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => handleInitiateDownload(selectedCertificate)} className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold text-sm shadow-sm">
                  <Download className="h-4 w-4" /> Download PDF
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto bg-slate-100 p-4 min-h-0">
              {previewLoading ? (
                <div className="flex flex-col items-center justify-center py-24"><Loader2 className="h-12 w-12 animate-spin text-blue-600 mb-4" /><p className="text-gray-600 font-medium">Loading certificate...</p></div>
              ) : previewData?.template_data ? (
                <CustomerCertificatePrintView data={previewData.template_data} />
              ) : (
                <div className="text-center py-24 text-gray-500 font-medium">Failed to load preview.</div>
              )}
            </div>
          </div>
        </div>, document.body
      )}
    </div>
  );
};
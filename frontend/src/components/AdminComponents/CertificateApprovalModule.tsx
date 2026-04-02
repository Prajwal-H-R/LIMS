import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { Award, Eye, CheckCircle, Send, Loader2, X, FileText, Search, ArrowLeft, Download, RotateCcw, ChevronRight, Package, ChevronDown, ChevronUp, Printer } from 'lucide-react';
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
  <div className="space-y-3">
    {[1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="flex items-center justify-between p-5 bg-gray-50 border border-gray-200 rounded-xl animate-pulse">
        <div className="flex items-start gap-4 w-full">
          <div className="h-10 w-10 bg-gray-200 rounded-full flex-shrink-0" />
          <div className="w-full space-y-2">
            <div className="h-5 w-32 bg-gray-300 rounded" />
            <div className="h-4 w-64 bg-gray-200 rounded" />
          </div>
        </div>
        <div className="h-5 w-5 bg-gray-200 rounded-full" />
      </div>
    ))}
  </div>
);

// --- Main Component ---

export const CertificateApprovalModule: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [pendingApproval, setPendingApproval] = useState<Certificate[]>([]);
  const [readyToIssue, setReadyToIssue] = useState<Certificate[]>([]);
  const [issued, setIssued] = useState<Certificate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<SectionKey>(() => {
    const s = searchParams.get('section');
    if (s === 'ready' || s === 'issued') return s === 'ready' ? SECTION_KEYS.READY : SECTION_KEYS.ISSUED;
    return SECTION_KEYS.PENDING;
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

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
  const [expandedSrfs, setExpandedSrfs] = useState<Set<string>>(new Set());

  const [selectedForBulkDownload, setSelectedForBulkDownload] = useState<Set<number>>(new Set());
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [showBulkDownloadModal, setShowBulkDownloadModal] = useState(false);
  const [bulkIncludeLetterhead, setBulkIncludeLetterhead] = useState(true);

  const [showApproveAllModal, setShowApproveAllModal] = useState(false);
  const [approveAllCerts, setApproveAllCerts] = useState<Certificate[]>([]);

  const [selectedForApproval, setSelectedForApproval] = useState<Set<number>>(new Set());

  const fetchCertificates = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [createdRes, approvedRes, issuedRes] = await Promise.all([
        api.get<Certificate[]>(ENDPOINTS.CERTIFICATES.LIST, { params: { status: 'CREATED' } }),
        api.get<Certificate[]>(ENDPOINTS.CERTIFICATES.LIST, { params: { status: 'APPROVED' } }),
        api.get<Certificate[]>(ENDPOINTS.CERTIFICATES.LIST, { params: { status: 'ISSUED' } }),
      ]);
      setPendingApproval(Array.isArray(createdRes.data) ? createdRes.data : []);
      setReadyToIssue(Array.isArray(approvedRes.data) ? approvedRes.data : []);
      setIssued(Array.isArray(issuedRes.data) ? issuedRes.data : []);
    } catch (err: any) {
      console.error('Failed to fetch certificates:', err);
      setError(err.response?.data?.detail || 'Failed to load certificates.');
      setPendingApproval([]);
      setReadyToIssue([]);
      setIssued([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCertificates();
  }, [fetchCertificates]);

  const formatDate = (d?: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const groupedByTab: Record<SectionKey, Certificate[]> = {
    [SECTION_KEYS.PENDING]: pendingApproval,
    [SECTION_KEYS.READY]: readyToIssue,
    [SECTION_KEYS.ISSUED]: issued,
  };

  const filterCertificates = (certs: Certificate[]) => {
    let filtered = certs;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          (c.certificate_no || '').toLowerCase().includes(term) ||
          (c.ulr_no || '').toLowerCase().includes(term) ||
          (c.srf_no || '').toLowerCase().includes(term) ||
          (c.nepl_id || '').toLowerCase().includes(term) ||
          (c.material_description || '').toLowerCase().includes(term) ||
          String(c.job_id).includes(term)
      );
    }
    if (startDate || endDate) {
      filtered = filtered.filter((c) => {
        const d = c.date_of_calibration ? new Date(c.date_of_calibration) : null;
        if (!d) return !startDate && !endDate;
        const ts = d.getTime();
        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          if (ts < start.getTime()) return false;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (ts > end.getTime()) return false;
        }
        return true;
      });
    }
    return filtered;
  };

  const currentItems = filterCertificates(groupedByTab[activeTab]);
  const hasActiveFilters = !!searchTerm || !!startDate || !!endDate;

  const srfGroups = React.useMemo(() => {
    const map = new Map<string, Certificate[]>();
    for (const c of currentItems) {
      const key = String(c.srf_no ?? c.inward_id ?? 'unknown');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === 'unknown') return 1;
      if (b === 'unknown') return -1;
      return String(b).localeCompare(String(a));
    });
  }, [currentItems]);

  const toggleSrf = (key: string) => {
    setExpandedSrfs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const resetFilters = () => {
    setSearchTerm('');
    setStartDate('');
    setEndDate('');
  };

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
    if (!selectedCertificate || !authorisedSignatory.trim()) {
      alert('Please enter the Authorised Signatory name.');
      return;
    }
    setIsSubmitting(true);
    try {
      await api.post(ENDPOINTS.CERTIFICATES.APPROVE(selectedCertificate.certificate_id), {
        authorised_signatory: authorisedSignatory.trim(),
      });
      setShowApproveModal(false);
      setSelectedCertificate(null);
      setAuthorisedSignatory('');
      fetchCertificates();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to approve certificate.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRework = async () => {
    if (!selectedCertificate || !reworkComment.trim()) {
      alert('Please enter a rework comment explaining what needs to be changed.');
      return;
    }
    setIsSubmitting(true);
    try {
      await api.post(ENDPOINTS.CERTIFICATES.REWORK(selectedCertificate.certificate_id), {
        rework_comment: reworkComment.trim(),
      });
      setShowReworkModal(false);
      setSelectedCertificate(null);
      setReworkComment('');
      fetchCertificates();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to send for rework.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleIssue = async (cert: Certificate) => {
    if (!confirm('Issue this certificate? It will become visible in the Customer Portal.')) return;
    setIsSubmitting(true);
    try {
      await api.post(ENDPOINTS.CERTIFICATES.ISSUE(cert.certificate_id));
      fetchCertificates();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to issue certificate.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleApprovalSelection = (certId: number) => {
    setSelectedForApproval((prev) => {
      const next = new Set(prev);
      if (next.has(certId)) next.delete(certId);
      else next.add(certId);
      return next;
    });
  };

  const toggleSrfApprovalSelection = (certs: Certificate[]) => {
    const ids = certs.map((c) => c.certificate_id);
    const allSelected = ids.every((id) => selectedForApproval.has(id));
    setSelectedForApproval((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
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
        await api.post(ENDPOINTS.CERTIFICATES.APPROVE(cert.certificate_id), {
          authorised_signatory: authorisedSignatory.trim(),
        });
      }
      setShowApproveAllModal(false);
      setApproveAllCerts([]);
      setAuthorisedSignatory('');
      fetchCertificates();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to approve one or more certificates.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleIssueAllForSrf = async (certs: Certificate[]) => {
    if (certs.length === 0) return;
    if (!confirm(`Issue all ${certs.length} certificate(s) in this SRF? They will become visible in the Customer Portal.`)) return;
    setIsSubmitting(true);
    try {
      for (const cert of certs) {
        await api.post(ENDPOINTS.CERTIFICATES.ISSUE(cert.certificate_id));
      }
      fetchCertificates();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to issue one or more certificates.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleSrfSelection = (certs: Certificate[]) => {
    const ids = certs.map((c) => c.certificate_id);
    const allSelected = ids.every((id) => selectedForBulkDownload.has(id));
    setSelectedForBulkDownload((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleInitiateDownload = (cert: Certificate) => {
    setDownloadCertData({ id: cert.certificate_id, no: cert.certificate_no });
    setIncludeLetterhead(true);
    setShowDownloadModal(true);
  };

  const handleConfirmDownload = async () => {
    if (!downloadCertData) return;
    const noHeaderFooter = !includeLetterhead;
    try {
      const url = `${ENDPOINTS.CERTIFICATES.DOWNLOAD_PDF(downloadCertData.id)}${noHeaderFooter ? '?no_header_footer=true' : ''}`;
      const res = await api.get(url, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const contentDisp = res.headers?.['content-disposition'];
      const filename =
        contentDisp?.match(/filename="?([^";\n]+)"?/)?.[1] ||
        `certificate_${downloadCertData.no || downloadCertData.id}.pdf`.replace(/\//g, '-');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
      setShowDownloadModal(false);
      setDownloadCertData(null);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to download PDF.');
    }
  };

  const handleOpenPreview = async (cert: Certificate) => {
    setSelectedCertificate(cert);
    setShowPreviewModal(true);
    setPreviewLoading(true);
    setPreviewData(null);
    try {
      const res = await api.get(ENDPOINTS.CERTIFICATES.PREVIEW(cert.certificate_id));
      setPreviewData(res.data);
    } catch (err) {
      console.error('Failed to load preview:', err);
      setPreviewData(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleBackToDashboard = () => {
    setSearchParams({ section: 'dashboard' });
  };

  const isBulkDownloadTab = activeTab === SECTION_KEYS.READY || activeTab === SECTION_KEYS.ISSUED;
  const bulkCertIds = currentItems.map((c) => c.certificate_id);
  const toggleBulkSelection = (certId: number) => {
    setSelectedForBulkDownload((prev) => {
      const next = new Set(prev);
      if (next.has(certId)) next.delete(certId);
      else next.add(certId);
      return next;
    });
  };
  const toggleBulkSelectAll = () => {
    if (bulkCertIds.length === 0) return;
    const allSelected = bulkCertIds.every((id) => selectedForBulkDownload.has(id));
    if (allSelected) {
      setSelectedForBulkDownload(new Set());
    } else {
      setSelectedForBulkDownload(new Set(bulkCertIds));
    }
  };
  const handleBulkDownloadClick = () => {
    if (selectedForBulkDownload.size === 0) return;
    setBulkIncludeLetterhead(includeLetterhead);
    setShowBulkDownloadModal(true);
  };

  const handleConfirmBulkDownload = async () => {
    setBulkDownloading(true);
    try {
      const noHeaderFooter = !bulkIncludeLetterhead;
      const res = await api.post(
        ENDPOINTS.CERTIFICATES.DOWNLOAD_BULK_PDF,
        { certificate_ids: Array.from(selectedForBulkDownload), no_header_footer: noHeaderFooter },
        { responseType: 'blob' }
      );
      const blob = new Blob([res.data], { type: 'application/zip' });
      const selectedCerts = currentItems.filter((c) => selectedForBulkDownload.has(c.certificate_id));
      const srfNos = [...new Set(selectedCerts.map((c) => c.srf_no).filter(Boolean))];
      const zipName =
        srfNos.length === 1
          ? `${String(srfNos[0]).replace(/[/\\?*:]/g, '-')}.zip`
          : 'certificates.zip';
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = zipName;
      link.click();
      URL.revokeObjectURL(link.href);
      setShowBulkDownloadModal(false);
    } catch (err: any) {
      alert(err.response?.data instanceof Blob ? 'Bulk download failed.' : err.response?.data?.detail || 'Bulk download failed.');
    } finally {
      setBulkDownloading(false);
    }
  };

  const renderCertificateCard = (cert: Certificate, type: 'approve' | 'issue' | 'issued', bulk?: { selected: boolean; onToggle: () => void }) => (
    <div
      key={cert.certificate_id}
      className="flex items-center justify-between p-5 bg-gray-50 hover:bg-blue-50 border border-gray-200 rounded-xl transition-all duration-200 group shadow-sm hover:shadow-md"
    >
      {bulk && (
        <div className="flex-shrink-0 pr-3">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={bulk.selected}
              onChange={bulk.onToggle}
              className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
            <span className="sr-only">Select for bulk download</span>
          </label>
        </div>
      )}
      <div className="flex items-start gap-4 flex-1 min-w-0">
        <div className="mt-1 flex-shrink-0">
          <div className="p-2 rounded-full bg-blue-100 text-blue-600">
            <FileText size={20} />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="font-semibold text-lg text-gray-800">
              {cert.certificate_no || `CERT-${cert.certificate_id}`}
            </p>
            {cert.srf_no && (
              <span className="text-sm text-gray-500 font-mono">SRF: {cert.srf_no}</span>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-1">
            {cert.material_description && (
              <span className="block text-gray-700">{cert.material_description}</span>
            )}
            Job #{cert.job_id} • Cal: {formatDate(cert.date_of_calibration)}
            {cert.ulr_no && <> • ULR: <span className="font-mono">{cert.ulr_no}</span></>}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-4">
        <button
          onClick={() => handleOpenPreview(cert)}
          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          title="Preview"
        >
          <Eye className="h-4 w-4" />
        </button>
        <button
          onClick={() => handleInitiateDownload(cert)}
          className="p-2 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
          title="Download PDF"
        >
          <Download className="h-4 w-4" />
        </button>
        {type === 'approve' && (
          <>
            <button
              onClick={() => handleOpenRework(cert)}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-800 border border-amber-200 text-sm font-medium rounded-lg hover:bg-amber-200 disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              Rework
            </button>
            <button
              onClick={() => handleOpenApprove(cert)}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              Approve
            </button>
          </>
        )}
        {type === 'issue' && (
          <button
            onClick={() => handleIssue(cert)}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Issue
          </button>
        )}
        {type === 'issued' && (
          <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
        )}
      </div>
    </div>
  );

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px] bg-red-50 rounded-2xl">
        <div className="text-center text-red-600 bg-white p-6 rounded-xl shadow-md border border-red-200">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-lg p-8 border border-gray-200">
        {/* Header - like SrfListPage */}
        <div className="flex items-center justify-between gap-4 mb-8 border-b border-gray-200 pb-5">
          <div className="flex items-center gap-4">
            <div className="bg-blue-100 p-3 rounded-full">
              <Award className="h-8 w-8 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold text-gray-800">Certificate Approval</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Approve, rework, or issue calibration certificates.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleBackToDashboard}
            className="flex-shrink-0 flex items-center space-x-2 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-semibold text-sm"
          >
            <ArrowLeft size={18} />
            <span>Back to Dashboard</span>
          </button>
        </div>

        {/* Tabs - like SrfListPage */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 mb-6">
          <div className="flex flex-wrap gap-3">
            {([SECTION_KEYS.PENDING, SECTION_KEYS.READY, SECTION_KEYS.ISSUED] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setSelectedForBulkDownload(new Set());
                  setSelectedForApproval(new Set());
                  setActiveTab(tab);
                }}
                className={`px-5 py-2.5 font-medium text-sm rounded-t-md border-b-2 transition-all duration-200 ${
                  activeTab === tab
                    ? `${SECTION_COLORS[tab]} bg-blue-50`
                    : 'text-gray-500 border-transparent hover:text-blue-600 hover:bg-gray-50'
                }`}
              >
                {SECTION_LABELS[tab]}
                <span className="ml-1 text-gray-400 font-normal">
                  ({groupedByTab[tab].length})
                </span>
              </button>
            ))}
          </div>
          {isBulkDownloadTab && (
            <button
              type="button"
              onClick={handleBulkDownloadClick}
              disabled={bulkDownloading || selectedForBulkDownload.size === 0}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:pointer-events-none shadow-sm whitespace-nowrap"
            >
              {bulkDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download selected ({selectedForBulkDownload.size}) as ZIP
            </button>
          )}
        </div>

        {/* Filters - like SrfListPage / ViewUpdateInward */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by certificate no, ULR, SRF, job ID..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-2 items-center">
              {isBulkDownloadTab && currentItems.length > 0 && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkCertIds.length > 0 && bulkCertIds.every((id) => selectedForBulkDownload.has(id))}
                    onChange={toggleBulkSelectAll}
                    className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Select all</span>
                </label>
              )}
              {hasActiveFilters && (
                <button
                  onClick={resetFilters}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                >
                  <X className="h-4 w-4" />
                  Clear
                </button>
              )}
            </div>
          </div>
          {hasActiveFilters && (
            <div className="mt-3 text-sm text-gray-600">
              Showing {currentItems.length} of {groupedByTab[activeTab].length} items
              {searchTerm && ` matching "${searchTerm}"`}
            </div>
          )}
        </div>

        {/* List - grouped by SRF */}
        <div className="space-y-3">
          {isLoading ? (
            <CertificateListSkeleton />
          ) : srfGroups.length > 0 ? (
            srfGroups.map(([srfKey, certs]) => {
              const isExpanded = expandedSrfs.has(srfKey);
              const actionType = activeTab === SECTION_KEYS.PENDING ? 'approve' : activeTab === SECTION_KEYS.READY ? 'issue' : 'issued';
              return (
                <div
                  key={srfKey}
                  className="border border-gray-200 rounded-xl overflow-hidden bg-white"
                >
                  <div className="w-full flex items-center gap-3 p-5 bg-gray-50">
                    {(isBulkDownloadTab || activeTab === SECTION_KEYS.PENDING) && (
                      <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <label className="flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={
                              activeTab === SECTION_KEYS.PENDING
                                ? certs.length > 0 && certs.every((c) => selectedForApproval.has(c.certificate_id))
                                : certs.length > 0 && certs.every((c) => selectedForBulkDownload.has(c.certificate_id))
                            }
                            onChange={() =>
                              activeTab === SECTION_KEYS.PENDING
                                ? toggleSrfApprovalSelection(certs)
                                : toggleSrfSelection(certs)
                            }
                            className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                          />
                          <span className="sr-only">
                            {activeTab === SECTION_KEYS.PENDING ? 'Select all NEPL for approval' : 'Select all NEPL under this SRF'}
                          </span>
                        </label>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleSrf(srfKey)}
                      className="flex-1 flex items-center justify-between text-left min-w-0"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                          <Package className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-semibold text-lg text-gray-900">
                            SRF No: {srfKey}
                          </p>
                          <p className="text-sm text-gray-500 mt-0.5">
                            {certs.length} certificate{certs.length !== 1 ? 's' : ''} (NEPL)
                          </p>
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5 text-gray-500 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-gray-500 flex-shrink-0" />
                      )}
                    </button>
                    {activeTab === SECTION_KEYS.PENDING && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const selectedInSrf = certs.filter((c) => selectedForApproval.has(c.certificate_id));
                          if (selectedInSrf.length > 0) {
                            handleApproveSelectedForSrf(certs);
                          } else {
                            handleApproveAllForSrf(certs);
                          }
                        }}
                        disabled={isSubmitting}
                        className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                        {certs.some((c) => selectedForApproval.has(c.certificate_id))
                          ? `Approve selected (${certs.filter((c) => selectedForApproval.has(c.certificate_id)).length})`
                          : 'Approve all'}
                      </button>
                    )}
                    {activeTab === SECTION_KEYS.READY && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleIssueAllForSrf(certs);
                        }}
                        disabled={isSubmitting}
                        className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Issue all
                      </button>
                    )}
                  </div>
                  {isExpanded && (
                    <div className="border-t border-gray-200 p-4 bg-gray-50/50 space-y-3">
                      {certs.map((cert) =>
                        renderCertificateCard(
                          cert,
                          actionType,
                          activeTab === SECTION_KEYS.PENDING
                            ? {
                                selected: selectedForApproval.has(cert.certificate_id),
                                onToggle: () => toggleApprovalSelection(cert.certificate_id),
                              }
                            : isBulkDownloadTab
                              ? {
                                  selected: selectedForBulkDownload.has(cert.certificate_id),
                                  onToggle: () => toggleBulkSelection(cert.certificate_id),
                                }
                              : undefined
                        )
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center text-gray-500 py-20">
              <FileText className="h-16 w-16 mx-auto text-gray-400" />
              <h3 className="mt-4 text-lg font-semibold">No Certificates Found</h3>
              <p className="text-gray-600 mt-1">
                There are no certificates under <span className="font-medium">{SECTION_LABELS[activeTab]}</span>.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Approve all (SRF) Modal */}
      {showApproveAllModal && approveAllCerts.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">Approve all in SRF</h2>
              <button
                onClick={() => {
                  setShowApproveAllModal(false);
                  setApproveAllCerts([]);
                }}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Approve all <strong>{approveAllCerts.length}</strong> certificate(s) in this SRF with the same authorised signatory.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Authorised Signatory *</label>
                <input
                  type="text"
                  value={authorisedSignatory}
                  onChange={(e) => setAuthorisedSignatory(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowApproveAllModal(false);
                    setApproveAllCerts([]);
                  }}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmApproveAll}
                  disabled={isSubmitting || !authorisedSignatory.trim()}
                  className="flex-1 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  Approve all ({approveAllCerts.length})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Approve Modal */}
      {showApproveModal && selectedCertificate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">Approve Certificate</h2>
              <button
                onClick={() => {
                  setShowApproveModal(false);
                  setSelectedCertificate(null);
                  setAuthorisedSignatory('');
                }}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Certificate <span className="font-mono font-medium">{selectedCertificate.certificate_no}</span> (Job #{selectedCertificate.job_id})
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Authorised Signatory *</label>
                <input
                  type="text"
                  value={authorisedSignatory}
                  onChange={(e) => setAuthorisedSignatory(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowApproveModal(false);
                    setSelectedCertificate(null);
                    setAuthorisedSignatory('');
                  }}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApprove}
                  disabled={isSubmitting || !authorisedSignatory.trim()}
                  className="flex-1 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  Approve
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rework Modal */}
      {showReworkModal && selectedCertificate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">Send for Rework</h2>
              <button
                onClick={() => {
                  setShowReworkModal(false);
                  setSelectedCertificate(null);
                  setReworkComment('');
                }}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Certificate <span className="font-mono font-medium">{selectedCertificate.certificate_no}</span> (Job #{selectedCertificate.job_id})
              </p>
              <p className="text-sm text-gray-500">
                The certificate will be sent back to the engineer portal under the Rework tab. Please describe what needs to be changed.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rework Comment *</label>
                <textarea
                  value={reworkComment}
                  onChange={(e) => setReworkComment(e.target.value)}
                  placeholder="e.g. Please correct the ULR number. Update the field of parameter to Torque."
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 resize-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowReworkModal(false);
                    setSelectedCertificate(null);
                    setReworkComment('');
                  }}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRework}
                  disabled={isSubmitting || !reworkComment.trim()}
                  className="flex-1 py-2.5 bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Send for Rework
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Download Modal with Include Letterhead */}
      {showDownloadModal && downloadCertData && createPortal(
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Download Certificate</h3>
            <p className="text-sm text-gray-500 mb-6">Choose how you want to export certificate <strong>{downloadCertData.no || downloadCertData.id}</strong>.</p>

            <label className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors mb-6">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  checked={includeLetterhead}
                  onChange={(e) => setIncludeLetterhead(e.target.checked)}
                />
              </div>
              <div className="flex-1">
                <span className="font-medium text-gray-900 block">Include Letterhead</span>
                <span className="text-xs text-gray-500">Header logo and footer details</span>
              </div>
              <Printer className="h-5 w-5 text-gray-400" />
            </label>

            <div className="flex gap-3">
              <button onClick={() => { setShowDownloadModal(false); setDownloadCertData(null); }} className="flex-1 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">Cancel</button>
              <button onClick={handleConfirmDownload} className="flex-1 py-2.5 text-white bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors flex items-center justify-center gap-2">
                <Download className="h-4 w-4" /> Download
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Bulk Download (ZIP) Modal with Include Letterhead */}
      {showBulkDownloadModal && createPortal(
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Download as ZIP</h3>
            <p className="text-sm text-gray-500 mb-6">
              Download <strong>{selectedForBulkDownload.size}</strong> certificate(s) as a ZIP file. Choose export option.
            </p>

            <label className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors mb-6">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  checked={bulkIncludeLetterhead}
                  onChange={(e) => setBulkIncludeLetterhead(e.target.checked)}
                />
              </div>
              <div className="flex-1">
                <span className="font-medium text-gray-900 block">Include Letterhead</span>
                <span className="text-xs text-gray-500">Header logo and footer details in PDFs</span>
              </div>
              <Printer className="h-5 w-5 text-gray-400" />
            </label>

            <div className="flex gap-3">
              <button onClick={() => setShowBulkDownloadModal(false)} className="flex-1 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">Cancel</button>
              <button onClick={handleConfirmBulkDownload} disabled={bulkDownloading} className="flex-1 py-2.5 text-white bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                {bulkDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Preview Modal - Rendered in portal so it appears above footer */}
      {showPreviewModal && selectedCertificate && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/50 p-4 pt-8 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[calc(100vh-4rem)] overflow-hidden flex flex-col flex-shrink-0 my-4">
            <div className="flex-shrink-0 flex items-center justify-between p-4 border-b bg-gray-50">
              <button
                onClick={() => {
                  setShowPreviewModal(false);
                  setSelectedCertificate(null);
                  setPreviewData(null);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors font-medium"
              >
                <ArrowLeft className="h-5 w-5" />
                Back
              </button>
              <h3 className="text-lg font-bold text-gray-900">Certificate Preview</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleInitiateDownload(selectedCertificate)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm"
                >
                  <Download className="h-4 w-4" /> Download PDF
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto bg-slate-100 p-4 min-h-0">
              {previewLoading ? (
                <div className="flex flex-col items-center justify-center py-24">
                  <Loader2 className="h-12 w-12 animate-spin text-blue-600 mb-4" />
                  <p className="text-gray-600">Loading certificate...</p>
                </div>
              ) : previewData?.template_data ? (
                <CustomerCertificatePrintView
                  data={previewData.template_data}
                />
              ) : (
                <div className="text-center py-24 text-gray-500">Failed to load preview.</div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import {
  Award,
  Plus,
  Loader2,
  Edit,
  Send,
  Eye,
  Search,
  X,
  FileText,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  Package,
  Download,
  RotateCcw,
  AlertCircle,
  User,
  ArrowLeft,
  Printer
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ENDPOINTS } from "../api/config";
import { CustomerCertificatePrintView } from "./CustomerCertificatePrintView";

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
  item_status?: string | null;
  authorised_signatory: string | null;
  status: string;
  created_at?: string | null;
  admin_rework_comment?: string | null;
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
}

interface HtwJob {
  job_id: number;
  inward_eqp_id: number;
  srf_no?: string | null;
  nepl_id?: string | null;
  calibration_date?: string;
  job_status?: string;
}

// --- Constants ---

const STATUS_KEYS = ["DRAFT", "CREATED", "REWORK", "APPROVED", "ISSUED"] as const;
type StatusKey = (typeof STATUS_KEYS)[number];

type CertTabKey = "pending_gen" | "draft" | "rework" | "approval" | "approved" | "issued";

const STATUS_LABELS: Record<StatusKey, string> = {
  DRAFT: "Draft",
  CREATED: "Pending Approval",
  REWORK: "Rework",
  APPROVED: "Approved",
  ISSUED: "Issued",
};

const TAB_BADGE_CLASSES: Record<string, string> = {
  DRAFT: "bg-amber-100 text-amber-800 border-amber-200",
  CREATED: "bg-blue-100 text-blue-800 border-blue-200",
  REWORK: "bg-orange-100 text-orange-800 border-orange-200",
  APPROVED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  ISSUED: "bg-green-100 text-green-800 border-green-200",
  NO_CERT: "bg-gray-100 text-gray-700 border-gray-200"
};

const STATUS_ICONS: Record<StatusKey, React.ReactNode> = {
  DRAFT: <FileText className="h-4 w-4" />,
  CREATED: <Clock className="h-4 w-4" />,
  REWORK: <RotateCcw className="h-4 w-4" />,
  APPROVED: <CheckCircle2 className="h-4 w-4" />,
  ISSUED: <Award className="h-4 w-4" />,
};

// --- Skeletons ---

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

const DetailSkeleton: React.FC = () => (
  <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8 animate-pulse">
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 h-32"></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => <div key={i} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 h-24"></div>)}
      </div>
      <div className="bg-white border border-gray-200 rounded-2xl h-96"></div>
    </div>
  </div>
);

// --- Helper: Modal Portal ---
const ModalPortal = ({ children }: { children: React.ReactNode }) => {
  return createPortal(children, document.body);
};

// --- Main Component ---
export const CertificatesPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Navigation / View State
  const activeSrfId = searchParams.get("srfId") ? Number(searchParams.get("srfId")) : null;
  const activeTab = (searchParams.get("tab") as CertTabKey) || "pending_gen";
  const viewMode = activeSrfId ? "detail" : "list";

  // Data State
  const [srfGroups, setSrfGroups] = useState<SrfGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Modals
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedCertificate, setSelectedCertificate] = useState<Certificate | null>(null);

  // Download Modal State
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadCertData, setDownloadCertData] = useState<{ id: number, no: string } | null>(null);
  const [includeLetterhead, setIncludeLetterhead] = useState(true);

  // Form state for edit
  const [editForm, setEditForm] = useState({
    ulr_no: "",
    field_of_parameter: "",
    recommended_cal_due_date: "",
    item_status: "Satisfactory",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Generate modal state
  const [jobs, setJobs] = useState<HtwJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [generatingJobId, setGeneratingJobId] = useState<number | null>(null);
  const [expandedGenerateSrfs, setExpandedGenerateSrfs] = useState<Set<string>>(new Set());

  // Preview state
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Multi PDF download (Approved / Issued tabs only)
  const [selectedForBulkDownload, setSelectedForBulkDownload] = useState<Set<number>>(new Set());
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [showBulkDownloadModal, setShowBulkDownloadModal] = useState(false);
  const [bulkIncludeLetterhead, setBulkIncludeLetterhead] = useState(true);

  // --- Scrollbar Management (FIXED) ---
  // Removed the padding-right calculation to prevent Header jumping/misalignment.
  // --- Scrollbar Management (PREVENT HEADER SHIFT) ---
useEffect(() => {
  const isAnyModalOpen =
    showGenerateModal ||
    showEditModal ||
    showPreviewModal ||
    showDownloadModal ||
    showBulkDownloadModal;

  if (isAnyModalOpen) {
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";

    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  } else {
    document.body.style.overflow = "";
    document.body.style.paddingRight = "";
  }

  return () => {
    document.body.style.overflow = "";
    document.body.style.paddingRight = "";
  };
}, [showGenerateModal, showEditModal, showPreviewModal, showDownloadModal, showBulkDownloadModal]);

  // --- Helpers ---

  const closeAllModals = () => {
    setShowGenerateModal(false);
    setShowEditModal(false);
    setShowPreviewModal(false);
    setShowDownloadModal(false);
    setShowBulkDownloadModal(false);
    setSelectedCertificate(null);
    setPreviewData(null);
    setDownloadCertData(null);
  };

  const formatDate = (d?: string | null) => {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const getEquipmentCategory = (item: SrfGroupEquipment): CertTabKey => {
    if (!item.certificate) return "pending_gen";
    const status = (item.certificate.status || "").toUpperCase();
    if (status === "DRAFT") return "draft";
    if (status === "REWORK") return "rework";
    if (status === "CREATED") return "approval";
    if (status === "APPROVED") return "approved";
    if (status === "ISSUED") return "issued";
    return "pending_gen";
  };

  const getStatusBadge = (cert: Certificate | null) => {
    if (!cert) return TAB_BADGE_CLASSES["NO_CERT"];
    const status = (cert.status || "DRAFT").toUpperCase();
    return TAB_BADGE_CLASSES[status] || TAB_BADGE_CLASSES["DRAFT"];
  };

  // --- Fetching ---

  const fetchSrfGroups = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<SrfGroup[]>(ENDPOINTS.CERTIFICATES.SRF_GROUPS);
      const data = Array.isArray(res.data) ? res.data : [];
      setSrfGroups(data);
      return data;
    } catch (err: any) {
      console.error("Failed to fetch SRF groups:", err);
      setError(err.response?.data?.detail || "Failed to load certificate data.");
      setSrfGroups([]);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSrfGroups();
  }, [fetchSrfGroups]);

  // --- Navigation Handlers ---

  const handleOpenSrf = (id: number) => {
    closeAllModals();
    setSearchParams({ srfId: id.toString(), tab: "pending_gen" });
  };

  const handleBackToList = () => {
    closeAllModals();
    setSearchParams({});
  };

  const handleTabChange = (tab: CertTabKey) => {
    setSelectedForBulkDownload(new Set());
    if (activeSrfId) {
      setSearchParams({ srfId: activeSrfId.toString(), tab: tab });
    }
  };

  // --- Action Handlers ---

  const fetchJobsForGenerate = async () => {
    setJobsLoading(true);
    try {
      const res = await api.get<HtwJob[]>("/htw-jobs/");
      const jobList = Array.isArray(res.data) ? res.data : [];
      const certJobIds = new Set(
        srfGroups.flatMap((g) =>
          g.equipments.filter((e) => e.certificate).map((e) => e.certificate!.job_id)
        )
      );
      const available = jobList.filter(
        (j) => !certJobIds.has(j.job_id) && (j.job_status || "").toLowerCase() === "calibrated"
      );
      setJobs(available);
      if (available.length > 0) {
        const firstSrf = available[0].srf_no || "Unknown SRF";
        setExpandedGenerateSrfs(new Set([firstSrf]));
      }
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
      setJobs([]);
    } finally {
      setJobsLoading(false);
    }
  };

  const handleOpenGenerateModal = () => {
    setShowGenerateModal(true);
    setExpandedGenerateSrfs(new Set());
    fetchJobsForGenerate();
  };

  const handleGenerateAndOpenFlow = async (jobId: number) => {
    setGeneratingJobId(jobId);
    try {
      await api.post(ENDPOINTS.CERTIFICATES.GENERATE(jobId));
      const updatedGroups = await fetchSrfGroups();

      let newCert: Certificate | null = null;
      let targetGroup: SrfGroup | null = null;

      for (const group of updatedGroups) {
        if (!group.equipments) continue;
        const foundEq = group.equipments.find(e => Number(e.job_id) === Number(jobId));
        if (foundEq && foundEq.certificate) {
          newCert = foundEq.certificate;
          targetGroup = group;
          break;
        }
      }

      setShowGenerateModal(false);

      if (newCert) {
        setSelectedCertificate(newCert);
        setShowPreviewModal(true);

        setPreviewLoading(true);
        try {
          const res = await api.get(ENDPOINTS.CERTIFICATES.PREVIEW(newCert.certificate_id));
          setPreviewData(res.data);
        } catch (err) {
          console.error("Preview load error", err);
        } finally {
          setPreviewLoading(false);
        }

        if (targetGroup) {
          setSearchParams({ srfId: targetGroup.inward_id.toString(), tab: "draft" });
        }
      } else {
        toast.success("Draft generated. Check Drafts tab.");
      }

    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to generate certificate.");
    } finally {
      setGeneratingJobId(null);
    }
  };

  const handleOpenEdit = (cert: Certificate) => {
    setSelectedCertificate(cert);
    setEditForm({
      ulr_no: cert.ulr_no || "",
      field_of_parameter: cert.field_of_parameter || "",
      recommended_cal_due_date: cert.recommended_cal_due_date
        ? cert.recommended_cal_due_date.slice(0, 10)
        : "",
      item_status: cert.item_status || "Satisfactory",
    });
    setShowEditModal(true);
  };

  const handleProceedToEditFromPreview = () => {
    setShowPreviewModal(false);
    setTimeout(() => {
      if (selectedCertificate) {
        handleOpenEdit(selectedCertificate);
      }
    }, 50);
  };

  const handleSaveEdit = async () => {
    if (!selectedCertificate) return;
    setIsSubmitting(true);
    try {
      const payload: Record<string, any> = {};
      if (editForm.ulr_no) payload.ulr_no = editForm.ulr_no;
      if (editForm.field_of_parameter) payload.field_of_parameter = editForm.field_of_parameter;
      if (editForm.recommended_cal_due_date)
        payload.recommended_cal_due_date = editForm.recommended_cal_due_date;
      if (editForm.item_status !== undefined) payload.item_status = editForm.item_status || "Satisfactory";

      await api.patch(ENDPOINTS.CERTIFICATES.UPDATE(selectedCertificate.certificate_id), payload);

      setShowEditModal(false);
      setSelectedCertificate(null);
      await fetchSrfGroups();
      toast.success("Certificate saved to Drafts");
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to update certificate.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResubmitForApproval = async (cert: Certificate) => {
    if (!editForm.ulr_no || !editForm.field_of_parameter || !editForm.recommended_cal_due_date) {
      alert("Please fill all mandatory fields."); return;
    }
    if (!confirm("Resubmit for admin approval?")) return;

    setIsSubmitting(true);
    try {
      await api.patch(ENDPOINTS.CERTIFICATES.UPDATE(cert.certificate_id), { ...editForm });
      await api.post(ENDPOINTS.CERTIFICATES.RESUBMIT(cert.certificate_id));
      setShowEditModal(false);
      await fetchSrfGroups();
      toast.success("Resubmitted for approval");
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed");
    } finally { setIsSubmitting(false); }
  };

  const handleSubmitForApproval = async (cert: Certificate) => {
    if (!editForm.ulr_no || !editForm.field_of_parameter || !editForm.recommended_cal_due_date) {
      alert("Please fill all mandatory fields."); return;
    }
    if (!confirm("Submit for admin approval? This locks editing.")) return;

    setIsSubmitting(true);
    try {
      await api.patch(ENDPOINTS.CERTIFICATES.UPDATE(cert.certificate_id), { ...editForm });
      await api.post(ENDPOINTS.CERTIFICATES.SUBMIT(cert.certificate_id));
      setShowEditModal(false);
      await fetchSrfGroups();
      toast.success("Submitted for approval");
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed");
    } finally { setIsSubmitting(false); }
  };

  // --- DOWNLOAD LOGIC ---

  const handleInitiateDownload = (cert: Certificate) => {
    setDownloadCertData({ id: cert.certificate_id, no: cert.certificate_no });
    setIncludeLetterhead(true); // Default to including header/footer
    setShowDownloadModal(true);
  };

  const handleConfirmDownload = async () => {
    if (!downloadCertData) return;

    // Logic:
    // Checkbox Checked (Include Letterhead) = true => noHeaderFooter = false
    // Checkbox Unchecked (Clean) = false => noHeaderFooter = true
    const noHeaderFooter = !includeLetterhead;

    try {
      const url = `${ENDPOINTS.CERTIFICATES.DOWNLOAD_PDF(downloadCertData.id)}${noHeaderFooter ? "?no_header_footer=true" : ""}`;
      const res = await api.get(url, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const contentDisp = res.headers?.["content-disposition"];
      const filename =
        contentDisp?.match(/filename="?([^";\n]+)"?/)?.[1]?.trim() ||
        `certificate_${(downloadCertData.no || downloadCertData.id).toString().replace(/\//g, "-")}.pdf`;
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);

      setShowDownloadModal(false);
      setDownloadCertData(null);
    } catch (err: any) {
      alert("Failed to download PDF.");
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
      console.error("Failed to load preview:", err);
    } finally {
      setPreviewLoading(false);
    }
  };

  // --- Bulk PDF download (Approved / Issued) ---
  const isBulkDownloadTab = activeTab === "approved" || activeTab === "issued";
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
    if (selectedForBulkDownload.size === 0) {
      toast.error("Select at least one certificate to download.");
      return;
    }
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
        { responseType: "blob" }
      );
      const blob = new Blob([res.data], { type: "application/zip" });
      const group = srfGroups.find((g) => g.inward_id === activeSrfId);
      const zipName = group?.srf_no
        ? `${String(group.srf_no).replace(/[/\\?*:]/g, "-")}.zip`
        : "certificates.zip";
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = zipName;
      link.click();
      URL.revokeObjectURL(link.href);
      setShowBulkDownloadModal(false);
      toast.success(`Downloaded ${selectedForBulkDownload.size} certificate(s) as ZIP.`);
    } catch (err: any) {
      const msg = err.response?.data instanceof Blob ? "Bulk download failed." : err.response?.data?.detail || "Bulk download failed.";
      toast.error(msg);
    } finally {
      setBulkDownloading(false);
    }
  };

  // Certificate IDs for current tab (Approved/Issued) - used for "Select all" and bulk download
  const bulkCertIds = useMemo(() => {
    if (!activeSrfId || (activeTab !== "approved" && activeTab !== "issued")) return [];
    const group = srfGroups.find((g) => g.inward_id === activeSrfId);
    if (!group) return [];
    return group.equipments
      .filter((e) => getEquipmentCategory(e) === activeTab)
      .map((e) => e.certificate?.certificate_id)
      .filter((id): id is number => id != null);
  }, [srfGroups, activeSrfId, activeTab]);

  // --- Filtering ---

  const filteredGroups = useMemo(() => {
    if (!searchTerm) return srfGroups;
    const lower = searchTerm.toLowerCase();
    return srfGroups.filter(g =>
      g.srf_no.toLowerCase().includes(lower) ||
      (g.customer_dc_no && g.customer_dc_no.toLowerCase().includes(lower))
    );
  }, [srfGroups, searchTerm]);

  // ==========================================
  // VIEW MODE: DETAIL
  // ==========================================

  if (viewMode === "detail" && activeSrfId) {
    if (isLoading) return <DetailSkeleton />;

    const selectedGroup = srfGroups.find(g => g.inward_id === activeSrfId);

    if (!selectedGroup) {
      return <div className="p-8 text-center">SRF Not Found <button onClick={handleBackToList} className="text-indigo-600 underline ml-2">Back</button></div>;
    }

    const counts = {
      pending_gen: selectedGroup.equipments.filter(e => getEquipmentCategory(e) === "pending_gen").length,
      draft: selectedGroup.equipments.filter(e => getEquipmentCategory(e) === "draft").length,
      rework: selectedGroup.equipments.filter(e => getEquipmentCategory(e) === "rework").length,
      approval: selectedGroup.equipments.filter(e => getEquipmentCategory(e) === "approval").length,
      approved: selectedGroup.equipments.filter(e => getEquipmentCategory(e) === "approved").length,
      issued: selectedGroup.equipments.filter(e => getEquipmentCategory(e) === "issued").length,
    };

    const filteredEquipments = selectedGroup.equipments.filter(e => getEquipmentCategory(e) === activeTab);

    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto space-y-6">

          {/* Header */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">Certificate Management</h1>
              </div>
              <div className="flex items-center gap-2 text-gray-500 text-sm mt-1">
                <span className="font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100">
                  SRF: {selectedGroup.srf_no}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleBackToList} className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm">
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </button>
            </div>
          </div>

          {/* Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl"><User className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</p>
                  <p className="font-medium text-gray-900 mt-1">{selectedGroup.customer_details || "N/A"}</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl"><FileText className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">DC Details</p>
                  <p className="font-medium text-gray-900 mt-1">{selectedGroup.customer_dc_no || "N/A"}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{formatDate(selectedGroup.customer_dc_date)}</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-teal-50 text-teal-600 rounded-xl"><Award className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</p>
                  <p className="font-medium text-gray-900 mt-1">{counts.issued} Issued / {selectedGroup.equipments.length} Total</p>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs & Table */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-gray-50 border-b border-gray-200 p-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex space-x-1 overflow-x-auto">
                  <button onClick={() => handleTabChange("pending_gen")} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === "pending_gen" ? "bg-white text-gray-900 shadow-sm border border-gray-200" : "text-gray-500 hover:bg-gray-200"}`}>
                    <Plus className="h-4 w-4" /> Pending Generation <span className="ml-1 bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full text-xs">{counts.pending_gen}</span>
                  </button>
                  <button onClick={() => handleTabChange("draft")} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === "draft" ? "bg-white text-amber-700 shadow-sm border border-gray-200" : "text-gray-500 hover:bg-gray-200"}`}>
                    <FileText className="h-4 w-4" /> Drafts <span className="ml-1 bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-xs">{counts.draft}</span>
                  </button>
                  <button onClick={() => handleTabChange("rework")} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === "rework" ? "bg-white text-orange-700 shadow-sm border border-gray-200" : "text-gray-500 hover:bg-gray-200"}`}>
                    <RotateCcw className="h-4 w-4" /> Rework <span className="ml-1 bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full text-xs">{counts.rework}</span>
                  </button>
                  <button onClick={() => handleTabChange("approval")} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === "approval" ? "bg-white text-blue-700 shadow-sm border border-gray-200" : "text-gray-500 hover:bg-gray-200"}`}>
                    <Clock className="h-4 w-4" /> Approval Pending <span className="ml-1 bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs">{counts.approval}</span>
                  </button>
                  <button onClick={() => handleTabChange("approved")} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === "approved" ? "bg-white text-emerald-700 shadow-sm border border-gray-200" : "text-gray-500 hover:bg-gray-200"}`}>
                    <CheckCircle2 className="h-4 w-4" /> Approved <span className="ml-1 bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-xs">{counts.approved}</span>
                  </button>
                  <button onClick={() => handleTabChange("issued")} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === "issued" ? "bg-white text-green-700 shadow-sm border border-gray-200" : "text-gray-500 hover:bg-gray-200"}`}>
                    <CheckCircle2 className="h-4 w-4" /> Issued <span className="ml-1 bg-green-100 text-green-800 px-2 py-0.5 rounded-full text-xs">{counts.issued}</span>
                  </button>
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
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50/50 text-gray-500 text-xs uppercase tracking-wider border-b border-gray-200">
                    {isBulkDownloadTab && (
                      <th className="px-4 py-4 font-semibold w-12">
                        <label className="flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={bulkCertIds.length > 0 && bulkCertIds.every((id) => selectedForBulkDownload.has(id))}
                            onChange={toggleBulkSelectAll}
                            className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                          />
                          <span className="sr-only">Select all</span>
                        </label>
                      </th>
                    )}
                    <th className="px-6 py-4 font-semibold">NEPL ID / Description</th>
                    <th className="px-6 py-4 font-semibold">Certificate No</th>
                    <th className="px-6 py-4 font-semibold">Status</th>
                    <th className="px-6 py-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {filteredEquipments.length > 0 ? (
                    filteredEquipments.map((item) => {
                      const cert = item.certificate;
                      return (
                        <tr key={item.inward_eqp_id} className="hover:bg-gray-50 transition-colors">
                          {isBulkDownloadTab && (
                            <td className="px-4 py-4 align-middle">
                              {cert && (
                                <label className="flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={selectedForBulkDownload.has(cert.certificate_id)}
                                    onChange={() => toggleBulkSelection(cert.certificate_id)}
                                    className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                  />
                                  <span className="sr-only">Select certificate {cert.certificate_no}</span>
                                </label>
                              )}
                            </td>
                          )}
                          <td className="px-6 py-4 align-top">
                            <div className="font-medium text-gray-900">{item.nepl_id}</div>
                            <div className="text-gray-500 text-xs">{item.material_description}</div>

                            {cert && cert.status === "DRAFT" && (
                              <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg flex gap-2 max-w-sm">
                                <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                                <div>
                                  <p className="text-xs font-medium text-amber-800">Draft generated.</p>
                                  <p className="text-xs text-amber-700">Please edit and submit for approval.</p>
                                </div>
                              </div>
                            )}
                            {cert && cert.status === "REWORK" && cert.admin_rework_comment && (
                              <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded-lg flex gap-2 max-w-sm">
                                <AlertCircle className="h-4 w-4 text-orange-600 flex-shrink-0 mt-0.5" />
                                <div>
                                  <p className="text-xs font-medium text-orange-800">Rework Requested</p>
                                  <p className="text-xs text-orange-700">{cert.admin_rework_comment}</p>
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 align-top font-mono text-gray-700">
                            {cert ? cert.certificate_no : <span className="text-gray-400 italic">Not Generated</span>}
                          </td>
                          <td className="px-6 py-4 align-top">
                            {cert ? (
                              <div className="flex flex-col gap-1">
                                <span className={`inline-flex w-fit items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusBadge(cert)}`}>
                                  {STATUS_LABELS[(cert.status || "DRAFT").toUpperCase() as StatusKey] || cert.status}
                                </span>
                              </div>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border bg-gray-100 text-gray-600 border-gray-200">
                                Ready to Generate
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 align-middle text-right">
                            <div className="flex justify-end gap-2">
                              {!cert ? (
                                <button
                                  onClick={() => handleGenerateAndOpenFlow(item.job_id)}
                                  disabled={generatingJobId !== null}
                                  className="inline-flex items-center px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                                >
                                  {generatingJobId === item.job_id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                                  Generate
                                </button>
                              ) : (
                                <>
                                  <button onClick={() => handleOpenPreview(cert)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Preview"><Eye className="h-4 w-4" /></button>

                                  {(cert.status === "DRAFT" || cert.status === "REWORK") && (
                                    <button onClick={() => handleOpenEdit(cert)} className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="Edit"><Edit className="h-4 w-4" /></button>
                                  )}

                                  <button onClick={() => handleInitiateDownload(cert)} className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Download PDF"><Download className="h-4 w-4" /></button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr><td colSpan={isBulkDownloadTab ? 5 : 4} className="px-6 py-16 text-center text-gray-400"><div className="flex flex-col items-center"><Package className="h-10 w-10 mb-2 opacity-30" /><p>No items found in this category.</p></div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* --- MODALS IN DETAIL VIEW --- */}

          {/* Download Options Modal */}
          {showDownloadModal && downloadCertData && (
            <ModalPortal>
              <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 zoom-in-95 animate-in">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Download Certificate</h3>
                  <p className="text-sm text-gray-500 mb-6">Choose how you want to export certificate <strong>{downloadCertData.no}</strong>.</p>

                  <label className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors mb-6">
                    <div className="relative flex items-center">
                      <input
                        type="checkbox"
                        className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
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
                    <button onClick={() => setShowDownloadModal(false)} className="flex-1 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">Cancel</button>
                    <button onClick={handleConfirmDownload} className="flex-1 py-2.5 text-white bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors flex items-center justify-center gap-2">
                      <Download className="h-4 w-4" /> Download
                    </button>
                  </div>
                </div>
              </div>
            </ModalPortal>
          )}

          {/* Bulk Download (ZIP) Options Modal */}
          {showBulkDownloadModal && (
            <ModalPortal>
              <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 zoom-in-95 animate-in">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Download as ZIP</h3>
                  <p className="text-sm text-gray-500 mb-6">
                    Download <strong>{selectedForBulkDownload.size}</strong> certificate(s) as a ZIP file. Choose export option.
                  </p>

                  <label className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors mb-6">
                    <div className="relative flex items-center">
                      <input
                        type="checkbox"
                        className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
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
              </div>
            </ModalPortal>
          )}

          {/* Edit Modal */}
          {showEditModal && selectedCertificate && (
            <ModalPortal>
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                <div className="bg-white rounded-2xl shadow-xl max-w-md w-full animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between p-6 border-b">
                    <h2 className="text-xl font-bold text-gray-900">Edit Certificate</h2>
                    <button onClick={() => setShowEditModal(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X className="h-5 w-5" /></button>
                  </div>
                  <div className="p-6 space-y-4">
                    {selectedCertificate.status === "REWORK" && selectedCertificate.admin_rework_comment && (
                      <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800">
                        <strong>Admin Comment:</strong> {selectedCertificate.admin_rework_comment}
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">ULR No *</label>
                      <input type="text" value={editForm.ulr_no} onChange={(e) => setEditForm((f) => ({ ...f, ulr_no: e.target.value }))} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="Enter ULR No" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Field of Parameter *</label>
                      <input type="text" value={editForm.field_of_parameter} onChange={(e) => setEditForm((f) => ({ ...f, field_of_parameter: e.target.value }))} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="e.g. Mechanical" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Recommended Due Date *</label>
                      <input type="date" value={editForm.recommended_cal_due_date} onChange={(e) => setEditForm((f) => ({ ...f, recommended_cal_due_date: e.target.value }))} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Item Status</label>
                      <input type="text" value={editForm.item_status} onChange={(e) => setEditForm((f) => ({ ...f, item_status: e.target.value }))} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" />
                    </div>

                    <div className="flex gap-2 pt-4">
                      <button onClick={handleSaveEdit} disabled={isSubmitting} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex justify-center items-center">{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Draft"}</button>
                      {(selectedCertificate.status === "DRAFT" || selectedCertificate.status === "REWORK") && (
                        <button onClick={() => selectedCertificate.status === "REWORK" ? handleResubmitForApproval(selectedCertificate) : handleSubmitForApproval(selectedCertificate)} disabled={isSubmitting} className="flex-1 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex justify-center items-center"><Send className="h-4 w-4 mr-1" /> Submit</button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </ModalPortal>
          )}

          {/* Preview Modal */}
          {showPreviewModal && selectedCertificate && (
            <ModalPortal>
              <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/50 p-4 pt-8 overflow-y-auto">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[calc(100vh-4rem)] overflow-hidden flex flex-col flex-shrink-0 my-4">
                  <div className="flex-shrink-0 flex items-center justify-between p-4 border-b bg-gray-50">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setShowPreviewModal(false);
                          setSelectedCertificate(null);
                          setPreviewData(null);
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors font-medium"
                      >
                        <ChevronLeft className="h-5 w-5" />
                        Back
                      </button>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">Certificate Preview</h3>
                    <div className="flex items-center gap-2">
                      {(selectedCertificate.status === "DRAFT" || selectedCertificate.status === "REWORK") && (
                        <button
                          onClick={handleProceedToEditFromPreview}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm"
                        >
                          <Edit className="h-4 w-4" /> Continue to Edit
                        </button>
                      )}
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
                        <Loader2 className="h-12 w-12 animate-spin text-purple-600 mb-4" />
                        <p className="text-gray-600">Loading certificate...</p>
                      </div>
                    ) : previewData?.template_data ? (
                      <CustomerCertificatePrintView
                        data={previewData.template_data}
                      // No onDownload prop here - removing the inner button
                      />
                    ) : (
                      <div className="text-center py-24 text-gray-500">Failed to load preview.</div>
                    )}
                  </div>
                </div>
              </div>
            </ModalPortal>
          )}
        </div>
      </div>);
  }
  // ==========================================
  // VIEW MODE: LIST
  // ==========================================

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
              <Award className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Certificates</h2>
              <p className="text-gray-500 text-sm mt-1">
                Generate and manage calibration certificates
              </p>
            </div>
          </div>
          <button type="button" onClick={() => navigate("/engineer")} className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:text-gray-900 font-medium text-sm transition-all shadow-sm" >
            <ChevronLeft size={16} /> <span>Back to Dashboard</span>
          </button>
        </div>

        {/* Main Content Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
          {/* Toolbar */}
          <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-50/50 rounded-t-2xl">
            <div className="relative max-w-md w-full">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input type="text" placeholder="Search by SRF or Customer DC..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2.5 w-full border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow bg-white" />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleOpenGenerateModal} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 shadow-sm transition-colors" >
                <Plus className="h-4 w-4" /> Generate Certificate
              </button>
            </div>
          </div>

          {error && (
            <div className="m-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          )}

          <div className="p-4 sm:p-6">
            {isLoading ? (
              <CertificateListSkeleton />
            ) : filteredGroups.length === 0 ? (
              <div className="text-center py-16">
                <div className="inline-flex items-center justify-center p-4 bg-gray-50 rounded-full mb-4">
                  <FileText className="h-8 w-8 text-gray-300" />
                </div>
                <h3 className="text-lg font-medium text-gray-900">No SRFs found</h3>
                <p className="text-gray-500 mt-1 max-w-sm mx-auto">
                  Calibrate equipment first to see them appear here for certificate generation.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredGroups.map((group) => {
                  const total = group.equipments.length;
                  const issued = group.equipments.filter(e => e.certificate?.status === "ISSUED").length;
                  const drafts = group.equipments.filter(e => e.certificate?.status === "DRAFT" || e.certificate?.status === "REWORK").length;
                  const pending = group.equipments.filter(e => !e.certificate).length;

                  return (
                    <div
                      key={group.inward_id}
                      onClick={() => handleOpenSrf(group.inward_id)}
                      className="flex items-center justify-between p-5 bg-gray-50 hover:bg-indigo-50 border border-gray-200 rounded-xl transition-all duration-200 group shadow-sm hover:shadow-md cursor-pointer"
                    >
                      <div className="flex items-start gap-4">
                        <div className="mt-1">
                          <div className="p-2 rounded-full bg-indigo-100 text-indigo-600">
                            <Package className="h-5 w-5" />
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center gap-3">
                            <p className="font-semibold text-lg text-gray-800">
                              SRF No: {group.srf_no}
                            </p>
                            {pending > 0 && <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-gray-200 text-gray-700 border border-gray-300">{pending} Pending</span>}
                            {drafts > 0 && <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800 border border-amber-200">{drafts} Drafts/Rework</span>}
                          </div>
                          <p className="text-sm text-gray-600 mt-1">
                            <span className="font-medium text-gray-900">{total} Equipments</span> • {issued} Certificates Issued
                          </p>
                          {group.customer_dc_no && (
                            <p className="text-xs text-gray-500 mt-0.5">DC: {group.customer_dc_no}</p>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-indigo-600 transition-colors" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- MODALS IN LIST VIEW --- */}

      {/* Generate Modal (Global) */}
      {showGenerateModal && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between p-6 border-b">
                <h2 className="text-xl font-bold text-gray-900">Generate Certificate</h2>
                <button onClick={() => setShowGenerateModal(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100" >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto flex-1">
                <p className="text-sm text-gray-600 mb-4">
                  Select a completed calibration job to generate a draft certificate.
                </p>
                {jobsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                  </div>
                ) : jobs.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    No pending jobs available for generation.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {/* Simplified list for modal */}
                    {jobs.map(job => (
                      <div key={job.job_id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                        <div>
                          <p className="font-medium text-sm text-gray-900">{job.nepl_id || `Job #${job.job_id}`}</p>
                          <p className="text-xs text-gray-500">SRF: {job.srf_no || 'N/A'}</p>
                        </div>
                        <button onClick={() => handleGenerateAndOpenFlow(job.job_id)} disabled={generatingJobId !== null} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded hover:bg-indigo-700 disabled:opacity-50 flex items-center" >
                          {generatingJobId === job.job_id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                          Create
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Download Modal (List View Context) */}
      {showDownloadModal && downloadCertData && (
        <ModalPortal>
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 zoom-in-95 animate-in">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Download Certificate</h3>
              <p className="text-sm text-gray-500 mb-6">Choose how you want to export certificate <strong>{downloadCertData.no}</strong>.</p>

              <label className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors mb-6">
                <div className="relative flex items-center">
                  <input
                    type="checkbox"
                    className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
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
                <button onClick={() => setShowDownloadModal(false)} className="flex-1 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">Cancel</button>
                <button onClick={handleConfirmDownload} className="flex-1 py-2.5 text-white bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors flex items-center justify-center gap-2">
                  <Download className="h-4 w-4" /> Download
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Edit Modal (List Context) */}
      {showEditModal && selectedCertificate && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between p-6 border-b">
                <h2 className="text-xl font-bold text-gray-900">Edit Certificate</h2>
                <button onClick={() => setShowEditModal(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X className="h-5 w-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                {selectedCertificate.status === "REWORK" && selectedCertificate.admin_rework_comment && (
                  <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800">
                    <strong>Admin Comment:</strong> {selectedCertificate.admin_rework_comment}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ULR No *</label>
                  <input type="text" value={editForm.ulr_no} onChange={(e) => setEditForm((f) => ({ ...f, ulr_no: e.target.value }))} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="Enter ULR No" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Field of Parameter *</label>
                  <input type="text" value={editForm.field_of_parameter} onChange={(e) => setEditForm((f) => ({ ...f, field_of_parameter: e.target.value }))} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="e.g. Mechanical" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Recommended Due Date *</label>
                  <input type="date" value={editForm.recommended_cal_due_date} onChange={(e) => setEditForm((f) => ({ ...f, recommended_cal_due_date: e.target.value }))} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Item Status</label>
                  <input type="text" value={editForm.item_status} onChange={(e) => setEditForm((f) => ({ ...f, item_status: e.target.value }))} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" />
                </div>

                <div className="flex gap-2 pt-4">
                  <button onClick={handleSaveEdit} disabled={isSubmitting} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex justify-center items-center">{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Draft"}</button>
                  {(selectedCertificate.status === "DRAFT" || selectedCertificate.status === "REWORK") && (
                    <button onClick={() => selectedCertificate.status === "REWORK" ? handleResubmitForApproval(selectedCertificate) : handleSubmitForApproval(selectedCertificate)} disabled={isSubmitting} className="flex-1 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex justify-center items-center"><Send className="h-4 w-4 mr-1" /> Submit</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Preview Modal (List Context) */}
      {showPreviewModal && selectedCertificate && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/50 p-4 pt-8 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[calc(100vh-4rem)] overflow-hidden flex flex-col flex-shrink-0 my-4">
              <div className="flex-shrink-0 flex items-center justify-between p-4 border-b bg-gray-50">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setShowPreviewModal(false);
                      setSelectedCertificate(null);
                      setPreviewData(null);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors font-medium"
                  >
                    <ChevronLeft className="h-5 w-5" />
                    Back
                  </button>
                </div>
                <h3 className="text-lg font-bold text-gray-900">Certificate Preview</h3>
                <div className="flex items-center gap-2">
                  {(selectedCertificate.status === "DRAFT" || selectedCertificate.status === "REWORK") && (
                    <button
                      onClick={handleProceedToEditFromPreview}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm"
                    >
                      <Edit className="h-4 w-4" /> Continue to Edit
                    </button>
                  )}
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
                    <Loader2 className="h-12 w-12 animate-spin text-purple-600 mb-4" />
                    <p className="text-gray-600">Loading certificate...</p>
                  </div>
                ) : previewData?.template_data ? (
                  <CustomerCertificatePrintView
                    data={previewData.template_data}
                  // No onDownload here
                  />
                ) : (
                  <div className="text-center py-24 text-gray-500">Failed to load preview.</div>
                )}
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
};
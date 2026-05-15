import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/config";
import {
  ArrowLeft,
  ChevronRight,
  ClipboardEdit,
  UploadCloud,
  Eye,
  EyeOff,
  Trash2,
  Loader2,
  AlertTriangle,
  X,
  Plus,
  CheckCircle2,
  Calendar,
  Search,
  Package,
  FileText,
  User,
  Download,
  MinusCircle,
  Info,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  Send,
  Clock,
  RefreshCw,
} from "lucide-react";

// ─────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────

interface SrfGroupSummary {
  srf_no: string;
  customer_name: string;
  received_date: string;
  equipment_count: number;
}

interface BasicEquipment {
  inward_eqp_id: number;
  nepl_id: string;
  material_description: string;
  make?: string;
  model?: string;
  serial_no?: string;
  range?: string;
}

interface DeviationAttachment {
  id: number | string;
  file_name: string;
  file_url: string;
  isLocal?: boolean;
  fileObject?: File;
}

interface ExternalDeviationData {
  id: number;
  inward_eqp_id: number;
  deviation_type: "OOT" | "NC";
  tool_status: string;
  step_per_deviation: Record<string, any>;
  engineer_remarks?: string;
  customer_decision?: string;
  report?: string;
  hide_customer_visibility?: boolean;
  attachments?: DeviationAttachment[];
}

type DocType = "result" | "certificate";
type UnlockStatus = "PENDING" | "APPROVED" | "REJECTED";

interface UnlockRequestHistory {
  status: UnlockStatus;
  engineer_reason: string;
  admin_comment: string | null;
  requested_at: string;
  actioned_at: string | null;
}

interface UnlockRequest {
  status: UnlockStatus;
  engineer_reason: string;
  requested_by: number;
  requested_at: string;
  admin_comment: string | null;
  actioned_by: number | null;
  actioned_at: string | null;
  history: UnlockRequestHistory[];
}

interface DocStatus {
  res: string | null;
  resN: string | null;
  resLocked: boolean;
  resUnlockRequest: UnlockRequest | null;
  cert: string | null;
  certN: string | null;
  certLocked: boolean;
  certUnlockRequest: UnlockRequest | null;
  dev: boolean;
}

// ─────────────────────────────────────────────
// FILE VALIDATION UTILITY
// ─────────────────────────────────────────────

interface FileValidationResult {
  isValid: boolean;
  uploadedFileName: string;
  neplId: string;
}

const validateFileAgainstNeplId = (
  file: File,
  neplId: string
): FileValidationResult => {
  const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_]/g, "");
  return {
    isValid: normalize(file.name).includes(normalize(neplId)),
    uploadedFileName: file.name,
    neplId,
  };
};

// ─────────────────────────────────────────────
// UPLOAD FEEDBACK COMPONENTS
// ─────────────────────────────────────────────

const ValidationErrorBanner: React.FC<{
  result: FileValidationResult;
  onDismiss: () => void;
}> = ({ result, onDismiss }) => (
  <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 shadow-sm">
    <ShieldAlert size={18} className="text-red-500 mt-0.5 shrink-0" />
    <div className="flex-1 min-w-0 space-y-2">
      <p className="text-sm font-semibold text-red-800">
        Upload blocked — NEPL ID not found in filename
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <div className="bg-white border border-red-100 rounded-lg px-3 py-2">
          <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-0.5">
            File selected
          </p>
          <p className="font-mono font-semibold text-red-700 break-all">
            {result.uploadedFileName}
          </p>
        </div>
        <div className="bg-white border border-red-100 rounded-lg px-3 py-2">
          <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-0.5">
            Must contain NEPL ID
          </p>
          <p className="font-mono font-bold text-blue-600">{result.neplId}</p>
        </div>
      </div>
    </div>
    <button
      onClick={onDismiss}
      className="p-1 text-red-300 hover:text-red-500 rounded shrink-0"
    >
      <X size={14} />
    </button>
  </div>
);

const UploadSuccessToast: React.FC<{ neplId: string }> = ({ neplId }) => (
  <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 shadow-sm">
    <CheckCircle2 size={18} className="text-green-600 shrink-0" />
    <p className="text-sm font-semibold text-green-800">
      File uploaded and locked for{" "}
      <span className="font-mono font-bold">{neplId}</span>
    </p>
  </div>
);

const UploadingIndicator: React.FC<{ neplId: string }> = ({ neplId }) => (
  <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 shadow-sm">
    <Loader2 size={18} className="text-blue-500 animate-spin shrink-0" />
    <p className="text-sm font-semibold text-blue-800">
      Uploading file for <span className="font-mono font-bold">{neplId}</span>…
    </p>
  </div>
);

const LockPill: React.FC<{
  locked: boolean;
  unlockRequest: UnlockRequest | null;
}> = ({ locked, unlockRequest }) => {
  if (!locked) return null;
  const st = unlockRequest?.status;

  if (st === "PENDING")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-50 border border-yellow-200 rounded-full text-[9px] font-bold text-yellow-700">
        <Clock size={8} className="animate-pulse" /> PENDING APPROVAL
      </span>
    );
  if (st === "REJECTED")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 border border-red-200 rounded-full text-[9px] font-bold text-red-600">
        <X size={8} /> REJECTED — RE-SUBMIT
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 border border-red-200 rounded-full text-[9px] font-bold text-red-600">
      <Lock size={8} /> LOCKED
    </span>
  );
};

// ─────────────────────────────────────────────
// ENGINEER: REQUEST UNLOCK MODAL
// ─────────────────────────────────────────────

const RequestUnlockModal: React.FC<{
  isOpen: boolean;
  equipment: BasicEquipment;
  docType: DocType;
  unlockRequest: UnlockRequest | null;
  onClose: () => void;
  onSubmitted: () => void;
}> = ({ isOpen, equipment, docType, unlockRequest, onClose, onSubmitted }) => {
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const label = docType === "result" ? "Calibration Worksheet" : "Certificate";
  const isPending  = unlockRequest?.status === "PENDING";
  const isRejected = unlockRequest?.status === "REJECTED";

  useEffect(() => {
    if (isOpen) {
      setReason("");
      setError("");
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError("Please provide a reason.");
      return;
    }
    setIsSubmitting(true);
    try {
      await api.post(
        `/manual-calibration/equipment/${equipment.inward_eqp_id}/request-unlock`,
        { doc_type: docType, reason }
      );
      onSubmitted();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to submit request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[200] flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 p-5 border-b bg-blue-50">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
            <Unlock size={18} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Request Delete</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              <span className="font-mono font-bold text-blue-600">
                {equipment.nepl_id}
              </span>
              {" · "}
              <span className="font-semibold">{label}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-1 text-gray-400 hover:text-gray-600 rounded-full"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {isRejected && unlockRequest && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1.5">
              <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">
                Previous Request — Rejected
              </p>
              <p className="text-xs text-gray-700">
                <span className="font-semibold">Your reason: </span>
                {unlockRequest.engineer_reason}
              </p>
              {unlockRequest.admin_comment && (
                <p className="text-xs text-gray-700">
                  <span className="font-semibold">Admin feedback: </span>
                  {unlockRequest.admin_comment}
                </p>
              )}
              <p className="text-[10px] text-gray-400 pt-1 border-t border-red-100">
                Submit a new request with more detail.
              </p>
            </div>
          )}

          {isPending ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 text-center space-y-3">
              <div className="flex justify-center">
                <div className="p-3 bg-yellow-100 rounded-full">
                  <Clock size={24} className="text-yellow-600" />
                </div>
              </div>
              <p className="font-bold text-gray-900">Awaiting Admin Approval</p>
              <p className="text-xs text-gray-500">
                Your unlock request for{" "}
                <span className="font-semibold">{label}</span> is pending.
              </p>
              <div className="bg-white border border-yellow-100 rounded-lg p-3 text-left space-y-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase">Your Reason</p>
                <p className="text-xs text-gray-700 font-medium">"{unlockRequest?.engineer_reason}"</p>
                <p className="text-[10px] text-gray-400">
                  Submitted {new Date(unlockRequest!.requested_at).toLocaleString("en-GB")}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
                <Info size={14} className="text-gray-400 mt-0.5 shrink-0" />
                <p className="text-xs text-gray-600">
                  Files are locked after upload. Provide a clear reason for the Admin.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    setError("");
                  }}
                  placeholder={`Why does the ${label} need to be changed?`}
                  maxLength={500}
                  className={`w-full p-3 border rounded-xl text-sm h-28 resize-none outline-none transition-colors ${
                    error
                      ? "border-red-300 bg-red-50"
                      : "border-gray-300 focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                  }`}
                />
                {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
                <p className="text-[10px] text-gray-400 mt-1 text-right">{reason.length}/500</p>
              </div>

              {(unlockRequest?.history?.length ?? 0) > 0 && (
                <details className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <summary className="text-xs font-bold text-gray-500 uppercase cursor-pointer">
                    Request History ({unlockRequest!.history!.length})
                  </summary>
                  <div className="mt-3 space-y-2">
                    {unlockRequest!.history!.map((h, i) => (
                      <div key={i} className="text-xs bg-white border border-gray-100 rounded-lg p-2.5 space-y-1">
                        <p className="text-gray-700">"{h.engineer_reason}"</p>
                        <p className={`font-bold text-[10px] ${h.status === "APPROVED" ? "text-green-600" : "text-red-500"}`}>
                          {h.status}{h.admin_comment && ` — "${h.admin_comment}"`}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
        </div>

        <div className="px-5 pb-5 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium">
            {isPending ? "Close" : "Cancel"}
          </button>
          {!isPending && (
            <button
              onClick={handleSubmit}
              disabled={!reason.trim() || isSubmitting}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg flex items-center gap-2"
            >
              {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {isRejected ? "Re-submit Request" : "Submit Request"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// ADMIN: REVIEW UNLOCK REQUEST MODAL
// ─────────────────────────────────────────────

const AdminReviewModal: React.FC<{
  isOpen: boolean;
  equipment: BasicEquipment;
  docType: DocType;
  unlockRequest: UnlockRequest;
  onClose: () => void;
  onActioned: () => void;
}> = ({ isOpen, equipment, docType, unlockRequest, onClose, onActioned }) => {
  const [comment, setComment]         = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");

  const label = docType === "result" ? "Calibration Worksheet" : "Certificate";

  useEffect(() => {
    if (isOpen) {
      setComment("");
      setActionError("");
    }
  }, [isOpen]);

  const handleAction = async (action: "APPROVED" | "REJECTED") => {
    if (action === "REJECTED" && !comment.trim()) {
      setActionError("A reason is required when rejecting.");
      return;
    }
    setIsSubmitting(true);
    try {
      await api.post(
        `/manual-calibration/equipment/${equipment.inward_eqp_id}/action-unlock`,
        { doc_type: docType, action, comment }
      );
      onActioned();
      onClose();
    } catch {
      setActionError("Failed to process.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[200] flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 p-5 border-b bg-amber-50">
          <div className="p-2 bg-amber-100 text-amber-600 rounded-xl"><ShieldCheck size={18} /></div>
          <div>
            <h3 className="font-bold text-gray-900">Review Unlock Request</h3>
            <p className="text-xs text-gray-500 mt-0.5"><span className="font-mono font-bold text-blue-600">{equipment.nepl_id}</span> · <span className="font-semibold">{label}</span></p>
          </div>
          <button onClick={onClose} className="ml-auto p-1 text-gray-400 hover:text-gray-600 rounded-full"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-1.5">
            <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Engineer's Reason</p>
            <p className="text-sm text-gray-800 font-medium">"{unlockRequest.engineer_reason}"</p>
            <p className="text-[10px] text-gray-400">Requested {new Date(unlockRequest.requested_at).toLocaleString("en-GB")}</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Comment <span className="text-gray-400 font-normal normal-case">(required for rejection)</span></label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add instructions or reason..."
              className={`w-full p-3 border rounded-xl text-sm h-20 resize-none outline-none transition-colors ${
                actionError ? "border-red-300 bg-red-50" : "border-gray-300 focus:ring-2 focus:ring-amber-100"
              }`}
            />
            {actionError && <p className="text-xs text-red-500 mt-1">{actionError}</p>}
          </div>
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button onClick={() => handleAction("REJECTED")} className="flex-1 py-2.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 text-sm font-semibold rounded-lg flex items-center justify-center gap-2"><X size={15} /> Reject</button>
          <button onClick={() => handleAction("APPROVED")} className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2">
            {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Approve
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// DOWNLOAD / VIEW HELPERS
// ─────────────────────────────────────────────

const coreDownload = async (url: string, fileName: string) => {
  try {
    if (url.startsWith("blob:")) {
      const a = document.createElement("a"); a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      return;
    }
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = blobUrl; a.setAttribute("download", fileName);
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, "_blank");
  }
};

const handleView = (url: string, fileName: string) => {
  fileName.match(/\.(xlsx|xls|csv)$/i) ? coreDownload(url, fileName) : window.open(url, "_blank", "noopener,noreferrer");
};

const handleDownload = (url: string, fileName: string) => coreDownload(url, fileName);

// ─────────────────────────────────────────────
// SINGLE FILE GROUP COMPONENT
// ─────────────────────────────────────────────

const FileGroup: React.FC<{
  label: string;
  docType: DocType;
  equipment: BasicEquipment;
  fileUrl: string | null;
  fileName: string | null;
  isLocked: boolean;
  unlockRequest: UnlockRequest | null;
  isAdmin: boolean;
  onPickFile: () => void;
  onDelete: () => void;
  onRefresh: () => void;
}> = ({ label, docType, equipment, fileUrl, fileName, isLocked, unlockRequest, isAdmin, onPickFile, onDelete, onRefresh }) => {
  const [requestModal, setRequestModal] = useState(false);
  const [reviewModal,  setReviewModal]  = useState(false);

  const isPending  = unlockRequest?.status === "PENDING";
  const isRejected = unlockRequest?.status === "REJECTED";
  const isApproved = unlockRequest?.status === "APPROVED";

  const handleDeleteClick = () => {
    if (!isLocked || isAdmin) {
      if (window.confirm(`Delete the ${label}? This cannot be undone.`)) onDelete();
      return;
    }
    if (isApproved) {
      if (window.confirm(`You have admin approval. Delete the ${label}?`)) onDelete();
      return;
    }
    setRequestModal(true);
  };

  if (isLocked) {
    return (
      <>
        <RequestUnlockModal isOpen={requestModal} equipment={equipment} docType={docType} unlockRequest={unlockRequest} onClose={() => setRequestModal(false)} onSubmitted={onRefresh} />
        {isAdmin && unlockRequest && <AdminReviewModal isOpen={reviewModal} equipment={equipment} docType={docType} unlockRequest={unlockRequest} onClose={() => setReviewModal(false)} onActioned={onRefresh} />}
        <div className="flex flex-col gap-1">
          <div className="inline-flex rounded-lg shadow-sm border border-red-200 bg-white overflow-hidden h-10">
            <div className="px-3 py-1.5 text-[10px] font-semibold bg-red-50 text-red-500 border-r border-red-100 flex items-center gap-1.5 uppercase tracking-wider whitespace-nowrap">
              <Lock size={10} /> {label}
            </div>
            {fileUrl && fileName && (
              <>
                <button onClick={() => handleView(fileUrl, fileName)} className="p-2.5 hover:bg-blue-50 text-gray-600"><Eye size={16} /></button>
                <button onClick={() => handleDownload(fileUrl, fileName)} className="p-2.5 border-l border-gray-100 hover:bg-green-50 text-green-600"><Download size={16} /></button>
                <button onClick={handleDeleteClick} className={`p-2.5 border-l border-gray-100 ${isAdmin || isApproved ? "text-red-500 hover:bg-red-50" : "text-yellow-500 hover:bg-yellow-50"}`}><Trash2 size={16} /></button>
              </>
            )}
            <div className="border-l border-gray-100">
              {isAdmin ? (
                isPending ? <button onClick={() => setReviewModal(true)} className="h-full px-3 flex items-center gap-1.5 text-[10px] font-bold text-amber-600 hover:bg-amber-50 whitespace-nowrap"><Clock size={11} className="animate-pulse" /> Review Request</button> : <div className="h-full px-3 flex items-center gap-1 text-[10px] text-gray-400"><Lock size={11} /> Locked</div>
              ) : isPending ? (
                <button onClick={() => setRequestModal(true)} className="h-full px-3 flex items-center gap-1.5 text-[10px] font-bold text-yellow-600 hover:bg-yellow-50 whitespace-nowrap"><Clock size={11} className="animate-pulse" /> Pending...</button>
              ) : isRejected ? (
                <button onClick={() => setRequestModal(true)} className="h-full px-3 flex items-center gap-1.5 text-[10px] font-bold text-red-500 hover:bg-red-50 whitespace-nowrap"><RefreshCw size={11} /> Re-request</button>
              ) : isApproved ? (
                <div className="h-full px-3 flex items-center gap-1 text-[10px] text-green-600 font-bold"><Unlock size={11} /> Approved</div>
              ) : (
                <button onClick={() => setRequestModal(true)} className="h-full px-3 flex items-center gap-1.5 text-[10px] font-bold text-blue-600 hover:bg-blue-50 whitespace-nowrap"><Send size={11} /> Request Delete</button>
              )}
            </div>
          </div>
          <LockPill locked={isLocked} unlockRequest={unlockRequest} />
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="inline-flex rounded-lg shadow-sm border border-gray-200 bg-white overflow-hidden h-10">
        <div className="px-3 py-1.5 text-[10px] font-semibold bg-gray-50 text-gray-500 border-r border-gray-200 flex items-center uppercase tracking-wider whitespace-nowrap">{label}</div>
        <button onClick={onPickFile} className="p-2.5 hover:bg-blue-50 text-blue-600"><UploadCloud size={16} /></button>
        {fileUrl && fileName && (
          <>
            <button onClick={() => handleView(fileUrl, fileName)} className="p-2.5 border-l border-gray-100 hover:bg-blue-50 text-gray-600"><Eye size={16} /></button>
            <button onClick={() => handleDownload(fileUrl, fileName)} className="p-2.5 border-l border-gray-100 hover:bg-green-50 text-green-600"><Download size={16} /></button>
            <button onClick={handleDeleteClick} className="p-2.5 border-l border-gray-100 hover:bg-red-50 text-red-500"><Trash2 size={16} /></button>
          </>
        )}
      </div>
      {isApproved && <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 border border-green-200 rounded-full text-[9px] font-bold text-green-600 w-fit"><Unlock size={8} /> UNLOCKED BY ADMIN</span>}
    </div>
  );
};

// ─────────────────────────────────────────────
// DEVIATION MODAL
// ─────────────────────────────────────────────

const DeviationModal: React.FC<{
  isOpen: boolean;
  isEditMode: boolean;
  onClose: () => void;
  equipment: BasicEquipment;
  onSuccess: () => void;
}> = ({ isOpen, isEditMode, onClose, equipment, onSuccess }) => {
  const [deviationId,       setDeviationId]       = useState<number | null>(null);
  const [deviationType,     setDeviationType]     = useState<"OOT" | "NC">("OOT");
  const [toolStatus,        setToolStatus]        = useState("");
  const [reportDate,        setReportDate]        = useState(new Date().toISOString().split("T")[0]);
  const [steps,             setSteps]             = useState([{ step: "", value: "" }]);
  const [engineerRemarks,   setEngineerRemarks]   = useState("");
  const [customerDecision,  setCustomerDecision]  = useState("");

  // ALIGNMENT: Server default false (Visible)
  const [hideCustomerVisibility, setHideCustomerVisibility] = useState(false);

  const [attachments,       setAttachments]       = useState<DeviationAttachment[]>([]);
  const [isSubmitting,      setIsSubmitting]      = useState(false);
  const [isLoadingData,     setIsLoadingData]     = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attError, setAttError] = useState<FileValidationResult | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (!isEditMode) {
      setDeviationId(null); setDeviationType("OOT"); setToolStatus(""); setEngineerRemarks(""); setCustomerDecision("");
      setHideCustomerVisibility(false); // Default to Visible (False)
      setAttachments([]); setSteps([{ step: "", value: "" }]); setAttError(null);
      return;
    }
    setIsLoadingData(true);
    api.get<ExternalDeviationData[]>(`/external-deviations/?inward_eqp_id=${equipment.inward_eqp_id}`)
      .then((res) => {
        if (res.data?.[0]) {
          const d = res.data[0];
          setDeviationId(d.id); setDeviationType(d.deviation_type); setToolStatus(d.tool_status || "");
          setReportDate(d.report || new Date().toISOString().split("T")[0]);
          setEngineerRemarks(d.engineer_remarks || ""); setCustomerDecision(d.customer_decision || "");
          setHideCustomerVisibility(d.hide_customer_visibility ?? false);
          setAttachments(d.attachments || []);
          const s = Object.entries(d.step_per_deviation || {}).map(([step, value]) => ({ step, value: String(value) }));
          setSteps(s.length > 0 ? s : [{ step: "", value: "" }]);
        }
      }).finally(() => setIsLoadingData(false));
  }, [isOpen, isEditMode, equipment.inward_eqp_id]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const stepPerDevObj = deviationType === "OOT" ? steps.reduce((acc, cur) => { if (cur.step) acc[cur.step] = cur.value; return acc; }, {} as Record<string, string>) : {};
    const payload = { inward_eqp_id: equipment.inward_eqp_id, deviation_type: deviationType, tool_status: toolStatus, report: reportDate, step_per_deviation: stepPerDevObj, engineer_remarks: engineerRemarks, customer_decision: customerDecision, hide_customer_visibility: hideCustomerVisibility };
    try {
      let currentId = deviationId;
      if (isEditMode && deviationId) { await api.patch(`/external-deviations/${deviationId}`, payload); }
      else { const res = await api.post("/external-deviations/", payload); currentId = res.data.id; }
      const localFiles = attachments.filter(a => a.isLocal && a.fileObject);
      if (deviationType !== "OOT" && localFiles.length > 0 && currentId) {
        for (const att of localFiles) {
          const fd = new FormData(); fd.append("file", att.fileObject!);
          await api.post(`/external-deviations/${currentId}/attachments`, fd);
        }
      }
      alert("Saved successfully!"); onSuccess(); onClose();
    } catch { alert("Failed to save."); } finally { setIsSubmitting(false); }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl"><AlertTriangle size={20} /></div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">{isEditMode ? "View / Edit" : "Log"} Deviation</h3>
              {deviationType === 'OOT' && (
                  <div className="mt-1 flex items-center gap-1.5">
                    {/* ALIGNMENT: !hide (False) is Emerald, hide (True) is Slate */}
                    <div className={`h-1.5 w-1.5 rounded-full ${!hideCustomerVisibility ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                      {!hideCustomerVisibility ? "Visible to Customer" : "Hidden from Customer"}
                    </p>
                  </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
             {deviationType === "OOT" && (
                <button
                  type="button"
                  onClick={() => setHideCustomerVisibility(!hideCustomerVisibility)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold transition-all border-2 shadow-sm ${
                    !hideCustomerVisibility 
                      ? "bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700" 
                      : "bg-slate-700 text-white border-slate-800 hover:bg-slate-900"
                  }`}
                >
                  {!hideCustomerVisibility ? <Eye size={16} /> : <EyeOff size={16} />}
                  {!hideCustomerVisibility ? "Hide from Customer" : "Show to Customer"}
                </button>
              )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-full"><X size={20} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-5 font-bold text-xs uppercase tracking-widest text-gray-800"><Info size={16} /> Equipment Specification</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="col-span-2 md:col-span-3"><p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Material Description</p><p className="text-sm font-semibold">{equipment.material_description || "N/A"}</p></div>
              <div><p className="text-[10px] font-bold text-gray-400 uppercase mb-1">NEPL ID</p><p className="text-sm font-mono font-bold text-blue-600">{equipment.nepl_id}</p></div>
            </div>
          </div>
          {isLoadingData ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-500" size={32} /></div> : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Type</label>
                  <select value={deviationType} onChange={e => setDeviationType(e.target.value as "OOT" | "NC")} className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-sm">
                    <option value="OOT">OOT (Out of Tolerance)</option><option value="NC">NC (Not Calibrated)</option>
                  </select>
                </div>
                <div><label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tool Status</label><input value={toolStatus} onChange={e => setToolStatus(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm" /></div>
                <div><label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Date</label><input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm" /></div>
              </div>
              {deviationType === "OOT" && (
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                  <div className="space-y-2 mb-3">
                    {steps.map((s, idx) => (
                      <div key={idx} className="flex gap-2">
                        <input placeholder="Step %" value={s.step} onChange={e => setSteps(p => p.map((x, i) => i === idx ? {...x, step: e.target.value} : x))} className="flex-1 p-2 border border-gray-300 rounded-lg text-sm" />
                        <input placeholder="Reading" value={s.value} onChange={e => setSteps(p => p.map((x, i) => i === idx ? {...x, value: e.target.value} : x))} className="flex-1 p-2 border border-gray-300 rounded-lg text-sm" />
                        <button onClick={() => setSteps(p => p.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-red-500"><MinusCircle size={18}/></button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setSteps(p => [...p, {step: "", value: ""}])} className="text-xs font-bold text-blue-600 flex items-center gap-1"><Plus size={14}/> Add Row</button>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Remarks</label><textarea value={engineerRemarks} onChange={e => setEngineerRemarks(e.target.value)} className="w-full p-3 border border-gray-300 rounded-xl text-sm h-24" /></div>
                <div><label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Decision</label><textarea value={customerDecision} onChange={e => setCustomerDecision(e.target.value)} className="w-full p-3 border border-gray-300 rounded-xl text-sm h-24" /></div>
              </div>
            </div>
          )}
        </div>
        <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-medium text-gray-600">Cancel</button>
          <button onClick={handleSubmit} disabled={isSubmitting} className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold flex items-center gap-2">
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Save Deviation
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// MAIN PAGE & LIST COMPONENTS (Remaining boiler plate unchanged)
// ─────────────────────────────────────────────

const EquipmentItem: React.FC<{
  equipment: BasicEquipment; refreshTrigger: number; currentUserRole: string;
  onOpenDeviation: (eqp: BasicEquipment, isEdit: boolean) => void;
  onValidationResult: (result: FileValidationResult, file: File, doUpload: (f: File) => Promise<void>) => void;
}> = ({ equipment, onOpenDeviation, refreshTrigger, onValidationResult, currentUserRole }) => {
  const [docs, setDocs] = useState<DocStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const baseUrl = api.defaults.baseURL?.split("/api")[0] ?? "";
  const isAdmin = currentUserRole === "admin";

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [d, dv] = await Promise.all([
        api.get(`/manual-calibration/equipment/${equipment.inward_eqp_id}/documents`).catch(() => ({ data: {} })),
        api.get(`/external-deviations/?inward_eqp_id=${equipment.inward_eqp_id}`),
      ]);
      setDocs({
        res: d.data.calibration_worksheet_file_url ? `${baseUrl}${d.data.calibration_worksheet_file_url}` : null,
        resN: d.data.calibration_worksheet_file_name || null,
        resLocked: d.data.calibration_worksheet_locked ?? false,
        resUnlockRequest: d.data.calibration_worksheet_unlock_request ?? null,
        cert: d.data.certificate_file_url ? `${baseUrl}${d.data.certificate_file_url}` : null,
        certN: d.data.certificate_file_name || null,
        certLocked: d.data.certificate_locked ?? false,
        certUnlockRequest: d.data.certificate_unlock_request ?? null,
        dev: (dv.data?.length ?? 0) > 0,
      });
    } finally { setLoading(false); }
  };
  useEffect(() => { fetchAll(); }, [equipment.inward_eqp_id, refreshTrigger]);

  const pickAndValidate = (docType: DocType) => {
    const input = document.createElement("input"); input.type = "file";
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
      const doUpload = async (f: File) => {
        const fd = new FormData(); fd.append("file", f); fd.append("doc_type", docType);
        await api.post(`/manual-calibration/equipment/${equipment.inward_eqp_id}/upload`, fd); fetchAll();
      };
      if (docType === "result") {
        const result = validateFileAgainstNeplId(file, equipment.nepl_id);
        onValidationResult(result, file, doUpload);
      } else {
        onValidationResult({ isValid: true, uploadedFileName: file.name, neplId: equipment.nepl_id }, file, doUpload);
      }
    };
    input.click();
  };

  if (loading) return <tr><td colSpan={3} className="h-16 animate-pulse bg-white" /></tr>;

  return (
    <tr className="hover:bg-gray-50 transition-colors border-b border-gray-100">
      <td className="px-6 py-4"><span className="font-medium text-blue-600 text-sm">{equipment.nepl_id}</span></td>
      <td className="px-6 py-4 text-gray-900 text-sm font-medium">{equipment.material_description}</td>
      <td className="px-6 py-4">
        <div className="flex flex-wrap gap-3 items-start">
          <FileGroup label="Calibration Worksheet" docType="result" equipment={equipment} fileUrl={docs?.res ?? null} fileName={docs?.resN ?? null} isLocked={docs?.resLocked ?? false} unlockRequest={docs?.resUnlockRequest ?? null} isAdmin={isAdmin} onPickFile={() => pickAndValidate("result")} onDelete={() => fetchAll()} onRefresh={fetchAll} />
          <button onClick={() => onOpenDeviation(equipment, docs?.dev ?? false)} className={`h-10 px-3 text-[10px] font-semibold border rounded-lg flex items-center gap-1.5 uppercase transition-all ${docs?.dev ? "bg-red-50 text-red-600 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"}`}><AlertTriangle size={14} />{docs?.dev ? "View Deviation" : "Log Deviation"}</button>
          <FileGroup label="Certificate" docType="certificate" equipment={equipment} fileUrl={docs?.cert ?? null} fileName={docs?.certN ?? null} isLocked={docs?.certLocked ?? false} unlockRequest={docs?.certUnlockRequest ?? null} isAdmin={isAdmin} onPickFile={() => pickAndValidate("certificate")} onDelete={() => fetchAll()} onRefresh={fetchAll} />
        </div>
      </td>
    </tr>
  );
};

const EquipmentDetailList: React.FC<{ group: SrfGroupSummary; onBack: () => void; currentUserRole: string }> = ({ group, onBack, currentUserRole }) => {
  const [list, setList] = useState<BasicEquipment[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [modalConfig, setModalConfig] = useState<{isOpen: boolean; isEdit: boolean; eqp: BasicEquipment | null}>({isOpen: false, isEdit: false, eqp: null});
  const [feedback, setFeedback] = useState<{type: string, neplId: string, result?: FileValidationResult} | null>(null);

  useEffect(() => { api.get(`/flow-configs/manual-calibration-groups/${group.srf_no}/equipment`).then(r => setList(r.data)); }, [group.srf_no]);

  const handleValidationResult = async (result: FileValidationResult, file: File, doUpload: (f: File) => Promise<void>) => {
    if (!result.isValid) { setFeedback({type: "error", result, neplId: result.neplId}); return; }
    setFeedback({type: "uploading", neplId: result.neplId});
    try { await doUpload(file); setFeedback({type: "success", neplId: result.neplId}); setRefreshTrigger(p => p+1); setTimeout(() => setFeedback(null), 3000); }
    catch { setFeedback(null); alert("Upload failed"); }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Job Details</h1><p className="text-gray-500 text-sm mt-1">SRF: {group.srf_no}</p></div>
        <button onClick={onBack} className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm"><ArrowLeft size={16} /> Back</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-200 flex items-start gap-3"><div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl"><User size={20} /></div><div><p className="text-xs font-semibold text-gray-500 uppercase">Customer</p><p className="font-medium text-gray-900">{group.customer_name}</p></div></div>
        <div className="bg-white p-5 rounded-2xl border border-gray-200 flex items-start gap-3"><div className="p-2.5 bg-teal-50 text-teal-600 rounded-xl"><Calendar size={20} /></div><div><p className="text-xs font-semibold text-gray-500 uppercase">Received</p><p className="font-medium text-gray-900">{new Date(group.received_date).toLocaleDateString("en-GB")}</p></div></div>
        <div className="bg-white p-5 rounded-2xl border border-gray-200 flex items-start gap-3"><div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl"><Package size={20} /></div><div><p className="text-xs font-semibold text-gray-500 uppercase">Items</p><p className="font-medium text-gray-900">{group.equipment_count} Equipments</p></div></div>
      </div>
      {feedback?.type === "uploading" && <UploadingIndicator neplId={feedback.neplId} />}
      {feedback?.type === "success" && <UploadSuccessToast neplId={feedback.neplId} />}
      {feedback?.type === "error" && feedback.result && <ValidationErrorBanner result={feedback.result} onDismiss={() => setFeedback(null)} />}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase border-b border-gray-200">
            <tr><th className="px-6 py-4 font-semibold">NEPL ID</th><th className="px-6 py-4 font-semibold">Description</th><th className="px-6 py-4 font-semibold">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {list.map(e => <EquipmentItem key={e.inward_eqp_id} equipment={e} refreshTrigger={refreshTrigger} currentUserRole={currentUserRole} onOpenDeviation={(eqp, isEdit) => setModalConfig({isOpen: true, isEdit, eqp})} onValidationResult={handleValidationResult} />)}
          </tbody>
        </table>
      </div>
      {modalConfig.isOpen && modalConfig.eqp && <DeviationModal isOpen={modalConfig.isOpen} isEditMode={modalConfig.isEdit} equipment={modalConfig.eqp} onClose={() => setModalConfig({...modalConfig, isOpen: false})} onSuccess={() => setRefreshTrigger(p => p+1)} />}
    </div>
  );
};

const ManualCalibrationPage: React.FC = () => {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<SrfGroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<SrfGroupSummary | null>(null);
  const currentUserRole = localStorage.getItem("role") ?? "engineer";

  useEffect(() => { api.get("/flow-configs/manual-calibration-groups").then(r => setGroups(r.data)).finally(() => setLoading(false)); }, []);
  const filtered = groups.filter(g => g.srf_no.toLowerCase().includes(searchTerm.toLowerCase()) || g.customer_name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        {!selectedGroup && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-600 text-white rounded-xl shadow-lg"><ClipboardEdit size={28} /></div>
              <div><h2 className="text-2xl font-bold text-gray-900 tracking-tight">Manual Calibration</h2><p className="text-gray-500 text-sm mt-1">Manage OOT / NC and certificates</p></div>
            </div>
            <button onClick={() => navigate("/engineer")} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm shadow-sm"><ArrowLeft size={16} /> Dashboard</button>
          </div>
        )}
        {loading ? <div className="space-y-4">{[1, 2].map(i => <div key={i} className="h-24 bg-white border border-gray-200 rounded-xl animate-pulse" />)}</div> :
          selectedGroup ? <EquipmentDetailList group={selectedGroup} onBack={() => setSelectedGroup(null)} currentUserRole={currentUserRole} /> : (
          <div className="space-y-4">
            <div className="bg-white p-5 border border-gray-200 rounded-2xl shadow-sm">
              <div className="relative max-w-md"><Search className="h-4 w-4 text-gray-400 absolute left-3 top-3.5" /><input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search..." className="pl-10 pr-4 py-2.5 w-full border border-gray-300 rounded-lg text-sm outline-none" /></div>
            </div>
            <div className="space-y-3">
              {filtered.map(g => (
                <div key={g.srf_no} onClick={() => setSelectedGroup(g)} className="flex items-center justify-between p-5 bg-gray-50 hover:bg-blue-50 border border-gray-200 rounded-xl transition-all cursor-pointer group shadow-sm hover:shadow-md">
                  <div className="flex items-start gap-4"><div className="mt-1 p-2.5 bg-gray-100 text-gray-400 group-hover:bg-blue-100 group-hover:text-blue-600 rounded-full"><FileText size={20} /></div><div><p className="font-semibold text-lg text-gray-800">SRF No: {g.srf_no}</p><p className="text-sm text-gray-600 mt-1">{g.customer_name} — Items: {g.equipment_count}</p></div></div>
                  <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-blue-600 transition-all transform group-hover:translate-x-1" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ManualCalibrationPage;
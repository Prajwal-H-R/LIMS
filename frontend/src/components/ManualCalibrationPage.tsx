import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom"; 
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
  reportDate: string | null;
  recommendedCalDueDate: string | null;
  dev: boolean;
}

// ─────────────────────────────────────────────
// FILE VALIDATION UTILITY
// ─────────────────────────────────────────────

type FileValidationFailReason =
  | "INVALID_EXTENSION"
  | "NEPL_ID_MISSING"
  | "EXTRA_ID_FOUND"
  | "FILENAME_NOT_EXACT";

interface FileValidationResult {
  isValid: boolean;
  uploadedFileName: string;
  neplId: string;
  failReason?: FileValidationFailReason;
  failDetail?: string;
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const validateFile = (file: File, neplId: string): FileValidationResult => {
  const base: Pick<FileValidationResult, "uploadedFileName" | "neplId"> = {
    uploadedFileName: file.name,
    neplId,
  };

  const extMatch = file.name.match(/\.([^.]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : "";
  if (!["pdf", "xlsx"].includes(ext)) {
    return {
      ...base,
      isValid: false,
      failReason: "INVALID_EXTENSION",
      failDetail: ext ? `.${ext}` : "(no extension)",
    };
  }

  const stem = file.name.replace(/\.[^.]+$/, "").trim();
  const nepl = neplId.trim();

  if (stem.toLowerCase() === nepl.toLowerCase()) {
    return { ...base, isValid: true };
  }

  const loose = (s: string) => s.toLowerCase().replace(/[\s\-_.]/g, "");
  const stemLoose = loose(stem);
  const neplLoose = loose(nepl);

  if (!stemLoose.includes(neplLoose)) {
    return { ...base, isValid: false, failReason: "NEPL_ID_MISSING" };
  }

  const exactNeplRegex = new RegExp(escapeRegExp(nepl), "i");

  if (exactNeplRegex.test(stem)) {
    const remaining = stem.replace(exactNeplRegex, "");
    const foreignIdMatch = remaining.match(/\d{4,}/);
    if (foreignIdMatch) {
      return {
        ...base,
        isValid: false,
        failReason: "EXTRA_ID_FOUND",
        failDetail: foreignIdMatch[0],
      };
    }
  }

  return {
    ...base,
    isValid: false,
    failReason: "FILENAME_NOT_EXACT",
    failDetail: `Expected exactly "${nepl}.pdf" or "${nepl}.xlsx"`,
  };
};

// ─────────────────────────────────────────────
// UPLOAD FEEDBACK COMPONENTS
// ─────────────────────────────────────────────

const ValidationErrorBanner: React.FC<{
  result: FileValidationResult;
  onDismiss: () => void;
}> = ({ result, onDismiss }) => {
  const reasonMap: Record<
    FileValidationFailReason,
    { title: string; body: React.ReactNode }
  > = {
    INVALID_EXTENSION: {
      title: "Upload blocked — invalid file type",
      body: (
        <p className="text-xs text-red-700">
          File{" "}
          <span className="font-mono font-bold">{result.uploadedFileName}</span>{" "}
          has extension{" "}
          <span className="font-mono font-bold text-red-600">
            {result.failDetail}
          </span>
          . Only <span className="font-mono font-bold">.pdf</span> and{" "}
          <span className="font-mono font-bold">.xlsx</span> files are accepted.
        </p>
      ),
    },
    NEPL_ID_MISSING: {
      title: "Upload blocked — NEPL ID not found in filename",
      body: (
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
              Required filename
            </p>
            <p className="font-mono font-bold text-blue-600">
              {result.neplId}.pdf
            </p>
            <p className="font-mono font-bold text-blue-600">
              {result.neplId}.xlsx
            </p>
          </div>
        </div>
      ),
    },
    EXTRA_ID_FOUND: {
      title: "Upload blocked — filename contains an extra identifier",
      body: (
        <p className="text-xs text-red-700">
          The filename{" "}
          <span className="font-mono font-bold">{result.uploadedFileName}</span>{" "}
          contains an extra numeric ID (
          <span className="font-mono font-bold text-red-600">
            {result.failDetail}
          </span>
          ) alongside{" "}
          <span className="font-mono font-bold text-blue-600">
            {result.neplId}
          </span>
          . The filename must be exactly{" "}
          <span className="font-mono font-bold">{result.neplId}.pdf</span> or{" "}
          <span className="font-mono font-bold">{result.neplId}.xlsx</span>.
        </p>
      ),
    },
    FILENAME_NOT_EXACT: {
      title: "Upload blocked — filename must exactly match NEPL ID",
      body: (
        <p className="text-xs text-red-700">
          File{" "}
          <span className="font-mono font-bold">{result.uploadedFileName}</span>{" "}
          is not in the required format. The filename must be exactly{" "}
          <span className="font-mono font-bold text-blue-600">
            {result.neplId}.pdf
          </span>{" "}
          or{" "}
          <span className="font-mono font-bold text-blue-600">
            {result.neplId}.xlsx
          </span>
          . Suffixes like{" "}
          <span className="font-mono text-red-600">(2)</span>,{" "}
          <span className="font-mono text-red-600">_copy</span>, or extra
          spaces are not allowed.
        </p>
      ),
    },
  };

  const { title, body } = result.failReason
    ? reasonMap[result.failReason]
    : { title: "Upload blocked", body: null };

  return (
    <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 shadow-sm">
      <ShieldAlert size={18} className="text-red-500 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <p className="text-sm font-semibold text-red-800">{title}</p>
        {body}
      </div>
      <button
        onClick={onDismiss}
        className="p-1 text-red-300 hover:text-red-500 rounded shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  );
};

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
// DATE BADGE
// ─────────────────────────────────────────────

const CertDateBadge: React.FC<{
  reportDate: string | null;
  recommendedCalDueDate: string | null;
}> = ({ reportDate, recommendedCalDueDate }) => {
  if (!reportDate && !recommendedCalDueDate) return null;

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  return (
    <div className="flex flex-col gap-0.5 mt-1">
      {reportDate && (
        <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
          <Calendar size={9} className="text-gray-400" />
          <span className="font-semibold text-gray-600">Report:</span>{" "}
          {fmt(reportDate)}
        </span>
      )}
      {recommendedCalDueDate && (
        <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
          <Calendar size={9} className="text-blue-400" />
          <span className="font-semibold text-gray-600">Cal Due:</span>{" "}
          {fmt(recommendedCalDueDate)}
        </span>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// UPLOAD DOCUMENT MODAL
// ─────────────────────────────────────────────

interface UploadFormData {
  reportDate: string;
  recommendedCalDueDate: string;
  file: File | null;
}

const UploadDocumentModal: React.FC<{
  isOpen: boolean;
  docType: DocType;
  equipment: BasicEquipment;
  onClose: () => void;
  onUpload: (
    file: File,
    reportDate: string,
    recommendedCalDueDate: string
  ) => Promise<void>;
  onValidationError: (result: FileValidationResult) => void;
}> = ({ isOpen, docType, equipment, onClose, onUpload, onValidationError }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isCertificate = docType === "certificate";

  const [formData, setFormData] = useState<UploadFormData>({
    reportDate: new Date().toISOString().split("T")[0],
    recommendedCalDueDate: "",
    file: null,
  });
  const [validationError, setValidationError] =
    useState<FileValidationResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const label = isCertificate ? "Certificate" : "Calibration Worksheet";

  useEffect(() => {
    if (isOpen) {
      setFormData({
        reportDate: new Date().toISOString().split("T")[0],
        recommendedCalDueDate: "",
        file: null,
      });
      setValidationError(null);
      setFieldErrors({});
      setIsUploading(false);
    }
  }, [isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = validateFile(file, equipment.nepl_id);
    if (!result.isValid) {
      setValidationError(result);
      setFormData((prev) => ({ ...prev, file: null }));
      e.target.value = "";
      return;
    }
    setValidationError(null);
    setFieldErrors((prev) => ({ ...prev, file: "" }));
    setFormData((prev) => ({ ...prev, file }));
    e.target.value = "";
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (isCertificate) {
      if (!formData.reportDate) errors.reportDate = "Report date is required.";
      if (!formData.recommendedCalDueDate)
        errors.recommendedCalDueDate =
          "Recommended calibration due date is required.";
    }
    if (!formData.file) errors.file = "Please attach a file.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    const result = validateFile(formData.file!, equipment.nepl_id);
    if (!result.isValid) {
      setValidationError(result);
      onValidationError(result);
      return;
    }

    setIsUploading(true);
    try {
      await onUpload(
        formData.file!,
        formData.reportDate,
        formData.recommendedCalDueDate
      );
      onClose();
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[150] flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 p-5 border-b bg-blue-50">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
            <UploadCloud size={18} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Upload {label}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              <span className="font-mono font-bold text-blue-600">
                {equipment.nepl_id}
              </span>
              {" · "}
              <span className="font-medium">
                {equipment.material_description}
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-1 text-gray-400 hover:text-gray-600 rounded-full"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl p-3">
            <Info size={14} className="text-blue-400 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-700">
              Only <span className="font-mono font-bold">.pdf</span> and{" "}
              <span className="font-mono font-bold">.xlsx</span> are accepted.
              The filename must be exactly{" "}
              <span className="font-mono font-bold text-blue-600">
                {equipment.nepl_id}.pdf
              </span>{" "}
              or{" "}
              <span className="font-mono font-bold text-blue-600">
                {equipment.nepl_id}.xlsx
              </span>
              .
            </p>
          </div>

          {isCertificate && (
            <>
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                  Report Date <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Calendar
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                  />
                  <input
                    type="date"
                    value={formData.reportDate}
                    onChange={(e) => {
                      setFormData((prev) => ({
                        ...prev,
                        reportDate: e.target.value,
                      }));
                      setFieldErrors((prev) => ({ ...prev, reportDate: "" }));
                    }}
                    className={`w-full pl-9 pr-3 py-2.5 border rounded-xl text-sm outline-none transition-colors ${
                      fieldErrors.reportDate
                        ? "border-red-300 bg-red-50 focus:ring-2 focus:ring-red-100"
                        : "border-gray-300 focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                    }`}
                  />
                </div>
                {fieldErrors.reportDate && (
                  <p className="text-xs text-red-500 mt-1">
                    {fieldErrors.reportDate}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                  Recommended Cal Due Date{" "}
                  <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Calendar
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                  />
                  <input
                    type="date"
                    value={formData.recommendedCalDueDate}
                    onChange={(e) => {
                      setFormData((prev) => ({
                        ...prev,
                        recommendedCalDueDate: e.target.value,
                      }));
                      setFieldErrors((prev) => ({
                        ...prev,
                        recommendedCalDueDate: "",
                      }));
                    }}
                    className={`w-full pl-9 pr-3 py-2.5 border rounded-xl text-sm outline-none transition-colors ${
                      fieldErrors.recommendedCalDueDate
                        ? "border-red-300 bg-red-50 focus:ring-2 focus:ring-red-100"
                        : "border-gray-300 focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                    }`}
                  />
                </div>
                {fieldErrors.recommendedCalDueDate && (
                  <p className="text-xs text-red-500 mt-1">
                    {fieldErrors.recommendedCalDueDate}
                  </p>
                )}
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
              Attach File <span className="text-red-500">*</span>
            </label>

            {validationError && (
              <div className="mb-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                <ShieldAlert
                  size={14}
                  className="text-red-500 mt-0.5 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  {validationError.failReason === "INVALID_EXTENSION" && (
                    <p className="text-xs text-red-700">
                      Invalid file type{" "}
                      <span className="font-mono font-bold">
                        {validationError.failDetail}
                      </span>
                      . Only{" "}
                      <span className="font-mono font-bold">.pdf</span> and{" "}
                      <span className="font-mono font-bold">.xlsx</span>{" "}
                      allowed.
                    </p>
                  )}
                  {validationError.failReason === "NEPL_ID_MISSING" && (
                    <p className="text-xs text-red-700">
                      Filename must be exactly{" "}
                      <span className="font-mono font-bold text-blue-600">
                        {validationError.neplId}.pdf
                      </span>{" "}
                      or{" "}
                      <span className="font-mono font-bold text-blue-600">
                        {validationError.neplId}.xlsx
                      </span>
                      .
                    </p>
                  )}
                  {validationError.failReason === "EXTRA_ID_FOUND" && (
                    <p className="text-xs text-red-700">
                      Filename contains an extra identifier (
                      <span className="font-mono font-bold text-red-600">
                        {validationError.failDetail}
                      </span>
                      ). Must be exactly{" "}
                      <span className="font-mono font-bold text-blue-600">
                        {validationError.neplId}.pdf
                      </span>{" "}
                      or{" "}
                      <span className="font-mono font-bold text-blue-600">
                        {validationError.neplId}.xlsx
                      </span>
                      .
                    </p>
                  )}
                  {validationError.failReason === "FILENAME_NOT_EXACT" && (
                    <p className="text-xs text-red-700">
                      Filename must exactly match — use{" "}
                      <span className="font-mono font-bold text-blue-600">
                        {validationError.neplId}.pdf
                      </span>{" "}
                      or{" "}
                      <span className="font-mono font-bold text-blue-600">
                        {validationError.neplId}.xlsx
                      </span>
                      .
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setValidationError(null)}
                  className="text-red-300 hover:text-red-500 shrink-0"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.xlsx"
              className="hidden"
              onChange={handleFileChange}
            />

            {formData.file ? (
              <div
                className={`flex items-center gap-3 p-3 border rounded-xl bg-green-50 ${
                  fieldErrors.file ? "border-red-300" : "border-green-200"
                }`}
              >
                <div className="p-2 bg-green-100 text-green-600 rounded-lg shrink-0">
                  <FileText size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-green-800 truncate">
                    {formData.file.name}
                  </p>
                  <p className="text-[10px] text-green-600 mt-0.5">
                    {(formData.file.size / 1024).toFixed(1)} KB ·{" "}
                    {formData.file.name.split(".").pop()?.toUpperCase()}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setFormData((prev) => ({ ...prev, file: null }));
                    setFieldErrors((prev) => ({ ...prev, file: "" }));
                  }}
                  className="p-1.5 text-green-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`w-full py-8 border-2 border-dashed rounded-xl flex flex-col items-center gap-2 transition-all group ${
                  fieldErrors.file
                    ? "border-red-300 bg-red-50 hover:border-red-400"
                    : "border-gray-200 hover:border-blue-300 hover:bg-blue-50"
                }`}
              >
                <div
                  className={`p-3 rounded-full transition-colors ${
                    fieldErrors.file
                      ? "bg-red-100 text-red-400"
                      : "bg-gray-100 text-gray-400 group-hover:bg-blue-100 group-hover:text-blue-500"
                  }`}
                >
                  <UploadCloud size={20} />
                </div>
                <div className="text-center">
                  <p
                    className={`text-sm font-semibold ${
                      fieldErrors.file ? "text-red-500" : "text-gray-600"
                    }`}
                  >
                    Click to browse file
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Filename must be exactly{" "}
                    <span className="font-mono font-bold text-blue-500">
                      {equipment.nepl_id}.pdf
                    </span>{" "}
                    or{" "}
                    <span className="font-mono font-bold text-blue-500">
                      {equipment.nepl_id}.xlsx
                    </span>
                  </p>
                </div>
              </button>
            )}

            {fieldErrors.file && (
              <p className="text-xs text-red-500 mt-1">{fieldErrors.file}</p>
            )}
          </div>
        </div>

        <div className="px-5 pb-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isUploading}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg flex items-center gap-2 transition-colors"
          >
            {isUploading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <UploadCloud size={14} />
            )}
            Upload
          </button>
        </div>
      </div>
    </div>
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
  const isPending = unlockRequest?.status === "PENDING";
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
              <p className="text-xs text-gray-700 font-medium">
                "{unlockRequest.engineer_reason}"
              </p>
              {unlockRequest.admin_comment && (
                <p className="text-xs text-gray-700">
                  <span className="font-semibold">Admin feedback: </span>
                  {unlockRequest.admin_comment}
                </p>
              )}
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
              <div className="bg-white border border-yellow-100 rounded-lg p-3 text-left">
                <p className="text-xs text-gray-700 font-medium">
                  "{unlockRequest?.engineer_reason}"
                </p>
              </div>
            </div>
          ) : (
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
                className={`w-full p-3 border rounded-xl text-sm h-28 resize-none outline-none ${
                  error ? "border-red-300 bg-red-50" : "border-gray-300"
                }`}
              />
              {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium"
          >
            {isPending ? "Close" : "Cancel"}
          </button>
          {!isPending && (
            <button
              onClick={handleSubmit}
              disabled={!reason.trim() || isSubmitting}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg flex items-center gap-2"
            >
              {isSubmitting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Send size={14} />
              )}
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
  const [comment, setComment] = useState("");
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
          <div className="p-2 bg-amber-100 text-amber-600 rounded-xl">
            <ShieldCheck size={18} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Review Unlock Request</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              <span className="font-mono font-bold text-blue-600">
                {equipment.nepl_id}
              </span>{" "}
              · <span className="font-semibold">{label}</span>
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
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-1">
              Engineer's Reason
            </p>
            <p className="text-sm text-gray-800 font-medium">
              "{unlockRequest.engineer_reason}"
            </p>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
              Comment{" "}
              <span className="text-gray-400 font-normal normal-case">
                (required for rejection)
              </span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add instructions or reason..."
              className={`w-full p-3 border rounded-xl text-sm h-20 resize-none outline-none ${
                actionError ? "border-red-300 bg-red-50" : "border-gray-300"
              }`}
            />
            {actionError && (
              <p className="text-xs text-red-500 mt-1">{actionError}</p>
            )}
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={() => handleAction("REJECTED")}
            disabled={isSubmitting}
            className="flex-1 py-2.5 bg-red-50 border border-red-200 text-red-600 text-sm font-semibold rounded-lg flex items-center justify-center gap-2"
          >
            <X size={15} /> Reject
          </button>
          <button
            onClick={() => handleAction("APPROVED")}
            disabled={isSubmitting}
            className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <CheckCircle2 size={15} />
            )}{" "}
            Approve
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const coreDownload = async (url: string, fileName: string) => {
  try {
    if (url.startsWith("blob:")) {
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.setAttribute("download", fileName);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, "_blank");
  }
};

const handleView = (url: string, fileName: string) =>
  fileName.match(/\.(xlsx|xls|csv)$/i)
    ? coreDownload(url, fileName)
    : window.open(url, "_blank", "noopener,noreferrer");
const handleDownload = (url: string, fileName: string) =>
  coreDownload(url, fileName);

// ─────────────────────────────────────────────
// FILE GROUP COMPONENT
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
  reportDate?: string | null;
  recommendedCalDueDate?: string | null;
  onPickFile: () => void;
  onDelete: () => void;
  onRefresh: () => void;
}> = ({
  label,
  docType,
  equipment,
  fileUrl,
  fileName,
  isLocked,
  unlockRequest,
  isAdmin,
  reportDate,
  recommendedCalDueDate,
  onPickFile,
  onDelete,
  onRefresh,
}) => {
  const [requestModal, setRequestModal] = useState(false);
  const [reviewModal, setReviewModal] = useState(false);
  const isPending = unlockRequest?.status === "PENDING";
  const isRejected = unlockRequest?.status === "REJECTED";
  const isApproved = unlockRequest?.status === "APPROVED";
  const isCertificate = docType === "certificate";

  const handleDeleteClick = () => {
    if (!isLocked || isAdmin) {
      if (window.confirm(`Delete the ${label}?`)) onDelete();
      return;
    }
    if (isApproved) {
      if (window.confirm(`Delete the ${label}?`)) onDelete();
      return;
    }
    setRequestModal(true);
  };

  if (isLocked) {
    return (
      <>
        <RequestUnlockModal
          isOpen={requestModal}
          equipment={equipment}
          docType={docType}
          unlockRequest={unlockRequest}
          onClose={() => setRequestModal(false)}
          onSubmitted={onRefresh}
        />
        {isAdmin && unlockRequest && (
          <AdminReviewModal
            isOpen={reviewModal}
            equipment={equipment}
            docType={docType}
            unlockRequest={unlockRequest}
            onClose={() => setReviewModal(false)}
            onActioned={onRefresh}
          />
        )}
        <div className="flex flex-col gap-1">
          <div className="inline-flex rounded-lg shadow-sm border border-red-200 bg-white overflow-hidden h-10">
            <div className="px-3 py-1.5 text-[10px] font-semibold bg-red-50 text-red-500 border-r border-red-100 flex items-center gap-1.5 uppercase tracking-wider whitespace-nowrap">
              <Lock size={10} /> {label}
            </div>
            {fileUrl && fileName && (
              <>
                <button
                  onClick={() => handleView(fileUrl, fileName)}
                  className="p-2.5 hover:bg-blue-50 text-gray-600"
                >
                  <Eye size={16} />
                </button>
                <button
                  onClick={() => handleDownload(fileUrl, fileName)}
                  className="p-2.5 border-l border-gray-100 hover:bg-green-50 text-green-600"
                >
                  <Download size={16} />
                </button>
                <button
                  onClick={handleDeleteClick}
                  className={`p-2.5 border-l border-gray-100 ${
                    isAdmin || isApproved
                      ? "text-red-500 hover:bg-red-50"
                      : "text-yellow-500 hover:bg-yellow-50"
                  }`}
                >
                  <Trash2 size={16} />
                </button>
              </>
            )}
            <div className="border-l border-gray-100">
              {isAdmin ? (
                isPending ? (
                  <button
                    onClick={() => setReviewModal(true)}
                    className="h-full px-3 text-[10px] font-bold text-amber-600 hover:bg-amber-50 whitespace-nowrap"
                  >
                    <Clock size={11} className="animate-pulse" /> Review Request
                  </button>
                ) : (
                  <div className="h-full px-3 flex items-center gap-1 text-[10px] text-gray-400">
                    <Lock size={11} /> Locked
                  </div>
                )
              ) : isPending ? (
                <button
                  onClick={() => setRequestModal(true)}
                  className="h-full px-3 text-[10px] font-bold text-yellow-600 hover:bg-yellow-50 whitespace-nowrap"
                >
                  <Clock size={11} className="animate-pulse" /> Pending...
                </button>
              ) : isRejected ? (
                <button
                  onClick={() => setRequestModal(true)}
                  className="h-full px-3 text-[10px] font-bold text-red-500 hover:bg-red-50 whitespace-nowrap"
                >
                  <RefreshCw size={11} /> Re-request
                </button>
              ) : isApproved ? (
                <div className="h-full px-3 text-[10px] text-green-600 font-bold flex items-center gap-1">
                  <Unlock size={11} /> Approved
                </div>
              ) : (
                <button
                  onClick={() => setRequestModal(true)}
                  className="h-full px-3 text-[10px] font-bold text-blue-600 hover:bg-blue-50 whitespace-nowrap"
                >
                  <Send size={11} /> Request Delete
                </button>
              )}
            </div>
          </div>
          <LockPill locked={isLocked} unlockRequest={unlockRequest} />
          {isCertificate && (
            <CertDateBadge
              reportDate={reportDate ?? null}
              recommendedCalDueDate={recommendedCalDueDate ?? null}
            />
          )}
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="inline-flex rounded-lg shadow-sm border border-gray-200 bg-white overflow-hidden h-10">
        <div className="px-3 py-1.5 text-[10px] font-semibold bg-gray-50 text-gray-500 border-r border-gray-200 flex items-center uppercase tracking-wider whitespace-nowrap">
          {label}
        </div>
        <button
          onClick={onPickFile}
          className="p-2.5 hover:bg-blue-50 text-blue-600"
        >
          <UploadCloud size={16} />
        </button>
        {fileUrl && fileName && (
          <>
            <button
              onClick={() => handleView(fileUrl, fileName)}
              className="p-2.5 border-l border-gray-100 hover:bg-blue-50 text-gray-600"
            >
              <Eye size={16} />
            </button>
            <button
              onClick={() => handleDownload(fileUrl, fileName)}
              className="p-2.5 border-l border-gray-100 hover:bg-green-50 text-green-600"
            >
              <Download size={16} />
            </button>
            <button
              onClick={handleDeleteClick}
              className="p-2.5 border-l border-gray-100 hover:bg-red-50 text-red-500"
            >
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>
      {isApproved && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 border border-green-200 rounded-full text-[9px] font-bold text-green-600 w-fit">
          <Unlock size={8} /> UNLOCKED BY ADMIN
        </span>
      )}
      {isCertificate && (
        <CertDateBadge
          reportDate={reportDate ?? null}
          recommendedCalDueDate={recommendedCalDueDate ?? null}
        />
      )}
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
  const [mounted, setMounted] = useState(false); // <-- Add mounted state for SSR safety

  const [deviationId, setDeviationId] = useState<number | null>(null);
  const [deviationType, setDeviationType] = useState<"OOT" | "NC">("OOT");
  const [toolStatus, setToolStatus] = useState("");
  const [reportDate, setReportDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [steps, setSteps] = useState<{ step: string; value: string }[]>([
    { step: "", value: "" },
  ]);
  const [engineerRemarks, setEngineerRemarks] = useState("");
  const [customerDecision, setCustomerDecision] = useState("");
  const [attachments, setAttachments] = useState<DeviationAttachment[]>([]);
  const [hideCustomerVisibility, setHideCustomerVisibility] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // <-- Ensure component is mounted to the client before rendering portal
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (!isEditMode) {
      setDeviationId(null);
      setDeviationType("OOT");
      setToolStatus("");
      setEngineerRemarks("");
      setCustomerDecision("");
      setAttachments([]);
      setSteps([{ step: "", value: "" }]);
      setHideCustomerVisibility(true);
      return;
    }
    setIsLoadingData(true);
    api
      .get<ExternalDeviationData[]>(
        `/external-deviations/?inward_eqp_id=${equipment.inward_eqp_id}`
      )
      .then((res) => {
        if (res.data?.[0]) {
          const d = res.data[0];
          setDeviationId(d.id);
          setDeviationType(d.deviation_type);
          setToolStatus(d.tool_status || "");
          setReportDate(d.report || new Date().toISOString().split("T")[0]);
          setEngineerRemarks(d.engineer_remarks || "");
          setCustomerDecision(d.customer_decision || "");
          setAttachments(d.attachments || []);
          setHideCustomerVisibility(d.hide_customer_visibility ?? true);
          const s = Object.entries(d.step_per_deviation || {}).map(
            ([step, value]) => ({ step, value: String(value) })
          );
          setSteps(s.length > 0 ? s : [{ step: "", value: "" }]);
        }
      })
      .finally(() => setIsLoadingData(false));
  }, [isOpen, isEditMode, equipment.inward_eqp_id]);

  const handleToggleVisibility = async () => {
    const nextVal = !hideCustomerVisibility;
    setHideCustomerVisibility(nextVal);

    if (deviationId && deviationType === "OOT") {
      setIsUpdatingVisibility(true);
      try {
        await api.patch(`/external-deviations/${deviationId}`, {
          hide_customer_visibility: nextVal,
        });
        onSuccess();
      } catch (err) {
        alert("Failed to update visibility dynamically.");
        setHideCustomerVisibility(!nextVal);
      } finally {
        setIsUpdatingVisibility(false);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const newAttachment: DeviationAttachment = {
        id: `local-${Date.now()}`,
        file_name: file.name,
        file_url: URL.createObjectURL(file),
        isLocal: true,
        fileObject: file,
      };
      setAttachments((prev) => [...prev, newAttachment]);
      e.target.value = "";
    }
  };

  const addStep = () => setSteps([...steps, { step: "", value: "" }]);
  const removeStep = (idx: number) =>
    setSteps(steps.filter((_, i) => i !== idx));
  const updateStep = (idx: number, field: "step" | "value", val: string) => {
    const updated = [...steps];
    updated[idx][field] = val;
    setSteps(updated);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const stepPerDevObj =
      deviationType === "OOT"
        ? steps.reduce((acc, curr) => {
            if (curr.step) acc[curr.step] = curr.value;
            return acc;
          }, {} as any)
        : {};

    const payload: any = {
      inward_eqp_id: equipment.inward_eqp_id,
      deviation_type: deviationType,
      tool_status: toolStatus,
      report: reportDate,
      step_per_deviation: stepPerDevObj,
      engineer_remarks: engineerRemarks,
      customer_decision: customerDecision,
    };

    if (deviationType === "OOT") {
      payload.hide_customer_visibility = hideCustomerVisibility;
    }

    try {
      let currentId = deviationId;
      if (isEditMode && deviationId) {
        await api.patch(`/external-deviations/${deviationId}`, payload);
      } else {
        const res = await api.post("/external-deviations/", payload);
        currentId = res.data.id;
      }
      const localFiles = attachments.filter((a) => a.isLocal && a.fileObject);
      if (deviationType !== "OOT" && localFiles.length > 0 && currentId) {
        for (const att of localFiles) {
          const formData = new FormData();
          formData.append("file", att.fileObject!);
          await api.post(
            `/external-deviations/${currentId}/attachments`,
            formData
          );
        }
      }
      alert("Saved successfully!");
      onSuccess();
      onClose();
    } catch (err) {
      alert("Failed to save");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getFileFullUrl = (url: string) =>
    url.startsWith("http") || url.startsWith("blob")
      ? url
      : `${api.defaults.baseURL?.split("/api")[0]}${url}`;

  // <-- Wait for component to be mounted on client and check if open
  if (!isOpen || !mounted) return null;

  // <-- Extract JSX into a variable
  const modalContent = (
    // Changed z-[100] to z-[9999] to ensure it stays over extreme sticky headers
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[9999] flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-6 border-b bg-white">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">
                {isEditMode ? "View/Edit" : "Log"} Deviation
              </h3>
              {deviationType === "OOT" && (
                <div className="mt-1 flex items-center gap-1.5">
                  <div
                    className={`h-1.5 w-1.5 rounded-full ${
                      !hideCustomerVisibility
                        ? "bg-emerald-500 animate-pulse"
                        : "bg-slate-400"
                    }`}
                  />
                  <p
                    className={`text-[10px] font-bold uppercase tracking-wider ${
                      !hideCustomerVisibility
                        ? "text-emerald-600"
                        : "text-slate-500"
                    }`}
                  >
                    {hideCustomerVisibility
                      ? "Status: Hidden from Customer"
                      : "Status: Visible to Customer"}
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {deviationType === "OOT" && (
              <button
                type="button"
                disabled={isUpdatingVisibility}
                onClick={handleToggleVisibility}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold transition-all border-2 shadow-sm ${
                  hideCustomerVisibility
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                    : "bg-slate-800 text-white border-slate-900 hover:bg-slate-900"
                }`}
              >
                {isUpdatingVisibility ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : hideCustomerVisibility ? (
                  <Eye size={16} />
                ) : (
                  <EyeOff size={16} />
                )}
                {hideCustomerVisibility
                  ? "Show to Customer"
                  : "Hide from Customer"}
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-full"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-8">
              <div className="col-span-2 md:col-span-3">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-tight mb-1">
                  Material Description
                </label>
                <p className="text-sm font-semibold text-gray-900">
                  {equipment.material_description || "N/A"}
                </p>
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-tight mb-1">
                  NEPL ID
                </label>
                <p className="text-sm font-mono font-bold text-blue-600">
                  {equipment.nepl_id || "N/A"}
                </p>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-tight mb-1">
                  Make
                </label>
                <p className="text-sm font-medium text-gray-700">
                  {equipment.make || "N/A"}
                </p>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-tight mb-1">
                  Model
                </label>
                <p className="text-sm font-medium text-gray-700">
                  {equipment.model || "N/A"}
                </p>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-tight mb-1">
                  Serial No
                </label>
                <p className="text-sm font-medium text-gray-700">
                  {equipment.serial_no || "N/A"}
                </p>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-tight mb-1">
                  Range
                </label>
                <p className="text-sm font-medium text-gray-700">
                  {equipment.range || "N/A"}
                </p>
              </div>
            </div>
          </div>

          {isLoadingData ? (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin text-blue-500" />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                    Type
                  </label>
                  <select
                    value={deviationType}
                    onChange={(e) =>
                      setDeviationType(e.target.value as "OOT" | "NC")
                    }
                    className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="OOT">OOT (Out of Tolerance)</option>
                    <option value="NC">NC (Not Calibrated)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                    Tool Status
                  </label>
                  <input
                    type="text"
                    value={toolStatus}
                    onChange={(e) => setToolStatus(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={reportDate}
                    onChange={(e) => setReportDate(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              {deviationType === "OOT" ? (
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-3">
                    OOT Observations
                  </label>
                  <div className="space-y-2 mb-3">
                    {steps.map((s, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input
                          placeholder="Step %"
                          value={s.step}
                          onChange={(e) =>
                            updateStep(idx, "step", e.target.value)
                          }
                          className="flex-1 p-2 border border-gray-300 rounded-lg text-sm"
                        />
                        <input
                          placeholder="Reading"
                          value={s.value}
                          onChange={(e) =>
                            updateStep(idx, "value", e.target.value)
                          }
                          className="flex-1 p-2 border border-gray-300 rounded-lg text-sm"
                        />
                        <button
                          onClick={() => removeStep(idx)}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <MinusCircle size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={addStep}
                    className="flex items-center gap-1 text-xs font-bold text-blue-600"
                  >
                    <Plus size={14} /> Add Row
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-gray-500 uppercase">
                    Attachments (Required for NC)
                  </label>
                  <div className="grid gap-2">
                    {attachments.map((a) => (
                      <div
                        key={a.id}
                        className="flex justify-between items-center bg-gray-50 p-3 border border-gray-200 rounded-xl"
                      >
                        <span className="text-xs font-medium text-gray-700 truncate w-3/4">
                          {a.file_name}
                        </span>
                        <div className="flex gap-1">
                          {/* Replaced undefined handleView/handleDownload with actual actions or console.logs */}
                          <button
                            onClick={() => window.open(getFileFullUrl(a.file_url), '_blank')}
                            className="p-2 text-blue-600"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => window.open(getFileFullUrl(a.file_url), '_blank')}
                            className="p-2 text-green-600"
                          >
                            <Download size={16} />
                          </button>
                          <button
                            onClick={() =>
                              setAttachments(
                                attachments.filter((at) => at.id !== a.id)
                              )
                            }
                            className="p-2 text-red-500"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-xs font-bold text-gray-400 hover:bg-gray-50"
                  >
                    + Add File
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                    Remarks
                  </label>
                  <textarea
                    value={engineerRemarks}
                    onChange={(e) => setEngineerRemarks(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-xl text-sm h-24"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                    Decision
                  </label>
                  <textarea
                    value={customerDecision}
                    onChange={(e) => setCustomerDecision(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-xl text-sm h-24"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold flex items-center gap-2"
          >
            {isSubmitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <CheckCircle2 size={16} />
            )}
            Save Deviation
          </button>
        </div>
      </div>
    </div>
  );

  // <-- Inject component directly into document.body
  return createPortal(modalContent, document.body);
};

// ─────────────────────────────────────────────
// EQUIPMENT ITEM
// ─────────────────────────────────────────────

const EquipmentItem: React.FC<{
  equipment: BasicEquipment;
  refreshTrigger: number;
  currentUserRole: string;
  onOpenDeviation: (eqp: BasicEquipment, isEdit: boolean) => void;
  onFeedback: (feedback: {
    type: "uploading" | "success" | "error";
    neplId: string;
    result?: FileValidationResult;
  } | null) => void;
}> = ({
  equipment,
  onOpenDeviation,
  refreshTrigger,
  onFeedback,
  currentUserRole,
}) => {
  const [docs, setDocs] = useState<DocStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadModal, setUploadModal] = useState<{
    isOpen: boolean;
    docType: DocType;
  }>({ isOpen: false, docType: "result" });

  const baseUrl = api.defaults.baseURL?.split("/api")[0] ?? "";
  const isAdmin = currentUserRole === "admin";

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [d, dv] = await Promise.all([
        api
          .get(
            `/manual-calibration/equipment/${equipment.inward_eqp_id}/documents`
          )
          .catch(() => ({ data: {} })),
        api.get(
          `/external-deviations/?inward_eqp_id=${equipment.inward_eqp_id}`
        ),
      ]);
      const data = d.data ?? {};
      setDocs({
        res: data.calibration_worksheet_file_url
          ? `${baseUrl}${data.calibration_worksheet_file_url}`
          : null,
        resN: data.calibration_worksheet_file_name || null,
        resLocked: data.calibration_worksheet_locked ?? false,
        resUnlockRequest: data.calibration_worksheet_unlock_request ?? null,
        cert: data.certificate_file_url
          ? `${baseUrl}${data.certificate_file_url}`
          : null,
        certN: data.certificate_file_name || null,
        certLocked: data.certificate_locked ?? false,
        certUnlockRequest: data.certificate_unlock_request ?? null,
        reportDate: data.report_date ?? null,
        recommendedCalDueDate: data.recommended_cal_due_date ?? null,
        dev: (dv.data?.length ?? 0) > 0,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [equipment.inward_eqp_id, refreshTrigger]);

  const handleDeleteDocument = async (docType: DocType) => {
    try {
      await api.delete(
        `/manual-calibration/equipment/${equipment.inward_eqp_id}/document/${docType}`
      );
      await fetchAll();
    } catch (error: any) {
      alert(error?.response?.data?.detail || "Delete failed.");
    }
  };

  const handleUpload = async (
    file: File,
    reportDate: string,
    recommendedCalDueDate: string
  ) => {
    onFeedback({ type: "uploading", neplId: equipment.nepl_id });
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("doc_type", uploadModal.docType);
      if (uploadModal.docType === "certificate") {
        if (reportDate) fd.append("report_date", reportDate);
        if (recommendedCalDueDate)
          fd.append("recommended_cal_due_date", recommendedCalDueDate);
      }
      await api.post(
        `/manual-calibration/equipment/${equipment.inward_eqp_id}/upload`,
        fd
      );
      await fetchAll();
      onFeedback({ type: "success", neplId: equipment.nepl_id });
      setTimeout(() => onFeedback(null), 3000);
    } catch (err) {
      onFeedback(null);
      alert("Upload failed.");
      throw err;
    }
  };

  if (loading)
    return (
      <tr>
        <td colSpan={3} className="h-16 animate-pulse bg-white" />
      </tr>
    );

  return (
    <>
      <UploadDocumentModal
        isOpen={uploadModal.isOpen}
        docType={uploadModal.docType}
        equipment={equipment}
        onClose={() => setUploadModal((p) => ({ ...p, isOpen: false }))}
        onUpload={handleUpload}
        onValidationError={(r) =>
          onFeedback({ type: "error", neplId: r.neplId, result: r })
        }
      />
      <tr className="hover:bg-gray-50 transition-colors border-b border-gray-100 text-sm">
        <td className="px-6 py-4 font-medium text-blue-600">
          {equipment.nepl_id}
        </td>
        <td className="px-6 py-4 text-gray-900 font-medium">
          {equipment.material_description}
        </td>
        <td className="px-6 py-4 text-gray-900">
          <div className="flex flex-wrap gap-3 items-start">
            <FileGroup
              label="Calibration Worksheet"
              docType="result"
              equipment={equipment}
              fileUrl={docs?.res ?? null}
              fileName={docs?.resN ?? null}
              isLocked={docs?.resLocked ?? false}
              unlockRequest={docs?.resUnlockRequest ?? null}
              isAdmin={isAdmin}
              onPickFile={() => setUploadModal({ isOpen: true, docType: "result" })}
              onDelete={() => handleDeleteDocument("result")}
              onRefresh={fetchAll}
            />
            <button
              onClick={() => onOpenDeviation(equipment, docs?.dev ?? false)}
              className={`h-10 px-3 text-[10px] font-semibold border rounded-lg flex items-center gap-1.5 uppercase ${
                docs?.dev
                  ? "bg-red-50 text-red-600 border-red-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }`}
            >
              <AlertTriangle size={14} />{" "}
              {docs?.dev ? "View Deviation" : "Log Deviation"}
            </button>
            <FileGroup
              label="Certificate"
              docType="certificate"
              equipment={equipment}
              fileUrl={docs?.cert ?? null}
              fileName={docs?.certN ?? null}
              isLocked={docs?.certLocked ?? false}
              unlockRequest={docs?.certUnlockRequest ?? null}
              isAdmin={isAdmin}
              reportDate={docs?.reportDate}
              recommendedCalDueDate={docs?.recommendedCalDueDate}
              onPickFile={() =>
                setUploadModal({ isOpen: true, docType: "certificate" })
              }
              onDelete={() => handleDeleteDocument("certificate")}
              onRefresh={fetchAll}
            />
          </div>
        </td>
      </tr>
    </>
  );
};

// ─────────────────────────────────────────────
// LIST COMPONENTS
// ─────────────────────────────────────────────

const EquipmentDetailList: React.FC<{
  group: SrfGroupSummary;
  onBack: () => void;
  currentUserRole: string;
}> = ({ group, onBack, currentUserRole }) => {
  const [list, setList] = useState<BasicEquipment[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    isEdit: boolean;
    eqp: BasicEquipment | null;
  }>({ isOpen: false, isEdit: false, eqp: null });
  const [feedback, setFeedback] = useState<{
    type: string;
    neplId: string;
    result?: FileValidationResult;
  } | null>(null);

  useEffect(() => {
    api
      .get(`/flow-configs/manual-calibration-groups/${group.srf_no}/equipment`)
      .then((r) => setList(r.data));
  }, [group.srf_no]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Job Details</h1>
          <p className="text-gray-500 text-sm mt-1">SRF: {group.srf_no}</p>
        </div>
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium text-sm"
        >
          <ArrowLeft size={16} /> Back
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-200 flex items-start gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
            <User size={20} />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase">
              Customer
            </p>
            <p className="font-medium text-gray-900">{group.customer_name}</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-200 flex items-start gap-3">
          <div className="p-2.5 bg-teal-50 text-teal-600 rounded-xl">
            <Calendar size={20} />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase">
              Received
            </p>
            <p className="font-medium text-gray-900">
              {new Date(group.received_date).toLocaleDateString("en-GB")}
            </p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-200 flex items-start gap-3">
          <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
            <Package size={20} />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase">
              Items
            </p>
            <p className="font-medium text-gray-900">
              {group.equipment_count} Equipments
            </p>
          </div>
        </div>
      </div>
      {feedback?.type === "uploading" && (
        <UploadingIndicator neplId={feedback.neplId} />
      )}
      {feedback?.type === "success" && (
        <UploadSuccessToast neplId={feedback.neplId} />
      )}
      {feedback?.type === "error" && feedback.result && (
        <ValidationErrorBanner
          result={feedback.result}
          onDismiss={() => setFeedback(null)}
        />
      )}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 font-semibold">NEPL ID</th>
              <th className="px-6 py-4 font-semibold">Description</th>
              <th className="px-6 py-4 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {list.map((e) => (
              <EquipmentItem
                key={e.inward_eqp_id}
                equipment={e}
                refreshTrigger={refreshTrigger}
                currentUserRole={currentUserRole}
                onOpenDeviation={(eqp, isEdit) =>
                  setModalConfig({ isOpen: true, isEdit, eqp })
                }
                onFeedback={(fb) => {
                  setFeedback(fb);
                  if (fb?.type === "success") setRefreshTrigger((p) => p + 1);
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
      {modalConfig.isOpen && modalConfig.eqp && (
        <DeviationModal
          isOpen={modalConfig.isOpen}
          isEditMode={modalConfig.isEdit}
          equipment={modalConfig.eqp}
          onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
          onSuccess={() => setRefreshTrigger((p) => p + 1)}
        />
      )}
    </div>
  );
};

const ManualCalibrationPage: React.FC = () => {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<SrfGroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGroup, setSelectedGroup] =
    useState<SrfGroupSummary | null>(null);
  const currentUserRole = localStorage.getItem("role") ?? "engineer";

  useEffect(() => {
    api
      .get("/flow-configs/manual-calibration-groups")
      .then((r) => setGroups(r.data))
      .finally(() => setLoading(false));
  }, []);
  const filtered = groups.filter(
    (g) =>
      g.srf_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
      g.customer_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        {!selectedGroup && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-600 text-white rounded-xl shadow-lg">
                <ClipboardEdit size={28} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
                  Manual Calibration
                </h2>
                <p className="text-gray-500 text-sm mt-1">
                  Manage OOT / NC and certificates
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate("/engineer")}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm shadow-sm"
            >
              <ArrowLeft size={16} /> Dashboard
            </button>
          </div>
        )}
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-24 bg-white border border-gray-200 rounded-xl animate-pulse"
              />
            ))}
          </div>
        ) : selectedGroup ? (
          <EquipmentDetailList
            group={selectedGroup}
            onBack={() => setSelectedGroup(null)}
            currentUserRole={currentUserRole}
          />
        ) : (
          <div className="space-y-4">
            <div className="bg-white p-5 border border-gray-200 rounded-2xl shadow-sm">
              <div className="relative max-w-md">
                <Search className="h-4 w-4 text-gray-400 absolute left-3 top-3.5" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search..."
                  className="pl-10 pr-4 py-2.5 w-full border border-gray-300 rounded-lg text-sm outline-none"
                />
              </div>
            </div>
            <div className="space-y-3">
              {filtered.map((g) => (
                <div
                  key={g.srf_no}
                  onClick={() => setSelectedGroup(g)}
                  className="flex items-center justify-between p-5 bg-gray-50 hover:bg-blue-50 border border-gray-200 rounded-xl transition-all cursor-pointer group shadow-sm hover:shadow-md"
                >
                  <div className="flex items-start gap-4">
                    <div className="mt-1 p-2.5 bg-gray-100 text-gray-400 group-hover:bg-blue-100 group-hover:text-blue-600 rounded-full">
                      <FileText size={20} />
                    </div>
                    <div>
                      <p className="font-semibold text-lg text-gray-800">
                        SRF No: {g.srf_no}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {g.customer_name} — Items: {g.equipment_count}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-blue-600 transform group-hover:translate-x-1" />
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
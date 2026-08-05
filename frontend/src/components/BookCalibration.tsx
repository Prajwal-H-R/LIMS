import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload, FileText, Loader2, CheckCircle, ChevronLeft, X, AlertCircle,
  Plus, Calendar, Image, Eye, Clock, ChevronDown, ChevronRight,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { api,CALIBRATION_BOOKING } from "../api/config";

const ALLOWED_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

interface BookingFile {
  file_name: string | null;
  file_url: string | null;
  file_type: string | null;
}

interface BookingHistoryItem {
  booking_id: number;
  status: string;
  created_at: string | null;
  equipment_count: number | null;
  files: BookingFile[];
  remarks: string | null;
}

const statusConfig: Record<string, { label: string; icon: React.ReactNode; class: string }> = {
  pending: {
    label: "Pending",
    icon: <Clock className="h-3.5 w-3.5" />,
    class: "bg-yellow-100 text-yellow-800",
  },
  accepted: {
    label: "Accepted",
    icon: <CheckCircle className="h-3.5 w-3.5" />,
    class: "bg-green-100 text-green-800",
  },
  resend_requested: {
    label: "Resend Requested",
    icon: <AlertCircle className="h-3.5 w-3.5" />,
    class: "bg-orange-100 text-orange-800",
  },
};

const isImage = (type: string | null): boolean =>
  !!type && ["image/jpeg", "image/png", "image/webp"].includes(type);

interface BookCalibrationProps {
  initialBookingId?: number;
}

const BookCalibration: React.FC<BookCalibrationProps> = ({ initialBookingId }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showForm, setShowForm] = useState(!!initialBookingId);
  const [equipmentCount, setEquipmentCount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [history, setHistory] = useState<BookingHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const fetchHistory = useCallback(async () => {
    try {
      const res = await api.get<{ bookings: BookingHistoryItem[] }>(CALIBRATION_BOOKING.HISTORY);
      setHistory(res.data.bookings || []);
    } catch {
      // silent
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!showForm) fetchHistory();
  }, [fetchHistory, showForm]);

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_MIMES.includes(file.type)) {
      return `"${file.name}" — type "${file.type || "unknown"}" is not allowed. Allowed: PDF, JPEG, PNG, WebP, or plain text.`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `"${file.name}" exceeds the 5 MB limit.`;
    }
    return null;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    const newErrors: string[] = [];
    const valid: File[] = [];
    for (const f of selected) {
      const err = validateFile(f);
      if (err) {
        newErrors.push(err);
      } else {
        valid.push(f);
      }
    }
    setFiles((prev) => [...prev, ...valid]);
    setFileErrors((prev) => [...prev, ...newErrors]);
    if (e.target) e.target.value = "";
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const dismissFileError = (index: number) => {
    setFileErrors((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!equipmentCount) {
      setError("Equipment count is required.");
      return;
    }

    if (files.length === 0) {
      setError("Please attach at least one file.");
      return;
    }

    setLoading(true);
    setProgress(0);
    try {
      const formData = new FormData();
      formData.append("equipment_count", equipmentCount);
      if (remarks.trim()) formData.append("remarks", remarks.trim());
      for (const f of files) {
        formData.append("files", f);
      }

      const res = await api.post(CALIBRATION_BOOKING.UPLOAD, formData, {
        onUploadProgress: (e) => {
          if (e.total) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        },
      });
      setSuccess(`Booking ID - ${res.data.booking_id} submitted with ${files.length} file(s)!`);
      setEquipmentCount("");
      setRemarks("");
      setFiles([]);
      setFileErrors([]);
      setProgress(0);
    } catch (err: any) {
      const msg =
        err.response?.data?.detail ||
        (typeof err.response?.data === "string" ? err.response.data : null);
      if (Array.isArray(msg)) {
        setError(msg.map((m: any) => m.msg || JSON.stringify(m)).join("; "));
      } else {
        setError(msg || "Failed to submit booking. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openForm = () => {
    setShowForm(true);
    setSuccess("");
    setError("");
  };

  // --- LIST VIEW ---
  if (!showForm) {
    return (
      <div className="min-h-[60vh]">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl shadow-md">
              <Upload className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Book Calibration</h2>
              <p className="text-sm text-gray-500 mt-0.5">Submit equipment for calibration</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openForm}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 shadow-md transition-all"
            >
              <Plus className="h-5 w-5" />
              New Booking
            </button>
            <button
              onClick={() => navigate("/customer")}
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium text-sm transition-all"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          <h3 className="text-lg font-bold text-gray-800 mb-5">Your Bookings</h3>

          {historyLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No bookings yet</p>
              <p className="text-gray-400 text-sm mt-1">Click "New Booking" to submit your first calibration request.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((booking) => {
                const cfg = statusConfig[booking.status] || statusConfig.pending;
                const isExpanded = expanded.has(booking.booking_id);
                return (
                  <div key={booking.booking_id} className="border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => toggleExpand(booking.booking_id)}
                      className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-lg shrink-0 ${cfg.class}`}>
                          {cfg.icon}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate">
                            Booking ID - {booking.booking_id}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {booking.files.length} file{booking.files.length !== 1 ? "s" : ""}
                            {booking.equipment_count != null && (
                              <> &middot; {booking.equipment_count} equipment</>
                            )}
                            {booking.created_at && (
                              <> &middot; {new Date(booking.created_at).toLocaleDateString("en-GB", {
                                day: "numeric", month: "short", year: "numeric",
                              })}</>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.class}`}>
                          {cfg.icon}
                          {cfg.label}
                        </span>
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-100 px-4 py-3 space-y-2">
                        {booking.files.map((file, i) => (
                          <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {isImage(file.file_type) ? (
                                <Image className="h-4 w-4 text-gray-500 shrink-0" />
                              ) : (
                                <FileText className="h-4 w-4 text-gray-500 shrink-0" />
                              )}
                              <span className="text-sm text-gray-700 truncate">{file.file_name || "Unnamed file"}</span>
                            </div>
                            {file.file_url && (
                              <a
                                href={file.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium shrink-0 ml-2"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                View
                              </a>
                            )}
                          </div>
                        ))}

                        {booking.remarks && (
                          <div className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 mt-2">
                            <span className="font-medium">Remarks:</span> {booking.remarks}
                          </div>
                        )}

                        {booking.status === "resend_requested" && (
                          <button
                            onClick={() => {
                              setShowForm(true);
                            }}
                            className="mt-2 w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 transition-colors"
                          >
                            <Upload className="h-4 w-4" />
                            Upload Again
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- FORM VIEW ---
  return (
    <div className="min-h-[60vh]">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl shadow-md">
            <Upload className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{initialBookingId ? "Re-upload" : "New Booking"}</h2>
            <p className="text-sm text-gray-500 mt-0.5">Submit equipment for calibration</p>
            {user?.customer_id && (
              <p className="text-xs text-gray-400 mt-1">Customer ID: {user.customer_id}</p>
            )}
          </div>
        </div>
        <button
          onClick={() => { setShowForm(false); setSuccess(""); setError(""); }}
          className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium text-sm transition-all"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to List
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 max-w-2xl">
        {success ? (
          <div className="text-center py-12">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Booking Submitted!</h3>
            <p className="text-gray-500 mb-6">{success}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => { setSuccess(""); setError(""); setEquipmentCount(""); setFiles([]); setFileErrors([]); setProgress(0); }}
                className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
              >
                Submit Another
              </button>
              <button
                onClick={() => { setShowForm(false); setSuccess(""); fetchHistory(); }}
                className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
              >
                Back to List
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Equipment Count</label>
              <input
                type="number"
                min="1"
                value={equipmentCount}
                onChange={(e) => setEquipmentCount(e.target.value)}
                placeholder="Number of equipment items"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Attach Files</label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors"
              >
                <div className="flex flex-col items-center gap-1">
                  <Upload className="h-8 w-8 text-gray-400" />
                  <p className="text-sm text-gray-500 font-medium">Click to select files</p>
                  <p className="text-xs text-gray-400">
                    PDF, images (JPEG, PNG, WebP), or plain text &middot; Max 5 MB each
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="application/pdf,image/jpeg,image/png,image/webp,text/plain"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {files.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {files.map((f, i) => (
                    <li key={i} className="flex items-center justify-between bg-indigo-50 rounded-lg px-3 py-2 text-sm">
                      <span className="flex items-center gap-2 text-gray-700 truncate min-w-0">
                        <FileText className="h-4 w-4 text-indigo-600 shrink-0" />
                        <span className="truncate">{f.name}</span>
                        <span className="text-gray-400 text-xs shrink-0">({(f.size / 1024).toFixed(0)} KB)</span>
                      </span>
                      <button type="button" onClick={() => removeFile(i)} className="text-gray-400 hover:text-red-600 ml-2 shrink-0">
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {fileErrors.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {fileErrors.map((msg, i) => (
                    <div key={i} className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span className="flex-1">{msg}</span>
                      <button type="button" onClick={() => dismissFileError(i)} className="text-red-400 hover:text-red-700 shrink-0">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Remarks (optional)</label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Any additional notes for the engineer..."
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm resize-none"
              />
            </div>

            {loading && progress > 0 && (
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Uploading...</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !equipmentCount || files.length === 0}
              className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-lg hover:from-indigo-700 hover:to-purple-700 focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Uploading {files.length} file{files.length > 1 ? "s" : ""}...
                </span>
              ) : (
                `Submit Booking${files.length ? ` (${files.length} file${files.length > 1 ? "s" : ""})` : ""}`
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default BookCalibration;

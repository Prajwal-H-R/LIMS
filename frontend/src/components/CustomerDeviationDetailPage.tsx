import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { 
  AlertTriangle, 
  ChevronLeft, 
  Loader2, 
  Save, 
  Paperclip, 
  FileText, 
  ExternalLink 
} from "lucide-react";
import { api, ENDPOINTS } from "../api/config";

interface DeviationDetail {
  deviation_id: number;
  inward_id?: number | null;
  inward_eqp_id: number;
  srf_no?: string | null;
  customer_dc_no?: string | null;
  customer_dc_date?: string | null;
  customer_details?: string | null;
  nepl_id?: string | null;
  make?: string | null;
  model?: string | null;
  serial_no?: string | null;
  job_id?: number | null;
  repeatability_id?: number | null;
  step_percent?: number | null;
  set_torque?: number | null;
  corrected_mean?: number | null;
  deviation_percent?: number | null;
  certificate_id?: number | null;
  status: string;
  calibration_status?: string | null;
  engineer_remarks?: string | null;
  customer_decision?: string | null;
  report?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  attachments: { 
    id: number; 
    file_name: string; 
    file_type?: string | null; 
    file_url: string; 
    created_at: string 
  }[];
  oot_steps?: { 
    step_percent?: number | null; 
    set_torque?: number | null; 
    corrected_mean?: number | null; 
    deviation_percent?: number | null 
  }[];
}

const CustomerDeviationDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { deviationId } = useParams<{ deviationId: string }>();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<DeviationDetail | null>(null);
  const [decision, setDecision] = useState("");

  // Helper: Format Dates
  const formatDcDate = (value?: string | null) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };

  // Helper: Format Calibration Status Text
  const formatCalibrationStatus = (value?: string | null) => {
    return (value || "not calibrated")
      .split(" ")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  // Helper: Construct full URL for attachments
  const getFileFullUrl = (url: string) => {
    if (!url) return "#";
    if (url.startsWith('http')) return url;
    const host = api.defaults.baseURL?.split('/api')[0] || '';
    return `${host}${url}`; 
  };

  useEffect(() => {
    const load = async () => {
      if (!deviationId) return;
      setLoading(true);
      setError(null);
      try {
        const id = Number(deviationId);
        const res = await api.get<DeviationDetail>(ENDPOINTS.PORTAL.DEVIATION_DETAIL(id));
        setDetail(res.data);
        setDecision(res.data.customer_decision || "");
      } catch (e: unknown) {
        const msg =
          e && typeof e === "object" && "response" in e
            ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
            : null;
        setError(msg || "Failed to load deviation record.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [deviationId]);

  const saveDecision = async () => {
    if (!detail) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(ENDPOINTS.PORTAL.DEVIATION_DETAIL(detail.deviation_id), {
        customer_decision: decision,
      });
      navigate("/customer/deviations");
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      setError(msg || "Failed to save decision.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 md:p-8 bg-white rounded-2xl shadow-lg border border-slate-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
          <AlertTriangle className="h-8 w-8 text-amber-600" />
          Deviation Record
        </h2>
        <Link
          to="/customer/deviations"
          className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium text-sm transition-all shadow-sm"
        >
          <ChevronLeft size={16} />
          <span>Back to Deviations</span>
        </Link>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-slate-500 text-sm py-12 justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
          <span>Loading deviation record...</span>
        </div>
      )}

      {!loading && error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm mb-4">
          {error}
        </div>
      )}

      {!loading && !error && detail && (
        <div className="space-y-6 text-sm">
          
          {/* Top Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-bold">DC Details</p>
              <p className="text-sm font-bold text-slate-900 mt-2">No: {detail.customer_dc_no || "—"}</p>
              <p className="text-sm font-semibold text-slate-600">Date: {formatDcDate(detail.customer_dc_date)}</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-bold">Current Status</p>
              <span className={`inline-flex mt-2 text-xs px-3 py-1 rounded-full font-bold border ${
                (detail.status || "").toUpperCase() === "CLOSED"
                  ? "bg-green-100 text-green-800 border-green-200"
                  : (detail.status || "").toUpperCase() === "IN_PROGRESS"
                    ? "bg-blue-100 text-blue-800 border-blue-200"
                    : "bg-amber-100 text-amber-900 border-amber-200"
              }`}>
                {detail.status || "OPEN"}
              </span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-bold">Calibration Status</p>
              <span className={`inline-flex mt-2 text-xs px-3 py-1 rounded-full font-bold border ${
                (detail.calibration_status || "").toLowerCase().includes("calibrated") || 
                (detail.calibration_status || "").toLowerCase().includes("ok")
                  ? "bg-green-100 text-green-800 border-green-200"
                  : "bg-slate-100 text-slate-700 border-slate-200"
              }`}>
                {formatCalibrationStatus(detail.calibration_status)}
              </span>
            </div>
          </div>

          {/* SRF and OOT Steps Section */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-tight">SRF No</p>
                <p className="font-semibold text-slate-900">{detail.srf_no || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-tight">NEPL ID</p>
                <p className="font-semibold text-slate-900">{detail.nepl_id || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-tight">Report Date</p>
                <p className="font-semibold text-slate-900">{formatDcDate(detail.report)}</p>
              </div>
            </div>

            {((detail.oot_steps?.length || 0) > 0) && (
              <div className="mt-6">
                <p className="text-slate-600 text-xs font-bold uppercase tracking-wide mb-3">
                  Out of Tolerance (OOT) Steps
                </p>
                <div className="overflow-hidden border border-slate-200 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr className="text-left text-slate-600 font-bold">
                        <th className="px-4 py-2">Step %</th>
                        <th className="px-4 py-2">Deviation %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detail.oot_steps?.map((step, idx) => (
                        <tr key={`oot-step-${idx}`} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2 text-slate-800">{step.step_percent ?? "—"}</td>
                          <td className="px-4 py-2 font-bold text-red-600">{step.deviation_percent ?? "—"}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Customer & Equipment Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-bold text-slate-500 uppercase mb-2">Customer Details</p>
              <p className="text-slate-800 leading-relaxed font-medium">{detail.customer_details || "—"}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-bold text-slate-500 uppercase mb-2">Equipment Information</p>
              <p className="text-slate-800 font-medium">
                {[detail.make, detail.model, detail.serial_no].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
          </div>

          {/* Engineer Remarks Display */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">Engineer Remarks</p>
            <div className="text-sm text-slate-800 whitespace-pre-wrap bg-slate-50 border border-slate-100 rounded-lg p-3 min-h-[60px]">
              {detail.engineer_remarks || "No remarks provided by engineer."}
            </div>
          </div>

          {/* Customer Decision Input */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Save className="h-4 w-4 text-amber-700" />
              <label className="block text-sm font-bold text-amber-900 uppercase tracking-tight">
                Your Decision / Action Required
              </label>
            </div>
            <textarea
              className="w-full border border-amber-200 rounded-lg p-4 text-sm min-h-[120px] bg-white/80 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-inner"
              placeholder="Please provide your instructions (e.g., 'Proceed as is', 'Rework required', or 'Return without calibration')..."
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
            />
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={saveDecision}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-60 shadow transition-all active:scale-95"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Submit My Decision
              </button>
            </div>
          </div>

          {/* Attachments Section */}
          {detail.attachments && detail.attachments.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Paperclip size={18} className="text-slate-400" />
                <p className="text-slate-700 font-bold uppercase text-xs tracking-wider">Evidence & Attachments</p>
                <span className="ml-auto text-[10px] font-black bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-100">
                    {detail.attachments.length} FILE(S)
                </span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {detail.attachments.map((a) => (
                  <a 
                    key={a.id} 
                    href={getFileFullUrl(a.file_url)} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 transition-all group"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="p-2 bg-white rounded border border-slate-200 text-indigo-500">
                        <FileText size={18} />
                      </div>
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-sm font-bold text-slate-700 truncate group-hover:text-indigo-700">
                          {a.file_name}
                        </span>
                        {a.file_type && (
                          <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">
                            {a.file_type.split('/')[1] || a.file_type}
                          </span>
                        )}
                      </div>
                    </div>
                    <ExternalLink size={14} className="text-slate-400 group-hover:text-indigo-500 flex-shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomerDeviationDetailPage;
import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ChevronLeft, Loader2, Save } from "lucide-react";
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
  attachments: { id: number; file_name: string; file_type?: string | null; file_url: string; created_at: string }[];
  oot_steps?: { step_percent?: number | null; set_torque?: number | null; corrected_mean?: number | null; deviation_percent?: number | null }[];
}

const CustomerDeviationDetailPage: React.FC = () => {
  const formatDcDate = (value?: string | null) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };

  const formatCalibrationStatus = (value?: string | null) => {
    return (value || "not calibrated")
      .split(" ")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  const navigate = useNavigate();
  const { deviationId } = useParams<{ deviationId: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<DeviationDetail | null>(null);
  const [decision, setDecision] = useState("");

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
          <AlertTriangle className="h-8 w-8 text-amber-600" />
          Deviation Record
        </h2>
        <Link
          to="/customer/deviations"
          className="text-indigo-600 hover:text-indigo-800 font-semibold text-sm flex items-center gap-1"
        >
          <ChevronLeft className="h-4 w-4" /> Back to Deviations
        </Link>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-slate-500 text-sm py-8 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading record...
        </div>
      )}

      {!loading && error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm mb-4">{error}</div>
      )}

      {!loading && !error && detail && (
        <div className="space-y-5 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Deviation ID</p>
              <p className="text-xl font-bold text-slate-900 mt-1">#{detail.deviation_id}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Status</p>
              <span className={`inline-flex mt-2 text-xs px-2.5 py-1 rounded-full font-semibold border ${
                (detail.status || "").toUpperCase() === "CLOSED"
                  ? "bg-green-100 text-green-800 border-green-200"
                  : (detail.status || "").toUpperCase() === "IN_PROGRESS"
                    ? "bg-blue-100 text-blue-800 border-blue-200"
                    : "bg-amber-100 text-amber-900 border-amber-200"
              }`}>
                {detail.status || "OPEN"}
              </span>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Calibration status</p>
              <span className={`inline-flex mt-2 text-xs px-2.5 py-1 rounded-full font-semibold border ${
                (detail.calibration_status || "").toLowerCase() === "calibrated"
                  ? "bg-green-100 text-green-800 border-green-200"
                  : "bg-slate-100 text-slate-700 border-slate-200"
              }`}>
                {formatCalibrationStatus(detail.calibration_status)}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div><span className="text-slate-500">SRF</span> <span className="font-medium text-slate-900 ml-2">{detail.srf_no || "—"}</span></div>
              <div><span className="text-slate-500">NEPL ID</span> <span className="font-medium text-slate-900 ml-2">{detail.nepl_id || "—"}</span></div>
              <div><span className="text-slate-500">Report date</span> <span className="font-medium text-slate-900 ml-2">{detail.report || "—"}</span></div>
            </div>
            {((detail.oot_steps?.length || 0) > 0) && (
              <div className="mt-4 overflow-x-auto">
                <p className="text-slate-600 text-xs font-semibold uppercase tracking-wide mb-2">
                  OOT Steps (one decision for all)
                </p>
                <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-left text-slate-600">
                      <th className="px-3 py-2">Step %</th>
                      <th className="px-3 py-2">Set Torque</th>
                      <th className="px-3 py-2">Corrected Mean</th>
                      <th className="px-3 py-2">Deviation %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.oot_steps?.map((step, idx) => (
                      <tr key={`oot-step-${idx}`} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-800">{step.step_percent ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-700">{step.set_torque ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-700">{step.corrected_mean ?? "—"}</td>
                        <td className="px-3 py-2 font-medium text-red-700">{step.deviation_percent ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 font-semibold">
                DC No: {detail.customer_dc_no || "—"}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold">
                DC Date: {formatDcDate(detail.customer_dc_date)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-medium text-slate-700 mb-1">Customer</p>
              <p className="text-sm text-slate-800">{detail.customer_details || "—"}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-medium text-slate-700 mb-1">Equipment</p>
              <p className="text-sm text-slate-800">{[detail.make, detail.model, detail.serial_no].filter(Boolean).join(" · ") || "—"}</p>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-1">Engineer remarks</p>
            <div className="text-sm text-slate-800 whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded-lg p-3 min-h-[64px]">
              {detail.engineer_remarks || "—"}
            </div>
          </div>

          <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">Your decision</label>
            <textarea
              className="w-full border border-amber-200 rounded-lg p-3 text-sm min-h-[110px] bg-white/70 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="e.g. Accept as-is / Request rework / Hold shipment…"
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
            />
          </div>

          {detail.attachments?.length > 0 && (
            <div>
              <p className="text-sm font-medium text-slate-700 mb-1">Attachments</p>
              <ul className="space-y-1">
                {detail.attachments.map((a) => (
                  <li key={a.id}>
                    <a href={a.file_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
                      {a.file_name}
                    </a>
                    {a.file_type && <span className="text-slate-500 text-xs ml-2">({a.file_type})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={saveDecision}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save decision
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerDeviationDetailPage;

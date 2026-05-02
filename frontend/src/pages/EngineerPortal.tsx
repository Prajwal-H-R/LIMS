import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Routes, Route, useNavigate, useLocation, useParams } from "react-router-dom";
import { 
  Wrench, FileText, Award, ClipboardList, AlertTriangle, 
  ArrowRight, Mail, Download, Briefcase, ChevronLeft, XCircle, 
  Loader2, Eye, Save, FileUp, Paperclip, ExternalLink 
} from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { User } from "../types";
import { api, ENDPOINTS } from "../api/config";

// --- UPDATED INTERFACE ---
interface DeviationDetailResponse {
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
  calibration_status?: string | null; // For internal deviations
  tool_status?: string | null; // For external deviations
  engineer_remarks?: string | null;
  customer_decision?: string | null;
  report?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  attachments: { id: number; file_name: string; file_type?: string | null; file_url: string; created_at: string }[];
  oot_steps?: { step_percent?: number | null; set_torque?: number | null; corrected_mean?: number | null; deviation_percent?: number | null }[];
}

interface OOTDeviationItem {
  deviation_type: string; 
  deviation_id?: number | null;
  status?: string | null;
  engineer_remarks?: string | null;
  repeatability_id?: number | null;
  srf_no?: string | null;
  customer_dc_no?: string | null;
  customer_dc_date?: string | null;
  job_id?: number | null;
  step_percent?: number | null;
  deviation_percent?: number | null;
  customer_decision?: string | null;
  nepl_id?: string | null;
  make?: string | null;
  model?: string | null;
  serial_no?: string | null;
  oot_steps?: { step_percent?: number | null; set_torque?: number | null; corrected_mean?: number | null; deviation_percent?: number | null }[];
}

// --- Import page components ---
import { CreateInwardPage } from "../components/CreateInwardPage"; 
import { ViewUpdateInward } from "../components/ViewUpdateInward";
import { ViewInward } from "../components/ViewInward";
import { PrintStickers } from "../components/PrintStickers";
import { InwardForm } from "../components/InwardForm";
import SrfDetailPage  from "../components/SrfDetailPage"; 
import { DelayedEmailManager } from "../components/DelayedEmailManager";
import { FailedNotificationsManager } from "../components/FailedNotificationManager";
import ExportInwardPage from "../components/ExportInwardPage";
import SrfListPage from "../components/SrfListPage";
import JobsManagementPage from "../components/JobsManagementPage";
import CalibrationPage from "../components/CalibrationPage";
import UncertaintyBudgetPage from '../components/UncertaintyBudgetPage';
import { CertificatesPage } from "../components/CertificatesPage";
import ProfilePage from "../components/ProfilePage";
import ManualCalibrationPage, { ManualCalibrationSrfDetailPage } from "../components/ManualCalibrationPage";

// --- Interfaces ---
interface EngineerPortalProps {
  user: User | null;
  onLogout: () => void;
}
interface DelayedTask { task_id: number; }
interface FailedNotification { id: number; }
interface AvailableDraft { inward_id: number; }
interface ReviewedFir { inward_id: number; }
interface FailedNotificationsResponse {
  failed_notifications: FailedNotification[];
}

interface EngineerNotificationItem {
  id: number;
  subject: string;
  body_text?: string | null;
  created_at: string;
  status: string;
  error?: string | null;
}

interface EngineerNotificationsResponse {
  notifications: EngineerNotificationItem[];
}

const extractCompanyFromNotification = (notification?: EngineerNotificationItem | null): string | null => {
  if (!notification) return null;
  const bodyMatch = notification.body_text?.match(/Company:\s*([^|]+)/i);
  if (bodyMatch?.[1]?.trim()) return bodyMatch[1].trim();
  const subjectMatch = notification.subject?.match(/\(Company:\s*([^)]+)\)/i);
  if (subjectMatch?.[1]?.trim()) return subjectMatch[1].trim();
  return null;
};

// Interface for Expiry Check
interface ExpiryCheckResponse {
    message: string;
    affected_tables: string[];
}

// --- HELPER FUNCTIONS ---
const formatTableName = (tableName: string) => {
    return tableName
      .replace('htw_', '')
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
};

const formatCalibrationStatus = (value?: string | null) => {
  if (!value) return "Not Available";
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

const ALL_STAFF_DEVIATIONS_ENDPOINT = "/deviations/all-staff";

const DeviationPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<OOTDeviationItem[]>([]);
  const [activeDeviationSection, setActiveDeviationSection] = useState<"OOT" | "MANUAL">("OOT");

  const loadDeviations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<OOTDeviationItem[]>(ALL_STAFF_DEVIATIONS_ENDPOINT);
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      setError(msg || "Failed to load deviations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDeviations();
  }, [loadDeviations]);

  const ootItems = useMemo(
    () => items.filter((item) => item.deviation_type.toUpperCase() === "OOT"),
    [items]
  );

  const manualItems = useMemo(
    () => items.filter((item) => item.deviation_type.toUpperCase() === "MANUAL"),
    [items]
  );

  const groupedBySrf = useMemo(() => {
    return ootItems.reduce<Record<string, OOTDeviationItem[]>>((acc, item) => {
      const key = item.srf_no?.trim() || "Without SRF";
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [ootItems]);

  const groupKeys = useMemo(() => {
    const keys = Object.keys(groupedBySrf);
    return keys.sort((a, b) => {
      if (a === "Without SRF") return 1;
      if (b === "Without SRF") return -1;
      return b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" });
    });
  }, [groupedBySrf]);

  const groupedManualBySrf = useMemo(() => {
    return manualItems.reduce<Record<string, OOTDeviationItem[]>>((acc, item) => {
      const key = item.srf_no?.trim() || "Without SRF";
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [manualItems]);

  const manualGroupKeys = useMemo(() => {
    const keys = Object.keys(groupedManualBySrf);
    return keys.sort((a, b) => {
      if (a === "Without SRF") return 1;
      if (b === "Without SRF") return -1;
      return b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" });
    });
  }, [groupedManualBySrf]);

  const formatDcDate = (value?: string | null) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };

  const openSrfRecords = (section: "OOT" | "MANUAL", srfKey: string) => {
    const encoded = encodeURIComponent(srfKey);
    const itemsToPass = section === 'OOT' ? ootItems : manualItems;
    navigate(`/engineer/deviations/srf/${section}/${encoded}`, { state: { items: itemsToPass } });
  };
  
  return (
    <div className="p-8 bg-white rounded-2xl shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">View Deviations</h2>
        <button
          type="button"
          onClick={() => navigate("/engineer")}
          className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:text-gray-900 font-medium text-sm transition-all shadow-sm"
        >
          <ChevronLeft size={16} />
          <span>Back to Dashboard</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <button
          type="button"
          onClick={() => setActiveDeviationSection("OOT")}
          className={`rounded-xl border p-4 text-left transition-colors ${
            activeDeviationSection === "OOT"
              ? "border-red-200 bg-red-50"
              : "border-gray-200 bg-white hover:bg-gray-50"
          }`}
        >
          <h3 className="font-bold text-red-800">OOT - Out of Tolerance</h3>
          <p className="text-sm text-red-700 mt-1">Grouped by SRF number. {ootItems.length} record(s).</p>
        </button>
        <button
          type="button"
          onClick={() => setActiveDeviationSection("MANUAL")}
          className={`rounded-xl border p-4 text-left transition-colors ${
            activeDeviationSection === "MANUAL"
              ? "border-gray-300 bg-gray-50"
              : "border-gray-200 bg-white hover:bg-gray-50"
          }`}
        >
          <h3 className="font-bold text-gray-800">Manual Deviation</h3>
          <p className="text-sm text-gray-600 mt-1">Grouped by SRF number. {manualItems.length} record(s).</p>
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-gray-600 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading deviations...
        </div>
      )}

      {!loading && error && (
        <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      {!loading && !error && activeDeviationSection === "OOT" && groupKeys.length === 0 && (
        <div className="p-8 text-center text-gray-500 border border-gray-200 rounded-xl">No OOT entries found.</div>
      )}

      {!loading && !error && activeDeviationSection === "OOT" && groupKeys.length > 0 && (
        <div className="space-y-4">
          {groupKeys.map((srfKey) => {
            const items = groupedBySrf[srfKey] || [];
            const first = items[0];
            return (
              <div key={srfKey} className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="w-full bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between text-left">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium text-slate-600">SRF: {srfKey}</div>
                    {(first?.customer_dc_no || first?.customer_dc_date) && (
                      <>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 font-semibold">
                          DC No: {first?.customer_dc_no || "—"}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold">
                          DC Date: {formatDcDate(first?.customer_dc_date)}
                        </span>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => openSrfRecords("OOT", srfKey)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
                  >
                    Open
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && activeDeviationSection === "MANUAL" && manualGroupKeys.length === 0 && (
        <div className="mt-6 p-8 text-center text-gray-500 border border-gray-200 rounded-xl">No Manual deviation entries found.</div>
      )}

      {!loading && !error && activeDeviationSection === "MANUAL" && manualGroupKeys.length > 0 && (
        <div className="space-y-4 mt-6">
          {manualGroupKeys.map((srfKey) => {
            const items = groupedManualBySrf[srfKey] || [];
            const first = items[0];
            return (
              <div key={`manual-${srfKey}`} className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="w-full bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between text-left">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium text-slate-600">SRF: {srfKey}</div>
                    {(first?.customer_dc_no || first?.customer_dc_date) && (
                      <>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 font-semibold">
                          DC No: {first?.customer_dc_no || "—"}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold">
                          DC Date: {formatDcDate(first?.customer_dc_date)}
                        </span>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => openSrfRecords("MANUAL", srfKey)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
                  >
                    Open
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const SrfDeviationRecordsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { section, srfKey } = useParams<{ section: string; srfKey: string }>();

  const allItems: OOTDeviationItem[] = location.state?.items || [];

  const activeSection: "OOT" | "MANUAL" =
    (section || "").toUpperCase() === "MANUAL" ? "MANUAL" : "OOT";
  const decodedSrf = decodeURIComponent(srfKey || "Without SRF");

  useEffect(() => {
    if (allItems.length === 0) {
      navigate("/engineer/deviations");
    }
  }, [allItems, navigate]);

  const filtered = useMemo(() => {
    return allItems.filter((item) => (item.srf_no?.trim() || "Without SRF") === decodedSrf);
  }, [allItems, decodedSrf]);

  const neplGroups = useMemo(() => {
    return filtered.reduce<Record<string, OOTDeviationItem[]>>((acc, item) => {
      const key = item.nepl_id?.trim() || "Without NEPL ID";
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [filtered]);

  const neplKeys = useMemo(
    () => Object.keys(neplGroups).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })),
    [neplGroups]
  );

  if (allItems.length === 0) {
    return (
        <div className="flex items-center justify-center h-64 gap-2 text-gray-600 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading records...
        </div>
    );
  }

  return (
    <div className="p-8 bg-white rounded-2xl shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {activeSection === "OOT" ? "OOT SRF Records" : "Manual SRF Records"}
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            SRF: <span className="font-semibold text-gray-800">{decodedSrf}</span> · {filtered.length} record(s)
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/engineer/deviations")}
          className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:text-gray-900 font-medium text-sm transition-all shadow-sm"
        >
          <ChevronLeft size={16} />
          <span>Back to Deviations</span>
        </button>
      </div>

       {neplKeys.length === 0 && (
        <div className="p-8 text-center text-gray-500 border border-gray-200 rounded-xl">
          No records found for this SRF.
        </div>
      )}

      {neplKeys.length > 0 && (
        <div className="space-y-4">
          {neplKeys.map((neplKey) => {
            const rows = neplGroups[neplKey] || [];
            const statusSet = Array.from(new Set(rows.map((row) => (row.status || "OPEN").toUpperCase())));
            const neplStatus = statusSet.length === 1 ? statusSet[0] : "MIXED";
            return (
              <div key={neplKey} className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">NEPL ID: {neplKey}</span>
                    <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-medium text-xs">
                      {neplStatus}
                    </span>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                    {rows.length} record{rows.length > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr className="text-left text-slate-600">
                        <th className="px-3 py-2 min-w-[220px]">Equipment</th>
                        <th className="px-3 py-2 min-w-[220px]">Engineer remarks</th>
                        <th className="px-3 py-2 min-w-[240px]">Customer decision</th>
                        <th className="px-3 py-2 w-[120px]">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.deviation_id ?? `${neplKey}-${row.job_id}`} className="border-t border-slate-100 align-top">
                          <td className="px-3 py-3">
                            <div className="font-semibold text-slate-900">{row.nepl_id || "Equipment"}</div>
                            <div className="text-xs text-slate-600 mt-0.5">
                              {[row.make, row.model, row.serial_no].filter(Boolean).join(" · ") || "—"}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-slate-700 whitespace-pre-wrap">{row.engineer_remarks || "—"}</td>
                          <td className="px-3 py-3 text-slate-700 whitespace-pre-wrap">{row.customer_decision || "—"}</td>
                          <td className="px-3 py-3">
                            {row.deviation_id != null ? (
                              <button
                                type="button"
                                onClick={() => navigate(`/engineer/deviations/${row.deviation_id}`)}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-60"
                              >
                                <Eye className="h-4 w-4" />
                                Open
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// --- UPDATED DEVIATION DETAIL COMPONENT ---
const DeviationDetailPage = () => {
  const navigate = useNavigate();
  const { deviationId } = useParams<{ deviationId: string }>();
  const [loading, setLoading] = useState(true);
  const [savingRemarks, setSavingRemarks] = useState(false);
  const [closingDeviation, setClosingDeviation] = useState(false);
  const [terminatingDeviationJob, setTerminatingDeviationJob] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<DeviationDetailResponse | null>(null);
  const [engineerRemarksInput, setEngineerRemarksInput] = useState("");

  const isExternalRecord = deviationId ? Number(deviationId) < 0 : false;

  const getFileFullUrl = (url: string) => {
    if (!url) return "#";
    if (url.startsWith('http')) return url;
    const host = api.defaults.baseURL?.split('/api')[0] || '';
    return `${host}${url}`; 
  };

  const formatDcDate = (value?: string | null) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };

  useEffect(() => {
    const loadDetail = async () => {
      if (!deviationId) {
        setError("Deviation ID is missing.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<DeviationDetailResponse>(ENDPOINTS.STAFF_DEVIATIONS.DETAIL(Number(deviationId)));
        setDetail(res.data);
        setEngineerRemarksInput(res.data.engineer_remarks || "");
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
    loadDetail();
  }, [deviationId]);

  const saveEngineerRemarks = async () => {
    if (!detail || !deviationId) return;
    setSavingRemarks(true);
    setError(null);
    try {
      let response;
      const payload = { engineer_remarks: engineerRemarksInput };
      const id = Number(deviationId);

      if (isExternalRecord) {
        const externalId = Math.abs(id);
        response = await api.patch<DeviationDetailResponse>(
          `/external-deviations/${externalId}`, 
          payload
        );
      } else {
        response = await api.patch<DeviationDetailResponse>(
          ENDPOINTS.STAFF_DEVIATIONS.UPDATE_ENGINEER_REMARKS(id),
          payload
        );
      }
      
      setDetail(response.data);
      setEngineerRemarksInput(response.data.engineer_remarks || "");

    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      setError(msg || "Failed to save engineer remarks.");
    } finally {
      setSavingRemarks(false);
    }
  };

  const closeDeviationRecord = async () => {
    if (!detail) return;
    setClosingDeviation(true);
    setError(null);
    try {
      const res = await api.patch<DeviationDetailResponse>(
        ENDPOINTS.STAFF_DEVIATIONS.CLOSE(detail.deviation_id)
      );
      setDetail(res.data);
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      setError(msg || "Failed to close deviation.");
    } finally {
      setClosingDeviation(false);
    }
  };

  const terminateDeviationJob = async () => {
    if (!detail) return;
    setTerminatingDeviationJob(true);
    setError(null);
    try {
      const res = await api.patch<DeviationDetailResponse>(
        ENDPOINTS.STAFF_DEVIATIONS.TERMINATE_JOB(detail.deviation_id)
      );
      setDetail(res.data);
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      setError(msg || "Failed to terminate linked job.");
    } finally {
      setTerminatingDeviationJob(false);
    }
  };

  return (
    <div className="p-8 bg-white rounded-2xl shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Deviation Record</h2>
        <button
          type="button"
          onClick={() => navigate("/engineer/deviations")}
          className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:text-gray-900 font-medium text-sm transition-all shadow-sm"
        >
          <ChevronLeft size={16} />
          <span>Back to Deviations</span>
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-gray-600 text-sm py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading deviation record...
        </div>
      )}

      {!loading && error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700">{error}</div>
      )}

      {!loading && !error && detail && (
        <div className="space-y-5 text-sm">
          {!isExternalRecord && (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={closingDeviation || (detail.status || "").toUpperCase() === "CLOSED"}
                onClick={closeDeviationRecord}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-black disabled:opacity-60"
              >
                {closingDeviation ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {(detail.status || "").toUpperCase() === "CLOSED" ? "Closed" : "Close Deviation"}
              </button>
              <button
                type="button"
                disabled={terminatingDeviationJob}
                onClick={terminateDeviationJob}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60"
              >
                {terminatingDeviationJob ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Terminate Job
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">DC Details</p>
              <p className="text-sm font-semibold text-gray-900 mt-1">No: {detail.customer_dc_no || "—"}</p>
              <p className="text-sm font-semibold text-gray-900 mt-1">Date: {formatDcDate(detail.customer_dc_date)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Status</p>
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
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
                {isExternalRecord ? "Tool Status" : "Calibration status"}
              </p>
              <span className={`inline-flex mt-2 text-xs px-2.5 py-1 rounded-full font-semibold border ${
                (detail.tool_status || detail.calibration_status || "").toLowerCase().includes("calibrated") || 
                (detail.tool_status || detail.calibration_status || "").toLowerCase().includes("ok")
                  ? "bg-green-100 text-green-800 border-green-200"
                  : "bg-gray-100 text-gray-700 border-gray-200"
              }`}>
                {formatCalibrationStatus(isExternalRecord ? detail.tool_status : detail.calibration_status)}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div><span className="text-gray-500">SRF</span> <span className="font-medium text-gray-900 ml-2">{detail.srf_no || "—"}</span></div>
              <div><span className="text-gray-500">NEPL ID</span> <span className="font-medium text-gray-900 ml-2">{detail.nepl_id || "—"}</span></div>
              <div><span className="text-gray-500">Report date</span> <span className="font-medium text-gray-900 ml-2">{detail.report ? formatDcDate(detail.report) : "—"}</span></div>
            </div>
            {(detail.oot_steps?.length || 0) > 0 && (
              <div className="mt-4 overflow-x-auto">
                <p className="text-gray-600 text-xs font-semibold uppercase tracking-wide mb-2">
                  OOT Steps (single response applies to all)
                </p>
                <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-left text-slate-600">
                      <th className="px-3 py-2">Step %</th>
                      <th className="px-3 py-2">Deviation %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.oot_steps?.map((step, idx) => (
                      <tr key={`oot-step-${idx}`} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-800">{step.step_percent ?? "—"}</td>
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
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-gray-500 font-medium mb-1">Customer</p>
              <p className="text-gray-800">{detail.customer_details || "—"}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-gray-500 font-medium mb-1">Equipment</p>
              <p className="text-gray-800">{[detail.make, detail.model, detail.serial_no].filter(Boolean).join(" · ") || "—"}</p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-gray-500 font-medium mb-1">Engineer remarks</p>
            <textarea
              className="w-full border border-gray-300 rounded-lg p-3 text-sm min-h-[110px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Add engineer remarks for this deviation..."
              value={engineerRemarksInput}
              onChange={(e) => setEngineerRemarksInput(e.target.value)}
            />
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                disabled={savingRemarks}
                onClick={saveEngineerRemarks}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
              >
                {savingRemarks ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save remarks
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
            <p className="text-gray-500 font-medium mb-1">Customer decision</p>
            <p className="text-gray-800 whitespace-pre-wrap bg-white/60 border border-amber-100 rounded-lg p-3 min-h-[48px]">
              {detail.customer_decision || "—"}
            </p>
          </div>

          {/* --- ATTACHMENTS SECTION --- */}
          {detail.attachments && detail.attachments.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2 mb-3">
                <Paperclip size={16} className="text-gray-400" />
                <p className="text-gray-500 font-medium">Evidence & Attachments</p>
                <span className="ml-auto text-xs font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100">
                    {detail.attachments.length} File(s)
                </span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {detail.attachments.map((a) => (
                  <a 
                    key={a.id} 
                    href={getFileFullUrl(a.file_url)} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50 hover:bg-blue-50 hover:border-blue-200 transition-all group"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="p-2 bg-white rounded border border-gray-200 text-blue-500">
                        <FileText size={18} />
                      </div>
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-sm font-semibold text-gray-700 truncate group-hover:text-blue-700">
                          {a.file_name}
                        </span>
                        {a.file_type && (
                          <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">
                            {a.file_type.split('/')[1] || a.file_type}
                          </span>
                        )}
                      </div>
                    </div>
                    <ExternalLink size={14} className="text-gray-400 group-hover:text-blue-500 flex-shrink-0" />
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

// --- SKELETON LOADING COMPONENT ---
const DashboardSkeleton = () => {
  return (
    <div className="animate-pulse w-full">
      <div className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 bg-slate-200 rounded-2xl"></div>
          <div className="space-y-3">
            <div className="h-8 w-64 bg-slate-200 rounded"></div>
            <div className="h-4 w-96 bg-slate-200 rounded"></div>
          </div>
        </div>
      </div>
      <div className="h-24 w-full bg-slate-100 rounded-xl mb-6 border border-slate-200"></div>
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
        <div className="h-8 w-48 bg-slate-200 rounded mb-6 border-b pb-3"></div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4, 5, 6, 7].map((item) => (
            <div key={item} className="p-6 rounded-2xl border border-gray-100 bg-white flex items-center">
              <div className="h-14 w-14 bg-slate-200 rounded-xl mr-4 shadow-sm"></div>
              <div className="flex-1 space-y-3">
                <div className="h-6 w-32 bg-slate-200 rounded"></div>
                <div className="h-4 w-full bg-slate-200 rounded"></div>
              </div>
              <div className="ml-4 h-6 w-6 bg-slate-200 rounded-full"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const ActionButton: React.FC<{
  label: string; 
  description: string; 
  icon: React.ReactNode; 
  onClick: () => void; 
  colorClasses: string; 
  badge?: number;
}> = ({ label, description, icon, onClick, colorClasses, badge }) => (
  <button 
    onClick={onClick} 
    className="group relative p-6 rounded-2xl text-left transition-all duration-300 transform hover:scale-[1.02] border border-gray-100 bg-white hover:border-blue-500 hover:shadow-xl shadow-md"
  >
    <div className="flex items-start">
      <div className={`p-3 rounded-xl text-white mr-4 shadow-lg ${colorClasses} group-hover:shadow-2xl transition-shadow duration-300 relative`}>
        {icon}
        {badge != null && badge > 0 && (
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-6 w-6 flex items-center justify-center font-bold border-2 border-white">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </div>
      <div className="flex-1">
        <h3 className="text-xl font-bold text-gray-900 mb-1">{label}</h3>
        <p className="text-gray-600 text-sm">{description}</p>
      </div>
      <ArrowRight className="ml-4 h-6 w-6 text-gray-400 group-hover:text-blue-600 transition-colors duration-300" />
    </div>
  </button>
);


const EngineerDashboard: React.FC = () => {
  const navigate = useNavigate();
  
  const [pendingEmailCount, setPendingEmailCount] = useState(0);
  const [failedNotificationCount, setFailedNotificationCount] = useState(0);
  const [showDelayedEmails, setShowDelayedEmails] = useState(false);
  const [showFailedNotifications, setShowFailedNotifications] = useState(false);
  const [availableDrafts, setAvailableDrafts] = useState<AvailableDraft[]>([]);
  const [reviewedFirCount, setReviewedFirCount] = useState(0);
  
  const [expiredStandards, setExpiredStandards] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDashboardData = useCallback(async (isInitialLoad = false) => {
    if (isInitialLoad) setIsLoading(true);
    try {
      const timestamp = new Date().getTime();
      const todayStr = new Date().toISOString().split('T')[0];

      const [pendingEmailsRes, failedNotifsRes, draftsRes, reviewedFirsRes, expiryRes] = await Promise.allSettled([
        api.get<DelayedTask[]>(`${ENDPOINTS.STAFF.INWARDS}/delayed-emails/pending?_t=${timestamp}`),
        api.get<FailedNotificationsResponse>(`${ENDPOINTS.STAFF.INWARDS}/notifications/failed?_t=${timestamp}`),
        api.get<AvailableDraft[]>(`${ENDPOINTS.STAFF.INWARDS}/drafts?_t=${timestamp}`), 
        api.get<ReviewedFir[]>(`${ENDPOINTS.STAFF.INWARDS}/reviewed-firs?_t=${timestamp}`),
        api.post<ExpiryCheckResponse>('/calibration/check-expiry', { reference_date: todayStr })
      ]);

      if (pendingEmailsRes.status === 'fulfilled') setPendingEmailCount(pendingEmailsRes.value.data.length);
      if (failedNotifsRes.status === 'fulfilled') setFailedNotificationCount(failedNotifsRes.value.data.failed_notifications.length);
      if (draftsRes.status === 'fulfilled') setAvailableDrafts(draftsRes.value.data || []);
      if (reviewedFirsRes.status === 'fulfilled') setReviewedFirCount(reviewedFirsRes.value.data.length);
      
      if (expiryRes.status === 'fulfilled' && expiryRes.value.data) {
        if ('affected_tables' in expiryRes.value.data && Array.isArray(expiryRes.value.data.affected_tables)) {
            setExpiredStandards(expiryRes.value.data.affected_tables);
        } else if (Array.isArray(expiryRes.value.data)) {
            setExpiredStandards(expiryRes.value.data as unknown as string[]);
        } else {
            setExpiredStandards([]);
        }
      }

    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      if (isInitialLoad) {
        setTimeout(() => setIsLoading(false), 300);
      }
    }
  }, []);

  useEffect(() => {
    fetchDashboardData(true);
    const onFocus = () => fetchDashboardData(false);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchDashboardData]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    const hasActiveTasks = pendingEmailCount > 0 || failedNotificationCount > 0;
    if (hasActiveTasks) {
      interval = setInterval(() => fetchDashboardData(false), 5000);
    } 
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [pendingEmailCount, failedNotificationCount, fetchDashboardData]);

  const quickActions = [
    { 
        label: "Create Inward", 
        description: "Process incoming equipment and SRF items", 
        icon: <ClipboardList className="h-8 w-8" />, 
        route: "create-inward", 
        colorClasses: "bg-gradient-to-r from-blue-500 to-indigo-600", 
        badge: availableDrafts.length 
    },
    { 
        label: "View & Update Inward", 
        description: "Manage existing inward entries and SRFs", 
        icon: <Wrench className="h-8 w-8" />, 
        route: "view-inward", 
        colorClasses: "bg-gradient-to-r from-cyan-500 to-blue-600", 
        badge: reviewedFirCount 
    },
    { label: "Export Inward", description: "Filter and export updated inward records", icon: <Download className="h-8 w-8" />, route: "export-inward", colorClasses: "bg-gradient-to-r from-indigo-500 to-purple-600" },
    { label: "SRF Management", description: "View and manage Service Request Forms", icon: <FileText className="h-8 w-8" />, route: "srfs", colorClasses: "bg-gradient-to-r from-green-500 to-emerald-600" },
    { label: "Jobs Management", description: "Manage calibration jobs and job status", icon: <Briefcase className="h-8 w-8" />, route: "jobs", colorClasses: "bg-gradient-to-r from-teal-500 to-cyan-600"},
    { label: "Manual Calibration", description: "View and manage Service Request Forms", icon: <FileUp className="h-8 w-8" />, route: "manual-calibration", colorClasses: "bg-gradient-to-r from-slate-500 to-slate-700"},
    { label: "View Deviations", description: "Access deviation reports", icon: <AlertTriangle className="h-8 w-8" />, route: "deviations", colorClasses: "bg-gradient-to-r from-orange-500 to-red-500" },
    { label: "Certificates", description: "Generate and manage certificates", icon: <Award className="h-8 w-8" />, route: "certificates", colorClasses: "bg-gradient-to-r from-purple-500 to-indigo-600" },
  ];

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl shadow-lg">
            <Wrench className="h-10 w-10 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Engineer Portal</h1>
            <p className="mt-1 text-base text-gray-600">Manage calibration jobs, certificates, and equipment intake</p>
          </div>
        </div>
      </div>

      {expiredStandards.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6 shadow-lg animate-fade-in relative overflow-hidden">
           <div className="absolute top-0 right-0 p-4 opacity-10"> <AlertTriangle className="w-32 h-32 text-red-600" /> </div>
           <div className="relative z-10 flex items-start gap-4">
            <div className="p-3 bg-red-100 rounded-full flex-shrink-0"> <AlertTriangle className="h-6 w-6 text-red-600" /> </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-red-900 mb-2">Attention: Master Standards Expired</h3>
              <p className="text-red-800 text-sm mb-3 font-medium"> The following master standards have expired. Please be aware that creating new jobs may be restricted in the Jobs module until these are updated by an administrator. </p>
              <div className="flex flex-wrap gap-2 mt-2">
                 {expiredStandards.map((table, idx) => ( <span key={idx} className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-white border border-red-200 text-red-700 shadow-sm"> <XCircle size={12} className="mr-1.5" /> {formatTableName(table)} </span> ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingEmailCount > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 mb-6 shadow-lg animate-fade-in">
          <div className="flex items-start gap-4">
            <Mail className="h-6 w-6 text-orange-600 mt-1 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-orange-900 mb-2">Scheduled Email Reminders ({pendingEmailCount})</h3>
              <p className="text-orange-800 text-sm mb-3">You have {pendingEmailCount} email(s) scheduled. Manage or send them immediately.</p>
              <button onClick={() => setShowDelayedEmails(true)} className="bg-orange-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-orange-700 transition-colors text-sm">Manage Scheduled Emails</button>
            </div>
          </div>
        </div>
      )}

      {failedNotificationCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6 shadow-lg animate-fade-in">
          <div className="flex items-start gap-4">
            <AlertTriangle className="h-6 w-6 text-red-600 mt-1 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-red-900 mb-2">Failed Email Notifications ({failedNotificationCount})</h3>
              <p className="text-red-800 text-sm mb-3">Some email notifications failed to send. Please review and retry them.</p>
              <button onClick={() => setShowFailedNotifications(true)} className="bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 transition-colors text-sm">Review Failed Emails</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 border-b pb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {quickActions.map((action) => ( <ActionButton key={action.label} {...action} onClick={() => navigate(action.route)} /> ))}
        </div>
      </div>

      {showDelayedEmails && <DelayedEmailManager onClose={() => { setShowDelayedEmails(false); fetchDashboardData(true); }} />}
      {showFailedNotifications && <FailedNotificationsManager onClose={() => { setShowFailedNotifications(false); fetchDashboardData(true); }} />}
    </div>
  );
};

const EngineerPortal: React.FC<EngineerPortalProps> = ({ user, onLogout }) => {
  const username = user?.full_name || user?.email || "Engineer";
  const navigate = useNavigate();
  const location = useLocation();
  const [profileUpdateNotifications, setProfileUpdateNotifications] = useState<EngineerNotificationItem[]>([]);
  const [profileUpdateLoading, setProfileUpdateLoading] = useState(false);
  const [profileUpdateError, setProfileUpdateError] = useState<string | null>(null);
  const [showProfileUpdatePopup, setShowProfileUpdatePopup] = useState(false);
  const PROFILE_UPDATE_LAST_SEEN_KEY = "engineer_profile_update_last_seen_id";
  const latestPopupCompany = extractCompanyFromNotification(profileUpdateNotifications[0]);

  const fetchProfileUpdateNotifications = useCallback(async () => {
    setProfileUpdateLoading(true);
    setProfileUpdateError(null);
    try {
      const res = await api.get<EngineerNotificationsResponse>(ENDPOINTS.NOTIFICATIONS);
      const notifications = res.data.notifications || [];
      setProfileUpdateNotifications(notifications);
      const newestId = notifications[0]?.id;
      const lastSeenId = Number(localStorage.getItem(PROFILE_UPDATE_LAST_SEEN_KEY) || "0");
      if (newestId && newestId > lastSeenId) {
        setShowProfileUpdatePopup(true);
        localStorage.setItem(PROFILE_UPDATE_LAST_SEEN_KEY, String(newestId));
      }
    } catch (e: unknown) {
      const maybeMsg =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      setProfileUpdateError(maybeMsg || "Failed to load notifications.");
    } finally {
      setProfileUpdateLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfileUpdateNotifications();
    const interval = setInterval(fetchProfileUpdateNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchProfileUpdateNotifications]);

  useEffect(() => {
    if (location.pathname.includes("/engineer/notifications")) {
      setShowProfileUpdatePopup(false);
    }
  }, [location.pathname]);

  const EngineerNotificationsPage: React.FC = () => (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Notifications</h2>
          <p className="text-gray-500 mt-1 text-sm">Customer profile updates from customer portal.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/engineer")}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
        >
          <ChevronLeft size={16} /> Back
        </button>
      </div>
      {profileUpdateLoading && <div className="text-gray-500">Loading notifications...</div>}
      {!profileUpdateLoading && profileUpdateError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">{profileUpdateError}</div>
      )}
      {!profileUpdateLoading && !profileUpdateError && profileUpdateNotifications.length === 0 && (
        <div className="p-4 bg-white border border-gray-200 rounded-xl text-gray-500">No notifications yet.</div>
      )}
      {!profileUpdateLoading && !profileUpdateError && profileUpdateNotifications.length > 0 && (
        <div className="space-y-3">
          {profileUpdateNotifications.map((n) => (
            <div key={n.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{n.subject}</h3>
                  {n.body_text && <p className="text-sm text-gray-600 mt-1">{n.body_text}</p>}
                </div>
                <span className="text-xs text-gray-500">{new Date(n.created_at).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header
        username={username}
        role="Engineer"
        onLogout={onLogout}
        profilePath="/engineer/profile"
        notificationsPath="/engineer/notifications"
      />
      <main className="flex-1 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 w-full">
        <Routes>
          <Route path="profile" element={<ProfilePage />} />
          <Route path="notifications" element={<EngineerNotificationsPage />} />
          <Route path="/" element={<EngineerDashboard />} />
          <Route path="create-inward" element={<CreateInwardPage />} />
          <Route path="create-inward/form" element={<InwardForm />} />
          <Route path="view-inward" element={<ViewUpdateInward />} />
          <Route path="view-inward/:id" element={<ViewInward />} />
          <Route path="edit-inward/:id" element={<InwardForm initialDraftId={null} />} />
          <Route path="print-stickers/:id" element={<PrintStickers />} />
          <Route path="export-inward" element={<ExportInwardPage />} />
          <Route path="srfs" element={<SrfListPage />} />
          <Route path="srfs/:srfId" element={<SrfDetailPage />} />
          <Route path="jobs" element={<JobsManagementPage />} />
          <Route path="manual-calibration/srf/:srfKey" element={<ManualCalibrationSrfDetailPage />} />
          <Route path="manual-calibration" element={<ManualCalibrationPage />} />
          <Route path="calibration/:inwardId/:equipmentId" element={<CalibrationPage />} />
          <Route path="uncertainty-budget/:inwardId/:equipmentId" element={<UncertaintyBudgetPage />} />
          <Route path="certificates" element={<CertificatesPage />} />
          <Route path="deviations" element={<DeviationPage />} />
          <Route path="deviations/srf/:section/:srfKey" element={<SrfDeviationRecordsPage />} />
          <Route path="deviations/:deviationId" element={<DeviationDetailPage />} />
        </Routes>
      </main>
      <Footer />
      {showProfileUpdatePopup && (
        <div className="fixed inset-0 z-[300] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-red-600 mt-1 flex-shrink-0" />
              <div>
                <h3 className="text-lg font-bold text-gray-900">New Customer Profile Update</h3>
                <p className="text-gray-600 mt-2 text-sm">
                  {latestPopupCompany ? (
                    <>
                      <span className="font-semibold text-gray-900">{latestPopupCompany}</span> updated customer profile details. Open Notifications to review the changes.
                    </>
                  ) : (
                    "A customer updated their profile details. Open Notifications to review the changes."
                  )}
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowProfileUpdatePopup(false)}
                className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowProfileUpdatePopup(false);
                  navigate("/engineer/notifications");
                }}
                className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
              >
                View Notifications
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EngineerPortal;
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  Clock3,
  Filter,
  Search,
  X,
  ArrowLeft,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/config";

export interface CalibrationCertificateReminder {
  certificate_id: number;
  certificate_no: string;
  recommended_cal_due_date: string;
  days_until_due: number;
  customer_id: number;
  customer_name: string;
  customer_email: string;
  inward_id: number;
  srf_no: string;
  inward_eqp_id: number;
  nepl_id: string;
  serial_no: string;
  material_description: string;
  make: string;
  model: string;
  range: string;
  unit: string | null;
  status: string;
  issued_at?: string | null;
}

export interface CalibrationReminderGroup {
  customer_id: number;
  customer_name: string;
  customer_email: string;
  due_count: number;
  certificates: CalibrationCertificateReminder[];
}

export interface CalibrationReminderResponse {
  window_days: number;
  total_due_count: number;
  customer_count: number;
  groups: CalibrationReminderGroup[];
}

interface CalibrationReminderModalProps {
  open: boolean;
  onClose: () => void;
  data: CalibrationReminderResponse | null;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onCustomerSelect?: (customerId: number) => void;
  onOpenExplorer?: () => void;
  title?: string;
}

const LAST_SEEN_KEY = "engineer_calibration_reminder_last_seen_certificate_id";
const API_ENDPOINT = "/calibration-reminders/engineer";

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const daysLabel = (days: number) => {
  if (days === 0) return "Due today";
  if (days === 1) return "1 day left";
  if (days < 0) return `${Math.abs(days)} day(s) overdue`;
  return `${days} days left`;
};

export const CalibrationReminderModal: React.FC<CalibrationReminderModalProps> = ({
  open,
  onClose,
  data,
  loading = false,
  error = null,
  onRefresh,
  onCustomerSelect,
  onOpenExplorer,
  title = "Calibration Due Reminder",
}) => {
  const totalDue = data?.total_due_count ?? 0;
  const customerCount = data?.customer_count ?? 0;
  const windowDays = data?.window_days ?? 7;

  const latestCertificateId = useMemo(() => {
    const all = data?.groups.flatMap((g) => g.certificates) ?? [];
    return all.length > 0 ? Math.max(...all.map((c) => c.certificate_id)) : 0;
  }, [data]);

  const dismiss = () => {
    if (latestCertificateId > 0) {
      localStorage.setItem(LAST_SEEN_KEY, String(latestCertificateId));
    }
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[350] bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-3xl bg-white shadow-2xl border border-gray-200 flex flex-col">
        <div className="px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-3 rounded-2xl bg-amber-100 text-amber-700 shrink-0">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-gray-900">{title}</h2>
                <span className="inline-flex items-center rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-semibold text-amber-700">
                  Next {windowDays} day(s)
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-600">
                {totalDue} certificate(s) due across {customerCount} customer(s).
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={dismiss}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
            aria-label="Close reminder popup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/60">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-600 py-8">
              <Clock3 className="h-4 w-4 animate-pulse" />
              Loading calibration reminders...
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && totalDue === 0 && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
              <p>No certificates are due in the reminder window.</p>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={onOpenExplorer}
                  className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
                >
                  Open calibration explorer
                </button>
              </div>
            </div>
          )}

          {!loading && !error && (data?.groups?.length ?? 0) > 0 && (
            <div className="space-y-4">
              {data!.groups.map((group) => (
                <CustomerSummaryCard
                  key={group.customer_id}
                  group={group}
                  onOpen={() => onCustomerSelect?.(group.customer_id)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 bg-white px-6 py-4 flex items-center justify-between gap-3">
          <div className="text-xs text-gray-500">
            Reminder window: <span className="font-semibold text-gray-700">{windowDays} days</span>
          </div>
          <div className="flex items-center gap-2">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
              >
                Refresh
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-black"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const CustomerSummaryCard: React.FC<{
  group: CalibrationReminderGroup;
  onOpen: () => void;
}> = ({ group, onOpen }) => {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-3xl border border-gray-200 bg-white p-5 shadow-sm text-left transition hover:shadow-md hover:border-indigo-300"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-bold text-gray-900">{group.customer_name}</h3>
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 border border-indigo-100">
              {group.due_count} due
            </span>
          </div>

          <p className="mt-1 text-sm text-gray-500">
            Customer ID: <span className="font-medium text-gray-700">{group.customer_id}</span>
          </p>
          <p className="mt-1 text-sm text-gray-500">{group.customer_email}</p>
        </div>

        <span className="inline-flex items-center rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-indigo-600">
          Open
        </span>
      </div>
    </button>
  );
};

export const CalibrationReminderFloatingButton: React.FC<{
  count: number;
  onOpen: () => void;
  label?: string;
}> = ({ count, onOpen, label }) => {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="fixed bottom-6 right-6 z-[340] inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-xl transition hover:bg-indigo-700"
    >
      <Bell className="h-4 w-4" />
      {label || (count > 0 ? "Calibration Due" : "Open calibration explorer")}
      {count > 0 && (
        <span className="ml-1 inline-flex min-w-6 items-center justify-center rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
};

export const useCalibrationReminder = () => {
  const [data, setData] = useState<CalibrationReminderResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const fetchReminders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<CalibrationReminderResponse>(API_ENDPOINT);
      const payload = res.data || null;
      setData(payload);

      const newestId =
        payload?.groups
          .flatMap((group) => group.certificates)
          .reduce((max, item) => Math.max(max, item.certificate_id), 0) || 0;

      const lastSeen = Number(localStorage.getItem(LAST_SEEN_KEY) || "0");

      if ((payload?.total_due_count ?? 0) > 0 && newestId > lastSeen) {
        setOpen(true);
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      setError(msg || "Failed to load calibration reminders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  const dismiss = () => {
    const newestId =
      data?.groups
        .flatMap((group) => group.certificates)
        .reduce((max, item) => Math.max(max, item.certificate_id), 0) || 0;
    if (newestId > 0) {
      localStorage.setItem(LAST_SEEN_KEY, String(newestId));
    }
    setOpen(false);
  };

  return {
    data,
    loading,
    error,
    open,
    setOpen,
    dismiss,
    refresh: fetchReminders,
  };
};

export const CalibrationReminderWidget: React.FC<{
  onCustomerSelect?: (customerId: number) => void;
}> = ({ onCustomerSelect }) => {
  const navigate = useNavigate();
  const reminder = useCalibrationReminder();
  const total = reminder.data?.total_due_count ?? 0;

  const handleCustomerSelect = (customerId: number) => {
    reminder.dismiss();
    window.setTimeout(() => {
      if (onCustomerSelect) {
        onCustomerSelect(customerId);
      } else {
        navigate(`/engineer/calibration-reminders/${customerId}`);
      }
    }, 0);
  };

  const handleOpenExplorer = () => {
    reminder.dismiss();
    navigate(`/engineer/calibration-reminders/0`);
  };

  return (
    <>
      <CalibrationReminderModal
        open={reminder.open}
        onClose={reminder.dismiss}
        data={reminder.data}
        loading={reminder.loading}
        error={reminder.error}
        onRefresh={reminder.refresh}
        onCustomerSelect={handleCustomerSelect}
        onOpenExplorer={handleOpenExplorer}
      />
      <CalibrationReminderFloatingButton
        count={total}
        onOpen={total > 0 ? () => reminder.setOpen(true) : handleOpenExplorer}
      />
    </>
  );
};

export const CalibrationReminderDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const { customerId } = useParams<{ customerId: string }>();

  const [data, setData] = useState<CalibrationReminderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [lotFilter, setLotFilter] = useState("");
  const [sortBy, setSortBy] = useState<"due_asc" | "due_desc" | "cert_asc" | "nepl_asc">("due_asc");

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await api.get<CalibrationReminderResponse>(API_ENDPOINT);
        setData(res.data);
      } catch (e: unknown) {
        const msg =
          e && typeof e === "object" && "response" in e
            ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
            : null;
        setError(msg || "Failed to load reminder details.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const group = useMemo<CalibrationReminderGroup | undefined>(() => {
    const id = Number(customerId);
    return data?.groups.find((g) => g.customer_id === id);
  }, [data, customerId]);

  const certificates = group?.certificates ?? [];

  const filteredCertificates = useMemo(() => {
    const q = search.trim().toLowerCase();
    const lot = lotFilter.trim().toLowerCase();

    const items = certificates.filter((cert) => {
      const haystack = [
        cert.certificate_no,
        cert.nepl_id,
        cert.serial_no,
        cert.srf_no,
        cert.material_description,
        cert.make,
        cert.model,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const lotHaystack = [cert.nepl_id, cert.certificate_no, cert.srf_no]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !q || haystack.includes(q);
      const matchesLot = !lot || lotHaystack.includes(lot);

      return matchesSearch && matchesLot;
    });

    items.sort((a, b) => {
      switch (sortBy) {
        case "due_desc":
          return b.days_until_due - a.days_until_due;
        case "cert_asc":
          return (a.certificate_no || "").localeCompare(b.certificate_no || "", undefined, {
            numeric: true,
            sensitivity: "base",
          });
        case "nepl_asc":
          return (a.nepl_id || "").localeCompare(b.nepl_id || "", undefined, {
            numeric: true,
            sensitivity: "base",
          });
        case "due_asc":
        default:
          return a.days_until_due - b.days_until_due;
      }
    });

    return items;
  }, [certificates, search, lotFilter, sortBy]);

  return (
    <div className="p-6 md:p-8 bg-white rounded-2xl shadow-lg border border-slate-200">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Calibration due details</h2>
          <p className="text-sm text-slate-600 mt-1">
            {group?.customer_name || "Customer"} · {group?.customer_email || "—"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      </div>

      {loading && <div className="text-sm text-slate-500">Loading...</div>}

      {!loading && error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && !group && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          No customer group found.
        </div>
      )}

      {!loading && group && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <InfoCard label="Customer ID" value={String(group.customer_id)} />
            <InfoCard label="Due count" value={String(group.due_count)} />
            <InfoCard label="Email" value={group.customer_email || "—"} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center gap-2">
              <Search className="h-4 w-4 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full outline-none text-sm"
                placeholder="Search certificate, NEPL, serial, SRF..."
              />
            </div>

            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <input
                value={lotFilter}
                onChange={(e) => setLotFilter(e.target.value)}
                className="w-full outline-none text-sm"
                placeholder="Lot filter e.g. 26001-1"
              />
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none"
            >
              <option value="due_asc">Sort: Due date (earliest)</option>
              <option value="due_desc">Sort: Due date (latest)</option>
              <option value="cert_asc">Sort: Certificate no</option>
              <option value="nepl_asc">Sort: NEPL ID</option>
            </select>
          </div>

          <div className="mb-4 text-sm text-slate-600">
            Showing <span className="font-semibold">{filteredCertificates.length}</span> of{" "}
            <span className="font-semibold">{certificates.length}</span> certificate(s)
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-slate-600">
                  <th className="px-3 py-2">Certificate</th>
                  <th className="px-3 py-2">NEPL</th>
                  <th className="px-3 py-2">Serial No</th>
                  <th className="px-3 py-2">Due Date</th>
                  <th className="px-3 py-2">Days Left</th>
                  <th className="px-3 py-2">Issued</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredCertificates.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                      No matching certificates found.
                    </td>
                  </tr>
                ) : (
                  filteredCertificates.map((cert) => (
                    <tr key={cert.certificate_id} className="border-t border-slate-100">
                      <td className="px-3 py-3 font-medium text-slate-900">{cert.certificate_no}</td>
                      <td className="px-3 py-3 text-slate-700">{cert.nepl_id || "—"}</td>
                      <td className="px-3 py-3 text-slate-700">{cert.serial_no || "—"}</td>
                      <td className="px-3 py-3 text-slate-700">{formatDate(cert.recommended_cal_due_date)}</td>
                      <td className="px-3 py-3 text-slate-700">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 border border-amber-100">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {cert.days_until_due}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{formatDate(cert.issued_at)}</td>
                      <td className="px-3 py-3 text-slate-700">{cert.status || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

const InfoCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
    <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">{label}</div>
    <div className="mt-1 text-sm font-semibold text-gray-900 break-words">{value}</div>
  </div>
);

export default CalibrationReminderWidget;

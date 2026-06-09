import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  CalendarDays,
  AlertTriangle,
  X,
  Search,
  Filter,
  ArrowUpDown,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
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
  unit: string;
  status: string;
  issued_at?: string | null;
  customer_dc_no?: string;
  customer_dc_date?: string;
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

type SortMode = "due_asc" | "due_desc" | "cert_asc" | "nepl_asc" | "serial_asc" | "srf_asc";

const LAST_SEEN_KEY = "customer_calibration_reminder_last_seen_certificate_id";

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const daysLabel = (days: number) => {
  if (days === 0) return "Due today";
  if (days === 1) return "1 day left";
  if (days < 0) return `${Math.abs(days)} day(s) overdue`;
  return `${days} days left`;
};

const normalize = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9-]/g, "");

const InfoBox: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3">
    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
    <div className="mt-1 text-sm font-medium text-gray-900 break-words">{value}</div>
  </div>
);

const CustomerCertificateCard: React.FC<{ cert: CalibrationCertificateReminder }> = ({ cert }) => {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-bold text-gray-900">{cert.certificate_no}</h4>
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 border border-amber-100">
              {daysLabel(cert.days_until_due)}
            </span>
          </div>
          <p className="mt-1 text-sm text-red-500">
            Due date:{" "}
            <span className="font-semibold text-red-500">
              {formatDate(cert.recommended_cal_due_date)}
            </span>
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
          <CalendarDays className="h-4 w-4 text-gray-500" />
          <span>{cert.days_until_due} day(s)</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
        <InfoBox label="DC No" value={cert.customer_dc_no || "—"}/>
        <InfoBox label="DC Date" value={formatDate(cert.customer_dc_date)}/>
        <InfoBox label="Material" value={cert.material_description || "—"} />
        <InfoBox label="Serial No" value={cert.serial_no || "—"} />  
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span className="rounded-full bg-gray-100 px-2.5 py-1 border border-gray-200">
          {cert.make || "—"}
        </span>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 border border-gray-200">
          {cert.model || "—"}
        </span>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 border border-gray-200">
          {cert.range || "—"} {cert.unit || ""}
        </span>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 border border-gray-200 text-green-900">
          Issued Date: {formatDate(cert.issued_at)}
        </span>
      </div>
    </div>
  );
};

export const CustomerCalibrationReminderWidget: React.FC = () => {
  const { user } = useAuth();
  const customerId = user?.customer_id;

  const [data, setData] = useState<CalibrationReminderResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [lotFilter, setLotFilter] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("due_asc");

  const fetchReminders = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await api.get<CalibrationReminderResponse>(
        `/calibration-reminders/customer/${customerId}`,
        {
          params: { days_ahead: 45 },
        }
      );

      const payload = res.data || null;
      setData(payload);

      const newestId =
        payload?.groups
          .flatMap((g) => g.certificates)
          .reduce((max, cert) => Math.max(max, cert.certificate_id), 0) || 0;

      const lastSeen = Number(localStorage.getItem(LAST_SEEN_KEY) || "0");

      if ((payload?.total_due_count ?? 0) > 0 && newestId > lastSeen) {
        setOpen(true);
      }
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      setError(msg || "Failed to load calibration reminders.");
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  const dismiss = () => {
    const newestId =
      data?.groups
        .flatMap((g) => g.certificates)
        .reduce((max, cert) => Math.max(max, cert.certificate_id), 0) || 0;

    if (newestId > 0) {
      localStorage.setItem(LAST_SEEN_KEY, String(newestId));
    }
    setOpen(false);
  };

  const totalDue = data?.total_due_count ?? 0;
  const customerGroup = data?.groups?.[0];
  const windowDays = data?.window_days ?? 45;

  const filteredCertificates = useMemo(() => {
    const certs = customerGroup?.certificates ?? [];
    const q = normalize(search.trim());
    const lot = normalize(lotFilter.trim());

    const filtered = certs.filter((cert) => {
      const searchHaystack = normalize(
        [
          cert.certificate_no,
          cert.nepl_id,
          cert.serial_no,
          cert.srf_no,
          cert.material_description,
          cert.make,
          cert.model,
          cert.range,
          cert.unit || "",
          cert.status,
        ]
          .filter(Boolean)
          .join(" ")
      );

      const lotHaystack = normalize(
        [cert.nepl_id, cert.certificate_no, cert.srf_no, cert.serial_no]
          .filter(Boolean)
          .join(" ")
      );

      const matchesSearch = !q || searchHaystack.includes(q);
      const matchesLot = !lot || lotHaystack.includes(lot);

      return matchesSearch && matchesLot;
    });

    filtered.sort((a, b) => {
      switch (sortMode) {
        case "due_desc":
          return b.days_until_due - a.days_until_due;
        case "cert_asc":
          return a.certificate_no.localeCompare(b.certificate_no, undefined, {
            numeric: true,
            sensitivity: "base",
          });
        case "nepl_asc":
          return a.nepl_id.localeCompare(b.nepl_id, undefined, {
            numeric: true,
            sensitivity: "base",
          });
        case "serial_asc":
          return a.serial_no.localeCompare(b.serial_no, undefined, {
            numeric: true,
            sensitivity: "base",
          });
        case "srf_asc":
          return a.srf_no.localeCompare(b.srf_no, undefined, {
            numeric: true,
            sensitivity: "base",
          });
        case "due_asc":
        default:
          return a.days_until_due - b.days_until_due;
      }
    });

    return filtered;
  }, [customerGroup, search, lotFilter, sortMode]);

  return (
    <>
      {totalDue > 0 && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-[340] inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-xl transition hover:bg-indigo-700"
        >
          <Bell className="h-4 w-4" />
          Calibration Due
          <span className="ml-1 inline-flex min-w-6 items-center justify-center rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold">
            {totalDue > 99 ? "99+" : totalDue}
          </span>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[350] bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-3xl bg-white shadow-2xl border border-gray-200 flex flex-col">
            <div className="px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-3 rounded-2xl bg-amber-100 text-amber-700 shrink-0">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-bold text-gray-900">Calibration Due Reminder</h2>
                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-semibold text-amber-700">
                      Next {windowDays} day(s)
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    {totalDue} certificate(s) due for your account.
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
                <div className="text-sm text-gray-600 py-8">
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
                  No certificates are due in the reminder window.
                </div>
              )}

              {!loading && !error && customerGroup && (
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
                    <div className="px-5 py-4 border-b border-gray-200">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-bold text-gray-900">
                          {customerGroup.customer_name}
                        </h3>
                        <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 border border-indigo-100">
                          {customerGroup.due_count} due
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">{customerGroup.customer_email}</p>
                    </div>

                    <div className="p-5 border-b border-gray-200 bg-gray-50/40">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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

                        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center gap-2">
                          <ArrowUpDown className="h-4 w-4 text-gray-400" />
                          <select
                            value={sortMode}
                            onChange={(e) => setSortMode(e.target.value as SortMode)}
                            className="w-full outline-none text-sm bg-transparent"
                          >
                            <option value="due_asc">Due date (earliest)</option>
                            <option value="due_desc">Due date (latest)</option>
                            <option value="cert_asc">Certificate no</option>
                            <option value="nepl_asc">NEPL ID</option>
                            <option value="serial_asc">Serial no</option>
                            <option value="srf_asc">SRF no</option>
                          </select>
                        </div>
                      </div>

                      <div className="mt-3 text-xs text-gray-500">
                        Showing <span className="font-semibold text-gray-700">{filteredCertificates.length}</span>{" "}
                        of <span className="font-semibold text-gray-700">{customerGroup.certificates.length}</span>{" "}
                        certificate(s)
                      </div>
                    </div>

                    <div className="border-t border-gray-200 bg-gray-50/70 p-4 space-y-3">
                      {filteredCertificates.length === 0 ? (
                        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
                          No matching certificates found.
                        </div>
                      ) : (
                        filteredCertificates.map((cert) => (
                          <CustomerCertificateCard key={cert.certificate_id} cert={cert} />
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-gray-200 bg-white px-6 py-4 flex items-center justify-between gap-3">
              <div className="text-xs text-gray-500">
                Reminder window: <span className="font-semibold text-gray-700">{windowDays} days</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchReminders}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
                >
                  Refresh
                </button>
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
      )}
    </>
  );
};

export default CustomerCalibrationReminderWidget;
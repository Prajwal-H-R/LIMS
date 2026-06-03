import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, ChevronRight, Loader2, Search } from "lucide-react";
import { api } from "../api/config";
import {
  CalibrationReminderGroup,
  CalibrationReminderResponse,
} from "./CalibrationReminder";

type SortMode =
  | "due_asc"
  | "due_desc"
  | "cert_asc"
  | "nepl_asc"
  | "serial_asc"
  | "srf_asc";

type DaysMode = "7" | "14" | "30" | "45" | "60" | "90" | "custom";

const SORT_MODE_MAP: Record<
  SortMode,
  {
    sort_by: "due_date" | "certificate_no" | "nepl_id" | "serial_no" | "srf_no";
    sort_order: "asc" | "desc";
    label: string;
  }
> = {
  due_asc: { sort_by: "due_date", sort_order: "asc", label: "Sort: Due date (earliest)" },
  due_desc: { sort_by: "due_date", sort_order: "desc", label: "Sort: Due date (latest)" },
  cert_asc: { sort_by: "certificate_no", sort_order: "asc", label: "Sort: Certificate no" },
  nepl_asc: { sort_by: "nepl_id", sort_order: "asc", label: "Sort: NEPL ID" },
  serial_asc: { sort_by: "serial_no", sort_order: "asc", label: "Sort: Serial no" },
  srf_asc: { sort_by: "srf_no", sort_order: "asc", label: "Sort: SRF no" },
};

const DAYS_PRESETS: Array<{ value: Exclude<DaysMode, "custom">; label: string }> = [
  { value: "7", label: "Next 7 days" },
  { value: "14", label: "Next 14 days" },
  { value: "30", label: "Next 30 days" },
  { value: "45", label: "Next 45 days" },
  { value: "60", label: "Next 60 days" },
  { value: "90", label: "Next 90 days" },
];

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

const daysUntilLabel = (days?: number | null) => {
  if (days === null || days === undefined) return "—";
  if (days === 0) return "Due today";
  if (days === 1) return "1 day left";
  if (days < 0) return `${Math.abs(days)} day(s) overdue`;
  return `${days} days left`;
};

const InfoCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
    <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">{label}</div>
    <div className="mt-1 text-sm font-semibold text-gray-900 break-words">{value}</div>
  </div>
);

const CustomerSummaryCard: React.FC<{
  group: CalibrationReminderGroup;
  onOpen: () => void;
}> = ({ group, onOpen }) => {
  const nextDue =
    group.certificates.length > 0
      ? Math.min(...group.certificates.map((cert) => cert.days_until_due))
      : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-3xl border border-gray-200 bg-white p-5 shadow-sm text-left transition hover:shadow-md hover:border-indigo-300"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-bold text-gray-900 truncate">{group.customer_name}</h3>
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 border border-indigo-100">
              {group.due_count} due
            </span>
          </div>

          <p className="mt-1 text-sm text-gray-500">
            Customer ID: <span className="font-medium text-gray-700">{group.customer_id}</span>
          </p>
          <p className="mt-1 text-sm text-gray-500 truncate">{group.customer_email}</p>
          <p className="mt-2 text-xs text-gray-500">
            Next due: <span className="font-semibold text-gray-700">{daysUntilLabel(nextDue)}</span>
          </p>
        </div>

        <span className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-indigo-600 shrink-0">
          Open
          <ChevronRight className="h-4 w-4" />
        </span>
      </div>
    </button>
  );
};

const CalibrationReminderDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const { customerId } = useParams<{ customerId: string }>();

  const [data, setData] = useState<CalibrationReminderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [daysMode, setDaysMode] = useState<DaysMode>("45");
  const [customDays, setCustomDays] = useState<number>(45);
  const [sortMode, setSortMode] = useState<SortMode>("due_asc");

  const customerIdNum = useMemo(() => {
    const parsed = Number(customerId);
    return Number.isFinite(parsed) ? parsed : null;
  }, [customerId]);

  const isExplorerMode = customerIdNum === 0;

  const effectiveDaysAhead = useMemo(() => {
    if (daysMode === "custom") {
      return Math.max(1, Math.min(365, Number(customDays) || 7));
    }
    return Number(daysMode);
  }, [daysMode, customDays]);

  const loadReminders = useCallback(async () => {
    if (customerIdNum === null) {
      setError("Invalid customer id.");
      setLoading(false);
      return;
    }

    const sortCfg = SORT_MODE_MAP[sortMode];
    const endpoint = isExplorerMode
      ? "/calibration-reminders/engineer"
      : `/calibration-reminders/customer/${customerIdNum}`;

    const params: Record<string, string | number> = {
      days_ahead: effectiveDaysAhead,
      sort_by: sortCfg.sort_by,
      sort_order: sortCfg.sort_order,
    };

    const trimmedSearch = search.trim();
    if (trimmedSearch) {
      params.search = trimmedSearch;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await api.get<CalibrationReminderResponse>(endpoint, { params });
      setData(res.data || null);
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      setError(msg || "Failed to load reminder details.");
    } finally {
      setLoading(false);
    }
  }, [customerIdNum, effectiveDaysAhead, isExplorerMode, search, sortMode]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadReminders();
    }, 300);

    return () => window.clearTimeout(timer);
  }, [loadReminders]);

  const currentGroup = useMemo<CalibrationReminderGroup | undefined>(() => {
    if (isExplorerMode || customerIdNum === null || !data?.groups?.length) return undefined;
    return data.groups.find((g) => g.customer_id === customerIdNum);
  }, [data, customerIdNum, isExplorerMode]);

  const explorerGroups = isExplorerMode ? data?.groups ?? [] : [];
  const certificates = currentGroup?.certificates ?? [];
  const windowDays = data?.window_days ?? effectiveDaysAhead;

  const pageTitle = isExplorerMode ? "Calibration explorer" : "Calibration due details";
  const pageSubtitle = isExplorerMode
    ? `Browse customers with due certificates in the next ${windowDays} day(s).`
    : `${currentGroup?.customer_name || "Customer"} · ${currentGroup?.customer_email || "—"}`;

  const openCustomerDetails = (id: number) => {
    navigate(`/engineer/calibration-reminders/${id}`);
  };

  return (
    <div className="p-6 md:p-8 bg-white rounded-2xl shadow-lg border border-slate-200">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{pageTitle}</h2>
          <p className="text-sm text-slate-600 mt-1">{pageSubtitle}</p>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {isExplorerMode ? (
          <>
            <InfoCard label="Window" value={`${windowDays} days`} />
            <InfoCard label="Companies" value={String(data?.customer_count ?? 0)} />
            <InfoCard label="Total due" value={String(data?.total_due_count ?? 0)} />
          </>
        ) : (
          <>
            <InfoCard label="Customer ID" value={String(currentGroup?.customer_id ?? customerIdNum ?? 0)} />
            <InfoCard label="Due count" value={String(data?.total_due_count ?? 0)} />
            <InfoCard label="Email" value={currentGroup?.customer_email || "—"} />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center gap-2">
          <Search className="h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full outline-none text-sm"
            placeholder={
              isExplorerMode
                ? "Search company, certificate, NEPL, serial..."
                : "Search certificate, NEPL, serial, SRF..."
            }
          />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <select
            value={daysMode}
            onChange={(e) => setDaysMode(e.target.value as DaysMode)}
            className="w-full outline-none text-sm bg-transparent"
          >
            {DAYS_PRESETS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
            <option value="custom">Custom days</option>
          </select>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          {daysMode === "custom" ? (
            <input
              type="number"
              min={1}
              max={365}
              value={customDays}
              onChange={(e) => setCustomDays(Number(e.target.value))}
              className="w-full outline-none text-sm"
              placeholder="Enter custom days (1-365)"
            />
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <CalendarDays className="h-4 w-4 text-gray-400" />
              {SORT_MODE_MAP[sortMode].label}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-1 gap-3 mb-6">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="w-full outline-none text-sm bg-transparent"
          >
            <option value="due_asc">{SORT_MODE_MAP.due_asc.label}</option>
            <option value="due_desc">{SORT_MODE_MAP.due_desc.label}</option>
            <option value="cert_asc">{SORT_MODE_MAP.cert_asc.label}</option>
            <option value="nepl_asc">{SORT_MODE_MAP.nepl_asc.label}</option>
            <option value="serial_asc">{SORT_MODE_MAP.serial_asc.label}</option>
            <option value="srf_asc">{SORT_MODE_MAP.srf_asc.label}</option>
          </select>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-slate-500 text-sm py-8 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading certificates...
        </div>
      )}

      {!loading && error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm mb-4">
          {error}
        </div>
      )}

      {!loading && !error && isExplorerMode && explorerGroups.length === 0 && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          No customer groups found for the selected window. Try 10, 14, or custom days.
        </div>
      )}

      {!loading && !error && !isExplorerMode && !currentGroup && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          No matching certificates found for the selected days or search filter.
        </div>
      )}

      {!loading && !error && isExplorerMode && explorerGroups.length > 0 && (
        <div className="space-y-4">
          <div className="mb-2 text-sm text-slate-600">
            Showing <span className="font-semibold">{explorerGroups.length}</span> customer(s) with due certificates.
          </div>
          {explorerGroups.map((group) => (
            <CustomerSummaryCard
              key={group.customer_id}
              group={group}
              onOpen={() => openCustomerDetails(group.customer_id)}
            />
          ))}
        </div>
      )}

      {!loading && !error && !isExplorerMode && currentGroup && (
        <>
          <div className="mb-4 text-sm text-slate-600">
            Showing <span className="font-semibold">{certificates.length}</span> of{" "}
            <span className="font-semibold">{data?.total_due_count ?? 0}</span> certificate(s) in{" "}
            <span className="font-semibold">{windowDays}</span> day(s)
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-slate-600">
                  <th className="px-3 py-2">Certificate</th>
                  <th className="px-3 py-2">NEPL</th>
                  <th className="px-3 py-2">Material</th>
                  <th className="px-3 py-2">Serial No</th>
                  <th className="px-3 py-2">Due Date</th>
                  <th className="px-3 py-2">Days Left</th>
                  <th className="px-3 py-2">Issued Date</th>
                </tr>
              </thead>
              <tbody>
                {certificates.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                      No matching certificates found.
                    </td>
                  </tr>
                ) : (
                  certificates.map((cert) => (
                    <tr key={cert.certificate_id} className="border-t border-slate-100">
                      <td className="px-3 py-3 font-medium text-slate-900">{cert.certificate_no}</td>
                      <td className="px-3 py-3 text-slate-700">{cert.nepl_id || "—"}</td>
                      <td className="px-3 py-3 text-slate-700">{cert.material_description || "—"}</td>
                      <td className="px-3 py-3 text-slate-700">{cert.serial_no || "—"}</td>
                      <td className="px-3 py-3 text-slate-700">{formatDate(cert.recommended_cal_due_date)}</td>
                      <td className="px-3 py-3 text-slate-700">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 border border-amber-100">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {cert.days_until_due}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{formatDate(cert.issued_at)}</td>
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

export default CalibrationReminderDetailsPage;

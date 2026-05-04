import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronLeft, ChevronDown, ChevronRight, Loader2, Eye } from "lucide-react";
import { api, ENDPOINTS } from "../api/config";

export interface CustomerDeviationRow {
  deviation_id: number;
  inward_id: number;
  inward_eqp_id: number;
  srf_no?: string | null;
  customer_dc_no?: string | null;
  customer_dc_date?: string | null;
  nepl_id?: string | null;
  make?: string | null;
  model?: string | null;
  serial_no?: string | null;
  job_id?: number | null;
  step_percent?: number | null;
  deviation_percent?: number | null;
  deviation_type?: string | null;
  status: string;
  engineer_remarks?: string | null;
  customer_decision?: string | null;
  report?: string | null;
  created_at?: string | null;
}

const CustomerDeviationsPage: React.FC = () => {
  const formatDcDate = (value?: string | null) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };
  const navigate = useNavigate();
  const [rows, setRows] = useState<CustomerDeviationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDeviationSection, setActiveDeviationSection] = useState<"OOT" | "MANUAL">("OOT");
  const [expandedSrfGroups, setExpandedSrfGroups] = useState<Record<string, boolean>>({});
  const [expandedNeplGroups, setExpandedNeplGroups] = useState<Record<string, boolean>>({});
  const ootRows = React.useMemo(
    () => rows.filter((r) => (r.deviation_type || "OOT").toUpperCase() === "OOT"),
    [rows]
  );
  const manualRows = React.useMemo(
    () => rows.filter((r) => (r.deviation_type || "").toUpperCase() === "MANUAL"),
    [rows]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<CustomerDeviationRow[]>(ENDPOINTS.PORTAL.DEVIATIONS);
      const data = res.data || [];
      setRows(data);
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      setError(msg || "Could not load deviations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSrfGroup = (srf: string) => {
    setExpandedSrfGroups((prev) => ({
      ...prev,
      [srf]: !(prev[srf] ?? false),
    }));
  };

  const toggleNeplGroup = (groupKey: string) => {
    setExpandedNeplGroups((prev) => ({
      ...prev,
      [groupKey]: !(prev[groupKey] ?? false),
    }));
  };

  const renderSection = (
    sectionKey: string,
    title: string,
    sectionRows: CustomerDeviationRow[],
    emptyText: string
  ) => {
    const groupedBySrf = sectionRows.reduce<Record<string, CustomerDeviationRow[]>>((acc, row) => {
      const key = row.srf_no?.trim() || "Without SRF";
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});
    const srfKeys = Object.keys(groupedBySrf).sort((a, b) => {
      if (a === "Without SRF") return 1;
      if (b === "Without SRF") return -1;
      return b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" });
    });

    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
          {title} ({sectionRows.length})
        </div>
        {srfKeys.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm border border-slate-200 rounded-lg bg-white">{emptyText}</div>
        ) : (
          srfKeys.map((srf) => (
            <div key={`${sectionKey}-${srf}`} className="border border-slate-200 rounded-xl overflow-hidden">
              {(() => {
                const first = (groupedBySrf[srf] || [])[0];
                const srfRows = groupedBySrf[srf] || [];
                const srfGroupKey = `${sectionKey}__SRF__${srf}`;
                const isSrfExpanded = expandedSrfGroups[srfGroupKey] ?? false;
                return (
              <button
                type="button"
                onClick={() => toggleSrfGroup(srfGroupKey)}
                className="w-full px-4 py-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-left hover:bg-slate-200/60"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  {isSrfExpanded ? (
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-500" />
                  )}
                  <h3 className="font-medium text-slate-600">SRF: {srf}</h3>
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
                <span className="text-xs bg-white border border-slate-300 px-2 py-0.5 rounded-full text-slate-600">
                  {srfRows.length} deviations
                </span>
              </button>
                );
              })()}
              {(expandedSrfGroups[`${sectionKey}__SRF__${srf}`] ?? false) && (
                <div className="bg-white p-3 space-y-3">
                  {Object.entries(
                    (groupedBySrf[srf] || []).reduce<Record<string, CustomerDeviationRow[]>>((acc, row) => {
                      const neplKey = row.nepl_id?.trim() || "Without NEPL ID";
                      if (!acc[neplKey]) acc[neplKey] = [];
                      acc[neplKey].push(row);
                      return acc;
                    }, {})
                  )
                    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
                    .map(([neplKey, neplRows]) => {
                      const groupKey = `${sectionKey}__${srf}__${neplKey}`;
                      const isNeplExpanded = expandedNeplGroups[groupKey] ?? false;
                      const statusSet = Array.from(
                        new Set(neplRows.map((row) => (row.status || "OPEN").toUpperCase()))
                      );
                      const neplStatus = statusSet.length === 1 ? statusSet[0] : "MIXED";
                      return (
                        <div key={groupKey} className="border border-slate-200 rounded-lg overflow-hidden">
                          <button
                            type="button"
                            onClick={() => toggleNeplGroup(groupKey)}
                            className="w-full px-3 py-2 bg-white hover:bg-slate-50 border-b border-slate-100 flex items-center justify-between text-left"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              {isNeplExpanded ? (
                                <ChevronDown className="h-4 w-4 text-slate-500" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-slate-500" />
                              )}
                              <span className="font-medium text-slate-800">NEPL ID: {neplKey}</span>
                              <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-medium text-xs">
                                {neplStatus}
                              </span>
                            </div>
                            <span className="text-xs bg-slate-100 border border-slate-300 px-2 py-0.5 rounded-full text-slate-600">
                              {neplRows.length} record{neplRows.length > 1 ? "s" : ""}
                            </span>
                          </button>

                          {isNeplExpanded && (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                  <tr className="text-left text-slate-600">
                                    <th className="px-3 py-2 min-w-[220px]">Equipment</th>
                                    <th className="px-3 py-2 min-w-[220px]">Engineer remarks</th>
                                    <th className="px-3 py-2 min-w-[240px]">Your decision</th>
                                    <th className="px-3 py-2 w-[120px]">Action</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {neplRows.map((row) => (
                                    <tr key={row.deviation_id} className="border-t border-slate-100 align-top">
                                      <td className="px-3 py-3">
                                        <div className="font-semibold text-slate-900">{row.nepl_id || "Equipment"}</div>
                                        <div className="text-xs text-slate-600 mt-0.5">
                                          {[row.make, row.model, row.serial_no].filter(Boolean).join(" · ") || "—"}
                                        </div>
                                        <div className="mt-1 text-xs">
                                          {row.job_id != null ? <span className="text-slate-500">Job #{row.job_id}</span> : <span className="text-slate-400">Job —</span>}
                                        </div>
                                      </td>
                                      <td className="px-3 py-3 text-slate-700 whitespace-pre-wrap">
                                        {row.engineer_remarks || "—"}
                                      </td>
                                      <td className="px-3 py-3 text-slate-700 whitespace-pre-wrap">
                                        {row.customer_decision?.trim() || "—"}
                                      </td>
                                      <td className="px-3 py-3">
                                        <button
                                          type="button"
                                          onClick={() => navigate(`/customer/deviations/${row.deviation_id}`)}
                                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-60"
                                        >
                                          <Eye className="h-4 w-4" />
                                          Open
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    );
  };

  return (
    <div className="p-6 md:p-8 bg-white rounded-2xl shadow-lg border border-slate-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
          <AlertTriangle className="h-8 w-8 text-amber-600" />
          Deviations
        </h2>
        <Link
          to="/customer"
          className="text-indigo-600 hover:text-indigo-800 font-semibold text-sm flex items-center gap-1"
        >
          <ChevronLeft className="h-4 w-4" /> Back to Dashboard
        </Link>
      </div>

      <p className="text-sm text-slate-600 mb-6">
        Review out-of-tolerance or recorded deviations for your equipment. Submit your decision for each line;
        your engineering team will see it in the engineer portal.
      </p>

      {loading && (
        <div className="flex items-center gap-2 text-slate-500 text-sm py-8 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading deviations...
        </div>
      )}

      {!loading && error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm mb-4">{error}</div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="text-center py-12 text-slate-500 text-sm">No deviations are linked to your account.</div>
      )}

      {!loading && rows.length > 0 && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setActiveDeviationSection("OOT")}
              className={`rounded-xl border p-4 text-left transition-colors ${
                activeDeviationSection === "OOT"
                  ? "border-red-200 bg-red-50"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <h3 className="font-bold text-red-800">OOT - Out of Tolerance</h3>
              <p className="text-sm text-red-700 mt-1">Grouped by SRF number. {ootRows.length} record(s).</p>
            </button>
            <button
              type="button"
              onClick={() => setActiveDeviationSection("MANUAL")}
              className={`rounded-xl border p-4 text-left transition-colors ${
                activeDeviationSection === "MANUAL"
                  ? "border-slate-300 bg-slate-50"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <h3 className="font-bold text-slate-800">Manual Deviation</h3>
              <p className="text-sm text-slate-600 mt-1">Grouped by SRF number. {manualRows.length} record(s).</p>
            </button>
          </div>

          {activeDeviationSection === "OOT"
            ? renderSection("OOT", "OOT - Out of Tolerance", ootRows, "No OOT deviations found.")
            : renderSection("MANUAL", "Manual Deviation", manualRows, "No manual deviations found.")}
        </div>
      )}
    </div>
  );
};

export default CustomerDeviationsPage;

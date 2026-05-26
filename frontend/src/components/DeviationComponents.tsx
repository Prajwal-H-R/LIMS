import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import {
  ChevronLeft, Loader2, Eye, Save, FileText,
  Paperclip, ExternalLink, EyeOff
} from "lucide-react";
import { api, ENDPOINTS } from "../api/config";

// --- INTERFACES ---
export interface DeviationDetailResponse {
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
  tool_status?: string | null;
  engineer_remarks?: string | null;
  customer_decision?: string | null;
  report?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  hide_customer_visibility?: boolean;
  deviation_type?: string | null;
  attachments: {
    id: number;
    file_name: string;
    file_type?: string | null;
    file_url: string;
    created_at: string;
  }[];
  oot_steps?: {
    step_percent?: number | null;
    set_torque?: number | null;
    corrected_mean?: number | null;
    deviation_percent?: number | null;
  }[];
}

export interface OOTDeviationItem {
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
  oot_steps?: {
    step_percent?: number | null;
    set_torque?: number | null;
    corrected_mean?: number | null;
    deviation_percent?: number | null;
  }[];
}

// --- HELPER FUNCTIONS ---
const formatCalibrationStatus = (value?: string | null) => {
  if (!value) return "Not Available";
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

const formatDcDate = (value?: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const ALL_STAFF_DEVIATIONS_ENDPOINT = "/deviations/all-staff";

// ============================================================
// DEVIATION PAGE COMPONENT
// ============================================================
export const DeviationPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<OOTDeviationItem[]>([]);
  const [activeDeviationSection, setActiveDeviationSection] = useState<
    "OOT" | "MANUAL"
  >("OOT");

  const loadDeviations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<OOTDeviationItem[]>(
        ALL_STAFF_DEVIATIONS_ENDPOINT
      );
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? (
              e as {
                response?: { data?: { detail?: string } };
              }
            ).response?.data?.detail
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
    () =>
      items.filter((item) => item.deviation_type.toUpperCase() === "OOT"),
    [items]
  );

  const manualItems = useMemo(
    () =>
      items.filter(
        (item) => item.deviation_type.toUpperCase() === "MANUAL"
      ),
    [items]
  );

  const groupedBySrf = useMemo(() => {
    return ootItems.reduce<Record<string, OOTDeviationItem[]>>(
      (acc, item) => {
        const key = item.srf_no?.trim() || "Without SRF";
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
      },
      {}
    );
  }, [ootItems]);

  const groupKeys = useMemo(() => {
    const keys = Object.keys(groupedBySrf);
    return keys.sort((a, b) => {
      if (a === "Without SRF") return 1;
      if (b === "Without SRF") return -1;
      return b.localeCompare(a, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
  }, [groupedBySrf]);

  const groupedManualBySrf = useMemo(() => {
    return manualItems.reduce<Record<string, OOTDeviationItem[]>>(
      (acc, item) => {
        const key = item.srf_no?.trim() || "Without SRF";
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
      },
      {}
    );
  }, [manualItems]);

  const manualGroupKeys = useMemo(() => {
    const keys = Object.keys(groupedManualBySrf);
    return keys.sort((a, b) => {
      if (a === "Without SRF") return 1;
      if (b === "Without SRF") return -1;
      return b.localeCompare(a, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
  }, [groupedManualBySrf]);

  const openSrfRecords = (
    section: "OOT" | "MANUAL",
    srfKey: string
  ) => {
    const encoded = encodeURIComponent(srfKey);
    const itemsToPass =
      section === "OOT" ? ootItems : manualItems;
    navigate(
      `/engineer/deviations/srf/${section}/${encoded}`,
      { state: { items: itemsToPass } }
    );
  };

  return (
    <div className="p-8 bg-white rounded-2xl shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          View Deviations
        </h2>
        <button
          type="button"
          onClick={() => navigate("/engineer")}
          className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:text-gray-900 font-medium text-sm transition-all shadow-sm"
        >
          <ChevronLeft size={16} />
          <span>Back to Dashboard</span>
        </button>
      </div>

      {/* Section Toggle */}
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
          <h3 className="font-bold text-red-800">
            Deviation - OOT
          </h3>
          <p className="text-sm text-red-700 mt-1">
            Grouped by SRF number. {ootItems.length} record(s).
          </p>
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
          <h3 className="font-bold text-gray-800">
            Deviation - NC
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Grouped by SRF number. {manualItems.length} record(s).
          </p>
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-gray-600 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading deviations...
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* OOT Empty */}
      {!loading &&
        !error &&
        activeDeviationSection === "OOT" &&
        groupKeys.length === 0 && (
          <div className="p-8 text-center text-gray-500 border border-gray-200 rounded-xl">
            No OOT entries found.
          </div>
        )}

      {/* OOT List */}
      {!loading &&
        !error &&
        activeDeviationSection === "OOT" &&
        groupKeys.length > 0 && (
          <div className="space-y-4">
            {groupKeys.map((srfKey) => {
              const srfItems = groupedBySrf[srfKey] || [];
              const first = srfItems[0];
              return (
                <div
                  key={srfKey}
                  className="border border-gray-200 rounded-xl overflow-hidden"
                >
                  <div className="w-full bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-medium text-slate-600">
                        SRF: {srfKey}
                      </div>
                      {(first?.customer_dc_no ||
                        first?.customer_dc_date) && (
                        <>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 font-semibold">
                            DC No: {first?.customer_dc_no || "—"}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold">
                            DC Date:{" "}
                            {formatDcDate(first?.customer_dc_date)}
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

      {/* MANUAL Empty */}
      {!loading &&
        !error &&
        activeDeviationSection === "MANUAL" &&
        manualGroupKeys.length === 0 && (
          <div className="mt-6 p-8 text-center text-gray-500 border border-gray-200 rounded-xl">
            No Manual deviation entries found.
          </div>
        )}

      {/* MANUAL List */}
      {!loading &&
        !error &&
        activeDeviationSection === "MANUAL" &&
        manualGroupKeys.length > 0 && (
          <div className="space-y-4 mt-6">
            {manualGroupKeys.map((srfKey) => {
              const srfItems = groupedManualBySrf[srfKey] || [];
              const first = srfItems[0];
              return (
                <div
                  key={`manual-${srfKey}`}
                  className="border border-gray-200 rounded-xl overflow-hidden"
                >
                  <div className="w-full bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-medium text-slate-600">
                        SRF: {srfKey}
                      </div>
                      {(first?.customer_dc_no ||
                        first?.customer_dc_date) && (
                        <>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 font-semibold">
                            DC No: {first?.customer_dc_no || "—"}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold">
                            DC Date:{" "}
                            {formatDcDate(first?.customer_dc_date)}
                          </span>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        openSrfRecords("MANUAL", srfKey)
                      }
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

// ============================================================
// SRF DEVIATION RECORDS PAGE
// ============================================================
export const SrfDeviationRecordsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { section, srfKey } = useParams<{
    section: string;
    srfKey: string;
  }>();

  const allItems: OOTDeviationItem[] =
    location.state?.items || [];

  const activeSection: "OOT" | "MANUAL" =
    (section || "").toUpperCase() === "MANUAL" ? "MANUAL" : "OOT";
  const decodedSrf = decodeURIComponent(
    srfKey || "Without SRF"
  );

  useEffect(() => {
    if (allItems.length === 0) {
      navigate("/engineer/deviations");
    }
  }, [allItems, navigate]);

  const filtered = useMemo(() => {
    return allItems.filter(
      (item) =>
        (item.srf_no?.trim() || "Without SRF") === decodedSrf
    );
  }, [allItems, decodedSrf]);

  const neplGroups = useMemo(() => {
    return filtered.reduce<Record<string, OOTDeviationItem[]>>(
      (acc, item) => {
        const key =
          item.nepl_id?.trim() || "Without NEPL ID";
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
      },
      {}
    );
  }, [filtered]);

  const neplKeys = useMemo(
    () =>
      Object.keys(neplGroups).sort((a, b) =>
        a.localeCompare(b, undefined, {
          numeric: true,
          sensitivity: "base",
        })
      ),
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
            {activeSection === "OOT"
              ? "Deviation-Out of Tolerance Records"
              : "Deviation-Not Calibrated Records"}
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            SRF:{" "}
            <span className="font-semibold text-gray-800">
              {decodedSrf}
            </span>{" "}
            · {filtered.length} record(s)
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
            const statusSet = Array.from(
              new Set(
                rows.map((row) =>
                  (row.status || "OPEN").toUpperCase()
                )
              )
            );
            const neplStatus =
              statusSet.length === 1
                ? statusSet[0]
                : "MIXED";
            return (
              <div
                key={neplKey}
                className="border border-gray-200 rounded-xl overflow-hidden"
              >
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">
                      NEPL ID: {neplKey}
                    </span>
                    <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-medium text-xs">
                      {neplStatus}
                    </span>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                    {rows.length} record
                    {rows.length > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr className="text-left text-slate-600">
                        <th className="px-3 py-2 min-w-[220px]">
                          Equipment
                        </th>
                        <th className="px-3 py-2 min-w-[220px]">
                          Engineer remarks
                        </th>
                        <th className="px-3 py-2 min-w-[240px]">
                          Customer decision
                        </th>
                        <th className="px-3 py-2 w-[120px]">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr
                          key={
                            row.deviation_id ??
                            `${neplKey}-${row.job_id}`
                          }
                          className="border-t border-slate-100 align-top"
                        >
                          <td className="px-3 py-3">
                            <div className="font-semibold text-slate-900">
                              {row.nepl_id || "Equipment"}
                            </div>
                            <div className="text-xs text-slate-600 mt-0.5">
                              {[
                                row.make,
                                row.model,
                                row.serial_no,
                              ]
                                .filter(Boolean)
                                .join(" · ") || "—"}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-slate-700 whitespace-pre-wrap">
                            {row.engineer_remarks || "—"}
                          </td>
                          <td className="px-3 py-3 text-slate-700 whitespace-pre-wrap">
                            {row.customer_decision || "—"}
                          </td>
                          <td className="px-3 py-3">
                            {row.deviation_id != null ? (
                              <button
                                type="button"
                                onClick={() =>
                                  navigate(
                                    `/engineer/deviations/${row.deviation_id}`
                                  )
                                }
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

// ============================================================
// DEVIATION DETAIL PAGE
// ============================================================
export const DeviationDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { deviationId } = useParams<{ deviationId: string }>();
  const [loading, setLoading] = useState(true);
  const [savingRemarks, setSavingRemarks] = useState(false);
  const [closingDeviation, setClosingDeviation] =
    useState(false);
  const [
    terminatingDeviationJob,
    setTerminatingDeviationJob,
  ] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] =
    useState<DeviationDetailResponse | null>(null);
  const [engineerRemarksInput, setEngineerRemarksInput] =
    useState("");
  const [togglingVisibility, setTogglingVisibility] =
    useState(false);

  const isExternalRecord = deviationId
    ? Number(deviationId) < 0
    : false;

  const getFileFullUrl = (url: string) => {
    if (!url) return "#";
    if (url.startsWith("http")) return url;
    const host =
      api.defaults.baseURL?.split("/api")[0] || "";
    return `${host}${url}`;
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
        const res =
          await api.get<DeviationDetailResponse>(
            ENDPOINTS.STAFF_DEVIATIONS.DETAIL(
              Number(deviationId)
            )
          );
        setDetail(res.data);
        setEngineerRemarksInput(
          res.data.engineer_remarks || ""
        );
      } catch (e: unknown) {
        const msg =
          e && typeof e === "object" && "response" in e
            ? (
                e as {
                  response?: {
                    data?: { detail?: string };
                  };
                }
              ).response?.data?.detail
            : null;
        setError(
          msg || "Failed to load deviation record."
        );
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
      const payload = {
        engineer_remarks: engineerRemarksInput,
      };
      const id = Number(deviationId);

      if (isExternalRecord) {
        const externalId = Math.abs(id);
        response =
          await api.patch<DeviationDetailResponse>(
            `/external-deviations/${externalId}`,
            payload
          );
      } else {
        response =
          await api.patch<DeviationDetailResponse>(
            ENDPOINTS.STAFF_DEVIATIONS.UPDATE_ENGINEER_REMARKS(
              id
            ),
            payload
          );
      }

      setDetail(response.data);
      setEngineerRemarksInput(
        response.data.engineer_remarks || ""
      );
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? (
              e as {
                response?: { data?: { detail?: string } };
              }
            ).response?.data?.detail
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
      const res =
        await api.patch<DeviationDetailResponse>(
          ENDPOINTS.STAFF_DEVIATIONS.CLOSE(
            detail.deviation_id
          )
        );
      setDetail(res.data);
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? (
              e as {
                response?: { data?: { detail?: string } };
              }
            ).response?.data?.detail
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
      const res =
        await api.patch<DeviationDetailResponse>(
          ENDPOINTS.STAFF_DEVIATIONS.TERMINATE_JOB(
            detail.deviation_id
          )
        );
      setDetail(res.data);
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? (
              e as {
                response?: { data?: { detail?: string } };
              }
            ).response?.data?.detail
          : null;
      setError(msg || "Failed to terminate linked job.");
    } finally {
      setTerminatingDeviationJob(false);
    }
  };

  const isCurrentlyVisible = () => {
    if (!detail) return false;
    if (
      !isExternalRecord &&
      detail.deviation_type === "MANUAL"
    )
      return true;
    return detail.hide_customer_visibility === false;
  };

  const toggleCustomerVisibility = async () => {
    if (!detail || !deviationId) return;
    setTogglingVisibility(true);
    setError(null);

    try {
      const id = Number(deviationId);
      const nextHideValue = !detail.hide_customer_visibility;
      const payload = {
        hide_customer_visibility: nextHideValue,
      };

      let response;
      if (isExternalRecord) {
        const externalId = Math.abs(id);
        response = await api.patch(
          `/external-deviations/${externalId}`,
          payload
        );
      } else {
        response = await api.patch(
          `/deviations/${id}/visibility`,
          payload
        );
      }

      setDetail(response.data);
    } catch (e: unknown) {
      console.error("Visibility update failed:", e);
      setError("Failed to update visibility settings.");
    } finally {
      setTogglingVisibility(false);
    }
  };

  return (
    <div className="p-8 bg-white rounded-2xl shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          Deviation Record
        </h2>
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
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && detail && (
        <div className="space-y-5 text-sm">
          {/* Actions & Visibility */}
          <div className="flex justify-between items-center bg-gray-50 p-5 rounded-xl border border-gray-200 shadow-sm">
            <div>
              <h3 className="font-bold text-gray-900 text-base">
                Actions & Visibility
              </h3>
              <div className="mt-1 flex items-center gap-2">
                <div
                  className={`h-2 w-2 rounded-full ${
                    isCurrentlyVisible()
                      ? "bg-emerald-500 animate-pulse"
                      : "bg-slate-400"
                  }`}
                />
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Status:{" "}
                  {isCurrentlyVisible()
                    ? "Visible to Customer"
                    : "Hidden from Customer"}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              {(isExternalRecord ||
                detail.deviation_type === "OOT") && (
                <button
                  type="button"
                  disabled={togglingVisibility}
                  onClick={toggleCustomerVisibility}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all border-2 shadow-sm ${
                    isCurrentlyVisible()
                      ? "bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700"
                      : "bg-slate-700 text-white border-slate-800 hover:bg-slate-900"
                  }`}
                >
                  {togglingVisibility ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isCurrentlyVisible() ? (
                    <>
                      <EyeOff size={18} />
                      <span>Hide from Customer</span>
                    </>
                  ) : (
                    <>
                      <Eye size={18} />
                      <span>Show to Customer</span>
                    </>
                  )}
                </button>
              )}

              {!isExternalRecord && (
                <>
                  <button
                    type="button"
                    disabled={
                      closingDeviation ||
                      (
                        detail.status || ""
                      ).toUpperCase() === "CLOSED"
                    }
                    onClick={closeDeviationRecord}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white border-2 border-gray-300 text-gray-900 text-sm font-bold hover:bg-gray-50 disabled:opacity-50 transition-all"
                  >
                    {closingDeviation ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    {(
                      detail.status || ""
                    ).toUpperCase() === "CLOSED"
                      ? "Record Closed"
                      : "Close Record"}
                  </button>

                  <button
                    type="button"
                    disabled={terminatingDeviationJob}
                    onClick={terminateDeviationJob}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-red-50 border-2 border-red-200 text-red-600 text-sm font-bold hover:bg-red-600 hover:text-white disabled:opacity-50 transition-all"
                  >
                    {terminatingDeviationJob ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    Terminate Job
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Status Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
                DC Details
              </p>
              <p className="text-sm font-semibold text-gray-900 mt-1">
                No: {detail.customer_dc_no || "—"}
              </p>
              <p className="text-sm font-semibold text-gray-900 mt-1">
                Date: {formatDcDate(detail.customer_dc_date)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
                Status
              </p>
              <span
                className={`inline-flex mt-2 text-xs px-2.5 py-1 rounded-full font-semibold border ${
                  (detail.status || "").toUpperCase() ===
                  "CLOSED"
                    ? "bg-green-100 text-green-800 border-green-200"
                    : (
                          detail.status || ""
                        ).toUpperCase() === "IN_PROGRESS"
                      ? "bg-blue-100 text-blue-800 border-blue-200"
                      : "bg-amber-100 text-amber-900 border-amber-200"
                }`}
              >
                {detail.status || "OPEN"}
              </span>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
                {isExternalRecord
                  ? "Tool Status"
                  : "Calibration status"}
              </p>
              <span
                className={`inline-flex mt-2 text-xs px-2.5 py-1 rounded-full font-semibold border ${
                  (
                    detail.tool_status ||
                    detail.calibration_status ||
                    ""
                  )
                    .toLowerCase()
                    .includes("calibrated") ||
                  (
                    detail.tool_status ||
                    detail.calibration_status ||
                    ""
                  )
                    .toLowerCase()
                    .includes("ok")
                    ? "bg-green-100 text-green-800 border-green-200"
                    : "bg-gray-100 text-gray-700 border-gray-200"
                }`}
              >
                {formatCalibrationStatus(
                  isExternalRecord
                    ? detail.tool_status
                    : detail.calibration_status
                )}
              </span>
            </div>
          </div>

          {/* Details Panel */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <span className="text-gray-500">SRF</span>
                <span className="font-medium text-gray-900 ml-2">
                  {detail.srf_no || "—"}
                </span>
              </div>
              <div>
                <span className="text-gray-500">NEPL ID</span>
                <span className="font-medium text-gray-900 ml-2">
                  {detail.nepl_id || "—"}
                </span>
              </div>
              <div>
                <span className="text-gray-500">
                  Report date
                </span>
                <span className="font-medium text-gray-900 ml-2">
                  {detail.report
                    ? formatDcDate(detail.report)
                    : "—"}
                </span>
              </div>
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
                      <th className="px-3 py-2">
                        Deviation %
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.oot_steps?.map((step, idx) => (
                      <tr
                        key={`oot-step-${idx}`}
                        className="border-t border-slate-100"
                      >
                        <td className="px-3 py-2 text-slate-800">
                          {step.step_percent ?? "—"}
                        </td>
                        <td className="px-3 py-2 font-medium text-red-700">
                          {step.deviation_percent ?? "—"}
                        </td>
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
                DC Date:{" "}
                {formatDcDate(detail.customer_dc_date)}
              </span>
            </div>
          </div>

          {/* Customer & Equipment */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-gray-500 font-medium mb-1">
                Customer
              </p>
              <p className="text-gray-800">
                {detail.customer_details || "—"}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-gray-500 font-medium mb-1">
                Equipment
              </p>
              <p className="text-gray-800">
                {[
                  detail.make,
                  detail.model,
                  detail.serial_no,
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
            </div>
          </div>

          {/* Engineer Remarks */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-gray-500 font-medium mb-1">
              Engineer remarks
            </p>
            <textarea
              className="w-full border border-gray-300 rounded-lg p-3 text-sm min-h-[110px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Add engineer remarks for this deviation..."
              value={engineerRemarksInput}
              onChange={(e) =>
                setEngineerRemarksInput(e.target.value)
              }
            />
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                disabled={savingRemarks}
                onClick={saveEngineerRemarks}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
              >
                {savingRemarks ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save remarks
              </button>
            </div>
          </div>

          {/* Customer Decision */}
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
            <p className="text-gray-500 font-medium mb-1">
              Customer decision
            </p>
            <p className="text-gray-800 whitespace-pre-wrap bg-white/60 border border-amber-100 rounded-lg p-3 min-h-[48px]">
              {detail.customer_decision || "—"}
            </p>
          </div>

          {/* Attachments */}
          {detail.attachments &&
            detail.attachments.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Paperclip
                    size={16}
                    className="text-gray-400"
                  />
                  <p className="text-gray-500 font-medium">
                    Evidence & Attachments
                  </p>
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
                              {a.file_type.split("/")[1] ||
                                a.file_type}
                            </span>
                          )}
                        </div>
                      </div>
                      <ExternalLink
                        size={14}
                        className="text-gray-400 group-hover:text-blue-500 flex-shrink-0"
                      />
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
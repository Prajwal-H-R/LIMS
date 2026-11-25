import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ClipboardCheck,
  AlertCircle,
  Search,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Clock,
  XCircle,
  Package,
  RefreshCw,
  Wrench,
  FileCheck,
  AlertTriangle,
  LayoutList,
  Filter,
  Layers,
  Truck,
} from "lucide-react";
import { api, ENDPOINTS } from "../api/config";

// ====================================================================
// API TYPES
// ====================================================================

interface DispatchEquipmentItem {
  inward_eqp_id: number;
  nepl_id?: string | null;
  material_description?: string | null;
  job_status?: string | null;
  flow_type?: string | null;
}

interface DispatchBatchItem {
  dispatch_id: number;
  inward_id: number;
  batch_no: number;
  dispatched_to_customer_id: number;
  status: string;
  dispatch_dc_no?: string | null;
  equipment_count: number;
  items: DispatchEquipmentItem[];
  destination_customer?: {
    customer_id: number;
    customer_details: string;
    location_name?: string | null;
  } | null;
  wcc_id?: number | null;
  wcc_no?: string | null;
  final_inspection_id?: number | null;
  final_inspection_status?: string | null;
  report_sent: boolean;
  customer_decision?: string | null;
  customer_remarks?: string | null;
}

interface InwardDispatchOverview {
  inward_id: number;
  srf_no: string;
  origin_customer_id?: number | null;
  origin_customer_details?: string | null;
  total_equipments: number;
  assigned_equipments: number;
  remaining_equipments: number;
  available_equipments: DispatchEquipmentItem[];
  batches: DispatchBatchItem[];
}

interface FinalInspectionListItem {
  inward_id: number;
  srf_no: string;
  customer_dc_no: string | null;
  customer_details: string | null;
  material_inward_date: string | null;
  created_at: string | null;
  status: string | null;
  total_equipment?: number | null;
  htw_count?: number | null;
  external_count?: number | null;
  completed_count?: number | null;

  // Legacy single-report fields are retained only as a fallback for inwards
  // that have not yet been migrated to dispatch batches.
  report_sent?: boolean;
  report_sent_at?: string | null;
  customer_decision?: string | null;
  final_inspection_id?: number | null;

  dispatchOverview?: InwardDispatchOverview;
}

interface ReadyListResponse {
  items?: unknown[];
  data?: unknown[] | { items?: unknown[]; results?: unknown[] };
  results?: unknown[];
  total_count?: number;
}

// ====================================================================
// LOT CLASSIFICATION
// ====================================================================

type LotType = "htw-only" | "external-only" | "mixed";
type FilterTab = "all" | LotType;

interface EquipmentSummary {
  total: number;
  htw: number;
  external: number;
  completed: number;
}

interface BatchSummary {
  activeBatches: DispatchBatchItem[];
  dispatchedCount: number;
  awaitingCount: number;
  approvedCount: number;
  rejectedCount: number;
}

const toCount = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const normalizeDecision = (value?: string | null): string =>
  String(value ?? "").trim().toUpperCase();

const getEquipmentSummary = (item: FinalInspectionListItem): EquipmentSummary => {
  const overview = item.dispatchOverview;
  const equipmentById = new Map<number, DispatchEquipmentItem>();

  if (overview) {
    // Remaining, undispatched equipment is returned separately from batch items.
    for (const equipment of overview.available_equipments ?? []) {
      equipmentById.set(equipment.inward_eqp_id, equipment);
    }

    // Cancelled batches release their equipment. Do not count their historical
    // item snapshots again because those instruments are already in available_equipments.
    for (const batch of overview.batches ?? []) {
      if (String(batch.status).toUpperCase() === "CANCELLED") continue;
      for (const equipment of batch.items ?? []) {
        equipmentById.set(equipment.inward_eqp_id, equipment);
      }
    }
  }

  const equipment = Array.from(equipmentById.values());
  const calculatedHtw = equipment.filter(
    (entry) => String(entry.flow_type ?? "").toUpperCase() === "INTERNAL",
  ).length;
  const calculatedExternal = equipment.filter(
    (entry) => String(entry.flow_type ?? "").toUpperCase() === "EXTERNAL",
  ).length;
  const calculatedCompleted = equipment.filter(
    (entry) => String(entry.job_status ?? "").trim().toUpperCase() === "COMPLETED",
  ).length;

  return {
    total:
      toCount(overview?.total_equipments) ??
      toCount(item.total_equipment) ??
      equipment.length,
    htw: toCount(item.htw_count) ?? calculatedHtw,
    external: toCount(item.external_count) ?? calculatedExternal,
    completed: toCount(item.completed_count) ?? calculatedCompleted,
  };
};

const getLotType = (item: FinalInspectionListItem): LotType => {
  const summary = getEquipmentSummary(item);
  const hasHTW = summary.htw > 0;
  const hasExt = summary.external > 0;
  if (hasHTW && !hasExt) return "htw-only";
  if (hasExt && !hasHTW) return "external-only";
  return "mixed";
};

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "htw-only", label: "HTW Only" },
  { key: "external-only", label: "External Only" },
  { key: "mixed", label: "Mixed" },
];

// ====================================================================
// VISUAL CONFIG
// ====================================================================

interface LotConfig {
  Icon: React.ElementType;
  avatarClass: string;
  rowHover: string;
  borderHover: string;
  pillClass: string;
  pillLabel: string;
  description: string;
  barDone: string;
  stripe: string;
}

const LOT_CONFIG: Record<LotType, LotConfig> = {
  "htw-only": {
    Icon: Wrench,
    avatarClass: "bg-blue-100 text-blue-700 group-hover:bg-blue-200",
    rowHover: "hover:bg-blue-50/60",
    borderHover: "hover:border-blue-300",
    pillClass: "bg-blue-50 text-blue-700 border-blue-200",
    pillLabel: "HTW Only",
    description: "All equipment use internal HTW calibration flow",
    barDone: "bg-blue-500",
    stripe: "bg-blue-500",
  },
  "external-only": {
    Icon: FileCheck,
    avatarClass: "bg-violet-100 text-violet-700 group-hover:bg-violet-200",
    rowHover: "hover:bg-violet-50/60",
    borderHover: "hover:border-violet-300",
    pillClass: "bg-violet-100 text-violet-700 border-violet-300",
    pillLabel: "External Only",
    description: "All equipment use external certificate uploads",
    barDone: "bg-violet-500",
    stripe: "bg-violet-500",
  },
  mixed: {
    Icon: ClipboardCheck,
    avatarClass: "bg-emerald-100 text-emerald-700 group-hover:bg-emerald-200",
    rowHover: "hover:bg-emerald-50/60",
    borderHover: "hover:border-emerald-300",
    pillClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    pillLabel: "Mixed",
    description: "Mix of HTW (internal) and external calibrations",
    barDone: "bg-emerald-500",
    stripe: "bg-emerald-500",
  },
};

// ====================================================================
// HELPERS
// ====================================================================

const formatDate = (value: string | null | undefined): string => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const getProgressPct = (completed: number, total: number): number =>
  total <= 0 ? 0 : Math.min(100, Math.round((completed / total) * 100));

const getBarColor = (pct: number, doneClass: string): string => {
  if (pct === 100) return doneClass;
  if (pct >= 50) return "bg-blue-400";
  if (pct > 0) return "bg-amber-400";
  return "bg-red-400";
};

const getLegacyDecisionBadge = (
  decision: string | null | undefined,
  reportSent: boolean | undefined,
): { label: string; cls: string } => {
  const normalized = normalizeDecision(decision);
  if (normalized === "APPROVED") {
    return { label: "Approved", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  }
  if (normalized === "REJECTED") {
    return { label: "Rejected", cls: "bg-red-50 text-red-700 border-red-200" };
  }
  if (reportSent) {
    return { label: "Awaiting Decision", cls: "bg-sky-50 text-sky-700 border-sky-200" };
  }
  return { label: "Not Sent", cls: "bg-slate-100 text-slate-500 border-slate-200" };
};

const getBatchSummary = (item: FinalInspectionListItem): BatchSummary | null => {
  const overview = item.dispatchOverview;
  if (!overview) return null;

  const activeBatches = (overview.batches ?? []).filter(
    (batch) => String(batch.status ?? "").toUpperCase() !== "CANCELLED",
  );

  const dispatched = activeBatches.filter(
    (batch) =>
      Boolean(batch.report_sent) ||
      String(batch.status ?? "").toUpperCase() === "DISPATCHED",
  );

  return {
    activeBatches,
    dispatchedCount: dispatched.length,
    awaitingCount: dispatched.filter(
      (batch) => !normalizeDecision(batch.customer_decision),
    ).length,
    approvedCount: activeBatches.filter(
      (batch) => normalizeDecision(batch.customer_decision) === "APPROVED",
    ).length,
    rejectedCount: activeBatches.filter(
      (batch) => normalizeDecision(batch.customer_decision) === "REJECTED",
    ).length,
  };
};

const getDispatchBadge = (
  item: FinalInspectionListItem,
  summary: BatchSummary | null,
): { label: string; cls: string } => {
  if (!summary) {
    return getLegacyDecisionBadge(item.customer_decision, item.report_sent);
  }

  const total = summary.activeBatches.length;
  if (total === 0) {
    // Preserve visibility of legacy FIRs that have not yet been backfilled
    // to a dispatch batch in the local test database.
    if (item.final_inspection_id || item.report_sent) {
      return getLegacyDecisionBadge(item.customer_decision, item.report_sent);
    }
    return { label: "No Active Batches", cls: "bg-slate-100 text-slate-500 border-slate-200" };
  }
  if (summary.rejectedCount > 0) {
    return {
      label: `Rejected ${summary.rejectedCount}/${total}`,
      cls: "bg-red-50 text-red-700 border-red-200",
    };
  }
  if (summary.awaitingCount > 0) {
    return {
      label: `Awaiting ${summary.awaitingCount}`,
      cls: "bg-sky-50 text-sky-700 border-sky-200",
    };
  }
  if (summary.approvedCount === total) {
    return { label: "All Approved", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  }
  if (summary.approvedCount > 0) {
    return {
      label: `Approved ${summary.approvedCount}/${total}`,
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  }
  if (summary.dispatchedCount > 0) {
    return {
      label: `Dispatched ${summary.dispatchedCount}/${total}`,
      cls: "bg-indigo-50 text-indigo-700 border-indigo-200",
    };
  }
  return { label: `${total} Batch${total === 1 ? "" : "es"} Created`, cls: "bg-amber-50 text-amber-700 border-amber-200" };
};

const getDestinationLabels = (summary: BatchSummary | null): string[] => {
  if (!summary) return [];
  const labels = summary.activeBatches
    .map((batch) => {
      const customer = batch.destination_customer;
      if (!customer) return `Customer #${batch.dispatched_to_customer_id}`;
      return customer.location_name
        ? `${customer.customer_details} (${customer.location_name})`
        : customer.customer_details;
    })
    .filter(Boolean);
  return Array.from(new Set(labels));
};

const extractListRows = (responseData: unknown): unknown[] => {
  if (Array.isArray(responseData)) return responseData;
  if (!responseData || typeof responseData !== "object") return [];

  const root = responseData as ReadyListResponse;
  if (Array.isArray(root.items)) return root.items;
  if (Array.isArray(root.results)) return root.results;
  if (Array.isArray(root.data)) return root.data;

  if (root.data && typeof root.data === "object") {
    const nested = root.data as { items?: unknown[]; results?: unknown[] };
    if (Array.isArray(nested.items)) return nested.items;
    if (Array.isArray(nested.results)) return nested.results;
  }

  return [];
};

const normalizeListItem = (value: unknown): FinalInspectionListItem | null => {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const inwardId = toCount(row.inward_id);
  if (!inwardId) return null;

  return {
    inward_id: inwardId,
    srf_no: String(row.srf_no ?? "—"),
    customer_dc_no: row.customer_dc_no == null ? null : String(row.customer_dc_no),
    customer_details:
      row.customer_details == null ? null : String(row.customer_details),
    material_inward_date:
      row.material_inward_date == null ? null : String(row.material_inward_date),
    created_at: row.created_at == null ? null : String(row.created_at),
    status:
      row.status == null
        ? row.inspection_status == null
          ? null
          : String(row.inspection_status)
        : String(row.status),
    total_equipment: toCount(row.total_equipment ?? row.total_equipments),
    htw_count: toCount(row.htw_count),
    external_count: toCount(row.external_count),
    completed_count: toCount(row.completed_count),
    report_sent: Boolean(row.report_sent),
    report_sent_at: row.report_sent_at == null ? null : String(row.report_sent_at),
    customer_decision:
      row.customer_decision == null ? null : String(row.customer_decision),
    final_inspection_id: toCount(row.final_inspection_id) ?? null,
  };
};

const getApiErrorMessage = (error: unknown): string | null => {
  if (!error || typeof error !== "object" || !("response" in error)) return null;
  const response = (error as { response?: { data?: { detail?: unknown } } }).response;
  const detail = response?.data?.detail;
  return typeof detail === "string" ? detail : null;
};

// ====================================================================
// SKELETON
// ====================================================================

const ListSkeleton: React.FC = () => (
  <div className="space-y-3" aria-busy="true">
    {[1, 2, 3, 4, 5].map((index) => (
      <div
        key={index}
        className="animate-pulse flex items-center gap-4 p-5 bg-white border border-gray-200 rounded-xl"
      >
        <div className="h-11 w-11 bg-slate-200 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-52 bg-slate-200 rounded" />
          <div className="h-4 w-72 bg-slate-100 rounded" />
          <div className="h-3 w-40 bg-slate-100 rounded" />
        </div>
        <div className="h-9 w-36 bg-slate-200 rounded-lg flex-shrink-0" />
      </div>
    ))}
  </div>
);

// ====================================================================
// LEGEND
// ====================================================================

const LegendStrip: React.FC = () => (
  <div className="flex flex-wrap items-center gap-2 text-xs px-1">
    <span className="font-semibold text-slate-400 uppercase tracking-wider mr-1">
      Legend:
    </span>
    {(Object.entries(LOT_CONFIG) as [LotType, LotConfig][]).map(([, config]) => (
      <span
        key={config.pillLabel}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-medium ${config.pillClass}`}
      >
        <config.Icon className="h-3 w-3" />
        {config.pillLabel}
        <span className="opacity-60 font-normal">— {config.description}</span>
      </span>
    ))}
  </div>
);

// ====================================================================
// FILTER TAB BAR
// ====================================================================

interface FilterTabBarProps {
  active: FilterTab;
  counts: Record<FilterTab, number>;
  onChange: (tab: FilterTab) => void;
}

const FilterTabBar: React.FC<FilterTabBarProps> = ({ active, counts, onChange }) => (
  <div className="flex items-center gap-1 flex-wrap">
    {FILTER_TABS.map(({ key, label }) => {
      const isActive = active === key;
      const config = key !== "all" ? LOT_CONFIG[key as LotType] : null;

      return (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
            isActive
              ? config
                ? `${config.pillClass} shadow-sm`
                : "bg-slate-800 text-white border-slate-800"
              : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
          }`}
        >
          {config && <config.Icon className="h-3 w-3" />}
          {label}
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              isActive ? "bg-white/50" : "bg-slate-100 text-slate-500"
            }`}
          >
            {counts[key]}
          </span>
        </button>
      );
    })}
  </div>
);

// ====================================================================
// LIST ITEM CARD
// ====================================================================

interface ListItemCardProps {
  item: FinalInspectionListItem;
  onNavigate: (id: number) => void;
}

const ListItemCard: React.FC<ListItemCardProps> = React.memo(({ item, onNavigate }) => {
  const lotType = getLotType(item);
  const config = LOT_CONFIG[lotType];
  const equipment = getEquipmentSummary(item);
  const pct = getProgressPct(equipment.completed, equipment.total);
  const barColor = getBarColor(pct, config.barDone);
  const batchSummary = getBatchSummary(item);
  const decisionBadge = getDispatchBadge(item, batchSummary);
  const destinationLabels = getDestinationLabels(batchSummary);

  const activeBatchCount = batchSummary?.activeBatches.length ?? 0;
  const assignedCount = item.dispatchOverview?.assigned_equipments ?? 0;
  const remainingCount = item.dispatchOverview?.remaining_equipments;
  const isAllDone = equipment.total > 0 && pct === 100;
  const isNotStarted = pct === 0 && equipment.total > 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(item.inward_id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onNavigate(item.inward_id);
        }
      }}
      className={`relative flex items-stretch overflow-hidden bg-white border border-gray-200 rounded-xl shadow-sm cursor-pointer group transition-all duration-200 hover:shadow-md ${config.rowHover} ${config.borderHover}`}
      aria-label={`Manage dispatch batches for SRF ${item.srf_no}`}
    >
      <div className={`w-1 flex-shrink-0 ${config.stripe} rounded-l-xl`} />

      <div className="flex flex-1 items-center gap-4 p-5 min-w-0">
        <div className="flex-shrink-0 self-start mt-0.5">
          <div className={`p-2.5 rounded-full transition-colors ${config.avatarClass}`}>
            <config.Icon className="h-5 w-5" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-lg text-gray-900 tracking-tight">
              {item.srf_no}
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${config.pillClass}`}
              title={config.description}
            >
              <config.Icon className="h-2.5 w-2.5" />
              {config.pillLabel}
            </span>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${decisionBadge.cls}`}
            >
              {decisionBadge.label}
            </span>
          </div>

          {item.customer_details && (
            <p className="text-sm text-gray-500 mt-0.5 truncate max-w-lg">
              {item.customer_details}
            </p>
          )}

          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="text-xs text-gray-400 font-medium">
              {equipment.total}&nbsp;equipment
            </span>
            {equipment.htw > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                <Wrench className="h-2.5 w-2.5" />
                HTW&nbsp;×{equipment.htw}
              </span>
            )}
            {equipment.external > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-700 border border-violet-300">
                <FileCheck className="h-2.5 w-2.5" />
                EXT&nbsp;×{equipment.external}
              </span>
            )}
            {item.customer_dc_no && (
              <span className="text-xs text-gray-400">DC:&nbsp;{item.customer_dc_no}</span>
            )}
            {item.material_inward_date && (
              <span className="text-xs text-gray-400">{formatDate(item.material_inward_date)}</span>
            )}
          </div>

          {batchSummary && (
            <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px]">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 font-semibold">
                <Layers className="h-3 w-3" />
                {activeBatchCount} active batch{activeBatchCount === 1 ? "" : "es"}
              </span>
              <span className="inline-flex items-center gap-1 text-slate-500">
                <Truck className="h-3 w-3" />
                {assignedCount} assigned
              </span>
              {typeof remainingCount === "number" && (
                <span className="text-slate-500">{remainingCount} remaining</span>
              )}
              {destinationLabels.length > 0 && (
                <span className="text-slate-400 truncate max-w-md" title={destinationLabels.join(", ")}>
                  To: {destinationLabels.slice(0, 2).join(", ")}
                  {destinationLabels.length > 2 ? ` +${destinationLabels.length - 2} more` : ""}
                </span>
              )}
            </div>
          )}

          {equipment.total > 0 && (
            <div className="mt-2.5 flex items-center gap-2">
              <div className="w-36 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-400 font-medium tabular-nums">
                {equipment.completed}/{equipment.total} calibrated
              </span>
              {isNotStarted && (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 font-semibold">
                  <AlertTriangle className="h-3 w-3" />
                  None complete
                </span>
              )}
              {isAllDone && (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-semibold">
                  <CheckCircle2 className="h-3 w-3" />
                  Ready
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onNavigate(item.inward_id);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-sm group-hover:shadow-md whitespace-nowrap bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <ClipboardCheck className="h-4 w-4" />
            Manage Dispatches
          </button>
          <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-gray-600 transition-colors" />
        </div>
      </div>
    </div>
  );
});

ListItemCard.displayName = "ListItemCard";

// ====================================================================
// MAIN PAGE
// ====================================================================

const FinalInspectionListPage: React.FC = () => {
  const navigate = useNavigate();

  const [items, setItems] = useState<FinalInspectionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  // The existing LIST_READY endpoint remains the source of inward-level
  // calibration counts. Dispatch overviews are loaded separately because the
  // new backend exposes them through /dispatch-batches/inward/{id}/overview.
  const fetchDispatchOverviews = useCallback(
    async (rows: FinalInspectionListItem[]): Promise<FinalInspectionListItem[]> => {
      const enriched = [...rows];
      let nextIndex = 0;
      const workerCount = Math.min(4, rows.length);

      const worker = async (): Promise<void> => {
        while (true) {
          const currentIndex = nextIndex;
          nextIndex += 1;
          if (currentIndex >= rows.length) return;

          const row = rows[currentIndex];
          try {
            const response = await api.get(
              `/dispatch-batches/inward/${row.inward_id}/overview`,
            );
            const overview = response.data as InwardDispatchOverview;
            if (overview && typeof overview === "object") {
              enriched[currentIndex] = { ...row, dispatchOverview: overview };
            }
          } catch {
            // Keep the existing LIST_READY row usable if an overview cannot
            // be loaded (for example, during a staged backend deployment).
          }
        }
      };

      await Promise.all(Array.from({ length: workerCount }, () => worker()));
      return enriched;
    },
    [],
  );

  // ====================================================================
  // FETCH
  // ====================================================================
  const fetchList = useCallback(
    async (silent = false) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const response = await api.get(ENDPOINTS.FINAL_INSPECTIONS.LIST_READY);
        const rawRows = extractListRows(response.data);
        const normalizedRows = rawRows
          .map(normalizeListItem)
          .filter((row): row is FinalInspectionListItem => row !== null);

        const rowsWithDispatches = await fetchDispatchOverviews(normalizedRows);
        setItems(rowsWithDispatches);
      } catch (requestError: unknown) {
        setError(getApiErrorMessage(requestError) || "Failed to load final inspection list.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetchDispatchOverviews],
  );

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  // ====================================================================
  // DERIVED STATE
  // ====================================================================
  const counts = useMemo<Record<FilterTab, number>>(() => {
    let htwOnly = 0;
    let externalOnly = 0;
    let mixed = 0;

    for (const item of items) {
      const lotType = getLotType(item);
      if (lotType === "htw-only") htwOnly += 1;
      else if (lotType === "external-only") externalOnly += 1;
      else mixed += 1;
    }

    return {
      all: items.length,
      "htw-only": htwOnly,
      "external-only": externalOnly,
      mixed,
    };
  }, [items]);

  const summaryStats = useMemo(() => {
    let batchCount = 0;
    let remainingEquipment = 0;
    let awaiting = 0;
    let approved = 0;
    let rejected = 0;

    for (const item of items) {
      const batchSummary = getBatchSummary(item);
      if (batchSummary) {
        batchCount += batchSummary.activeBatches.length;
        remainingEquipment += item.dispatchOverview?.remaining_equipments ?? 0;
        awaiting += batchSummary.awaitingCount;
        approved += batchSummary.approvedCount;
        rejected += batchSummary.rejectedCount;

        // Some local databases may still contain an un-migrated legacy FIR
        // without a dispatch batch. Do not hide its report/decision counters.
        if (
          batchSummary.activeBatches.length === 0 &&
          (item.final_inspection_id || item.report_sent)
        ) {
          batchCount += 1;
          if (item.report_sent && !normalizeDecision(item.customer_decision)) awaiting += 1;
          if (normalizeDecision(item.customer_decision) === "APPROVED") approved += 1;
          if (normalizeDecision(item.customer_decision) === "REJECTED") rejected += 1;
        }
      } else {
        // Backward-compatible fallback for rows whose dispatch overview is
        // unavailable or for records that still use the original single FIR.
        if (item.final_inspection_id || item.report_sent) batchCount += 1;
        if (item.report_sent && !normalizeDecision(item.customer_decision)) awaiting += 1;
        if (normalizeDecision(item.customer_decision) === "APPROVED") approved += 1;
        if (normalizeDecision(item.customer_decision) === "REJECTED") rejected += 1;
      }
    }

    return {
      batchCount,
      remainingEquipment,
      awaiting,
      approved,
      rejected,
    };
  }, [items]);

  const filtered = useMemo(() => {
    let byTab = items;
    if (activeTab !== "all") {
      byTab = items.filter((item) => getLotType(item) === activeTab);
    }

    const query = searchTerm.trim().toLowerCase();
    if (!query) return byTab;

    return byTab.filter((item) => {
      const batchSummary = getBatchSummary(item);
      const recipients = getDestinationLabels(batchSummary).join(" ").toLowerCase();
      return (
        item.srf_no.toLowerCase().includes(query) ||
        (item.customer_dc_no ?? "").toLowerCase().includes(query) ||
        (item.customer_details ?? "").toLowerCase().includes(query) ||
        recipients.includes(query)
      );
    });
  }, [items, activeTab, searchTerm]);

  const handleNavigate = useCallback(
    (inwardId: number) => navigate(`/engineer/final-inspection/${inwardId}`),
    [navigate],
  );

  // ====================================================================
  // RENDER
  // ====================================================================
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
            <ClipboardCheck className="h-8 w-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Final Inspection</h2>
            <p className="text-gray-500 text-sm mt-1">
              Manage equipment split dispatches and track recipient-wise reports
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate("/engineer")}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm transition-all shadow-sm"
        >
          <ChevronLeft size={16} />
          Back to Dashboard
        </button>
      </div>

      {/* Summary cards */}
      {!loading && !error && items.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
              <Package className="h-5 w-5 text-gray-400 flex-shrink-0" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{items.length}</p>
                <p className="text-xs text-gray-400 font-medium">Total Inwards</p>
              </div>
            </div>

            <div className={`rounded-xl border p-4 flex items-center gap-3 ${
              counts["external-only"] > 0
                ? "bg-violet-50 border-violet-200 text-violet-800"
                : "bg-white border-gray-200 text-gray-400"
            }`}>
              <FileCheck className="h-5 w-5 flex-shrink-0 opacity-70" />
              <div>
                <p className="text-2xl font-bold">{counts["external-only"]}</p>
                <p className="text-xs font-medium opacity-70">External-only</p>
              </div>
            </div>

            <div className="bg-indigo-50 border border-indigo-100 text-indigo-800 rounded-xl p-4 flex items-center gap-3">
              <Layers className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="text-2xl font-bold">{summaryStats.batchCount}</p>
                <p className="text-xs font-medium opacity-70">Active Batches</p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-100 text-amber-800 rounded-xl p-4 flex items-center gap-3">
              <Package className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="text-2xl font-bold">{summaryStats.remainingEquipment}</p>
                <p className="text-xs font-medium opacity-70">Unassigned</p>
              </div>
            </div>

            <div className="bg-sky-50 border border-sky-100 text-sky-800 rounded-xl p-4 flex items-center gap-3">
              <Clock className="h-5 w-5 text-sky-400 flex-shrink-0" />
              <div>
                <p className="text-2xl font-bold">{summaryStats.awaiting}</p>
                <p className="text-xs font-medium opacity-70">Awaiting Decision</p>
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl p-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-2xl font-bold">{summaryStats.approved}</p>
                <p className="text-xs font-medium opacity-70">Approved</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-100 text-red-800 rounded-xl p-4 flex items-center gap-3">
              <XCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
              <div>
                <p className="text-2xl font-bold">{summaryStats.rejected}</p>
                <p className="text-xs font-medium opacity-70">Rejected</p>
              </div>
            </div>
          </div>
          <LegendStrip />
        </div>
      )}

      {/* Main card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
        {/* Toolbar */}
        <div className="p-5 border-b border-gray-100 space-y-3 bg-gray-50/50 rounded-t-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute inset-y-0 left-3 my-auto h-4 w-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by SRF, DC number, customer or recipient…"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="pl-10 pr-4 py-2.5 w-full border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-shadow bg-white"
              />
            </div>

            <button
              type="button"
              onClick={() => void fetchList(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm transition-all shadow-sm disabled:opacity-50 flex-shrink-0"
            >
              <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          {!loading && !error && items.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
              <FilterTabBar active={activeTab} counts={counts} onChange={setActiveTab} />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700 text-sm">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span>{error}</span>
              <button
                type="button"
                onClick={() => void fetchList()}
                className="ml-auto underline font-medium hover:no-underline"
              >
                Retry
              </button>
            </div>
          )}

          {loading && <ListSkeleton />}

          {!loading && !error && filtered.length === 0 && (
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center p-4 bg-gray-50 rounded-full mb-4">
                <LayoutList className="h-8 w-8 text-gray-300" />
              </div>
              <h3 className="text-lg font-medium text-gray-900">
                {searchTerm || activeTab !== "all" ? "No results match your filter" : "No inwards found"}
              </h3>
              <p className="text-gray-500 mt-1 max-w-sm mx-auto text-sm">
                {searchTerm
                  ? "Try a different SRF, DC number, customer or recipient name."
                  : activeTab !== "all"
                    ? `No "${FILTER_TABS.find((tab) => tab.key === activeTab)?.label}" lots found.`
                    : "Inwards with equipment will appear here."}
              </p>
              {(searchTerm || activeTab !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setActiveTab("all");
                  }}
                  className="mt-4 text-sm text-indigo-600 font-semibold hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {!loading && !error && filtered.length > 0 && (
            <>
              <p className="text-xs text-slate-400 font-medium mb-3">
                Showing {filtered.length} of {items.length} inwards
                {activeTab !== "all" && (
                  <span className="ml-1">
                    — filtered by&nbsp;
                    <span className="font-bold text-slate-600">
                      {FILTER_TABS.find((tab) => tab.key === activeTab)?.label}
                    </span>
                  </span>
                )}
              </p>

              <div className="space-y-3">
                {filtered.map((item) => (
                  <ListItemCard key={item.inward_id} item={item} onNavigate={handleNavigate} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FinalInspectionListPage;

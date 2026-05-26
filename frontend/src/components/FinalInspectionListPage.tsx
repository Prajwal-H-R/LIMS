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
} from "lucide-react";
import { api, ENDPOINTS } from "../api/config";

// ====================================================================
// TYPES
// ====================================================================

interface FinalInspectionListItem {
  inward_id:            number;
  srf_no:               string;
  customer_dc_no:       string | null;
  customer_details:     string | null;
  material_inward_date: string | null;
  created_at:           string | null;
  status:               string | null;
  total_equipment:      number;
  htw_count:            number;
  external_count:       number;
  completed_count:      number;
  report_sent:          boolean;
  report_sent_at:       string | null;
  customer_decision:    string | null;
  final_inspection_id:  number | null;
}

// ====================================================================
// LOT CLASSIFICATION
// ====================================================================

type LotType   = "htw-only" | "external-only" | "mixed";
type FilterTab = "all" | LotType;

const getLotType = (item: FinalInspectionListItem): LotType => {
  const hasHTW = item.htw_count > 0;
  const hasExt = item.external_count > 0;
  if (hasHTW && !hasExt) return "htw-only";
  if (hasExt && !hasHTW) return "external-only";
  return "mixed";
};

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all",           label: "All"           },
  { key: "htw-only",      label: "HTW Only"      },
  { key: "external-only", label: "External Only" },
  { key: "mixed",         label: "Mixed"         },
];

// ====================================================================
// VISUAL CONFIG
// ====================================================================

interface LotConfig {
  Icon:         React.ElementType;
  avatarClass:  string;
  rowHover:     string;
  borderHover:  string;
  pillClass:    string;
  pillLabel:    string;
  description:  string;
  barDone:      string;
  stripe:       string;
}

const LOT_CONFIG: Record<LotType, LotConfig> = {
  "htw-only": {
    Icon:        Wrench,
    avatarClass: "bg-blue-100 text-blue-700 group-hover:bg-blue-200",
    rowHover:    "hover:bg-blue-50/60",
    borderHover: "hover:border-blue-300",
    pillClass:   "bg-blue-50 text-blue-700 border-blue-200",
    pillLabel:   "HTW Only",
    description: "All equipment use internal HTW calibration flow",
    barDone:     "bg-blue-500",
    stripe:      "bg-blue-500",
  },
  "external-only": {
    Icon:        FileCheck,
    avatarClass: "bg-violet-100 text-violet-700 group-hover:bg-violet-200",
    rowHover:    "hover:bg-violet-50/60",
    borderHover: "hover:border-violet-300",
    pillClass:   "bg-violet-100 text-violet-700 border-violet-300",
    pillLabel:   "External Only",
    description: "All equipment use external certificate uploads",
    barDone:     "bg-violet-500",
    stripe:      "bg-violet-500",
  },
  mixed: {
    Icon:        ClipboardCheck,
    avatarClass: "bg-emerald-100 text-emerald-700 group-hover:bg-emerald-200",
    rowHover:    "hover:bg-emerald-50/60",
    borderHover: "hover:border-emerald-300",
    pillClass:   "bg-emerald-50 text-emerald-700 border-emerald-200",
    pillLabel:   "Mixed",
    description: "Mix of HTW (internal) and external calibrations",
    barDone:     "bg-emerald-500",
    stripe:      "bg-emerald-500",
  },
};

// ====================================================================
// HELPERS
// ====================================================================

const formatDate = (d: string | null | undefined): string => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
};

const getProgressPct = (completed: number, total: number): number =>
  total === 0 ? 0 : Math.round((completed / total) * 100);

const getBarColor = (pct: number, doneCls: string): string => {
  if (pct === 100) return doneCls;
  if (pct >= 50)   return "bg-blue-400";
  if (pct > 0)     return "bg-amber-400";
  return "bg-red-400";
};

const getDecisionBadge = (
  decision: string | null,
  reportSent: boolean,
): { label: string; cls: string } => {
  if (decision === "APPROVED")
    return { label: "Approved",          cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (decision === "REJECTED")
    return { label: "Rejected",          cls: "bg-red-50 text-red-700 border-red-200" };
  if (reportSent)
    return { label: "Awaiting Decision", cls: "bg-sky-50 text-sky-700 border-sky-200" };
  return   { label: "Not Sent",          cls: "bg-slate-100 text-slate-500 border-slate-200" };
};

// ====================================================================
// SKELETON
// ====================================================================

const ListSkeleton: React.FC = () => (
  <div className="space-y-3" aria-busy="true">
    {[1, 2, 3, 4, 5].map((i) => (
      <div
        key={i}
        className="animate-pulse flex items-center gap-4 p-5
                   bg-white border border-gray-200 rounded-xl"
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
    {(Object.entries(LOT_CONFIG) as [LotType, LotConfig][]).map(([, cfg]) => (
      <span
        key={cfg.pillLabel}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1
                    rounded-full border font-medium ${cfg.pillClass}`}
      >
        <cfg.Icon className="h-3 w-3" />
        {cfg.pillLabel}
        <span className="opacity-60 font-normal">— {cfg.description}</span>
      </span>
    ))}
  </div>
);

// ====================================================================
// FILTER TAB BAR
// ====================================================================

interface FilterTabBarProps {
  active:   FilterTab;
  counts:   Record<FilterTab, number>;
  onChange: (tab: FilterTab) => void;
}

const FilterTabBar: React.FC<FilterTabBarProps> = ({
  active, counts, onChange,
}) => (
  <div className="flex items-center gap-1 flex-wrap">
    {FILTER_TABS.map(({ key, label }) => {
      const isActive = active === key;
      const cfg      = key !== "all" ? LOT_CONFIG[key as LotType] : null;

      return (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`
            inline-flex items-center gap-1.5 px-3 py-1.5
            rounded-lg text-xs font-bold border transition-all
            ${isActive
              ? cfg
                ? `${cfg.pillClass} shadow-sm`
                : "bg-slate-800 text-white border-slate-800"
              : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
            }
          `}
        >
          {cfg && <cfg.Icon className="h-3 w-3" />}
          {label}
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold
              ${isActive ? "bg-white/50" : "bg-slate-100 text-slate-500"}`}
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
  item:       FinalInspectionListItem;
  onNavigate: (id: number) => void;
}

const ListItemCard: React.FC<ListItemCardProps> = React.memo(
  ({ item, onNavigate }) => {
    const lotType  = getLotType(item);
    const cfg      = LOT_CONFIG[lotType];
    const pct      = getProgressPct(item.completed_count, item.total_equipment);
    const barColor = getBarColor(pct, cfg.barDone);
    const decision = getDecisionBadge(item.customer_decision, item.report_sent);

    const isAllDone    = pct === 100;
    const isNotStarted = pct === 0 && item.total_equipment > 0;

    const btnLabel = item.report_sent ? "View / Resend" : "Dispatch Report";
    const btnClass = item.report_sent
      ? "bg-slate-700 hover:bg-slate-800 text-white"
      : isAllDone
        ? "bg-indigo-600 hover:bg-indigo-700 text-white"
        : "bg-amber-500 hover:bg-amber-600 text-white";

    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onNavigate(item.inward_id)}
        onKeyDown={(e) => e.key === "Enter" && onNavigate(item.inward_id)}
        className={`
          relative flex items-stretch overflow-hidden
          bg-white border border-gray-200 rounded-xl
          shadow-sm cursor-pointer group transition-all duration-200
          hover:shadow-md ${cfg.rowHover} ${cfg.borderHover}
        `}
      >
        <div className={`w-1 flex-shrink-0 ${cfg.stripe} rounded-l-xl`} />

        <div className="flex flex-1 items-center gap-4 p-5 min-w-0">
          <div className="flex-shrink-0 self-start mt-0.5">
            <div className={`p-2.5 rounded-full transition-colors ${cfg.avatarClass}`}>
              <cfg.Icon className="h-5 w-5" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-lg text-gray-900 tracking-tight">
                {item.srf_no}
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5
                  rounded-full text-[11px] font-bold border ${cfg.pillClass}`}
                title={cfg.description}
              >
                <cfg.Icon className="h-2.5 w-2.5" />
                {cfg.pillLabel}
              </span>
              <span
                className={`inline-flex items-center px-2.5 py-0.5
                  rounded-full text-[11px] font-semibold border ${decision.cls}`}
              >
                {decision.label}
              </span>
            </div>

            {item.customer_details && (
              <p className="text-sm text-gray-500 mt-0.5 truncate max-w-lg">
                {item.customer_details}
              </p>
            )}

            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className="text-xs text-gray-400 font-medium">
                {item.total_equipment}&nbsp;equipment
              </span>
              {item.htw_count > 0 && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5
                    rounded-full text-[10px] font-bold
                    bg-blue-50 text-blue-700 border border-blue-200"
                >
                  <Wrench className="h-2.5 w-2.5" />
                  HTW&nbsp;×{item.htw_count}
                </span>
              )}
              {item.external_count > 0 && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5
                    rounded-full text-[10px] font-bold
                    bg-violet-100 text-violet-700 border border-violet-300"
                >
                  <FileCheck className="h-2.5 w-2.5" />
                  EXT&nbsp;×{item.external_count}
                </span>
              )}
              {item.customer_dc_no && (
                <span className="text-xs text-gray-400">
                  DC:&nbsp;{item.customer_dc_no}
                </span>
              )}
              {item.material_inward_date && (
                <span className="text-xs text-gray-400">
                  {formatDate(item.material_inward_date)}
                </span>
              )}
              {item.report_sent_at && (
                <span className="text-xs text-gray-400">
                  Sent:&nbsp;{formatDate(item.report_sent_at)}
                </span>
              )}
            </div>

            {item.total_equipment > 0 && (
              <div className="mt-2.5 flex items-center gap-2">
                <div className="w-36 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-400 font-medium tabular-nums">
                  {item.completed_count}/{item.total_equipment} calibrated
                </span>
                {isNotStarted && !item.report_sent && (
                  <span className="inline-flex items-center gap-1
                    text-[10px] text-amber-600 font-semibold">
                    <AlertTriangle className="h-3 w-3" />
                    None complete
                  </span>
                )}
                {isAllDone && (
                  <span className="inline-flex items-center gap-1
                    text-[10px] text-emerald-600 font-semibold">
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
              onClick={(e) => { e.stopPropagation(); onNavigate(item.inward_id); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg
                text-sm font-bold transition-all shadow-sm
                group-hover:shadow-md whitespace-nowrap ${btnClass}`}
            >
              <ClipboardCheck className="h-4 w-4" />
              {btnLabel}
            </button>
            <ChevronRight className="h-5 w-5 text-gray-300
              group-hover:text-gray-600 transition-colors" />
          </div>
        </div>
      </div>
    );
  },
);
ListItemCard.displayName = "ListItemCard";

// ====================================================================
// MAIN PAGE
// ====================================================================

const FinalInspectionListPage: React.FC = () => {
  const navigate = useNavigate();

  const [items,      setItems]      = useState<FinalInspectionListItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab,  setActiveTab]  = useState<FilterTab>("all");

  // ══════════════════════════════════════════════════════════════════
  // DEBUG: Log every state change
  // ══════════════════════════════════════════════════════════════════
  useEffect(() => {
    console.log("[DEBUG] items state changed → length:", items.length);
    if (items.length > 0) {
      console.log("[DEBUG] First 3 items:", items.slice(0, 3).map(i => i.srf_no));
      console.log("[DEBUG] NEPL26038 in items?", items.some(i => i.srf_no === "NEPL26038"));
      console.log("[DEBUG] External-only items:", 
        items.filter(i => i.htw_count === 0 && i.external_count > 0)
             .map(i => `${i.srf_no} (id=${i.inward_id})`)
      );
    }
  }, [items]);

  useEffect(() => {
    console.log("[DEBUG] loading:", loading, "| error:", error);
  }, [loading, error]);

  useEffect(() => {
    console.log("[DEBUG] activeTab:", activeTab, "| searchTerm:", JSON.stringify(searchTerm));
  }, [activeTab, searchTerm]);

  // ══════════════════════════════════════════════════════════════════
  // FETCH
  // ══════════════════════════════════════════════════════════════════
  const fetchList = useCallback(async (silent = false) => {
    console.log("[DEBUG] fetchList called, silent:", silent);

    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const url = ENDPOINTS.FINAL_INSPECTIONS.LIST_READY;
      console.log("[DEBUG] Calling API:", url);

      const res = await api.get(url);

      console.log("[DEBUG] API response status:", res.status);
      console.log("[DEBUG] API response type:", typeof res.data);
      console.log("[DEBUG] API response isArray:", Array.isArray(res.data));

      // ── Handle every possible response shape ─────────────────
      let data: FinalInspectionListItem[] = [];

      if (Array.isArray(res.data)) {
        data = res.data;
        console.log("[DEBUG] Direct array, length:", data.length);
      } else if (res.data && typeof res.data === "object") {
        // Maybe wrapped: { data: [...] } or { items: [...] } or { results: [...] }
        console.log("[DEBUG] Response is object, keys:", Object.keys(res.data));
        if (Array.isArray(res.data.data))    data = res.data.data;
        else if (Array.isArray(res.data.items))   data = res.data.items;
        else if (Array.isArray(res.data.results)) data = res.data.results;
        else {
          console.error("[DEBUG] Cannot find array in response:", res.data);
        }
      } else {
        console.error("[DEBUG] Unexpected response data:", res.data);
      }

      // ── Log NEPL26038 specifically ───────────────────────────
      const target = data.find((d) => d.srf_no === "NEPL26038");
      if (target) {
        console.log("[DEBUG] ✅ NEPL26038 FOUND in API data:", target);
      } else {
        console.error("[DEBUG] ❌ NEPL26038 NOT in API data!");
        console.log("[DEBUG] All SRF numbers received:",
          data.map((d) => d.srf_no)
        );
      }

      // ── Log all external-only items ──────────────────────────
      const extItems = data.filter(
        (d) => d.htw_count === 0 && d.external_count > 0
      );
      console.log(
        "[DEBUG] External-only items in response:",
        extItems.map((d) => ({
          srf: d.srf_no,
          id: d.inward_id,
          ext: d.external_count,
          completed: d.completed_count,
        }))
      );

      console.log("[DEBUG] Setting items state with", data.length, "items");
      setItems(data);

    } catch (err: unknown) {
      console.error("[DEBUG] API call FAILED:", err);

      const detail =
        err &&
        typeof err === "object" &&
        "response" in err
          ? (err as { response?: { data?: { detail?: string } } })
              .response?.data?.detail
          : null;

      console.error("[DEBUG] Error detail:", detail);
      setError(detail || "Failed to load final inspection list.");
    } finally {
      console.log("[DEBUG] fetchList finally block — setting loading=false");
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // ══════════════════════════════════════════════════════════════════
  // DERIVED STATE
  // ══════════════════════════════════════════════════════════════════
  const counts = useMemo<Record<FilterTab, number>>(() => {
    let htwOnly = 0;
    let extOnly = 0;
    let mixed   = 0;

    for (const item of items) {
      const t = getLotType(item);
      if      (t === "htw-only")      htwOnly++;
      else if (t === "external-only") extOnly++;
      else                            mixed++;
    }

    const result = {
      all:             items.length,
      "htw-only":      htwOnly,
      "external-only": extOnly,
      mixed,
    };

    console.log("[DEBUG] Computed counts:", result);
    return result;
  }, [items]);

  const summaryStats = useMemo(() => ({
    approved: items.filter((i) => i.customer_decision === "APPROVED").length,
    rejected: items.filter((i) => i.customer_decision === "REJECTED").length,
    awaiting: items.filter((i) => i.report_sent && !i.customer_decision).length,
  }), [items]);

  // ── Filtered list ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    console.log("[DEBUG] Computing filtered list...");
    console.log("[DEBUG]   items.length:", items.length);
    console.log("[DEBUG]   activeTab:", activeTab);
    console.log("[DEBUG]   searchTerm:", JSON.stringify(searchTerm));

    // Step 1: tab filter
    let byTab: FinalInspectionListItem[];
    if (activeTab === "all") {
      byTab = items;
    } else {
      byTab = items.filter((i) => {
        const lot = getLotType(i);
        return lot === activeTab;
      });
    }
    console.log("[DEBUG]   After tab filter:", byTab.length);

    // Check NEPL26038 after tab filter
    const afterTab = byTab.find((i) => i.srf_no === "NEPL26038");
    if (afterTab) {
      console.log("[DEBUG]   ✅ NEPL26038 passed tab filter");
    } else if (items.some((i) => i.srf_no === "NEPL26038")) {
      console.warn("[DEBUG]   ❌ NEPL26038 was in items but FAILED tab filter!",
        "activeTab:", activeTab
      );
      const nepl = items.find((i) => i.srf_no === "NEPL26038")!;
      console.warn("[DEBUG]   NEPL26038 getLotType():", getLotType(nepl));
      console.warn("[DEBUG]   NEPL26038 htw_count:", nepl.htw_count, "external_count:", nepl.external_count);
    }

    // Step 2: search filter
    const q = searchTerm.trim().toLowerCase();
    if (!q) {
      console.log("[DEBUG]   No search term, returning", byTab.length, "items");
      return byTab;
    }

    const result = byTab.filter(
      (i) =>
        i.srf_no.toLowerCase().includes(q) ||
        i.customer_dc_no?.toLowerCase().includes(q) ||
        i.customer_details?.toLowerCase().includes(q),
    );

    console.log("[DEBUG]   After search filter:", result.length);
    return result;
  }, [items, activeTab, searchTerm]);

  // ══════════════════════════════════════════════════════════════════
  // DEBUG: Log what actually renders
  // ══════════════════════════════════════════════════════════════════
  useEffect(() => {
    console.log("[DEBUG] RENDER STATE:",
      "loading:", loading,
      "| error:", error,
      "| items:", items.length,
      "| filtered:", filtered.length,
      "| tab:", activeTab,
    );
  }, [loading, error, items.length, filtered.length, activeTab]);

  const handleNavigate = useCallback(
    (id: number) => navigate(`/engineer/final-inspection/${id}`),
    [navigate],
  );

  // ====================================================================
  // RENDER
  // ====================================================================

  return (
    <div className="space-y-6">

      {/* ── DEBUG PANEL — remove after fixing ── */}
      <div className="bg-yellow-50 border-2 border-yellow-400 rounded-xl p-4 text-xs font-mono">
        <h3 className="font-bold text-yellow-800 mb-2 text-sm">
          🔍 DEBUG PANEL (remove after fixing)
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>loading: <strong>{String(loading)}</strong></div>
          <div>error: <strong>{error || "null"}</strong></div>
          <div>items.length: <strong>{items.length}</strong></div>
          <div>filtered.length: <strong>{filtered.length}</strong></div>
          <div>activeTab: <strong>{activeTab}</strong></div>
          <div>searchTerm: <strong>"{searchTerm}"</strong></div>
          <div>refreshing: <strong>{String(refreshing)}</strong></div>
          <div>
            NEPL26038 in items:{" "}
            <strong className={items.some(i => i.srf_no === "NEPL26038") ? "text-green-700" : "text-red-700"}>
              {String(items.some(i => i.srf_no === "NEPL26038"))}
            </strong>
          </div>
          <div>
            NEPL26038 in filtered:{" "}
            <strong className={filtered.some(i => i.srf_no === "NEPL26038") ? "text-green-700" : "text-red-700"}>
              {String(filtered.some(i => i.srf_no === "NEPL26038"))}
            </strong>
          </div>
        </div>

        {/* Show external-only items specifically */}
        <div className="mt-2 pt-2 border-t border-yellow-300">
          <span className="font-bold text-yellow-800">External-only lots in items: </span>
          {items.filter(i => i.htw_count === 0 && i.external_count > 0).length === 0
            ? <span className="text-red-700 font-bold">NONE FOUND</span>
            : items
                .filter(i => i.htw_count === 0 && i.external_count > 0)
                .map(i => (
                  <span key={i.inward_id} className="inline-block bg-violet-100 text-violet-700 px-2 py-0.5 rounded mr-1 mb-1">
                    {i.srf_no} (id={i.inward_id}, ext={i.external_count}, completed={i.completed_count})
                  </span>
                ))
          }
        </div>

        {/* Show external-only items in filtered */}
        <div className="mt-1">
          <span className="font-bold text-yellow-800">External-only lots in filtered: </span>
          {filtered.filter(i => i.htw_count === 0 && i.external_count > 0).length === 0
            ? <span className="text-red-700 font-bold">NONE FOUND</span>
            : filtered
                .filter(i => i.htw_count === 0 && i.external_count > 0)
                .map(i => (
                  <span key={i.inward_id} className="inline-block bg-violet-100 text-violet-700 px-2 py-0.5 rounded mr-1 mb-1">
                    {i.srf_no} (id={i.inward_id})
                  </span>
                ))
          }
        </div>
      </div>
      {/* ── END DEBUG PANEL ── */}

      {/* ── Page header ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6
                      flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
            <ClipboardCheck className="h-8 w-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
              Final Inspection
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              Dispatch and track final inspection reports for all inwards
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate("/engineer")}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300
                     text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm
                     transition-all shadow-sm"
        >
          <ChevronLeft size={16} />
          Back to Dashboard
        </button>
      </div>

      {/* ── Summary cards ── */}
      {!loading && !error && items.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
              <Package className="h-5 w-5 text-gray-400 flex-shrink-0" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{items.length}</p>
                <p className="text-xs text-gray-400 font-medium">Total Inwards</p>
              </div>
            </div>

            <div className={`rounded-xl border p-4 flex items-center gap-3
              ${counts["external-only"] > 0
                ? "bg-violet-50 border-violet-200 text-violet-800"
                : "bg-white border-gray-200 text-gray-400"}`}
            >
              <FileCheck className="h-5 w-5 flex-shrink-0 opacity-70" />
              <div>
                <p className="text-2xl font-bold">{counts["external-only"]}</p>
                <p className="text-xs font-medium opacity-70">External Lots</p>
              </div>
            </div>

            <div className="bg-sky-50 border border-sky-100 text-sky-800
                            rounded-xl p-4 flex items-center gap-3">
              <Clock className="h-5 w-5 text-sky-400 flex-shrink-0" />
              <div>
                <p className="text-2xl font-bold">{summaryStats.awaiting}</p>
                <p className="text-xs font-medium opacity-70">Awaiting Decision</p>
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-100 text-emerald-800
                            rounded-xl p-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-2xl font-bold">{summaryStats.approved}</p>
                <p className="text-xs font-medium opacity-70">Approved</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-100 text-red-800
                            rounded-xl p-4 flex items-center gap-3">
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

      {/* ── Main card ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200">

        {/* Toolbar */}
        <div className="p-5 border-b border-gray-100 space-y-3 bg-gray-50/50 rounded-t-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute inset-y-0 left-3 my-auto h-4 w-4
                                 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by SRF, DC number or customer…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-full border border-gray-300 rounded-lg
                           text-sm focus:ring-2 focus:ring-emerald-500
                           focus:border-emerald-500 transition-shadow bg-white"
              />
            </div>

            <button
              type="button"
              onClick={() => fetchList(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border
                         border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50
                         font-medium text-sm transition-all shadow-sm
                         disabled:opacity-50 flex-shrink-0"
            >
              <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          {!loading && !error && items.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
              <FilterTabBar
                active={activeTab}
                counts={counts}
                onChange={setActiveTab}
              />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6">

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl
                            flex items-center gap-3 text-red-700 text-sm">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span>{error}</span>
              <button
                type="button"
                onClick={() => fetchList()}
                className="ml-auto underline font-medium hover:no-underline"
              >
                Retry
              </button>
            </div>
          )}

          {loading && <ListSkeleton />}

          {!loading && !error && filtered.length === 0 && (
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center p-4
                              bg-gray-50 rounded-full mb-4">
                <LayoutList className="h-8 w-8 text-gray-300" />
              </div>
              <h3 className="text-lg font-medium text-gray-900">
                {searchTerm || activeTab !== "all"
                  ? "No results match your filter"
                  : "No inwards found"}
              </h3>
              <p className="text-gray-500 mt-1 max-w-sm mx-auto text-sm">
                {searchTerm
                  ? "Try a different SRF, DC number or customer name."
                  : activeTab !== "all"
                    ? `No "${FILTER_TABS.find((t) => t.key === activeTab)?.label}" lots found.`
                    : "Inwards with at least one equipment will appear here."}
              </p>
              {(searchTerm || activeTab !== "all") && (
                <button
                  type="button"
                  onClick={() => { setSearchTerm(""); setActiveTab("all"); }}
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
                      {FILTER_TABS.find((t) => t.key === activeTab)?.label}
                    </span>
                  </span>
                )}
              </p>

              <div className="space-y-3">
                {filtered.map((item) => (
                  <ListItemCard
                    key={item.inward_id}
                    item={item}
                    onNavigate={handleNavigate}
                  />
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
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Clock3,
  GripVertical,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  CheckCircle2,
  Mail,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
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
  customer_dc_no?: string | null;
  customer_dc_date?: string | null;
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
  source_type?: "INTERNAL" | "EXTERNAL";
  already_in_lab?: boolean;
  renewal_inward_id?: number | null;
  renewal_srf_no?: string | null;
}

export interface CalibrationReminderGroup {
  customer_id: number;
  customer_name: string;
  customer_email: string;
  due_count: number;
  overdue_count?: number;
  already_in_lab_count?: number;
  last_notified_at?: string | null;
  certificates: CalibrationCertificateReminder[];
}

export interface CalibrationReminderResponse {
  window_days: number;
  days_back?: number;
  total_due_count: number;
  overdue_count?: number;
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

export const CalibrationReminderModal: React.FC<CalibrationReminderModalProps> = ({
  open,
  onClose,
  data,
  loading = false,
  error = null,
  onRefresh,
  onCustomerSelect,
  onOpenExplorer,
  title = "Calibration Due Reminders",
}) => {
  const totalDue = data?.total_due_count ?? 0;
  const customerCount = data?.customer_count ?? 0;
  const windowDays = data?.window_days ?? 45;

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
    <div className="fixed inset-0 z-[350] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-5xl max-h-[88vh] overflow-hidden rounded-3xl bg-white shadow-2xl border border-slate-200 flex flex-col">
        <div className="px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 rounded-2xl bg-white/15 text-white shrink-0 backdrop-blur-sm">
              <Bell className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl font-bold">{title}</h2>
                <span className="inline-flex items-center rounded-full bg-white/20 px-3 py-0.5 text-xs font-semibold text-white">
                  Next {windowDays} days
                </span>
              </div>
              <p className="mt-1 text-sm text-blue-100">
                {totalDue} certificate(s) due across {customerCount} customer(s).
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={dismiss}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
            aria-label="Close reminder popup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/70">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-600 py-8 justify-center">
              <Clock3 className="h-4 w-4 animate-pulse text-blue-600" />
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
              <p className="font-medium">No certificates are due in the reminder window.</p>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={onOpenExplorer}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition"
                >
                  Open Calibration Explorer
                </button>
              </div>
            </div>
          )}

          {!loading && !error && (data?.groups?.length ?? 0) > 0 && (
            <div className="space-y-3.5">
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

        <div className="border-t border-slate-200 bg-white px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-slate-500">
            Active reminder window: <span className="font-semibold text-slate-700">{windowDays} days</span>
          </div>
          <div className="flex items-center gap-2.5">
            {onOpenExplorer && (
              <button
                type="button"
                onClick={onOpenExplorer}
                className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
              >
                Open Explorer & Calendar
                <ArrowUpRight className="h-4 w-4" />
              </button>
            )}
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Refresh
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-black"
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
      className="w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-left transition hover:shadow-md hover:border-blue-300 group"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition">
              {group.customer_name}
            </h3>
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 border border-blue-100">
              {group.due_count} due
            </span>
            {(group.already_in_lab_count ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="h-3 w-3" />
                {group.already_in_lab_count} in lab
              </span>
            )}
          </div>

          <p className="mt-1 text-xs text-slate-500">
            Customer ID: <span className="font-medium text-slate-700">{group.customer_id}</span>
          </p>
          <p className="mt-0.5 text-xs text-slate-500 flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 text-slate-400" />
            {group.customer_email || "No email on record"}
          </p>
        </div>

        <span className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-blue-600 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition">
          Open
          <ChevronRight className="h-4 w-4" />
        </span>
      </div>
    </button>
  );
};

const CALIBRATION_REMINDER_POSITION_KEY = "engineer_calibration_reminder_vertical_position_v1";

export const CalibrationReminderFloatingButton: React.FC<{
  count: number;
  onOpen: () => void;
  onOpenExplorer?: () => void;
  label?: string;
}> = ({ count, onOpen, onOpenExplorer, label }) => {
  const [expanded, setExpanded] = useState(false);
  const [verticalPosition, setVerticalPosition] = useState<number>(() => {
    try {
      const rawPosition = localStorage.getItem(CALIBRATION_REMINDER_POSITION_KEY);
      if (rawPosition === null) return 0.5;
      const stored = Number(rawPosition);
      return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : 0.5;
    } catch {
      return 0.5;
    }
  });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startRatio: number;
    lastRatio: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const countLabel = count > 99 ? "99+" : count;
  const actionLabel = label || (count > 0 ? "View due reminders" : "Open calibration explorer");
  const accessibleLabel =
    label ||
    (count > 0
      ? `Open calibration reminders (${count} due)`
      : "Open calibration explorer");

  const clampPosition = useCallback((ratio: number) => {
    if (typeof window === "undefined" || window.innerHeight <= 0) return ratio;

    const viewportHeight = window.innerHeight;
    const widgetHeight = containerRef.current?.getBoundingClientRect().height ?? 112;
    const margin = 12;
    const minimum = (widgetHeight / 2 + margin) / viewportHeight;
    const maximum = 1 - minimum;

    if (maximum < minimum) return 0.5;
    return Math.min(maximum, Math.max(minimum, ratio));
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;

    suppressClickRef.current = false;
    const initialRatio = verticalPosition;
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startRatio: initialRatio,
      lastRatio: initialRatio,
      moved: false,
    };

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignore if pointer capture is already released
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || typeof window === "undefined") return;

    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.abs(deltaY) < 4) return;

    drag.moved = true;
    event.preventDefault();
    drag.lastRatio = clampPosition(drag.startRatio + deltaY / window.innerHeight);

    if (containerRef.current) {
      containerRef.current.style.top = `${drag.lastRatio * 100}%`;
    }
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;
    if (drag.moved) {
      suppressClickRef.current = true;
      setVerticalPosition(drag.lastRatio);
      try {
        localStorage.setItem(CALIBRATION_REMINDER_POSITION_KEY, String(drag.lastRatio));
      } catch {
        // Ignore storage failure
      }
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
  };

  const handleExpandClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (suppressClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      suppressClickRef.current = false;
      return;
    }
    setExpanded(true);
  };

  useEffect(() => {
    const keepInBounds = () => {
      const nextPosition = clampPosition(verticalPosition);
      if (Math.abs(nextPosition - verticalPosition) < 0.0001) return;

      setVerticalPosition(nextPosition);
      try {
        localStorage.setItem(CALIBRATION_REMINDER_POSITION_KEY, String(nextPosition));
      } catch {
        // Ignore storage failure
      }
    };

    const frame = window.requestAnimationFrame(keepInBounds);
    window.addEventListener("resize", keepInBounds);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", keepInBounds);
    };
  }, [clampPosition, expanded, verticalPosition]);

  const renderedPosition = dragRef.current?.lastRatio ?? verticalPosition;

  return (
    <div
      ref={containerRef}
      className={`fixed right-0 z-[340] -translate-y-1/2 transition-[width] duration-200 ease-out ${
        expanded ? "w-72 max-w-[calc(100vw-0.75rem)]" : "w-11"
      }`}
      style={{ top: `${renderedPosition * 100}%` }}
      aria-label="Calibration reminder shortcut"
    >
      {expanded ? (
        <div className="max-h-[calc(100vh-1.5rem)] overflow-hidden rounded-l-2xl border border-r-0 border-blue-100 bg-white shadow-[0_12px_36px_-12px_rgba(15,23,42,0.35)]">
          <div className="flex items-center gap-2 bg-gradient-to-r from-blue-50 to-white px-3 py-3">
            <div
              className="group flex min-w-0 flex-1 cursor-grab select-none items-center gap-3 touch-none active:cursor-grabbing"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
              title="Drag up or down to reposition"
              aria-label="Drag calibration reminder panel up or down"
            >
              <GripVertical className="h-3.5 w-3.5 shrink-0 text-slate-300 opacity-70 transition-colors group-hover:text-slate-400" aria-hidden="true" />
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md ring-2 ring-blue-100">
                <Bell className="h-5 w-5" />
                {count > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white ring-2 ring-white">
                    {countLabel}
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">Calibration reminders</p>
                <p className="text-xs text-slate-500">
                  {count > 0
                    ? `${count} certificate${count === 1 ? "" : "s"} due`
                    : "Open the calibration explorer"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
              aria-label="Collapse calibration reminders to the right edge"
              title="Collapse"
            >
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </button>
          </div>

          <div className="border-t border-slate-100 p-3">
            <button
              type="button"
              onClick={onOpen}
              className="inline-flex w-full items-center justify-between gap-3 rounded-xl bg-blue-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label={accessibleLabel}
            >
              <span>{actionLabel}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-white/80" />
            </button>

            {count > 0 && onOpenExplorer && (
              <button
                type="button"
                onClick={onOpenExplorer}
                className="group mt-2 inline-flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
                aria-label="Open reminder explorer to search all calibration reminders"
              >
                <span>Open Reminder Explorer</span>
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-blue-100 group-hover:text-blue-700">
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onClick={handleExpandClick}
          className="relative flex h-28 w-11 touch-none select-none flex-col items-center justify-center gap-2 rounded-l-2xl border border-r-0 border-blue-200 bg-white/95 text-blue-700 shadow-lg shadow-slate-900/10 backdrop-blur transition hover:w-12 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-grab active:cursor-grabbing"
          aria-label={`Expand ${accessibleLabel}`}
          aria-expanded={false}
          title={`${accessibleLabel} — drag up or down to reposition`}
        >
          <GripVertical className="h-3.5 w-3.5 text-slate-300 opacity-70" aria-hidden="true" />
          <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md ring-2 ring-blue-100">
            <Bell className="h-4 w-4" />
            {count > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white ring-2 ring-white">
                {countLabel}
              </span>
            )}
          </span>
          <ChevronLeft className="h-3.5 w-3.5 text-slate-400" />
        </button>
      )}
    </div>
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
      const res = await api.get<CalibrationReminderResponse>(API_ENDPOINT, {
        params: { days_ahead: 45 },
      });
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
  baseRoutePrefix?: "/engineer" | "/admin";
}> = ({ onCustomerSelect, baseRoutePrefix }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const reminder = useCalibrationReminder();
  const total = reminder.data?.total_due_count ?? 0;

  const resolvedPrefix = useMemo(() => {
    if (baseRoutePrefix) return baseRoutePrefix;
    return location.pathname.startsWith("/admin") ? "/admin" : "/engineer";
  }, [baseRoutePrefix, location.pathname]);

  const handleCustomerSelect = (customerId: number) => {
    reminder.dismiss();
    window.setTimeout(() => {
      if (onCustomerSelect) {
        onCustomerSelect(customerId);
      } else {
        navigate(`${resolvedPrefix}/calibration-reminders/${customerId}`);
      }
    }, 0);
  };

  const handleOpenExplorer = () => {
    reminder.dismiss();
    navigate(`${resolvedPrefix}/calibration-reminders/0`);
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
        onOpenExplorer={handleOpenExplorer}
      />
    </>
  );
};

export default CalibrationReminderWidget;
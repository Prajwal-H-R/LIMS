import React, { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft,
  Search,
  Activity,
  Check,
  AlertCircle,
  Eye,
  FileText,
  Box,
  Settings,
  Truck,
  ArrowLeft,
  Clock,
  Package,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Info,
  Loader2,
  BadgeCheck,
  Radio,
  PauseCircle,
  Gauge,
  ShieldCheck,
} from "lucide-react";
import { api, ENDPOINTS } from "../api/config";

// ================================================================== //
//  TYPES                                                               //
// ================================================================== //

/**
 * Timeline step visual states sent by the backend.
 *
 * completed   → all previous steps done          → blue filled circle
 * current     → active / in-progress step        → blue pulsing circle
 * pending     → not yet reached                  → grey circle
 * terminated  → HTW job was terminated           → red circle  (XCircle)
 * deviated    → active deviation raised          → amber circle (AlertTriangle)
 * oot         → completed out-of-tolerance       → orange circle (Gauge)
 * onhold      → job on hold, no deviation        → amber circle (PauseCircle)
 */
type TimelineStatus =
  | "completed"
  | "current"
  | "pending"
  | "terminated"
  | "deviated"
  | "oot"
  | "onhold";

type ActivityLogType = "info" | "success" | "warning" | "error";

interface TimelineStep {
  label:  string;
  status: TimelineStatus;
  date:   string | null;
  icon:   string;
}

interface ActivityLogItem {
  date:        string;
  title:       string;
  description: string;
  type?:       ActivityLogType;
}

interface TrackingEquipmentItem {
  nepl_id:             string;
  inward_eqp_id:       number;
  srf_no:              string;
  customer_name:       string;
  dc_number:           string | null;
  qty:                 number;
  current_status:      string;
  display_status:      string;
  alert_message?:      string;
  timeline:            TimelineStep[];
  activity_log:        ActivityLogItem[];
  expected_completion: string | null;
}

interface TrackingResult {
  search_query: string;
  found_via:    string;
  equipments:   TrackingEquipmentItem[];
}

// ================================================================== //
//  STATUS CLASSIFICATION                                               //
// ================================================================== //

interface StatusFlags {
  isTerminated: boolean;
  isDeviated:   boolean;
  isOnHold:     boolean;
  isOOT:        boolean;
  isDispatched: boolean;
  isReady:      boolean;
  isCompleted:  boolean;
  isProgress:   boolean;
  isInward:     boolean;
}

/**
 * Single source of truth for classifying a display_status string.
 *
 * Priority order (highest wins):
 *   terminated > oot > deviated > onhold > dispatched > ready > completed > progress > inward
 *
 * HTW certificate mapping (from backend):
 *   HTWCertificate.status = 'approved' → display_status = "Certificate Ready"
 *   HTWCertificate.status = 'issued'   → display_status = "Certificate Dispatched"
 */
const classifyStatus = (displayStatus: string): StatusFlags => {
  const s = displayStatus.toLowerCase();

  const isTerminated = s.includes("terminated");
  const isOOT        = s.includes("oot") || s.includes("out of tolerance");
  const isDeviated   = !isTerminated && !isOOT &&
                       (s.includes("deviation") || s.includes("deviated"));
  const isOnHold     = !isTerminated && !isOOT && !isDeviated &&
                       (s.includes("on hold") || s.includes("on_hold"));

  // "Certificate Dispatched" — HTW: cert.status='issued', Non-HTW: cert.status='issued'
  const isDispatched = s.includes("dispatched");

  // "Certificate Ready"
  //   HTW:     cert.status = 'approved'
  //   Non-HTW: external_uploads.certificate_file_url populated
  const isReady = s.includes("ready") && !isDispatched;

  const isCompleted = s.includes("completed") && !isOOT && !isDispatched;
  const isProgress  = s.includes("progress") && !isDeviated && !isOnHold;
  const isInward    = s.includes("inward");

  return {
    isTerminated,
    isOOT,
    isDeviated,
    isOnHold,
    isDispatched,
    isReady,
    isCompleted,
    isProgress,
    isInward,
  };
};

// ================================================================== //
//  COLOUR HELPERS                                                      //
// ================================================================== //

/**
 * Tailwind classes for the status badge pill in list and detail views.
 *
 * Certificate Ready      → green  (HTW: cert approved / Non-HTW: cert file uploaded)
 * Certificate Dispatched → purple (HTW + Non-HTW: cert issued)
 */
const getStatusBadgeClasses = (displayStatus: string): string => {
  const c = classifyStatus(displayStatus);
  if (c.isTerminated) return "bg-red-100    text-red-700    border-red-200";
  if (c.isOOT)        return "bg-orange-100 text-orange-700 border-orange-200";
  if (c.isDeviated)   return "bg-amber-100  text-amber-700  border-amber-200";
  if (c.isOnHold)     return "bg-amber-100  text-amber-700  border-amber-200";
  if (c.isDispatched) return "bg-purple-100 text-purple-700 border-purple-200";
  if (c.isReady)      return "bg-green-100  text-green-700  border-green-200";
  if (c.isCompleted)  return "bg-teal-100   text-teal-700   border-teal-200";
  if (c.isProgress)   return "bg-blue-100   text-blue-700   border-blue-200";
  return                     "bg-slate-100  text-slate-600  border-slate-200";
};

/**
 * Tailwind bg-* accent colour used for:
 *   - coloured strip at top of detail card
 *   - progress connector fill in the timeline track
 *
 * Certificate Ready      → green
 * Certificate Dispatched → purple
 */
const getAccentColour = (displayStatus: string): string => {
  const c = classifyStatus(displayStatus);
  if (c.isTerminated) return "bg-red-500";
  if (c.isOOT)        return "bg-orange-500";
  if (c.isDeviated)   return "bg-amber-500";
  if (c.isOnHold)     return "bg-amber-400";
  if (c.isDispatched) return "bg-purple-600";
  if (c.isReady)      return "bg-green-500";
  if (c.isCompleted)  return "bg-teal-500";
  return                     "bg-blue-600";
};

// ================================================================== //
//  ICON HELPERS                                                        //
// ================================================================== //

/**
 * Maps backend `icon` key strings → Lucide icon components.
 *
 * Keys the backend currently sends:
 *   box | file | settings | check | badge | truck | gauge
 */
const TimelineIcon: React.FC<{ iconName: string; className?: string }> = ({
  iconName,
  className = "h-5 w-5",
}) => {
  switch (iconName) {
    case "box":      return <Box          className={className} />;
    case "file":     return <FileText     className={className} />;
    case "settings": return <Settings     className={className} />;
    case "check":    return <CheckCircle2 className={className} />;
    case "badge":    return <BadgeCheck   className={className} />;
    case "truck":    return <Truck        className={className} />;
    case "gauge":    return <Gauge        className={className} />;
    default:         return <Activity     className={className} />;
  }
};

/** Coloured dot icon for each activity log entry type */
const ActivityIcon: React.FC<{ type?: ActivityLogType }> = ({ type = "info" }) => {
  const base = "w-8 h-8 rounded-full flex items-center justify-center shrink-0";
  switch (type) {
    case "success":
      return (
        <span className={`${base} bg-green-100 ring-4 ring-green-50`}>
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        </span>
      );
    case "warning":
      return (
        <span className={`${base} bg-amber-100 ring-4 ring-amber-50`}>
          <AlertTriangle className="h-4 w-4 text-amber-600" />
        </span>
      );
    case "error":
      return (
        <span className={`${base} bg-red-100 ring-4 ring-red-50`}>
          <XCircle className="h-4 w-4 text-red-600" />
        </span>
      );
    default:
      return (
        <span className={`${base} bg-blue-100 ring-4 ring-blue-50`}>
          <Info className="h-4 w-4 text-blue-600" />
        </span>
      );
  }
};

// ================================================================== //
//  TIMELINE STEP NODE                                                  //
// ================================================================== //

interface StepConfig {
  circle: string;
  icon:   React.ReactNode;
  label:  string;
}

/**
 * Visual configuration for each timeline step status.
 * Defined at module scope — not recreated on each render.
 *
 * Special states for HTW certificate steps:
 *   "Certificate Ready"      (step label) → rendered as "current" with green accent
 *                                           when display_status = "Certificate Ready"
 *   "Certificate Dispatched" (step label) → rendered as "current" with purple accent
 *                                           when display_status = "Certificate Dispatched"
 *
 * The step status itself ("completed" / "current" / "pending") is determined
 * by the backend via _assemble_timeline(); the frontend only needs to render it.
 */
const getStepConfig = (stepStatus: TimelineStatus): StepConfig => {
  switch (stepStatus) {
    case "completed":
      return {
        circle: "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-200",
        icon:   <Check className="h-5 w-5" />,
        label:  "text-slate-800 font-bold",
      };
    case "current":
      return {
        circle: "bg-white border-blue-600 text-blue-600 shadow-lg shadow-blue-100 scale-110",
        icon:   <Radio className="h-5 w-5 animate-pulse" />,
        label:  "text-blue-700 font-bold",
      };
    case "terminated":
      return {
        circle: "bg-red-600 border-red-600 text-white shadow-md shadow-red-200 scale-110",
        icon:   <XCircle className="h-5 w-5" />,
        label:  "text-red-700 font-bold",
      };
    case "deviated":
      return {
        circle: "bg-amber-500 border-amber-500 text-white shadow-md shadow-amber-200 scale-110",
        icon:   <AlertTriangle className="h-5 w-5" />,
        label:  "text-amber-700 font-bold",
      };
    case "oot":
      return {
        circle: "bg-orange-500 border-orange-500 text-white shadow-md shadow-orange-200 scale-110",
        icon:   <Gauge className="h-5 w-5" />,
        label:  "text-orange-700 font-bold",
      };
    case "onhold":
      return {
        circle: "bg-amber-400 border-amber-400 text-white shadow-md shadow-amber-100 scale-110",
        icon:   <PauseCircle className="h-5 w-5" />,
        label:  "text-amber-600 font-bold",
      };
    case "pending":
    default:
      return {
        circle: "bg-white border-slate-200 text-slate-300",
        icon:   <Clock className="h-5 w-5" />,
        label:  "text-slate-400 font-medium",
      };
  }
};

/**
 * Returns special override styling for certificate steps when
 * the overall display_status corresponds to that step being active.
 *
 * This lets "Certificate Ready" show green and "Certificate Dispatched"
 * show purple even though their step.status is "current" (normally blue).
 *
 * Only applied when step.status === "current".
 */
const getCertStepOverride = (
  stepLabel:     string,
  displayStatus: string,
): StepConfig | null => {
  const ds = displayStatus.toLowerCase();

  // Certificate Ready step — green when it is the active step
  if (
    stepLabel.toLowerCase().includes("certificate ready") &&
    ds.includes("ready") &&
    !ds.includes("dispatched")
  ) {
    return {
      circle: "bg-green-500 border-green-500 text-white shadow-md shadow-green-200 scale-110",
      icon:   <ShieldCheck className="h-5 w-5" />,
      label:  "text-green-700 font-bold",
    };
  }

  // Certificate Dispatched step — purple when it is the active step
  if (
    stepLabel.toLowerCase().includes("certificate dispatched") &&
    ds.includes("dispatched")
  ) {
    return {
      circle: "bg-purple-600 border-purple-600 text-white shadow-md shadow-purple-200 scale-110",
      icon:   <Truck className="h-5 w-5" />,
      label:  "text-purple-700 font-bold",
    };
  }

  return null;
};

const TimelineStepNode: React.FC<{
  step:          TimelineStep;
  isLast:        boolean;
  displayStatus: string;
}> = ({ step, displayStatus }) => {
  // Base config from step status
  let cfg = getStepConfig(step.status);

  // Override for certificate steps when they are "current"
  if (step.status === "current") {
    const override = getCertStepOverride(step.label, displayStatus);
    if (override) cfg = override;
  }

  return (
    <div className="relative z-10 flex flex-col items-center min-w-0 flex-1">
      {/* Circle */}
      <div
        className={`
          w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center
          justify-center border-4 transition-all duration-500 ${cfg.circle}
        `}
      >
        {cfg.icon}
      </div>

      {/* Label + date */}
      <div className="mt-3 text-center px-0.5 md:px-1">
        <p className={`text-[10px] md:text-xs leading-tight ${cfg.label}`}>
          {step.label}
        </p>
        {step.date && (
          <p className="text-[9px] md:text-[10px] text-slate-400 mt-1 leading-tight">
            {step.date}
          </p>
        )}
      </div>
    </div>
  );
};

// ================================================================== //
//  ALERT BANNER                                                        //
// ================================================================== //

/**
 * Contextual alert banner rendered above the timeline card whenever
 * the backend provides an alert_message.
 *
 * Variants:
 *   terminated → red  (XCircle)
 *   oot        → orange (Gauge)
 *   deviated   → amber (AlertTriangle)
 *   onhold     → amber (PauseCircle)
 *   default    → blue  (Info)
 */
const AlertBanner: React.FC<{
  message:       string;
  displayStatus: string;
}> = ({ message, displayStatus }) => {
  const c = classifyStatus(displayStatus);

  if (c.isTerminated) {
    return (
      <div className="flex items-start gap-3 bg-red-50 border border-red-200
                      rounded-xl px-5 py-4">
        <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-red-700">Calibration Terminated</p>
          <p className="text-sm text-red-600 mt-0.5">{message}</p>
        </div>
      </div>
    );
  }

  if (c.isOOT) {
    return (
      <div className="flex items-start gap-3 bg-orange-50 border border-orange-200
                      rounded-xl px-5 py-4">
        <Gauge className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-orange-700">
            Out Of Tolerance – Action Required
          </p>
          <p className="text-sm text-orange-600 mt-0.5">{message}</p>
        </div>
      </div>
    );
  }

  if (c.isDeviated) {
    return (
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200
                      rounded-xl px-5 py-4">
        <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-amber-700">Deviation Raised</p>
          <p className="text-sm text-amber-600 mt-0.5">{message}</p>
        </div>
      </div>
    );
  }

  if (c.isOnHold) {
    return (
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200
                      rounded-xl px-5 py-4">
        <PauseCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-amber-700">Calibration On Hold</p>
          <p className="text-sm text-amber-600 mt-0.5">{message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 bg-blue-50 border border-blue-200
                    rounded-xl px-5 py-4">
      <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
      <p className="text-sm text-blue-700">{message}</p>
    </div>
  );
};

// ================================================================== //
//  TIMELINE LEGEND                                                     //
// ================================================================== //

/**
 * One-line plain-English explanation shown below the timeline track.
 * Only rendered for special/terminal states and certificate states.
 * Returns null for ordinary in-progress states.
 *
 * Certificate Ready      → green legend  (HTW: cert approved)
 * Certificate Dispatched → purple legend (HTW + Non-HTW: cert issued)
 */
const TimelineLegend: React.FC<{ displayStatus: string }> = ({
  displayStatus,
}) => {
  const c = classifyStatus(displayStatus);

  if (c.isTerminated) {
    return (
      <div className="mt-5 flex items-start gap-2 text-xs text-red-600
                      bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
        <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          <strong>Terminated</strong> — This calibration job has been stopped.
          No further calibration will be performed under the current job.
          Please contact the lab.
        </span>
      </div>
    );
  }

  if (c.isOOT) {
    return (
      <div className="mt-5 flex items-start gap-2 text-xs text-orange-600
                      bg-orange-50 border border-orange-100 rounded-lg px-3 py-2.5">
        <Gauge className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          <strong>Out Of Tolerance</strong> — Calibration was completed but the
          instrument's readings are outside acceptable limits. The certificate
          team is reviewing the results.
        </span>
      </div>
    );
  }

  if (c.isDeviated) {
    return (
      <div className="mt-5 flex items-start gap-2 text-xs text-amber-700
                      bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          <strong>Deviation Raised</strong> — A deviation has been recorded for
          this equipment. Calibration is on hold pending engineer and customer
          decision.
        </span>
      </div>
    );
  }

  if (c.isOnHold) {
    return (
      <div className="mt-5 flex items-start gap-2 text-xs text-amber-700
                      bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
        <PauseCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          <strong>On Hold</strong> — Calibration is temporarily paused for
          operational reasons. Please contact the lab for more information.
        </span>
      </div>
    );
  }

  if (c.isDispatched) {
    return (
      <div className="mt-5 flex items-start gap-2 text-xs text-purple-700
                      bg-purple-50 border border-purple-100 rounded-lg px-3 py-2.5">
        <Truck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          <strong>Certificate Dispatched</strong> — Your calibration certificate
          has been issued and dispatched. Please check your registered address
          or contact the lab for courier details.
        </span>
      </div>
    );
  }

  if (c.isReady) {
    return (
      <div className="mt-5 flex items-start gap-2 text-xs text-green-700
                      bg-green-50 border border-green-100 rounded-lg px-3 py-2.5">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          <strong>Certificate Ready</strong> — Your calibration certificate has
          been approved and is ready for dispatch. You will be notified once it
          has been issued.
        </span>
      </div>
    );
  }

  return null;
};

// ================================================================== //
//  DETAIL VIEW                                                         //
// ================================================================== //

const DetailView: React.FC<{
  item:   TrackingEquipmentItem;
  onBack: () => void;
}> = ({ item, onBack }) => {
  const accentColour = getAccentColour(item.display_status);

  // Progress percentage for the connector fill line.
  // Counts all non-pending steps (completed + any active special state).
  const nonPendingCount = item.timeline.filter(
    (s) => s.status !== "pending"
  ).length;
  const progressPct =
    item.timeline.length > 1
      ? ((nonPendingCount - 1) / (item.timeline.length - 1)) * 100
      : 0;

  return (
    <div className="animate-in slide-in-from-right-4 fade-in duration-300 space-y-6">

      {/* ── Back button ─────────────────────────────────────────────── */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-slate-500 hover:text-blue-600
                   font-medium transition-colors text-sm group"
      >
        <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
        Back to Results
      </button>

      {/* ── Alert banner ─────────────────────────────────────────────── */}
      {item.alert_message && (
        <AlertBanner
          message={item.alert_message}
          displayStatus={item.display_status}
        />
      )}

      {/* ── Header card ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200
                      overflow-hidden">

        {/* Coloured accent strip — colour reflects current status */}
        <div className={`h-1.5 w-full ${accentColour}`} />

        <div className="p-5 md:p-8">

          {/* Title row */}
          <div className="flex flex-col sm:flex-row sm:items-start
                          sm:justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  {item.nepl_id}
                </h2>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold border
                    ${getStatusBadgeClasses(item.display_status)}`}
                >
                  {item.display_status}
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-1.5">
                SRF:{" "}
                <span className="font-semibold text-slate-700">
                  {item.srf_no}
                </span>
                {item.dc_number && (
                  <>
                    &nbsp;·&nbsp; DC:{" "}
                    <span className="font-semibold text-slate-700">
                      {item.dc_number}
                    </span>
                  </>
                )}
              </p>
            </div>

            {/* Meta chips */}
            <div className="flex flex-wrap gap-2 shrink-0">
              <span className="inline-flex items-center gap-1.5 bg-slate-100
                               text-slate-600 text-xs font-semibold px-3 py-1.5
                               rounded-full">
                <Package className="h-3.5 w-3.5" />
                Qty: {item.qty}
              </span>
              {item.expected_completion &&
               item.expected_completion !== "TBD" && (
                <span className="inline-flex items-center gap-1.5 bg-slate-100
                                 text-slate-600 text-xs font-semibold px-3
                                 py-1.5 rounded-full">
                  <Clock className="h-3.5 w-3.5" />
                  ETA: {item.expected_completion}
                </span>
              )}
            </div>
          </div>

          {/* ── Horizontal timeline ──────────────────────────────────── */}
          <div className="relative overflow-x-auto">
            {/* Full-width grey track */}
            <div className="absolute top-5 md:top-6 left-5 md:left-6
                            right-5 md:right-6 h-1 bg-slate-100 rounded-full" />

            {/* Coloured progress fill */}
            <div
              className={`absolute top-5 md:top-6 left-5 md:left-6 h-1
                          rounded-full transition-all duration-1000 ${accentColour}`}
              style={{
                width: `calc(${progressPct / 100} * (100% - 2.5rem))`,
              }}
            />

            <div className="relative flex items-start justify-between
                            gap-1 md:gap-2 pb-4 min-w-0">
              {item.timeline.map((step, idx) => (
                <TimelineStepNode
                  key={idx}
                  step={step}
                  isLast={idx === item.timeline.length - 1}
                  displayStatus={item.display_status}
                />
              ))}
            </div>
          </div>

          {/* Timeline legend */}
          <TimelineLegend displayStatus={item.display_status} />
        </div>
      </div>

      {/* ── Info grid ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: "Customer", value: item.customer_name },
          { label: "NEPL ID",  value: item.nepl_id },
          { label: "SRF No",   value: item.srf_no },
          { label: "DC No",    value: item.dc_number || "—" },
        ].map((kv) => (
          <div
            key={kv.label}
            className="bg-white rounded-xl border border-slate-200 shadow-sm p-4"
          >
            <p className="text-xs text-slate-400 font-semibold uppercase
                          tracking-wide mb-1">
              {kv.label}
            </p>
            <p className="text-sm font-bold text-slate-800 truncate"
               title={kv.value}>
              {kv.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Activity Log ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200
                      p-5 md:p-8">
        <div className="flex items-center gap-2 mb-6">
          <div className="bg-blue-100 p-2 rounded-lg shrink-0">
            <FileText className="h-4 w-4 text-blue-600" />
          </div>
          <h3 className="text-base font-bold text-slate-900">Activity Log</h3>
          <span className="ml-auto text-xs bg-slate-100 text-slate-500
                           font-semibold px-2.5 py-0.5 rounded-full">
            {item.activity_log.length} event
            {item.activity_log.length !== 1 ? "s" : ""}
          </span>
        </div>

        {item.activity_log.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No activity recorded yet.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {item.activity_log.map((log, idx) => (
              <div key={idx} className="flex items-start gap-3 md:gap-4">
                <ActivityIcon type={log.type as ActivityLogType | undefined} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:justify-between
                                  sm:items-start gap-0.5">
                    <p className="text-sm font-bold text-slate-900">
                      {log.title}
                    </p>
                    <span className="text-xs text-slate-400 font-medium
                                     whitespace-nowrap shrink-0">
                      {log.date}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">
                    {log.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ================================================================== //
//  LIST VIEW                                                           //
// ================================================================== //

const ListView: React.FC<{
  data:         TrackingResult;
  onViewDetail: (item: TrackingEquipmentItem) => void;
}> = ({ data, onViewDetail }) => (
  <div className="bg-white rounded-2xl shadow-sm border border-slate-200
                  overflow-hidden animate-in fade-in duration-300">

    {/* Header */}
    <div className="px-5 md:px-6 py-4 border-b border-slate-100 bg-slate-50/60
                    flex flex-col sm:flex-row sm:items-center
                    sm:justify-between gap-2">
      <div>
        <h2 className="text-base font-bold text-slate-800">Search Results</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          {data.equipments.length} record
          {data.equipments.length !== 1 ? "s" : ""} found via{" "}
          <span className="font-semibold text-slate-700">{data.found_via}</span>
        </p>
      </div>
      <span className="self-start sm:self-center text-xs bg-blue-50 text-blue-700
                       border border-blue-100 font-semibold px-3 py-1 rounded-full
                       whitespace-nowrap">
        Query: {data.search_query}
      </span>
    </div>

    {/* Scrollable table */}
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            {[
              "SRF No", "NEPL ID", "Customer",
              "DC Number", "Qty", "Status", "",
            ].map((h) => (
              <th
                key={h}
                className="px-4 md:px-5 py-3 text-xs font-bold text-slate-500
                           uppercase tracking-wider whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100">
          {data.equipments.map((item) => {
            const c = classifyStatus(item.display_status);
            return (
              <tr
                key={item.inward_eqp_id}
                className="hover:bg-blue-50/30 transition-colors group"
              >
                <td className="px-4 md:px-5 py-4 font-semibold text-blue-600
                               whitespace-nowrap">
                  {item.srf_no}
                </td>
                <td className="px-4 md:px-5 py-4 font-bold text-slate-800
                               whitespace-nowrap">
                  {item.nepl_id}
                </td>
                <td className="px-4 md:px-5 py-4 text-slate-600
                               max-w-[160px] md:max-w-[200px] truncate">
                  {item.customer_name}
                </td>
                <td className="px-4 md:px-5 py-4 text-slate-500 whitespace-nowrap">
                  {item.dc_number || <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 md:px-5 py-4">
                  <span className="bg-blue-100 text-blue-800 text-xs font-bold
                                   px-2.5 py-0.5 rounded-full">
                    {item.qty}
                  </span>
                </td>
                <td className="px-4 md:px-5 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    {/* Leading icon for special states */}
                    {c.isTerminated && (
                      <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    )}
                    {(c.isDeviated || c.isOnHold) && (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    )}
                    {c.isOOT && (
                      <Gauge className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                    )}
                    {c.isReady && (
                      <ShieldCheck className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    )}
                    {c.isDispatched && (
                      <Truck className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                    )}
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold
                                  border ${getStatusBadgeClasses(item.display_status)}`}
                    >
                      {item.display_status}
                    </span>
                  </div>
                </td>
                <td className="px-4 md:px-5 py-4">
                  <button
                    onClick={() => onViewDetail(item)}
                    className="flex items-center gap-1.5 text-xs font-semibold
                               text-slate-400 hover:text-blue-600 hover:bg-blue-50
                               px-3 py-1.5 rounded-lg transition-all
                               group-hover:text-blue-500 whitespace-nowrap"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View Details
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);

// ================================================================== //
//  EMPTY STATE                                                         //
// ================================================================== //

const EmptyState: React.FC<{ query: string }> = ({ query }) => (
  <div className="bg-white rounded-2xl shadow-sm border border-slate-200
                  p-12 text-center animate-in fade-in">
    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center
                    justify-center mx-auto mb-4">
      <Search className="h-7 w-7 text-slate-400" />
    </div>
    <h3 className="text-base font-bold text-slate-700 mb-1">No Records Found</h3>
    <p className="text-sm text-slate-500">
      No equipment found matching{" "}
      <span className="font-semibold text-slate-700">"{query}"</span>.
    </p>
    <p className="text-xs text-slate-400 mt-2">
      Try searching with your SRF number, DC number, or NEPL ID.
    </p>
  </div>
);

// ================================================================== //
//  ERROR STATE                                                         //
// ================================================================== //

const ErrorState: React.FC<{ message: string }> = ({ message }) => (
  <div className="bg-red-50 border border-red-100 rounded-2xl p-8
                  text-center animate-in fade-in">
    <div className="w-12 h-12 bg-red-100 rounded-full flex items-center
                    justify-center mx-auto mb-3">
      <AlertCircle className="h-6 w-6 text-red-500" />
    </div>
    <p className="text-sm font-semibold text-red-700">{message}</p>
  </div>
);

// ================================================================== //
//  SEARCH BAR                                                          //
// ================================================================== //

const SearchBar: React.FC<{
  searchQuery: string;
  loading:     boolean;
  onChange:    (v: string) => void;
  onSubmit:    (e: React.FormEvent) => void;
}> = ({ searchQuery, loading, onChange, onSubmit }) => (
  <div className="bg-white rounded-2xl shadow-xl overflow-hidden
                  border border-slate-100 mb-8">

    {/* Hero strip */}
    <div className="bg-gradient-to-r from-blue-700 to-blue-500 p-6 md:p-8
                    relative overflow-hidden">
      <div className="absolute -top-24 -right-24 w-72 h-72 bg-white
                      opacity-5 rounded-full pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-white
                      opacity-5 rounded-full pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row
                      md:justify-between md:items-start gap-4 md:gap-6">
        <div className="flex items-start gap-4">
          <div className="bg-white/20 p-3 rounded-xl backdrop-blur-sm
                          border border-white/20 shrink-0">
            <BadgeCheck className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold text-white
                           tracking-tight mb-1">
              Track Calibration Status
            </h1>
            <p className="text-blue-100 text-sm leading-relaxed">
              Enter your SRF number, DC number, or NEPL ID to view
              real-time calibration progress.
            </p>
          </div>
        </div>

        <Link
          to="/customer"
          className="shrink-0 self-start bg-white/10 hover:bg-white/20 text-white
                     px-4 py-2 rounded-xl backdrop-blur-sm transition-all text-sm
                     font-semibold flex items-center gap-2 border border-white/10"
        >
          <ChevronLeft className="h-4 w-4" />
          Dashboard
        </Link>
      </div>
    </div>

    {/* Search form */}
    <div className="p-5 md:p-8">
      <form onSubmit={onSubmit} className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4
                             text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onChange(e.target.value)}
            placeholder="e.g.  NEPL26024  ·  SRF/2024/001  ·  ZKVH/DC-09-380"
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200
                       rounded-xl text-sm focus:outline-none focus:ring-2
                       focus:ring-blue-500 focus:border-transparent
                       placeholder:text-slate-400 transition-all"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !searchQuery.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60
                     disabled:cursor-not-allowed text-white px-5 md:px-7 py-3
                     rounded-xl font-bold text-sm transition-all flex items-center
                     gap-2 shadow-sm shadow-blue-200 whitespace-nowrap"
        >
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Search  className="h-4 w-4" />
          }
          <span className="hidden sm:inline">
            {loading ? "Searching…" : "Track"}
          </span>
        </button>
      </form>

      {/* Hint chips */}
      <div className="flex flex-wrap gap-2 mt-4">
        {["Search by SRF No", "Search by DC No", "Search by NEPL ID"].map(
          (hint) => (
            <span
              key={hint}
              className="text-xs text-slate-400 bg-slate-50 border
                         border-slate-200 px-3 py-1 rounded-full"
            >
              {hint}
            </span>
          )
        )}
      </div>
    </div>
  </div>
);

// ================================================================== //
//  LOADING SKELETON                                                    //
// ================================================================== //

const LoadingSkeleton: React.FC = () => (
  <div className="space-y-3 animate-pulse">
    {[1, 2, 3].map((n) => (
      <div
        key={n}
        className="h-14 bg-slate-100 rounded-xl"
        style={{ opacity: 1 - n * 0.25 }}
      />
    ))}
  </div>
);

// ================================================================== //
//  MAIN PAGE                                                           //
// ================================================================== //

const TrackStatusPage: React.FC = () => {
  const [searchQuery, setSearchQuery]   = useState("");
  const [searchResult, setSearchResult] = useState<TrackingResult | null>(null);
  const [selectedItem, setSelectedItem] = useState<TrackingEquipmentItem | null>(null);
  const [loading, setLoading]           = useState(false);
  const [hasSearched, setHasSearched]   = useState(false);
  const [errorMsg, setErrorMsg]         = useState<string | null>(null);
  const [errorType, setErrorType]       = useState<"notfound" | "server" | null>(null);

  const handleSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const q = searchQuery.trim();
      if (!q) return;

      setLoading(true);
      setHasSearched(true);
      setSearchResult(null);
      setSelectedItem(null);
      setErrorMsg(null);
      setErrorType(null);

      try {
        const response = await api.get<TrackingResult>(
          ENDPOINTS.PORTAL.TRACK,
          { params: { query: q } }
        );
        setSearchResult(response.data);

        // Auto-open detail view when exactly one NEPL ID match is returned
        if (
          response.data.found_via === "NEPL ID" &&
          response.data.equipments.length === 1
        ) {
          setSelectedItem(response.data.equipments[0]);
        }
      } catch (err: any) {
        if (err.response?.status === 404) {
          setErrorMsg(`No records found for "${q}".`);
          setErrorType("notfound");
        } else {
          setErrorMsg(
            "An error occurred while tracking. Please try again later."
          );
          setErrorType("server");
        }
      } finally {
        setLoading(false);
      }
    },
    [searchQuery]
  );

  const handleBack = useCallback(() => setSelectedItem(null), []);

  return (
    <div className="max-w-6xl mx-auto mt-6 px-4 pb-16">

      {/* Search bar — hidden when detail view is open */}
      {!selectedItem && (
        <SearchBar
          searchQuery={searchQuery}
          loading={loading}
          onChange={setSearchQuery}
          onSubmit={handleSearch}
        />
      )}

      {/* Content area */}
      {loading ? (
        <LoadingSkeleton />
      ) : selectedItem ? (
        <DetailView item={selectedItem} onBack={handleBack} />
      ) : searchResult ? (
        <ListView
          data={searchResult}
          onViewDetail={(item) => setSelectedItem(item)}
        />
      ) : hasSearched && errorType === "notfound" ? (
        <EmptyState query={searchQuery} />
      ) : hasSearched && errorType === "server" ? (
        <ErrorState message={errorMsg ?? "Unknown error."} />
      ) : null}

    </div>
  );
};

export default TrackStatusPage;
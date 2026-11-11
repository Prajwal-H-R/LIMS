import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Calendar as CalendarIcon,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileSpreadsheet,
  Filter,
  Layers,
  LayoutList,
  Loader2,
  Mail,
  Plus,
  Search,
  Send,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { api } from "../api/config";
import {
  CalibrationCertificateReminder,
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

type DaysMode = "7" | "14" | "30" | "45" | "60" | "90" | "180" | "365" | "custom";
type ViewMode = "list" | "calendar";
type SourceFilter = "ALL" | "INTERNAL" | "EXTERNAL";
type IntakeFilter = "ALL" | "AWAITING" | "IN_LAB";

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
  { value: "180", label: "Next 6 months (180d)" },
  { value: "365", label: "Full year (365d)" },
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

const formatDateTime = (value?: string | null) => {
  if (!value) return "Not sent yet";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const daysUntilLabel = (days?: number | null) => {
  if (days === null || days === undefined) return "—";
  if (days === 0) return "Due today";
  if (days === 1) return "1 day left";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  return `${days} days left`;
};

const getDaysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month - 1, 1).getDay();

/* -------------------------------------------------------------------------- */
/*                     SEND CUSTOMER EMAIL MODAL COMPONENT                    */
/* -------------------------------------------------------------------------- */

interface SendCustomerEmailModalProps {
  open: boolean;
  customerGroup: CalibrationReminderGroup | null;
  preselectedCerts?: CalibrationCertificateReminder[];
  daysAhead: number;
  daysBack: number;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

const SendCustomerEmailModal: React.FC<SendCustomerEmailModalProps> = ({
  open,
  customerGroup,
  preselectedCerts,
  daysAhead,
  daysBack,
  onClose,
  onSuccess,
}) => {
  const [emailInput, setEmailInput] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [ccInput, setCcInput] = useState("");
  const [ccRecipients, setCcRecipients] = useState<string[]>([]);
  const [customSubject, setCustomSubject] = useState("");
  const [customNote, setCustomNote] = useState("");
  const [selectedCertIds, setSelectedCertIds] = useState<number[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const availableCerts = useMemo(() => {
    if (preselectedCerts && preselectedCerts.length > 0) return preselectedCerts;
    return customerGroup?.certificates ?? [];
  }, [customerGroup, preselectedCerts]);

  useEffect(() => {
    if (!open || !customerGroup) return;
    const initialEmails = (customerGroup.customer_email || "")
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter((s) => s && s.includes("@"));

    setRecipients(initialEmails);
    setEmailInput("");
    setCcRecipients([]);
    setCcInput("");
    setCustomSubject(
      `Calibration Due Reminder - ${customerGroup.customer_name || "Customer"} (${availableCerts.length} equipment)`
    );
    setCustomNote("");
    setSelectedCertIds(availableCerts.map((c) => c.certificate_id));
    setSendError(null);
  }, [open, customerGroup, availableCerts]);

  if (!open || !customerGroup) return null;

  const addEmailTag = (raw: string, target: "to" | "cc") => {
    const parts = raw
      .split(/[,;\s]+/)
      .map((p) => p.trim())
      .filter((p) => p && p.includes("@"));
    if (parts.length === 0) return;

    if (target === "to") {
      setRecipients((prev) => {
        const existing = new Set(prev.map((x) => x.toLowerCase()));
        const next = [...prev];
        parts.forEach((p) => {
          if (!existing.has(p.toLowerCase())) {
            existing.add(p.toLowerCase());
            next.push(p);
          }
        });
        return next;
      });
      setEmailInput("");
    } else {
      setCcRecipients((prev) => {
        const existing = new Set(prev.map((x) => x.toLowerCase()));
        const next = [...prev];
        parts.forEach((p) => {
          if (!existing.has(p.toLowerCase())) {
            existing.add(p.toLowerCase());
            next.push(p);
          }
        });
        return next;
      });
      setCcInput("");
    }
  };

  const toggleCertSelection = (id: number) => {
    setSelectedCertIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendError(null);

    const finalTo = [...recipients];
    if (emailInput.trim() && emailInput.includes("@")) {
      emailInput
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter((s) => s.includes("@"))
        .forEach((s) => {
          if (!finalTo.some((x) => x.toLowerCase() === s.toLowerCase())) {
            finalTo.push(s);
          }
        });
    }

    const finalCc = [...ccRecipients];
    if (ccInput.trim() && ccInput.includes("@")) {
      ccInput
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter((s) => s.includes("@"))
        .forEach((s) => {
          if (!finalCc.some((x) => x.toLowerCase() === s.toLowerCase())) {
            finalCc.push(s);
          }
        });
    }

    if (finalTo.length === 0) {
      setSendError("Please add at least one valid recipient email address.");
      return;
    }

    if (selectedCertIds.length === 0) {
      setSendError("Please select at least one certificate to include in the reminder email.");
      return;
    }

    setSending(true);
    try {
      const res = await api.post(
        `/calibration-reminders/customer/${customerGroup.customer_id}/send-email`,
        {
          to_emails: finalTo,
          cc_emails: finalCc,
          certificate_ids: selectedCertIds,
          days_ahead: daysAhead,
          days_back: daysBack,
          custom_subject: customSubject.trim() || undefined,
          custom_note: customNote.trim() || undefined,
        }
      );
      const deliveredCount = res.data?.recipients?.length ?? finalTo.length;
      onSuccess(
        `Reminder email sent to ${deliveredCount} recipient(s) for ${customerGroup.customer_name}.`
      );
      onClose();
    } catch (err: unknown) {
      const detail =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      setSendError(detail || "Failed to send reminder email. Please check SMTP configuration.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[380] bg-slate-900/55 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-3xl bg-white shadow-2xl border border-slate-200 flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-white/15 flex items-center justify-center backdrop-blur-sm">
              <Mail className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Send Calibration Reminder Email</h3>
              <p className="text-xs text-blue-100 mt-0.5">
                Customer: <span className="font-semibold text-white">{customerGroup.customer_name}</span> (ID: {customerGroup.customer_id})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSend} className="flex-1 overflow-y-auto p-6 space-y-5">
          {sendError && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-xs font-medium text-red-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{sendError}</span>
            </div>
          )}

          {/* Recipient Emails (Multiple Supported) */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
              To Email(s) — Add Multiple Recipients
            </label>
            <div className="rounded-xl border border-slate-300 bg-slate-50/60 p-2.5 focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition">
              <div className="flex flex-wrap gap-1.5 mb-2">
                {recipients.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs font-semibold text-blue-700"
                  >
                    {email}
                    <button
                      type="button"
                      onClick={() =>
                        setRecipients((prev) => prev.filter((item) => item !== email))
                      }
                      className="text-blue-400 hover:text-blue-700"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addEmailTag(emailInput, "to");
                    }
                  }}
                  placeholder="Type email and press Enter or comma (e.g. manager@client.com)..."
                  className="w-full bg-transparent text-sm outline-none text-slate-800 placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => addEmailTag(emailInput, "to")}
                  className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* CC Emails */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
              CC Email(s) <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 focus-within:border-blue-500 focus-within:bg-white transition">
              {ccRecipients.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {ccRecipients.map((email) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700"
                    >
                      {email}
                      <button
                        type="button"
                        onClick={() =>
                          setCcRecipients((prev) => prev.filter((item) => item !== email))
                        }
                        className="text-slate-500 hover:text-slate-800"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={ccInput}
                  onChange={(e) => setCcInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addEmailTag(ccInput, "cc");
                    }
                  }}
                  placeholder="Add CC emails separated by comma or Enter..."
                  className="w-full bg-transparent text-sm outline-none text-slate-800 placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => addEmailTag(ccInput, "cc")}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 shrink-0"
                >
                  Add CC
                </button>
              </div>
            </div>
          </div>

          {/* Custom Subject */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Subject Line
            </label>
            <input
              type="text"
              value={customSubject}
              onChange={(e) => setCustomSubject(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500"
            />
          </div>

          {/* Custom Note */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Custom Message / Lab Note <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={2}
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="E.g., Please schedule pickup before Friday so our thermal bench is ready for your batch."
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-800 outline-none focus:border-blue-500"
            />
          </div>

          {/* Certificate Selection List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Equipment Included ({selectedCertIds.length} of {availableCerts.length})
              </label>
              <button
                type="button"
                onClick={() =>
                  setSelectedCertIds(
                    selectedCertIds.length === availableCerts.length
                      ? []
                      : availableCerts.map((c) => c.certificate_id)
                  )
                }
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                {selectedCertIds.length === availableCerts.length ? "Deselect All" : "Select All"}
              </button>
            </div>
            <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
              {availableCerts.map((cert) => {
                const checked = selectedCertIds.includes(cert.certificate_id);
                return (
                  <label
                    key={cert.certificate_id}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs hover:bg-slate-50 cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCertSelection(cert.certificate_id)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="truncate">
                        <span className="font-semibold text-slate-800">{cert.certificate_no}</span>
                        <span className="text-slate-500"> · {cert.material_description || cert.nepl_id || "Equipment"}</span>
                        {cert.serial_no && (
                          <span className="text-slate-400"> (S/N: {cert.serial_no})</span>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 font-semibold text-slate-600">
                      {formatDate(cert.recommended_cal_due_date)}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 transition"
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending Email...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send Reminder Now
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                            CUSTOMER SUMMARY CARD                           */
/* -------------------------------------------------------------------------- */

const CustomerSummaryCard: React.FC<{
  group: CalibrationReminderGroup;
  onOpen: () => void;
  onSendEmail: (group: CalibrationReminderGroup) => void;
}> = ({ group, onOpen, onSendEmail }) => {
  const nextDue =
    group.certificates.length > 0
      ? Math.min(...group.certificates.map((cert) => cert.days_until_due))
      : null;

  const isUrgent = nextDue !== null && nextDue <= 7;

  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md hover:border-blue-300 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm shrink-0">
            {(group.customer_name || "C").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-slate-900 truncate">
                {group.customer_name || `Customer #${group.customer_id}`}
              </h3>
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 border border-blue-200">
                {group.due_count} due
              </span>
              {(group.overdue_count ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700 border border-rose-200">
                  <AlertTriangle className="h-3 w-3" />
                  {group.overdue_count} overdue
                </span>
              )}
              {(group.already_in_lab_count ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="h-3 w-3" />
                  {group.already_in_lab_count} in lab
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-3 flex-wrap text-xs text-slate-500">
              <span>
                Customer ID: <strong className="text-slate-700">{group.customer_id}</strong>
              </span>
              <span>·</span>
              <span className="truncate">{group.customer_email || "No email configured"}</span>
              {group.last_notified_at && (
                <>
                  <span>·</span>
                  <span className="text-emerald-700 font-medium">
                    Last emailed: {formatDateTime(group.last_notified_at)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Quick equipment preview chips */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold border ${
              isUrgent
                ? "bg-amber-50 text-amber-800 border-amber-200"
                : "bg-slate-50 text-slate-700 border-slate-200"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            Next due: {daysUntilLabel(nextDue)}
          </span>

          {Array.from(
            new Set(
              group.certificates
                .map((c) => c.material_description)
                .filter(Boolean)
            )
          )
            .slice(0, 3)
            .map((desc) => (
              <span
                key={desc}
                className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-600 truncate max-w-[200px]"
              >
                {desc}
              </span>
            ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2.5 self-end md:self-center shrink-0">
        <button
          type="button"
          onClick={() => onSendEmail(group)}
          className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/80 px-3.5 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-600 hover:text-white hover:border-blue-600"
        >
          <Mail className="h-3.5 w-3.5" />
          Send Email
        </button>

        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          Open Details
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                       MAIN CALIBRATION EXPLORER PAGE                       */
/* -------------------------------------------------------------------------- */

const CalibrationReminderDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { customerId } = useParams<{ customerId: string }>();

  // Automatically support both /engineer and /admin portal routes
  const portalPrefix = useMemo(
    () => (location.pathname.startsWith("/admin") ? "/admin" : "/engineer"),
    [location.pathname]
  );
  const isAdminPortal = portalPrefix === "/admin";

  const [data, setData] = useState<CalibrationReminderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filters & View State
  const [search, setSearch] = useState("");
  const [daysMode, setDaysMode] = useState<DaysMode>("45");
  const [customDays, setCustomDays] = useState<number>(45);
  const [includeOverdue, setIncludeOverdue] = useState<boolean>(false);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("ALL");
  const [intakeFilter, setIntakeFilter] = useState<IntakeFilter>("ALL");
  const [sortMode, setSortMode] = useState<SortMode>("due_asc");
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // Calendar interactive state
  const [calendarScope, setCalendarScope] = useState<"single" | "all">("single");
  const [activeMonthIndex, setActiveMonthIndex] = useState<number>(0);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);

  // Email Modal State
  const [emailModalGroup, setEmailModalGroup] = useState<CalibrationReminderGroup | null>(null);
  const [emailModalCerts, setEmailModalCerts] = useState<CalibrationCertificateReminder[] | undefined>(
    undefined
  );

  const customerIdNum = useMemo(() => {
    const parsed = Number(customerId);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [customerId]);

  const isExplorerMode = customerIdNum === 0;

  const effectiveDaysAhead = useMemo(() => {
    if (daysMode === "custom") {
      return Math.max(1, Math.min(365, Number(customDays) || 45));
    }
    return Number(daysMode);
  }, [daysMode, customDays]);

  const effectiveDaysBack = includeOverdue ? 90 : 0;

  const loadReminders = useCallback(async () => {
    const sortCfg = SORT_MODE_MAP[sortMode];
    const endpoint = isExplorerMode
      ? isAdminPortal
        ? "/calibration-reminders/admin"
        : "/calibration-reminders/engineer"
      : `/calibration-reminders/customer/${customerIdNum}`;

    const params: Record<string, string | number> = {
      days_ahead: effectiveDaysAhead,
      days_back: effectiveDaysBack,
      source_filter: sourceFilter,
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
      setError(msg || "Failed to load calibration reminder data.");
    } finally {
      setLoading(false);
    }
  }, [
    customerIdNum,
    effectiveDaysAhead,
    effectiveDaysBack,
    isAdminPortal,
    isExplorerMode,
    search,
    sortMode,
    sourceFilter,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadReminders();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [loadReminders]);

  // Apply frontend Intake Status filter (All / Awaiting Arrival / Already in Lab)
  const filteredGroups = useMemo<CalibrationReminderGroup[]>(() => {
    const rawGroups = data?.groups ?? [];
    if (intakeFilter === "ALL") return rawGroups;

    return rawGroups
      .map((group) => {
        const filteredCerts = group.certificates.filter((c) =>
          intakeFilter === "IN_LAB" ? Boolean(c.already_in_lab) : !c.already_in_lab
        );
        return {
          ...group,
          due_count: filteredCerts.length,
          certificates: filteredCerts,
        };
      })
      .filter((g) => g.certificates.length > 0);
  }, [data, intakeFilter]);

  const currentGroup = useMemo<CalibrationReminderGroup | undefined>(() => {
    if (isExplorerMode) return undefined;
    return filteredGroups.find((g) => g.customer_id === customerIdNum);
  }, [filteredGroups, customerIdNum, isExplorerMode]);

  const allDisplayedCertificates = useMemo(() => {
    return isExplorerMode
      ? filteredGroups.flatMap((g) => g.certificates)
      : currentGroup?.certificates ?? [];
  }, [isExplorerMode, filteredGroups, currentGroup]);

  const windowDays = data?.window_days ?? effectiveDaysAhead;

  // Calendar aggregation by YYYY-MM-DD
  const certificatesByDate = useMemo(() => {
    const map = new Map<string, CalibrationCertificateReminder[]>();
    allDisplayedCertificates.forEach((cert) => {
      if (!cert.recommended_cal_due_date) return;
      const d = new Date(cert.recommended_cal_due_date);
      if (Number.isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(cert);
    });
    return map;
  }, [allDisplayedCertificates]);

  // Generate continuous list of months covering the active window
  const monthsToRender = useMemo(() => {
    const months = new Set<string>();
    const today = new Date();
    const endDate = new Date();
    endDate.setDate(today.getDate() + effectiveDaysAhead);

    const cursor = new Date(today.getFullYear(), today.getMonth(), 1);
    const limit = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

    while (cursor <= limit) {
      months.add(
        `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`
      );
      cursor.setMonth(cursor.getMonth() + 1);
    }

    allDisplayedCertificates.forEach((cert) => {
      if (cert.recommended_cal_due_date) {
        const d = new Date(cert.recommended_cal_due_date);
        if (!Number.isNaN(d.getTime())) {
          months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
        }
      }
    });

    return Array.from(months).sort();
  }, [allDisplayedCertificates, effectiveDaysAhead]);

  useEffect(() => {
    if (activeMonthIndex >= monthsToRender.length) {
      setActiveMonthIndex(0);
    }
  }, [monthsToRender, activeMonthIndex]);

  // Selected Day Drawer Data
  const selectedDayCerts = useMemo(() => {
    if (!selectedCalendarDate) return [];
    return certificatesByDate.get(selectedCalendarDate) ?? [];
  }, [certificatesByDate, selectedCalendarDate]);

  const selectedDayCustomerGroups = useMemo(() => {
    const map = new Map<number, CalibrationReminderGroup>();
    selectedDayCerts.forEach((cert) => {
      const cid = cert.customer_id || 0;
      if (!map.has(cid)) {
        map.set(cid, {
          customer_id: cid,
          customer_name: cert.customer_name || `Customer #${cid}`,
          customer_email: cert.customer_email || "",
          due_count: 0,
          certificates: [],
        });
      }
      const grp = map.get(cid)!;
      grp.certificates.push(cert);
      grp.due_count = grp.certificates.length;
    });
    return Array.from(map.values());
  }, [selectedDayCerts]);

  // CSV Export Handler
  const handleExportCsv = () => {
    if (allDisplayedCertificates.length === 0) return;

    const headers = [
      "Certificate No",
      "Customer ID",
      "Customer Name",
      "Customer Email",
      "NEPL ID",
      "Equipment Description",
      "Make",
      "Model",
      "Serial No",
      "Due Date",
      "Days Until Due",
      "Source",
      "Intake Status",
    ];

    const escapeCsv = (val: unknown) => {
      const s = String(val ?? "").replace(/"/g, '""');
      return `"${s}"`;
    };

    const rows = allDisplayedCertificates.map((c) =>
      [
        c.certificate_no,
        c.customer_id,
        c.customer_name,
        c.customer_email,
        c.nepl_id,
        c.material_description,
        c.make,
        c.model,
        c.serial_no,
        c.recommended_cal_due_date,
        c.days_until_due,
        c.source_type || "INTERNAL",
        c.already_in_lab ? `In Lab (${c.renewal_srf_no || "Received"})` : "Awaiting Arrival",
      ]
        .map(escapeCsv)
        .join(",")
    );

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `calibration_schedule_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openCustomerDetails = (id: number) => {
    navigate(`${portalPrefix}/calibration-reminders/${id}`);
  };

  const handleOpenEmailModal = (
    group: CalibrationReminderGroup,
    subsetCerts?: CalibrationCertificateReminder[]
  ) => {
    setEmailModalGroup(group);
    setEmailModalCerts(subsetCerts);
  };

  // High-load days count for metric card
  const busyDaysCount = useMemo(() => {
    let count = 0;
    certificatesByDate.forEach((certs) => {
      if (certs.length >= 5) count += 1;
    });
    return count;
  }, [certificatesByDate]);

  const visibleCalendarMonths =
    calendarScope === "single"
      ? monthsToRender.slice(activeMonthIndex, activeMonthIndex + 1)
      : monthsToRender;

  return (
    <div className="space-y-6">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3.5 text-sm font-medium text-emerald-900 shadow-sm flex items-center justify-between animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-emerald-700 hover:text-emerald-950"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main Card Container matching Nextage Portal Theme */}
      <div className="p-6 md:p-8 bg-white rounded-3xl shadow-sm border border-slate-200/90">
        {/* Top Portal Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/20 shrink-0">
              <Wrench className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-bold text-slate-900">
                  {isExplorerMode ? "Calibration Explorer" : "Customer Calibration Due Details"}
                </h1>
                {/* <span className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200 px-3 py-0.5 text-xs font-semibold text-blue-700">
                  {isAdminPortal ? "Admin Portal" : "Engineer Portal"}
                </span> */}
              </div>
              <p className="text-sm text-slate-500 mt-1">
                {isExplorerMode
                  ? `Track incoming customer equipment, and send recall reminders`
                  : `${currentGroup?.customer_name || "Customer"} · ${currentGroup?.customer_email || "No email on record"}`}
              </p>
            </div>
          </div>

{/* Right Action Controls: View Switcher (Icons Only) + Export + Back on same line */}
<div className="flex items-center gap-2.5 flex-nowrap shrink-0">
  <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
    <button
      type="button"
      onClick={() => setViewMode("list")}
      title="List View"
      aria-label="List View"
      className={`flex items-center justify-center p-2 rounded-lg transition ${
        viewMode === "list"
          ? "bg-blue-600 text-white shadow-sm"
          : "text-slate-600 hover:text-slate-900"
      }`}
    >
      <LayoutList className="h-4 w-4" />
    </button>
    <button
      type="button"
      onClick={() => setViewMode("calendar")}
      title="Calendar View"
      aria-label="Calendar View"
      className={`flex items-center justify-center p-2 rounded-lg transition ${
        viewMode === "calendar"
          ? "bg-blue-600 text-white shadow-sm"
          : "text-slate-600 hover:text-slate-900"
      }`}
    >
      <CalendarIcon className="h-4 w-4" />
    </button>
  </div>


  {!isExplorerMode && currentGroup && (
    <button
      type="button"
      onClick={() => handleOpenEmailModal(currentGroup)}
      className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition"
    >
      <Mail className="h-4 w-4" />
      Send Reminder Email
    </button>
  )}


  <button
    type="button"
    onClick={handleExportCsv}
    disabled={allDisplayedCertificates.length === 0}
    className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition"
    title="Export current view to CSV"
  >
    <Download className="h-4 w-4 text-slate-500" />
    Export CSV
  </button>


  <button
    type="button"
    onClick={() =>
      isExplorerMode
        ? navigate(portalPrefix)
        : navigate(`${portalPrefix}/calibration-reminders/0`)
    }
    className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
  >
    <ArrowLeft className="h-4 w-4" />
    {isExplorerMode ? "Back" : "All Customers"}
  </button>
</div>
        </div>

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 my-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                Planning Window
              </div>
              <div className="text-lg font-bold text-slate-900 mt-0.5">
                {windowDays} Days {includeOverdue ? "(+Overdue)" : ""}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                {isExplorerMode ? "Customer Companies" : "Customer ID"}
              </div>
              <div className="text-lg font-bold text-slate-900 mt-0.5">
                {isExplorerMode
                  ? filteredGroups.length
                  : `#${currentGroup?.customer_id ?? customerIdNum}`}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                Equipment Due
              </div>
              <div className="text-lg font-bold text-slate-900 mt-0.5">
                {allDisplayedCertificates.length} Certificate(s)
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 flex items-center gap-3.5">
            <div
              className={`h-11 w-11 rounded-xl text-white flex items-center justify-center shrink-0 ${
                busyDaysCount > 0 ? "bg-amber-500" : "bg-teal-600"
              }`}
            >
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                Lab Traffic Alert
              </div>
              <div className="text-sm font-bold text-slate-900 mt-0.5">
                {busyDaysCount > 0
                  ? `${busyDaysCount} Heavy Day(s) — Plan Ahead`
                  : "Balanced Daily Load"}
              </div>
            </div>
          </div>
        </div>

        {/* Unified Search & Filter Toolbar (No Duplicate Sort Boxes) */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 mb-6 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            {/* Search Input */}
            <div className="md:col-span-4 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 flex items-center gap-2 focus-within:border-blue-500">
              <Search className="h-4 w-4 text-slate-400 shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full outline-none text-sm text-slate-800 placeholder:text-slate-400"
                placeholder={
                  isExplorerMode
                    ? "Search company, certificate, NEPL, serial, material..."
                    : "Search certificate, NEPL, serial, SRF, material..."
                }
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Days Window Preset */}
            <div className="md:col-span-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-blue-600 shrink-0" />
              <select
                value={daysMode}
                onChange={(e) => setDaysMode(e.target.value as DaysMode)}
                className="w-full outline-none text-sm bg-transparent text-slate-800 font-medium"
              >
                {DAYS_PRESETS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
                <option value="custom">Custom days (1–365)</option>
              </select>
            </div>

            {/* Source Type Filter */}
            <div className="md:col-span-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 flex items-center gap-2">
              <Layers className="h-4 w-4 text-slate-400 shrink-0" />
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
                className="w-full outline-none text-sm bg-transparent text-slate-800"
              >
                <option value="ALL">Source: All</option>
                <option value="INTERNAL">Internal Lab</option>
                <option value="EXTERNAL">External Upload</option>
              </select>
            </div>

            {/* Sort Selector */}
            <div className="md:col-span-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400 shrink-0" />
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="w-full outline-none text-sm bg-transparent text-slate-800"
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

          {/* Secondary Filter Pills Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2 flex-wrap">
              {daysMode === "custom" && (
                <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-1.5">
                  <span className="text-xs font-semibold text-slate-600">Days ahead:</span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={customDays}
                    onChange={(e) => setCustomDays(Number(e.target.value))}
                    className="w-20 text-xs font-bold text-blue-700 outline-none"
                  />
                </div>
              )}

              {/* Overdue Toggle */}
              <button
                type="button"
                onClick={() => setIncludeOverdue((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold border transition ${
                  includeOverdue
                    ? "bg-rose-50 text-rose-700 border-rose-200"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                {includeOverdue ? "Showing Overdue (Last 90d)" : "Include Overdue Equipment"}
              </button>

              {/* Intake Status Pills */}
              <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5">
                {(
                  [
                    { id: "ALL", label: "All Status" },
                    { id: "AWAITING", label: "Awaiting Arrival" },
                    { id: "IN_LAB", label: "Already In Lab" },
                  ] as Array<{ id: IntakeFilter; label: string }>
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setIntakeFilter(tab.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                      intakeFilter === tab.id
                        ? "bg-blue-600 text-white"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs text-slate-500">
              Showing <strong className="text-slate-800">{allDisplayedCertificates.length}</strong>{" "}
              equipment across <strong className="text-slate-800">{filteredGroups.length}</strong>{" "}
              customer(s)
            </div>
          </div>
        </div>

        {/* Loading & Error States */}
        {loading && (
          <div className="flex items-center gap-2.5 text-slate-600 text-sm py-12 justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            Loading calibration schedule...
          </div>
        )}

        {!loading && error && (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm mb-4">
            {error}
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/*                        INTERACTIVE CALENDAR VIEW                   */}
        {/* ------------------------------------------------------------------ */}
        {!loading && !error && viewMode === "calendar" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Calendar Toolbar & Legend */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
              <div className="flex items-center gap-2">
                {calendarScope === "single" && monthsToRender.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={activeMonthIndex <= 0}
                      onClick={() => setActiveMonthIndex((i) => Math.max(0, i - 1))}
                      className="h-8 w-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <select
                      value={activeMonthIndex}
                      onChange={(e) => setActiveMonthIndex(Number(e.target.value))}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-800 outline-none"
                    >
                      {monthsToRender.map((mStr, idx) => {
                        const [y, m] = mStr.split("-");
                        const label = new Date(Number(y), Number(m) - 1, 1).toLocaleString(
                          "default",
                          { month: "long", year: "numeric" }
                        );
                        return (
                          <option key={mStr} value={idx}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                    <button
                      type="button"
                      disabled={activeMonthIndex >= monthsToRender.length - 1}
                      onClick={() =>
                        setActiveMonthIndex((i) => Math.min(monthsToRender.length - 1, i + 1))
                      }
                      className="h-8 w-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() =>
                    setCalendarScope((prev) => (prev === "single" ? "all" : "single"))
                  }
                  className="ml-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition"
                >
                  {calendarScope === "single"
                    ? `Show All ${monthsToRender.length} Month(s)`
                    : "Single Month View"}
                </button>
              </div>

              {/* Load Legend */}
              <div className="flex items-center gap-4 text-xs flex-wrap">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                  1–2 Normal
                </span>
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  3–4 Moderate
                </span>
                <span className="flex items-center gap-1.5 text-rose-700 font-semibold">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                  5+ Heavy Load (Plan Ahead)
                </span>
              </div>
            </div>

            {/* Month Grid(s) */}
            {visibleCalendarMonths.map((monthStr) => {
              const [y, m] = monthStr.split("-");
              const year = parseInt(y, 10);
              const month = parseInt(m, 10);

              const daysInMonth = getDaysInMonth(year, month);
              const firstDay = getFirstDayOfMonth(year, month);

              const blanks = Array.from({ length: firstDay });
              const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
              const totalCells = blanks.length + days.length;
              const endBlanks = Array.from({ length: (7 - (totalCells % 7)) % 7 });

              const monthName = new Date(year, month - 1, 1).toLocaleString("default", {
                month: "long",
                year: "numeric",
              });
              const todayStr = new Date().toISOString().split("T")[0];

              return (
                <div
                  key={monthStr}
                  className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm"
                >
                  <div className="bg-gradient-to-r from-slate-50 to-blue-50/40 px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="text-base font-bold text-slate-900">{monthName}</h3>
                    <span className="text-xs text-slate-500">
                      Click any date box to inspect equipment & send customer reminders
                    </span>
                  </div>

                  <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                      <div
                        key={day}
                        className="py-2.5 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wider"
                      >
                        {day}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 bg-slate-200 gap-[1px]">
                    {blanks.map((_, i) => (
                      <div key={`blank-${i}`} className="min-h-[128px] bg-slate-50/60" />
                    ))}

                    {days.map((day) => {
                      const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(
                        day
                      ).padStart(2, "0")}`;
                      const dayCerts = certificatesByDate.get(dateKey) || [];
                      const count = dayCerts.length;
                      const isHeavy = count >= 5;
                      const isModerate = count >= 3 && count < 5;
                      const isToday = dateKey === todayStr;
                      const isSelected = selectedCalendarDate === dateKey;

                      const uniqueCompanies = Array.from(
                        new Set(dayCerts.map((c) => c.customer_name || `Customer #${c.customer_id}`))
                      );

                      return (
                        <button
                          key={dateKey}
                          type="button"
                          onClick={() => setSelectedCalendarDate(dateKey)}
                          className={`min-h-[128px] p-2.5 text-left transition flex flex-col justify-between focus:outline-none ${
                            isSelected
                              ? "bg-blue-50/90 ring-2 ring-inset ring-blue-600"
                              : isHeavy
                              ? "bg-rose-50/30 hover:bg-rose-50/60"
                              : "bg-white hover:bg-blue-50/30"
                          }`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span
                              className={`text-xs font-bold flex items-center justify-center h-6 w-6 rounded-full ${
                                isToday
                                  ? "bg-blue-600 text-white shadow-sm"
                                  : "text-slate-700"
                              }`}
                            >
                              {day}
                            </span>

                            {count > 0 && (
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                  isHeavy
                                    ? "bg-rose-100 text-rose-800 border-rose-200"
                                    : isModerate
                                    ? "bg-amber-100 text-amber-800 border-amber-200"
                                    : "bg-blue-50 text-blue-700 border-blue-200"
                                }`}
                              >
                                {count} due
                              </span>
                            )}
                          </div>

                          {count > 0 && (
                            <div className="mt-2 space-y-1 w-full">
                              {uniqueCompanies.slice(0, 2).map((comp) => (
                                <div
                                  key={comp}
                                  className="truncate text-[11px] font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200/80"
                                >
                                  {comp}
                                </div>
                              ))}
                              {uniqueCompanies.length > 2 && (
                                <div className="text-[10px] font-semibold text-blue-600 pl-1">
                                  +{uniqueCompanies.length - 2} more company
                                </div>
                              )}

                              {isHeavy && (
                                <div className="pt-0.5 flex items-center gap-1 text-[10px] font-bold text-rose-600 uppercase tracking-tight">
                                  <AlertTriangle className="h-3 w-3 shrink-0" />
                                  Heavy Lab Load
                                </div>
                              )}
                            </div>
                          )}
                        </button>
                      );
                    })}

                    {endBlanks.map((_, i) => (
                      <div key={`endblank-${i}`} className="min-h-[128px] bg-slate-50/60" />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/*                              LIST VIEW                             */}
        {/* ------------------------------------------------------------------ */}
        {!loading && !error && viewMode === "list" && isExplorerMode && filteredGroups.length === 0 && (
          <div className="p-8 rounded-2xl bg-amber-50/70 border border-amber-200 text-amber-900 text-sm text-center">
            No customer groups found for the selected filters. Try expanding the window to 90 or 365 days, or enabling Overdue lookback.
          </div>
        )}

        {!loading && !error && viewMode === "list" && isExplorerMode && filteredGroups.length > 0 && (
          <div className="space-y-3.5 animate-in fade-in duration-200">
            {filteredGroups.map((group) => (
              <CustomerSummaryCard
                key={group.customer_id}
                group={group}
                onOpen={() => openCustomerDetails(group.customer_id)}
                onSendEmail={(grp) => handleOpenEmailModal(grp)}
              />
            ))}
          </div>
        )}

        {!loading && !error && viewMode === "list" && !isExplorerMode && !currentGroup && (
          <div className="p-8 rounded-2xl bg-amber-50/70 border border-amber-200 text-amber-900 text-sm text-center">
            No matching certificates found for this customer in the selected window.
          </div>
        )}

        {!loading && !error && viewMode === "list" && !isExplorerMode && currentGroup && (
          <div className="animate-in fade-in duration-200">
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-500 font-bold">
                    <th className="px-4 py-3.5">Certificate No</th>
                    <th className="px-4 py-3.5">NEPL ID</th>
                    <th className="px-4 py-3.5">Equipment / Material</th>
                    <th className="px-4 py-3.5">Serial No</th>
                    <th className="px-4 py-3.5">Source</th>
                    <th className="px-4 py-3.5">Intake Status</th>
                    <th className="px-4 py-3.5">Due Date</th>
                    <th className="px-4 py-3.5">Timeline</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentGroup.certificates.map((cert) => {
                    const isOverdue = cert.days_until_due < 0;
                    const isUrgent = cert.days_until_due >= 0 && cert.days_until_due <= 7;

                    return (
                      <tr key={cert.certificate_id} className="hover:bg-slate-50/80 transition">
                        <td className="px-4 py-3.5 font-bold text-slate-900">
                          {cert.certificate_no}
                        </td>
                        <td className="px-4 py-3.5 text-slate-700">{cert.nepl_id || "—"}</td>
                        <td className="px-4 py-3.5 text-slate-700">
                          <div className="font-medium text-slate-800">
                            {cert.material_description || "—"}
                          </div>
                          {(cert.make || cert.model) && (
                            <div className="text-xs text-slate-400">
                              {[cert.make, cert.model].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-slate-700">{cert.serial_no || "—"}</td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold ${
                              cert.source_type === "EXTERNAL"
                                ? "bg-purple-50 text-purple-700 border border-purple-200"
                                : "bg-blue-50 text-blue-700 border border-blue-200"
                            }`}
                          >
                            {cert.source_type || "INTERNAL"}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          {cert.already_in_lab ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              In Lab {cert.renewal_srf_no ? `(${cert.renewal_srf_no})` : ""}
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                              Awaiting Arrival
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 font-medium text-slate-800">
                          {formatDate(cert.recommended_cal_due_date)}
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold border ${
                              isOverdue
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : isUrgent
                                ? "bg-amber-50 text-amber-800 border-amber-200"
                                : "bg-blue-50 text-blue-700 border-blue-200"
                            }`}
                          >
                            <CalendarDays className="h-3.5 w-3.5" />
                            {daysUntilLabel(cert.days_until_due)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------------------- */}
      {/*                INTERACTIVE CALENDAR DAY SLIDE-OVER DRAWER              */}
      {/* ---------------------------------------------------------------------- */}
      {selectedCalendarDate && (
        <div className="fixed inset-0 z-[360] bg-slate-900/45 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-xl bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col animate-in slide-in-from-right duration-200">
            <div className="px-6 py-5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-100">
                  Daily Lab Readiness Schedule
                </span>
                <h3 className="text-xl font-bold mt-0.5">
                  {formatDate(selectedCalendarDate)}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCalendarDate(null)}
                className="h-9 w-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50/60">
              {/* Capacity Readiness Banner */}
              <div
                className={`rounded-2xl p-4 border flex items-start gap-3 ${
                  selectedDayCerts.length >= 5
                    ? "bg-rose-50 border-rose-200 text-rose-900"
                    : selectedDayCerts.length > 0
                    ? "bg-blue-50 border-blue-200 text-blue-900"
                    : "bg-slate-100 border-slate-200 text-slate-700"
                }`}
              >
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  {selectedDayCerts.length >= 5 ? (
                    <>
                      <strong className="font-bold block text-sm">
                        Heavy Equipment Traffic ({selectedDayCerts.length} items due)
                      </strong>
                      Keep calibration engineers and reference standards ready in advance, or coordinate staggered intake with customers below.
                    </>
                  ) : selectedDayCerts.length > 0 ? (
                    <>
                      <strong className="font-bold block text-sm">
                        {selectedDayCerts.length} Equipment Scheduled for Calibration
                      </strong>
                      Review customer batches below or trigger an immediate reminder email.
                    </>
                  ) : (
                    <strong className="font-bold block text-sm">
                      No equipment due on this date.
                    </strong>
                  )}
                </div>
              </div>

              {/* Customer Batches on Selected Date */}
              {selectedDayCustomerGroups.map((grp) => (
                <div
                  key={grp.customer_id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">
                        {grp.customer_name}
                      </h4>
                      <p className="text-xs text-slate-500">
                        {grp.customer_email || "No email on record"} · {grp.due_count} item(s) due on this day
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEmailModal(grp, grp.certificates)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Send Email
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCalendarDate(null);
                          openCustomerDetails(grp.customer_id);
                        }}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Open
                      </button>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100 border-t border-slate-100 pt-2">
                    {grp.certificates.map((cert) => (
                      <div
                        key={cert.certificate_id}
                        className="py-2 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-bold text-slate-800">
                            {cert.certificate_no}
                          </span>
                          <span className="text-slate-600">
                            {" "}
                            · {cert.material_description || cert.nepl_id || "Equipment"}
                          </span>
                          {cert.serial_no && (
                            <span className="text-slate-400"> (S/N: {cert.serial_no})</span>
                          )}
                        </div>
                        {cert.already_in_lab ? (
                          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                            In Lab
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            {cert.source_type || "INTERNAL"}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Multi-Email Customer Reminder Popup Modal */}
      <SendCustomerEmailModal
        open={Boolean(emailModalGroup)}
        customerGroup={emailModalGroup}
        preselectedCerts={emailModalCerts}
        daysAhead={effectiveDaysAhead}
        daysBack={effectiveDaysBack}
        onClose={() => {
          setEmailModalGroup(null);
          setEmailModalCerts(undefined);
        }}
        onSuccess={(msg) => {
          setToastMessage(msg);
          void loadReminders();
        }}
      />
    </div>
  );
};

export default CalibrationReminderDetailsPage;
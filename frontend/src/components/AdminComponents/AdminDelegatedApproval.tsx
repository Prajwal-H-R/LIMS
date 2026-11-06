
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { api, ENDPOINTS } from "../../api/config";

type ApprovalType = "fir" | "srf" | "final";
type ApprovalTab = "pending" | "reviewed" | "approved" | "rejected";
type AnyRecord = Record<string, any>;
type ApprovalState = "pending" | "reviewed" | "approved" | "rejected";

interface AdminDelegatedApprovalProps {
  onBack: () => void;
}

interface ApprovalCardConfig {
  id: ApprovalType;
  title: string;
  description: string;
  icon: React.ElementType;
  iconClass: string;
}

interface ApprovalTabConfig {
  id: ApprovalTab;
  label: string;
}

type WCCDetailItem = {
  po_s_no?: number | null;
  description_of_work?: string | null;
  uom?: string | null;
  quantity_completed?: number | string | null;
  sac_no?: string | null;
  status_of_work_completed?: string | null;
};

type WCCRecord = {
  id: number;
  inward_id: number | null;
  vendor_company_details?: string | null;
  tax_registration_details?: string | null;
  nextage_dispatch_dc_no?: string | null;
  date?: string | null;
  services_delivered_to?: string | null;
  work_location_1?: string | null;
  work_location_2?: string | null;
  work_location_3?: string | null;
  gst_no?: string | null;
  pan_no?: string | null;
  wcc_no?: string | null;
  work_start_date?: string | null;
  work_completion_date?: string | null;
  po_no?: string | null;
  po_date?: string | null;
  project_name?: string | null;
  details_table?: WCCDetailItem[] | null;
  remarks?: string | null;
  signature_details?: {
    representative_and_company_seal_name?: string | null;
    vendor_representative_company_seal_name?: string | null;
  } | null;
  srf_no?: string | null;
  customer_dc_no?: string | null;
  created_at?: string;
  updated_at?: string;
};

const WCC_COLLECTION = "/work-completion-certificates/";

const PAGE_SIZE = 1000;

const APPROVAL_CARDS: ApprovalCardConfig[] = [
  {
    id: "fir",
    title: "First Inspection Report",
    description:
      "Review and approve the First Inspection Report,awaiting customer action",
    icon: FileText,
    iconClass: "bg-blue-50 text-blue-700 border-blue-100",
  },
  {
    id: "srf",
    title: "SRF Management",
    description:
      "Review and approve Service Request Form,awaiting customer action",
    icon: ClipboardCheck,
    iconClass: "bg-violet-50 text-violet-700 border-violet-100",
  },
  {
    id: "final",
    title: "Final Inspection Report",
    description:
      "Review dispatched final inspection reports and record the customer's decision.",
    icon: FileCheck2,
    iconClass: "bg-emerald-50 text-emerald-700 border-emerald-100",
  },
];

const getErrorMessage = (error: any, fallback: string): string =>
  error?.response?.data?.detail ||
  error?.response?.data?.message ||
  error?.message ||
  fallback;

const getArray = (payload: any, ...keys: string[]): AnyRecord[] => {
  if (Array.isArray(payload)) return payload;

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }

  return [];
};

const isTrue = (value: any): boolean =>
  value === true || value === 1 || String(value).toLowerCase() === "true";

const normalizeText = (value: any): string =>
  value === null || value === undefined ? "" : String(value).trim();

const getRecordId = (type: ApprovalType, item: AnyRecord): number =>
  Number(type === "srf" ? item.srf_id ?? item.id : item.inward_id ?? item.id);

const getSrfNumber = (item: AnyRecord): string => {
  const value =
    item?.nepl_srf_no ||
    item?.srf_no ||
    item?.displayNumber ||
    item?.srf?.nepl_srf_no ||
    item?.inward?.srf_no;

  if (value === null || value === undefined || String(value).trim() === "") {
    return "—";
  }

  return String(value).replace(/^SRF\s*No:\s*/i, "").trim();
};

const getCustomerName = (item: AnyRecord): string => {
  const value =
    item?.customer_details ||
    item?.customer_name ||
    item?.company_name ||
    item?.customer?.customer_details ||
    item?.inward?.customer?.customer_details ||
    item?.inward?.customer_details;

  return normalizeText(value) || "—";
};

const formatDate = (value?: string | null): string => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const getListDate = (type: ApprovalType, item: AnyRecord): string | null => {
  if (type === "fir") {
    return (
      item?.material_inward_date ||
      item?.received_date ||
      item?.date ||
      item?.created_at ||
      null
    );
  }

  if (type === "srf") {
    return item?.date || item?.item_date || item?.created_at || null;
  }

  return item?.report_sent_at || item?.created_at || null;
};

const getEquipmentRows = (
  type: ApprovalType,
  record: AnyRecord | null | undefined
): AnyRecord[] => {
  if (!record) return [];

  if (type === "srf") {
    const nestedRows = getArray(record?.inward?.equipments, "items", "data");

    return nestedRows.length
      ? nestedRows
      : getArray(record?.equipments, "items", "data");
  }

  return getArray(record?.equipments, "equipment_list", "items", "data");
};

/**
 * Fetch all pages from existing paginated list endpoints.
 * The supplied routers cap each request at 1,000 records.
 */
const fetchAllPages = async (
  url: string,
  baseParams: AnyRecord,
  responseKeys: string[]
): Promise<AnyRecord[]> => {
  const allRows: AnyRecord[] = [];

  let skip = 0;
  let expectedTotal: number | null = null;

  for (let page = 0; page < 100; page += 1) {
    const response = await api.get(url, {
      params: {
        ...baseParams,
        skip,
        limit: PAGE_SIZE,
      },
    });

    const pageRows = getArray(response.data, ...responseKeys);

    allRows.push(...pageRows);

    const rawTotal = Number(
      response.data?.total_count ??
      response.data?.total ??
      response.data?.total_records
    );

    if (Number.isFinite(rawTotal) && rawTotal >= 0) {
      expectedTotal = rawTotal;
    }

    if (pageRows.length < PAGE_SIZE) break;

    if (expectedTotal !== null && allRows.length >= expectedTotal) break;

    skip += pageRows.length;
  }

  return allRows;
};

/**
 * Keep final-report decision lookups bounded.
 * The supplied final-inspection list endpoint does not return
 * customer_decision, so use the existing customer-view endpoint
 * to hydrate dispatched reports.
 */
const mapInBatches = async <T, R>(
  rows: T[],
  batchSize: number,
  mapper: (row: T) => Promise<R>
): Promise<R[]> => {
  const results: R[] = [];

  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const mapped = await Promise.all(batch.map(mapper));

    results.push(...mapped);
  }

  return results;
};

const getApprovalTabs = (type: ApprovalType): ApprovalTabConfig[] => {
  if (type === "fir") {
    return [
      { id: "pending", label: "Pending Customer Review" },
      { id: "reviewed", label: "Reviewed" },
    ];
  }

  if (type === "srf") {
    return [
      { id: "pending", label: "Customer Review Pending" },
      { id: "approved", label: "Approved" },
      { id: "rejected", label: "Rejected" },
    ];
  }

  return [
    { id: "pending", label: "Awaiting Customer Approval" },
    { id: "approved", label: "Approved" },
    { id: "rejected", label: "Rejected" },
  ];
};

const getDefaultTab = (_type: ApprovalType): ApprovalTab => "pending";

const getApprovalState = (
  type: ApprovalType,
  record: AnyRecord | null | undefined
): ApprovalState => {
  if (!record) return "pending";

  if (type === "fir") {
    const equipmentRows = getEquipmentRows("fir", record);

    const equipmentStatuses = equipmentRows.map((equipment) =>
      normalizeText(equipment?.status).toLowerCase()
    );

    // FIR review is equipment-wise.
    // One pending equipment row keeps the inward/FIR in the pending queue.

    if (equipmentStatuses.some((status) => status === "pending")) {
      return "pending";
    }

    const parentStatus = normalizeText(record?.status).toLowerCase();

    if (
      parentStatus === "reviewed" ||
      parentStatus === "approved" ||
      (
        equipmentStatuses.length > 0 &&
        equipmentStatuses.every(
          (status) => status === "reviewed" || status === "approved"
        )
      )
    ) {
      return "reviewed";
    }

    return normalizeText(record?.__approvalState).toLowerCase() === "reviewed"
      ? "reviewed"
      : "pending";
  }

  if (type === "srf") {
    const status = normalizeText(
      record?.status || record?.__approvalState
    ).toLowerCase();

    if (status === "approved") return "approved";
    if (status === "rejected") return "rejected";

    return "pending";
  }

  const decision = normalizeText(
    record?.customer_decision ||
    record?.decision ||
    record?.status
  ).toUpperCase();

  if (decision === "APPROVED") return "approved";
  if (decision === "REJECTED") return "rejected";

  return "pending";
};

const getStatusPresentation = (
  type: ApprovalType,
  state: ApprovalState
): { label: string; className: string } => {
  if (type === "fir") {
    if (state === "reviewed") {
      return {
        label: "Reviewed",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    }

    return {
      label: "Pending customer review",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  if (state === "approved") {
    return {
      label: "Approved",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (state === "rejected") {
    return {
      label: "Rejected",
      className: "border-red-200 bg-red-50 text-red-700",
    };
  }

  return {
    label: type === "final" ? "Awaiting approval" : "Awaiting customer review",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  };
};

const DetailField: React.FC<{ label: string; value?: React.ReactNode }> = ({
  label,
  value,
}) => (
  <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
      {label}
    </p>

    <div className="mt-1 break-words text-sm font-medium text-slate-800">
      {value === null || value === undefined || value === "" ? "—" : value}
    </div>
  </div>
);

function WCCReadOnlyField({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: unknown;
  multiline?: boolean;
}) {
  const displayValue = value === null || value === undefined || String(value).trim() === "" ? "—" : String(value);
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 break-words text-sm text-slate-800 ${multiline ? "whitespace-pre-wrap" : ""}`}>{displayValue}</div>
    </div>
  );
}

function WCCReadOnlyModal({
  wcc,
  onClose,
  onDownload,
}: {
  wcc: WCCRecord;
  onClose: () => void;
  onDownload: () => void;
}) {
  const rows = Array.isArray(wcc.details_table) ? wcc.details_table : [];
  return (
    <div data-wcc-modal className="fixed inset-x-0 bottom-0 top-[70px] z-[100] flex items-center justify-center p-3 sm:p-4 lg:left-[270px]" role="dialog" aria-modal="true" aria-labelledby="customer-wcc-title">
      <button type="button" aria-label="Close WCC view" className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[calc(100vh-8rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-900 px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <FileCheck2 className="h-6 w-6 text-blue-300" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-300">Nextage Engineering</p>
              <h2 id="customer-wcc-title" className="mt-1 text-lg font-bold">Work Completion Certificate</h2>
              <p className="mt-0.5 text-xs text-slate-300">WCC No: {wccSafe(wcc.wcc_no) || "—"} · Read-only customer view</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onDownload} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-bold text-slate-800 transition hover:bg-blue-50">
              <Download className="h-4 w-4" /> Download PDF
            </button>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>
        <div data-wcc-scroll-container className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <section className="space-y-3">
            <h3 className="border-b border-slate-100 pb-2 text-sm font-bold uppercase tracking-wide text-blue-700">Vendor Details</h3>
            <WCCReadOnlyField label="Vendor Company Details" value={wcc.vendor_company_details} multiline />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <WCCReadOnlyField label="Tax Registration Details" value={wcc.tax_registration_details} />
              <WCCReadOnlyField label="Services Delivered To" value={wcc.services_delivered_to} />
            </div>
          </section>
          <section className="space-y-3">
            <h3 className="border-b border-slate-100 pb-2 text-sm font-bold uppercase tracking-wide text-blue-700">Work Locations and Tax Details</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <WCCReadOnlyField label="Work Location 1" value={wcc.work_location_1} />
              <WCCReadOnlyField label="Work Location 2" value={wcc.work_location_2} />
              <WCCReadOnlyField label="Work Location 3" value={wcc.work_location_3} />
              <WCCReadOnlyField label="GST No" value={wcc.gst_no} />
              <WCCReadOnlyField label="PAN No" value={wcc.pan_no} />
            </div>
          </section>
          <section className="space-y-3">
            <h3 className="border-b border-slate-100 pb-2 text-sm font-bold uppercase tracking-wide text-blue-700">Certificate and Purchase Order</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <WCCReadOnlyField label="Date" value={formatWCCPODate(wcc.date)} />
              <WCCReadOnlyField label="NEPL ID" value={wcc.srf_no} />
              <WCCReadOnlyField label="Customer DC No" value={wcc.customer_dc_no} />
              <WCCReadOnlyField label="Nextage Dispatch DC No" value={wcc.nextage_dispatch_dc_no} />
              <WCCReadOnlyField label="WCC No" value={wcc.wcc_no} />
              <WCCReadOnlyField label="Work Start Date" value={formatWCCLongDate(wcc.work_start_date)} />
              <WCCReadOnlyField label="Work Completion Date" value={formatWCCLongDate(wcc.work_completion_date)} />
              <WCCReadOnlyField label="PO No" value={wcc.po_no} />
              <WCCReadOnlyField label="PO Date" value={formatWCCPODate(wcc.po_date)} />
              <WCCReadOnlyField label="Project Name" value={wcc.project_name} />
            </div>
          </section>
          <section className="space-y-3">
            <h3 className="border-b border-slate-100 pb-2 text-sm font-bold uppercase tracking-wide text-blue-700">Details of Work Completed</h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-600">
                  <tr>
                    { ["PO S.No", "Description of Work", "UOM", "Quantity Completed", "SAC No", "Status of Work Completed"].map((label) => (
                      <th key={label} className="border-b border-r border-slate-200 p-3 text-left last:border-r-0">{label}</th>
                    )) }
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.length ? rows.map((row, index) => (
                    <tr key={`${row.po_s_no ?? "row"}-${index}`} className="align-top">
                      <td className="border-r border-slate-100 p-3">{row.po_s_no ?? "—"}</td>
                      <td className="border-r border-slate-100 p-3 whitespace-pre-wrap">{row.description_of_work || "—"}</td>
                      <td className="border-r border-slate-100 p-3">{row.uom || "—"}</td>
                      <td className="border-r border-slate-100 p-3">{row.quantity_completed ?? "—"}</td>
                      <td className="border-r border-slate-100 p-3">{row.sac_no || "—"}</td>
                      <td className="p-3">{row.status_of_work_completed || "—"}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={6} className="p-4 text-center text-slate-500">No work details recorded.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <section className="space-y-3">
            <h3 className="border-b border-slate-100 pb-2 text-sm font-bold uppercase tracking-wide text-blue-700">Remarks</h3>
            <WCCReadOnlyField label="Remarks" value={wcc.remarks} multiline />
          </section>
          <section className="space-y-3">
            <h3 className="border-b border-slate-100 pb-2 text-sm font-bold uppercase tracking-wide text-blue-700">Signatures and Company Seal</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <WCCReadOnlyField label="Name of the Vendor Representative, Company Seal" value={wcc.signature_details?.vendor_representative_company_seal_name} />
              <WCCReadOnlyField label="Name of the Representative and Company Seal" value={wcc.signature_details?.representative_and_company_seal_name} />
            </div>
            <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-3">
              <WCCReadOnlyField label="Authorised Signature" value="Name of the authorised Signature" />
              <WCCReadOnlyField label="Tool Incharge" value="Name of the site Engineer" />
              <WCCReadOnlyField label="Site Incharge / Site Engineer" value="Name of the Site Incharge" />
            </div>
          </section>
        </div>
        <footer className="flex justify-end border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Close</button>
        </footer>
      </div>
    </div>
  );
}


function wccSafe(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseWCCDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatWCCLongDate(value: string | null | undefined): string {
  const date = parseWCCDate(value);
  if (!date) return "";
  return date.toLocaleDateString("en-IN", { month: "long", day: "numeric", year: "numeric" });
}

function formatWCCPODate(value: string | null | undefined): string {
  const date = parseWCCDate(value);
  if (!date) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${date.getFullYear()}`;
}

function downloadWCCPdf(wcc: WCCRecord) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 4;

  // Explicit white page background keeps the certificate readable in PDF
  // previews/exporters that otherwise render transparent page areas as black.
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  // Keep the blue title bar strictly inside the thin black page frame.
  // The frame is drawn again at the end so its black outline stays crisp.
  doc.setFillColor(8, 8, 110);
  doc.rect(1.3, 1.3, pageWidth - 2.6, 7.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.2);
  doc.text("WORK COMPLETION CERTIFICATE", pageWidth / 2, 5.9, { align: "center" });

  const vendorLines = wccSafe(wcc.vendor_company_details).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const companyName = vendorLines[0] || "Nextage Engineering Pvt Ltd";
  doc.setTextColor(47, 128, 237);
  let vendorY = 15.5;
  vendorLines.forEach((line, index) => {
    // Make the company name and address slightly larger to match the reference.
    doc.setFont("helvetica", index === 0 ? "bold" : "normal");
    doc.setFontSize(index === 0 ? 9.2 : 8.5);
    doc.text(line, pageWidth / 2, vendorY, { align: "center" });
    vendorY += 4.3;
  });
  if (!vendorLines.length) vendorY += 4.3;
  // Vendor code was removed from the database and is no longer printed.
  doc.setTextColor(255, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.7);
  doc.text(`TAX REGISTRATION DETAILS: ${wccSafe(wcc.tax_registration_details)}`, pageWidth / 2, Math.max(vendorY + 4.2, 34), { align: "center" });

  const leftX = margin;
  const leftW = 140;
  const rightX = 207;
  const rightW = pageWidth - rightX - margin;
  let leftY = 51;
  const leftRowH = 8.2;
  const leftFields: Array<[string, string]> = [
    ["SERVICES DELIVERED TO:", wccSafe(wcc.services_delivered_to)],
    ["WORK LOCATION 1", wccSafe(wcc.work_location_1)],
    ["WORK LOCATION 2", wccSafe(wcc.work_location_2)],
    ["WORK LOCATION 3", wccSafe(wcc.work_location_3)],
  ];
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.16);
  doc.setTextColor(0, 0, 0);

  leftFields.forEach(([label, value], index) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);

    if (index === 0) {
      // Match the original certificate: service recipient on the same line
      // as its label, with only a horizontal separator below the row.
      const labelX = leftX + 0.8;
      const baselineY = leftY + 4.9;
      doc.text(label, labelX, baselineY);
      const valueX = labelX + doc.getTextWidth(label) + 2;
      doc.setFont("helvetica", "normal");
      doc.text(value, valueX, baselineY, {
        maxWidth: Math.max(1, leftX + leftW - valueX - 0.8),
      });
    } else {
      doc.text(label, leftX + 0.8, leftY + 2.3);
      doc.setFont("helvetica", "normal");
      if (value) {
        doc.text(value, leftX + 0.8, leftY + 5.8, {
          maxWidth: leftW - 1.6,
        });
      }
    }

    // These rows use underlines only. Do not draw enclosing rectangles or
    // vertical edges around Services Delivered / Work Location fields.
    doc.line(leftX, leftY + leftRowH, leftX + leftW, leftY + leftRowH);
    leftY += leftRowH;
  });

  // GST and PAN share one final metadata row with a single bottom separator.
  const taxY = leftY + 5.1;
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.1);
  doc.text("GST NO", leftX + 0.8, taxY);
  doc.setFont("helvetica", "normal");
  doc.text(wccSafe(wcc.gst_no), leftX + 20, taxY, {
    maxWidth: 45,
  });
  doc.setFont("helvetica", "bold");
  doc.text("PAN NO", leftX + 69, taxY);
  doc.setFont("helvetica", "normal");
  doc.text(wccSafe(wcc.pan_no), leftX + 87, taxY, {
    maxWidth: leftW - 88,
  });
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.16);
  doc.line(leftX, leftY + leftRowH, leftX + leftW, leftY + leftRowH);

  // Right-side metadata uses one fixed label column, one fixed value column,
  // uniform row spacing, and lines that all finish at the same right margin.
  let rightY = 51.5;
  const rightFields: Array<[string, string]> = [
    ["Date", formatWCCPODate(wcc.date)],
    ["NEPL ID", wccSafe(wcc.srf_no)],
    ["Customer DC No", wccSafe(wcc.customer_dc_no)],
    ["Nextage Dispatch DC No", wccSafe(wcc.nextage_dispatch_dc_no)],
    ["WCC No", wccSafe(wcc.wcc_no)],
    ["Work Start Date", formatWCCLongDate(wcc.work_start_date)],
    ["Work completion Date", formatWCCLongDate(wcc.work_completion_date)],
    ["PO No", wccSafe(wcc.po_no)],
    ["PO Date", formatWCCPODate(wcc.po_date)],
    ["PROJECT NAME", wccSafe(wcc.project_name)],
  ];
  const rightValueX = rightX + 34;
  rightFields.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.0);
    doc.setTextColor(17, 17, 17);
    doc.text(label, rightX, rightY);

    doc.setFont("helvetica", "normal");
    doc.text(value, rightValueX, rightY, {
      maxWidth: Math.max(1, rightX + rightW - rightValueX - 0.8),
    });

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.14);
    doc.line(rightValueX - 1.5, rightY + 1.2, rightX + rightW, rightY + 1.2);
    rightY += 5.5;
  });

  const tableStartY = Math.max(leftY + leftRowH + 1.5, rightY + 7, 93);
  const detailRows = (wcc.details_table ?? []).map((row) => [
    row.po_s_no === null || row.po_s_no === undefined ? "" : String(row.po_s_no),
    wccSafe(row.description_of_work),
    wccSafe(row.uom),
    row.quantity_completed === null || row.quantity_completed === undefined ? "" : String(row.quantity_completed),
    wccSafe(row.sac_no),
    wccSafe(row.status_of_work_completed),
  ]);
  autoTable(doc, {
    startY: tableStartY,
    head: [["PO S.NO", "DESCRIPTION OF WORK", "UOM", "QUANTITY\nCOMPLETED", "SAC NO", "STATUS OF WORK\nCOMPLETED"]],
    body: detailRows.length ? detailRows : [["", "", "", "", "", ""]],
    theme: "grid",
    margin: { left: margin, right: margin },
    tableWidth: "auto",
    styles: {
      font: "helvetica",
      fontSize: 7.0,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.16,
      cellPadding: { top: 1.4, right: 1.3, bottom: 1.4, left: 1.3 },
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0], fontStyle: "bold", halign: "center", minCellHeight: 8.3 },
    bodyStyles: { minCellHeight: 7.2 },
    willDrawPage: (hookData) => {
      if (hookData.pageNumber > 1) {
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, pageWidth, pageHeight, "F");
      }
    },
    columnStyles: {
      // Total 289 mm = A4 landscape width minus the 4 mm side margins.
      0: { cellWidth: 13, halign: "center" },
      1: { cellWidth: 152 },
      2: { cellWidth: 20, halign: "center" },
      3: { cellWidth: 24, halign: "center" },
      4: { cellWidth: 28, halign: "center" },
      5: { cellWidth: 52, halign: "center" },
    },
  });

  let nextY = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? tableStartY + 18) + 4;
  if (nextY > pageHeight - 48) {
    doc.addPage("a4", "landscape");
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, "F");
    nextY = 14;
  }
  doc.setTextColor(17, 17, 17);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("REMARKS:", margin + 0.5, nextY + 1.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.1);
  const remarksLines = doc.splitTextToSize(wccSafe(wcc.remarks), pageWidth - 2 * margin - 2);
  doc.text(remarksLines.length ? remarksLines : [""], margin + 0.5, nextY + 7.5);
  const remarkBottom = nextY + 7.5 + Math.max(1, remarksLines.length) * 3.5;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.16);
  doc.line(margin, remarkBottom + 3, pageWidth - margin, remarkBottom + 3);
  doc.line(margin, remarkBottom + 7, pageWidth - margin, remarkBottom + 7);

  let signatureY = Math.max(remarkBottom + 17, 165);
  if (signatureY > pageHeight - 34) {
    doc.addPage("a4", "landscape");
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, "F");
    signatureY = 150;
  }
  const leftSignatureX = margin + 0.5;
  const rightSignatureX = pageWidth / 2 + 4;
  const signatureWidth = 135;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.18);
  doc.line(leftSignatureX, signatureY, leftSignatureX + signatureWidth, signatureY);
  doc.line(rightSignatureX, signatureY, rightSignatureX + signatureWidth, signatureY);
  doc.setTextColor(255, 36, 36);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.0);
  doc.text("Name of the Vendor Representative, Company Seal", leftSignatureX, signatureY + 4);
  const vendorRepresentativeSeal = wccSafe(wcc.signature_details?.vendor_representative_company_seal_name) || companyName;
  doc.text(vendorRepresentativeSeal, leftSignatureX, signatureY + 8, { maxWidth: signatureWidth });
  doc.text("Name of the Representative and Company Seal", rightSignatureX, signatureY + 4);
  const representativeSeal = wccSafe(wcc.signature_details?.representative_and_company_seal_name) || wccSafe(wcc.services_delivered_to);
  doc.text(representativeSeal, rightSignatureX, signatureY + 8, { maxWidth: signatureWidth });

  doc.setTextColor(17, 17, 17);
  // These are fixed template labels; do not read them from JSONB.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.0);
  doc.text("Authorised Signature", leftSignatureX, signatureY + 22);
  doc.setFont("helvetica", "normal");
  doc.text("Name of the authorised Signature", leftSignatureX, signatureY + 26);
  doc.setFont("helvetica", "bold");
  doc.text("Tool Incharge", pageWidth * 0.58, signatureY + 22);
  doc.text("Site Incharge / Site Engineer", pageWidth * 0.75, signatureY + 22);
  doc.setFont("helvetica", "normal");
  doc.text("Name of the site Engineer", pageWidth * 0.58, signatureY + 26);
  doc.text("Name of the Site Incharge", pageWidth * 0.75, signatureY + 26);

  // The page frame itself closes the certificate; do not draw an extra
  // horizontal rule above the Encls line.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.8);
  doc.setTextColor(17, 17, 17);
  doc.text("Encls: Other related documents of work", margin, pageHeight - 2.1);

  // Draw a thin black frame around every page, after content has been placed.
  const totalPages = doc.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    doc.setPage(pageNumber);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.rect(1.2, 1.2, pageWidth - 2.4, pageHeight - 2.4, "S");
  }

  const safeNumber = wccSafe(wcc.wcc_no).replace(/[^a-zA-Z0-9_-]+/g, "-") || `inward-${wcc.inward_id ?? "record"}`;
  doc.save(`WCC-${safeNumber}.pdf`);
}

export const AdminDelegatedApproval: React.FC<AdminDelegatedApprovalProps> = ({
  onBack,
}) => {
  const [activeType, setActiveType] = useState<ApprovalType | null>(null);
  const [activeTab, setActiveTab] = useState<ApprovalTab>("pending");

  const [items, setItems] = useState<AnyRecord[]>([]);
  const [selectedItem, setSelectedItem] = useState<AnyRecord | null>(null);
  const [detail, setDetail] = useState<AnyRecord | null>(null);

  const [searchTerm, setSearchTerm] = useState("");

  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [approvalLoading, setApprovalLoading] = useState(false);

  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [approvalRemarks, setApprovalRemarks] = useState(
    "Approved by administrator on behalf of the customer."
  );
  const [rejectionRemarks, setRejectionRemarks] = useState("");

  const [wccLoading, setWccLoading] = useState(false);
  const [wccData, setWccData] = useState<WCCRecord | null>(null);
  const [wccError, setWccError] = useState<string | null>(null);
  const [showWccModal, setShowWccModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);

  const [showConfirm, setShowConfirm] = useState(false);

  const requestSequence = useRef(0);

  const srfBasePath = useMemo(() => {
    const path = String(ENDPOINTS.SRFS || "/srfs/");
    return path.endsWith("/") ? path.slice(0, -1) : path;
  }, []);

  const resetDetailState = useCallback(() => {
    setSelectedItem(null);
    setDetail(null);
    setDetailLoading(false);
    setDetailError(null);
    setApprovalError(null);
    setSuccessMessage(null);
    setShowConfirm(false);
    setShowWccModal(false);
    setShowRejectModal(false);
    setRejectionRemarks("");
    setWccData(null);
    setWccError(null);
    setWccLoading(false);
  }, []);

  // Prevent the admin page behind the WCC dialog from scrolling.
  // The WCC content area is explicitly exempted so its own scrollbar remains usable.
  useEffect(() => {
    if (!showWccModal) return;

    const body = document.body;
    const html = document.documentElement;
    const scrollY = window.scrollY || window.pageYOffset;
    const scrollX = window.scrollX || window.pageXOffset;

    const previousBodyStyles = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
    };
    const previousHtmlOverflow = html.style.overflow;

    // Fix the document at its current scroll position. This also prevents
    // the browser viewport from moving while the modal is open.
    const scrollbarWidth = Math.max(0, window.innerWidth - html.clientWidth);
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = `-${scrollX}px`;
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
    html.style.overflow = "hidden";

    const isInsideWccScrollArea = (target: EventTarget | null): boolean =>
      target instanceof Element &&
      target.closest("[data-wcc-scroll-container]") !== null;

    // Some admin layouts use their own scrollable content wrapper instead
    // of scrolling the document. Intercept background wheel/touch scrolling
    // as well, but allow the WCC dialog's own scroll container to work.
    const preventBackgroundWheel = (event: WheelEvent) => {
      if (!isInsideWccScrollArea(event.target)) {
        event.preventDefault();
      }
    };

    const preventBackgroundTouch = (event: TouchEvent) => {
      if (!isInsideWccScrollArea(event.target)) {
        event.preventDefault();
      }
    };

    const preventBackgroundKeyboardScroll = (event: KeyboardEvent) => {
      // Keep keyboard controls on the WCC header/footer buttons functional.
      if (
        event.target instanceof Element &&
        event.target.closest("[data-wcc-modal]") !== null
      ) {
        return;
      }

      const scrollKeys = [
        "ArrowUp",
        "ArrowDown",
        "PageUp",
        "PageDown",
        "Home",
        "End",
        " ",
      ];

      if (scrollKeys.includes(event.key)) {
        const target = event.target;
        const isEditable =
          target instanceof HTMLElement &&
          (target.isContentEditable ||
            target.closest("input, textarea, select, [contenteditable='true']") !== null);

        if (!isEditable) event.preventDefault();
      }
    };

    document.addEventListener("wheel", preventBackgroundWheel, {
      capture: true,
      passive: false,
    });
    document.addEventListener("touchmove", preventBackgroundTouch, {
      capture: true,
      passive: false,
    });
    document.addEventListener("keydown", preventBackgroundKeyboardScroll, true);

    return () => {
      document.removeEventListener("wheel", preventBackgroundWheel, true);
      document.removeEventListener("touchmove", preventBackgroundTouch, true);
      document.removeEventListener("keydown", preventBackgroundKeyboardScroll, true);

      body.style.position = previousBodyStyles.position;
      body.style.top = previousBodyStyles.top;
      body.style.left = previousBodyStyles.left;
      body.style.right = previousBodyStyles.right;
      body.style.width = previousBodyStyles.width;
      body.style.overflow = previousBodyStyles.overflow;
      body.style.paddingRight = previousBodyStyles.paddingRight;
      html.style.overflow = previousHtmlOverflow;

      // Restore the exact page position that was present before opening WCC.
      window.scrollTo(scrollX, scrollY);
    };
  }, [showWccModal]);

  // ============================================================
  // FIRST INSPECTION REPORT
  // ============================================================

  const loadFirRows = useCallback(async (): Promise<AnyRecord[]> => {
    // Use the existing inward list API without a parent-level status filter.
    // The customer FIR page displays equipment from the inward record.
    // Individual equipment status controls whether each item is pending.

    const inwardRows = await fetchAllPages(
      "/staff/inwards",
      {},
      ["inwards", "items", "data", "results"]
    );

    const pendingRows = inwardRows
      .filter((inward) => {
        const equipmentRows = getEquipmentRows("fir", inward);

        return equipmentRows.some(
          (equipment) =>
            normalizeText(equipment?.status).toLowerCase() === "pending"
        );
      })
      .map((inward) => ({
        ...inward,
        __approvalState: "pending" as ApprovalState,
      }));

    // Reuse the existing engineer Reviewed FIR list for completed records.
    // If the separate history request fails, do not hide pending FIRs.

    let reviewedRows: AnyRecord[] = [];

    try {
      const reviewedResponse = await api.get(
        "/staff/inwards/reviewed-firs"
      );

      reviewedRows = getArray(
        reviewedResponse.data,
        "inwards",
        "items",
        "data"
      );
    } catch (error) {
      console.warn("Unable to load reviewed FIR history:", error);
    }

    // The reviewed-FIR summary response can omit material_inward_date.
    // Match the detail page's "Record Date" by loading the existing FIR detail
    // only for reviewed rows whose list response has no date value.
    const reviewedRowsWithDates = await mapInBatches(
      reviewedRows,
      12,
      async (row) => {
        // Fetch the authoritative inward date if the summary omitted it,
        // even when it happens to contain a created/updated timestamp.
        if (normalizeText(row?.material_inward_date)) return row;

        const inwardId = getRecordId("fir", row);
        if (!Number.isInteger(inwardId) || inwardId <= 0) return row;

        try {
          const detailResponse = await api.get(
            `/staff/inwards/portal/firs/${inwardId}`
          );
          const inwardDetail = detailResponse.data || {};

          return {
            ...row,
            material_inward_date:
              inwardDetail.material_inward_date || row.material_inward_date,
            received_date:
              inwardDetail.received_date || row.received_date,
            date: inwardDetail.date || row.date,
            created_at: inwardDetail.created_at || row.created_at,
          };
        } catch (error) {
          console.warn(
            `Unable to load Record Date for reviewed FIR ${inwardId}:`,
            error
          );
          return row;
        }
      }
    );

    const byId = new Map<number, AnyRecord>();

    pendingRows.forEach((row) => {
      const id = getRecordId("fir", row);

      if (Number.isInteger(id) && id > 0) {
        byId.set(id, row);
      }
    });

    reviewedRowsWithDates.forEach((row) => {
      const id = getRecordId("fir", row);

      if (!Number.isInteger(id) || id <= 0 || byId.has(id)) return;

      byId.set(id, {
        ...row,
        __approvalState: "reviewed" as ApprovalState,
      });
    });

    return Array.from(byId.values()).sort((left, right) => {
      const leftDate = new Date(getListDate("fir", left) || 0).getTime();
      const rightDate = new Date(getListDate("fir", right) || 0).getTime();

      return rightDate - leftDate;
    });
  }, []);

  // ============================================================
  // SRF MANAGEMENT
  // ============================================================

  const loadSrfRows = useCallback(async (): Promise<AnyRecord[]> => {
    // Reuse the existing work-items API.
    // pending_creation is intentionally excluded because that belongs
    // to engineer SRF creation, not customer approval.

    const [pendingRows, approvedRows, rejectedRows] = await Promise.all([
      fetchAllPages(
        `${srfBasePath}/work-items`,
        { tab_status: "customer_review" },
        ["items", "data", "results"]
      ),

      fetchAllPages(
        `${srfBasePath}/work-items`,
        { tab_status: "approved" },
        ["items", "data", "results"]
      ),

      fetchAllPages(
        `${srfBasePath}/work-items`,
        { tab_status: "rejected" },
        ["items", "data", "results"]
      ),
    ]);

    const byId = new Map<number, AnyRecord>();

    pendingRows.forEach((row) => {
      const id = getRecordId("srf", row);

      if (Number.isInteger(id) && id > 0) {
        byId.set(id, {
          ...row,
          __approvalState: "pending" as ApprovalState,
        });
      }
    });

    approvedRows.forEach((row) => {
      const id = getRecordId("srf", row);

      if (Number.isInteger(id) && id > 0) {
        byId.set(id, {
          ...row,
          __approvalState: "approved" as ApprovalState,
        });
      }
    });

    rejectedRows.forEach((row) => {
      const id = getRecordId("srf", row);

      if (Number.isInteger(id) && id > 0) {
        byId.set(id, {
          ...row,
          __approvalState: "rejected" as ApprovalState,
        });
      }
    });

    return Array.from(byId.values()).sort((left, right) => {
      const leftDate = new Date(getListDate("srf", left) || 0).getTime();
      const rightDate = new Date(getListDate("srf", right) || 0).getTime();

      return rightDate - leftDate;
    });
  }, [srfBasePath]);

  // ============================================================
  // FINAL INSPECTION REPORT
  // ============================================================

  const loadFinalRows = useCallback(async (): Promise<AnyRecord[]> => {
    // The existing GET /final-inspections/ list returns dispatched state.
    // The supplied router does not return customer_decision in each list row.
    // Use the existing customer-view endpoint to retrieve the actual decision.

    const allRows = await fetchAllPages(
      "/final-inspections/",
      {},
      ["items", "data", "results"]
    );

    const dispatchedRows = allRows.filter((row) =>
      isTrue(row?.report_sent)
    );

    return mapInBatches(dispatchedRows, 12, async (row) => {
      const inwardId = Number(row?.inward_id);

      if (!Number.isInteger(inwardId) || inwardId <= 0) {
        return {
          ...row,
          __approvalState: "pending" as ApprovalState,
        };
      }

      // Some deployed router revisions may already return this field.
      // Avoid an additional request when it is present.

      if (row?.customer_decision !== undefined) {
        const decision = normalizeText(
          row.customer_decision
        ).toUpperCase();

        const state: ApprovalState =
          decision === "APPROVED"
            ? "approved"
            : decision === "REJECTED"
              ? "rejected"
              : "pending";

        return {
          ...row,
          __approvalState: state,
        };
      }

      const response = await api.get(
        ENDPOINTS.FINAL_INSPECTIONS.CUSTOMER_VIEW(inwardId)
      );

      const inspection = response.data || {};

      const decision = normalizeText(
        inspection?.customer_decision
      ).toUpperCase();

      const state: ApprovalState =
        decision === "APPROVED"
          ? "approved"
          : decision === "REJECTED"
            ? "rejected"
            : "pending";

      return {
        ...row,
        ...inspection,
        inward_id: inwardId,
        __approvalState: state,
      };
    });
  }, []);

  // ============================================================
  // MAIN LIST LOADER
  // ============================================================

  const loadList = useCallback(
    async (type: ApprovalType) => {
      const requestId = ++requestSequence.current;

      setListLoading(true);
      setListError(null);
      setSuccessMessage(null);

      resetDetailState();

      try {
        let rows: AnyRecord[] = [];

        if (type === "fir") {
          rows = await loadFirRows();
        } else if (type === "srf") {
          rows = await loadSrfRows();
        } else {
          rows = await loadFinalRows();
        }

        if (requestSequence.current === requestId) {
          setItems(rows);
        }
      } catch (error: any) {
        if (requestSequence.current === requestId) {
          setItems([]);

          setListError(
            getErrorMessage(
              error,
              "Unable to load records for delegated approval."
            )
          );
        }
      } finally {
        if (requestSequence.current === requestId) {
          setListLoading(false);
        }
      }
    },
    [
      loadFirRows,
      loadSrfRows,
      loadFinalRows,
      resetDetailState,
    ]
  );

  useEffect(() => {
    if (activeType) {
      void loadList(activeType);
    }
  }, [activeType, loadList]);

  // ============================================================
  // OPEN RECORD DETAIL
  // ============================================================

  const openRecord = useCallback(
    async (item: AnyRecord) => {
      if (!activeType) return;

      const id = getRecordId(activeType, item);

      if (!Number.isInteger(id) || id <= 0) {
        setDetailError(
          "The selected record does not contain a valid record ID."
        );
        return;
      }

      setSelectedItem(item);
      setDetail(null);
      setDetailError(null);
      setApprovalError(null);
      setSuccessMessage(null);

      setApprovalRemarks(
        "Approved by administrator on behalf of the customer."
      );
      setRejectionRemarks("");
      setWccData(null);
      setWccError(null);
      setShowWccModal(false);
      setShowRejectModal(false);
      setWccLoading(activeType === "final");

      setShowConfirm(false);
      setDetailLoading(true);

      try {
        let response;

        if (activeType === "fir") {
          // Same detail route used by CustomerRemarksPortal.
          response = await api.get(
            `/staff/inwards/portal/firs/${id}`
          );
        } else if (activeType === "srf") {
          // Same detail route used by SrfDetailPage.
          response = await api.get(`${srfBasePath}/${id}`);
        } else {
          // Match CustomerFinalReportView exactly: this endpoint returns the
          // full customer-facing final report, including its equipment rows,
          // customer decision, remarks and report dispatch metadata.
          response = await api.get(
            ENDPOINTS.FINAL_INSPECTIONS.CUSTOMER_VIEW(id)
          );

          setDetail({
            ...item,
            ...(response.data || {}),
          });

          // WCC is linked to the same inward_id. A missing WCC (404) is valid
          // and must not block the final inspection report from opening.
          try {
            const wccResponse = await api.get(
              `${WCC_COLLECTION}by-inward/${id}`
            );
            const linkedWcc = wccResponse.data as WCCRecord;

            if (Number(linkedWcc?.inward_id) !== id) {
              throw new Error(
                "The returned Work Completion Certificate is not linked to this inward record."
              );
            }

            setWccData(linkedWcc);
          } catch (wccLoadError: any) {
            setWccData(null);

            if (wccLoadError?.response?.status !== 404) {
              setWccError(
                getErrorMessage(
                  wccLoadError,
                  "Unable to load the Work Completion Certificate."
                )
              );
            }
          } finally {
            setWccLoading(false);
          }

          return;
        }

        setDetail({
          ...item,
          ...(response.data || {}),
        });
      } catch (error: any) {
        setDetailError(
          getErrorMessage(
            error,
            "Unable to load the selected record."
          )
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [activeType, srfBasePath]
  );

  // ============================================================
  // APPROVE / FINALIZE SELECTED RECORD
  // ============================================================

  const approveSelectedRecord = useCallback(async () => {
    if (!activeType || !selectedItem || !detail) return;

    const id = getRecordId(activeType, selectedItem);

    if (!Number.isInteger(id) || id <= 0) {
      setApprovalError(
        "The selected record does not contain a valid record ID."
      );
      return;
    }

    const currentState = getApprovalState(activeType, detail);

    if (currentState !== "pending") {
      setApprovalError(
        "This record has already been processed and cannot be approved again."
      );

      setShowConfirm(false);
      return;
    }

    setApprovalLoading(true);
    setApprovalError(null);
    setSuccessMessage(null);

    try {
      // --------------------------------------------------------
      // FIRST INSPECTION REPORT
      // --------------------------------------------------------

      if (activeType === "fir") {
        // Mirror CustomerRemarksPortal exactly:
        // 1. Submit one remark for every equipment row.
        // 2. Default blank remarks to "Ok".
        // 3. Set inward.status to "reviewed".

        const firEquipment = getEquipmentRows("fir", detail);

        const remarks = firEquipment
          .filter(
            (equipment) =>
              Number.isInteger(Number(equipment?.inward_eqp_id)) &&
              Number(equipment?.inward_eqp_id) > 0
          )
          .map((equipment) => ({
            inward_eqp_id: Number(equipment.inward_eqp_id),

            customer_remark:
              normalizeText(equipment?.customer_remarks) || "Ok",
          }));

        if (remarks.length === 0) {
          throw new Error(
            "No inward equipment rows were returned. The FIR was not finalized."
          );
        }

        // Existing customer FIR remarks endpoint.
        await api.post(
          `/staff/inwards/portal/firs/${id}/remarks`,
          { remarks }
        );

        // Existing customer FIR status endpoint.
        await api.put(
          `/staff/inwards/portal/firs/${id}/status`,
          { status: "reviewed" }
        );

        const reviewedEquipment = firEquipment.map((equipment) => ({
          ...equipment,
          status: "reviewed",
          customer_remarks:
            normalizeText(equipment?.customer_remarks) || "Ok",
        }));

        const updatedDetail = {
          ...detail,
          status: "reviewed",
          equipments: reviewedEquipment,
          __approvalState: "reviewed" as ApprovalState,
        };

        setDetail(updatedDetail);

        setSelectedItem((current) =>
          current
            ? {
                ...current,
                status: "reviewed",
                __approvalState: "reviewed",
              }
            : current
        );

        setItems((current) =>
          current.map((row) =>
            getRecordId("fir", row) === id
              ? {
                  ...row,
                  status: "reviewed",
                  __approvalState: "reviewed",
                  equipments: reviewedEquipment,
                }
              : row
          )
        );

        setActiveTab("reviewed");

        setSuccessMessage(
          "First Inspection Report finalized on behalf of the customer."
        );

      // --------------------------------------------------------
      // SRF MANAGEMENT
      // --------------------------------------------------------

      } else if (activeType === "srf") {
        // Use the same payload structure as SrfDetailPage.
        // Only status is changed to approved; existing SRF and equipment
        // values are retained.

        const equipmentRows = getEquipmentRows("srf", detail);

        const inward = detail?.inward || {};
        const customer = inward?.customer || {};

        const turnaroundValue = detail?.turnaround_time;

        const normalizedTurnaroundTime = (() => {
          if (
            turnaroundValue === null ||
            turnaroundValue === undefined ||
            String(turnaroundValue).trim() === ""
          ) {
            return undefined;
          }

          const parsed =
            typeof turnaroundValue === "number"
              ? turnaroundValue
              : Number(String(turnaroundValue).trim());

          return Number.isNaN(parsed) ? undefined : parsed;
        })();

        const payload = {
          srf_no: detail?.srf_no,
          date: detail?.date,
          nepl_srf_no: detail?.nepl_srf_no,

          telephone:
            detail?.telephone ||
            detail?.phone ||
            customer?.phone ||
            "",

          contact_person:
            detail?.contact_person ||
            customer?.contact_person ||
            "",

          email:
            detail?.email ||
            customer?.email ||
            "",

          address:
            detail?.address ||
            detail?.bill_to_address ||
            customer?.bill_to_address ||
            "",

          ship_to_address:
            detail?.ship_to_address ||
            customer?.ship_to_address ||
            "",

          certificate_issue_name:
            detail?.certificate_issue_name || "",

          certificate_issue_adress:
            detail?.certificate_issue_adress || "",

          status: "approved",
          inward_status: "reviewed",

          inward_id:
            detail?.inward_id ??
            selectedItem?.inward_id ??
            null,

          calibration_frequency:
            detail?.calibration_frequency ?? null,

          statement_of_conformity:
            detail?.statement_of_conformity ?? false,

          ref_iso_is_doc:
            detail?.ref_iso_is_doc ?? false,

          ref_manufacturer_manual:
            detail?.ref_manufacturer_manual ?? false,

          ref_customer_requirement:
            detail?.ref_customer_requirement ?? false,

          resources_capability_reviewed_cal:
            detail?.resources_capability_reviewed_cal ?? false,

          turnaround_time: normalizedTurnaroundTime,

          remarks:
            typeof detail?.remarks === "string" &&
            detail.remarks.trim()
              ? detail.remarks.trim()
              : undefined,

          equipments: equipmentRows.map((equipment) => ({
            srf_eqp_id:
              equipment?.srf_equipment?.srf_eqp_id ??
              equipment?.srf_eqp_id,

            inward_eqp_id: equipment?.inward_eqp_id,

            unit:
              equipment?.srf_equipment?.unit ??
              equipment?.unit,

            no_of_calibration_points:
              equipment?.srf_equipment?.no_of_calibration_points ??
              equipment?.no_of_calibration_points,

            mode_of_calibration:
              equipment?.srf_equipment?.mode_of_calibration ??
              equipment?.mode_of_calibration,
          })),
        };

        // Existing SRF update endpoint.
        await api.put(`${srfBasePath}/${id}`, payload);

        setDetail((current) =>
          current
            ? {
                ...current,
                status: "approved",
                __approvalState: "approved",
              }
            : current
        );

        setSelectedItem((current) =>
          current
            ? {
                ...current,
                status: "approved",
                __approvalState: "approved",
              }
            : current
        );

        setItems((current) =>
          current.map((row) =>
            getRecordId("srf", row) === id
              ? {
                  ...row,
                  status: "approved",
                  __approvalState: "approved",
                }
              : row
          )
        );

        setActiveTab("approved");

        setSuccessMessage(
          "SRF approved on behalf of the customer."
        );

      // --------------------------------------------------------
      // FINAL INSPECTION REPORT
      // --------------------------------------------------------

      } else {
        // Existing final-inspection customer decision endpoint.
        // The approval note is retained in customer_remarks.

        const delegatedNote =
          normalizeText(approvalRemarks) ||
          "Approved by administrator on behalf of the customer.";

        const previousRemarks = normalizeText(
          detail?.customer_remarks
        );

        const note = previousRemarks
          ? `${previousRemarks}\n\n[Delegated approval] ${delegatedNote}`
          : `[Delegated approval] ${delegatedNote}`;

        await api.post(
          ENDPOINTS.FINAL_INSPECTIONS.SUBMIT_DECISION(id),
          {
            decision: "APPROVED",
            remarks: note,
          }
        );

        setDetail((current) =>
          current
            ? {
                ...current,
                customer_decision: "APPROVED",
                customer_remarks: note,
                __approvalState: "approved",
              }
            : current
        );

        setSelectedItem((current) =>
          current
            ? {
                ...current,
                customer_decision: "APPROVED",
                customer_remarks: note,
                __approvalState: "approved",
              }
            : current
        );

        setItems((current) =>
          current.map((row) =>
            getRecordId("final", row) === id
              ? {
                  ...row,
                  customer_decision: "APPROVED",
                  customer_remarks: note,
                  __approvalState: "approved",
                }
              : row
          )
        );

        setActiveTab("approved");

        setSuccessMessage(
          "Final Inspection Report approved on behalf of the customer."
        );
      }

      setShowConfirm(false);
    } catch (error: any) {
      setApprovalError(
        getErrorMessage(error, "Approval failed. Please try again.")
      );
    } finally {
      setApprovalLoading(false);
    }
  }, [
    activeType,
    selectedItem,
    detail,
    srfBasePath,
    approvalRemarks,
  ]);



  // ============================================================
  // FINAL INSPECTION REJECTION (DELEGATED CUSTOMER DECISION)
  // ============================================================

  const rejectFinalInspection = useCallback(async () => {
    if (activeType !== "final" || !selectedItem || !detail) return;

    if (!rejectionRemarks.trim()) {
      setApprovalError("Please provide a reason for rejection.");
      return;
    }

    const id = getRecordId("final", selectedItem);
    if (!Number.isInteger(id) || id <= 0) {
      setApprovalError("The selected report does not contain a valid inward ID.");
      return;
    }

    if (getApprovalState("final", detail) !== "pending") {
      setApprovalError("This report already has a customer decision.");
      setShowRejectModal(false);
      return;
    }

    setApprovalLoading(true);
    setApprovalError(null);
    setSuccessMessage(null);

    try {
      const note = `[Delegated approval - rejection] ${rejectionRemarks.trim()}`;

      await api.post(
        ENDPOINTS.FINAL_INSPECTIONS.SUBMIT_DECISION(id),
        {
          decision: "REJECTED",
          remarks: note,
        }
      );

      const updatedReport = {
        ...detail,
        customer_decision: "REJECTED",
        customer_remarks: note,
        __approvalState: "rejected" as ApprovalState,
      };

      setDetail(updatedReport);
      setSelectedItem((current) =>
        current
          ? {
              ...current,
              customer_decision: "REJECTED",
              customer_remarks: note,
              __approvalState: "rejected",
            }
          : current
      );
      setItems((current) =>
        current.map((row) =>
          getRecordId("final", row) === id
            ? {
                ...row,
                customer_decision: "REJECTED",
                customer_remarks: note,
                __approvalState: "rejected",
              }
            : row
        )
      );

      setRejectionRemarks("");
      setShowRejectModal(false);
      setActiveTab("rejected");
      setSuccessMessage(
        "Final Inspection Report rejected on behalf of the customer."
      );
    } catch (error: any) {
      setApprovalError(
        getErrorMessage(error, "Unable to submit the delegated rejection.")
      );
    } finally {
      setApprovalLoading(false);
    }
  }, [activeType, selectedItem, detail, rejectionRemarks]);

  // ============================================================
  // FILTERED LIST AND COUNTS
  // ============================================================

  const filteredItems = useMemo(() => {
    const visibleByTab = items.filter(
      (item) =>
        getApprovalState(activeType || "fir", item) === activeTab
    );

    const query = searchTerm.trim().toLowerCase();

    if (!query) return visibleByTab;

    return visibleByTab.filter((item) => {
      const equipmentRows = getEquipmentRows(
        activeType || "fir",
        item
      );

      const equipmentText = equipmentRows
        .map((equipment) =>
          [
            equipment?.nepl_id,
            equipment?.material_description,
            equipment?.make,
            equipment?.model,
            equipment?.serial_no,
          ]
            .map((value) => normalizeText(value))
            .join(" ")
        )
        .join(" ");

      return [
        getSrfNumber(item),
        getCustomerName(item),
        item?.customer_dc_no,
        item?.status,
        item?.inspection_status,
        item?.customer_decision,
        equipmentText,
      ].some((value) =>
        normalizeText(value).toLowerCase().includes(query)
      );
    });
  }, [items, activeTab, activeType, searchTerm]);

  const tabCounts = useMemo(() => {
    const counts: Record<ApprovalTab, number> = {
      pending: 0,
      reviewed: 0,
      approved: 0,
      rejected: 0,
    };

    items.forEach((item) => {
      const state = getApprovalState(activeType || "fir", item);
      counts[state] += 1;
    });

    return counts;
  }, [items, activeType]);

  const selectedCard = APPROVAL_CARDS.find(
    (card) => card.id === activeType
  );

  const selectedId =
    activeType && selectedItem
      ? getRecordId(activeType, selectedItem)
      : 0;

  const currentDetailState = activeType
    ? getApprovalState(activeType, detail || selectedItem)
    : "pending";

  const isAlreadyProcessed = currentDetailState !== "pending";

  const equipmentRows =
    activeType && detail
      ? getEquipmentRows(activeType, detail)
      : [];

  const detailCustomer = getCustomerName(
    detail || selectedItem || {}
  );

  const detailSrfNo = getSrfNumber(
    detail || selectedItem || {}
  );

  const detailDate = activeType
    ? getListDate(activeType, detail || selectedItem || {})
    : null;

  const statusPresentation = activeType
    ? getStatusPresentation(activeType, currentDetailState)
    : null;

  const tabs = activeType
    ? getApprovalTabs(activeType)
    : [];

  const pendingEquipmentCount =
    activeType === "fir"
      ? equipmentRows.filter(
          (equipment) =>
            normalizeText(equipment?.status).toLowerCase() ===
            "pending"
        ).length
      : 0;

  const handleDownloadWccPdf = useCallback(() => {
    if (!wccData) {
      setWccError("The Work Completion Certificate is not available for this inward record.");
      return;
    }

    try {
      downloadWCCPdf(wccData);
    } catch (error: any) {
      console.error("Failed to export WCC PDF", error);
      setWccError("Could not download the Work Completion Certificate PDF. Please try again.");
    }
  }, [wccData]);

  // ============================================================
  // DELEGATED APPROVAL HOME
  // ============================================================

  if (!activeType) {
    return (
      <div className="space-y-7 animate-fadeIn">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <ShieldCheck size={24} />
              </span>

              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  Delegated Approval
                </h1>

                <p className="mt-1 text-sm text-slate-500">
                  Review and complete customer actions through the administrator portal.
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Back to Dashboard
          </button>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-900">
Manage pending customer actions and complete the required approvals across inspection reports and SRFs        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {APPROVAL_CARDS.map((card) => {
            const Icon = card.icon;

            return (
              <button
                key={card.id}
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setItems([]);
                  setActiveTab(getDefaultTab(card.id));
                  setActiveType(card.id);
                }}
                className="group flex min-h-[220px] flex-col rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                <span
                  className={`flex h-14 w-14 items-center justify-center rounded-xl border ${card.iconClass}`}
                >
                  <Icon size={27} />
                </span>

                <span className="mt-5 flex w-full items-center justify-between gap-3">
                  <span className="text-lg font-bold text-slate-900 group-hover:text-blue-700">
                    {card.title}
                  </span>

                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-600" />
                </span>

                <span className="mt-2 text-sm leading-6 text-slate-500">
                  {card.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ============================================================
  // FINAL INSPECTION REPORT DETAIL (CUSTOMER VIEW + WCC)
  // ============================================================

  if (activeType === "final" && selectedItem && detail) {
    const customerDecision = normalizeText(detail.customer_decision).toUpperCase();
    const hasDecision = customerDecision === "APPROVED" || customerDecision === "REJECTED";
    const statusInfo = customerDecision === "APPROVED"
      ? { label: "Approved", color: "bg-green-100 text-green-800", icon: <CheckCircle2 className="h-4 w-4" /> }
      : customerDecision === "REJECTED"
        ? { label: "Rejected", color: "bg-red-100 text-red-800", icon: <XCircle className="h-4 w-4" /> }
        : { label: "Pending Review", color: "bg-yellow-100 text-yellow-800", icon: <AlertCircle className="h-4 w-4" /> };

    const finalEquipment = Array.isArray(detail.equipments) ? detail.equipments : [];
    const reportDate = detail.report_sent_at
      ? new Date(detail.report_sent_at).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "N/A";

    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4 animate-fadeIn">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Navigation Header */}
          <div className="flex items-center justify-between px-2">
            <button
              type="button"
              onClick={resetDetailState}
              className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 text-sm font-semibold transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Final Inspection Reports
            </button>

            <div className={`flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-full ${statusInfo.color}`}>
              {statusInfo.icon}
              {statusInfo.label}
            </div>
          </div>

          {successMessage && (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
              {successMessage}
            </div>
          )}

          {detailError && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              {detailError}
            </div>
          )}

          {approvalError && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              {approvalError}
            </div>
          )}

          {/* MAIN REPORT CARD - follows CustomerFinalReportView */}
          <div className="bg-white shadow-lg rounded-2xl border border-slate-200 overflow-hidden relative">
            {/* Decision Banner */}
            {hasDecision && (
              <div className={`${customerDecision === "APPROVED" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"} border-b px-6 py-3 flex items-center gap-3`}>
                <div className={`p-1.5 rounded-full ${customerDecision === "APPROVED" ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"}`}>
                  {customerDecision === "APPROVED" ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                </div>
                <div>
                  <h3 className={`text-sm font-bold uppercase tracking-wide ${customerDecision === "APPROVED" ? "text-green-800" : "text-red-800"}`}>
                    Report {customerDecision}
                  </h3>
                  {customerDecision === "REJECTED" && detail.customer_remarks && (
                    <p className="text-xs text-red-700 mt-0.5">
                      <span className="font-bold">Reason:</span> {detail.customer_remarks}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Report Header with WCC actions */}
            <div className="bg-slate-800 text-white p-5 sm:p-6 flex flex-wrap justify-between items-center gap-4">
              <div className="flex items-center gap-3">
                <ShieldCheck size={24} className="text-emerald-400" />
                <h2 className="text-xl font-bold tracking-tight">Final Inspection Report</h2>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowWccModal(true)}
                  disabled={wccLoading || !wccData}
                  title={wccData ? "View the Work Completion Certificate" : "No WCC is available for this inward ID"}
                  className="inline-flex items-center gap-2 rounded-lg border border-blue-300/40 bg-blue-600 px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {wccLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                  {wccLoading ? "Checking WCC..." : "View WCC"}
                </button>

                {wccData && (
                  <button
                    type="button"
                    onClick={handleDownloadWccPdf}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm transition hover:bg-blue-50"
                  >
                    <Download className="h-4 w-4" /> Download WCC PDF
                  </button>
                )}

                <div className="min-w-[100px] text-right">
                  <p className="text-[10px] text-slate-400 uppercase font-bold">SRF Number</p>
                  <p className="text-lg font-mono font-bold text-blue-400">{detail.srf_no || detailSrfNo}</p>
                </div>
              </div>
            </div>

            {wccError && (
              <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-6 py-3 text-xs text-amber-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{wccError}</p>
              </div>
            )}

            {!wccLoading && !wccData && !wccError && (
              <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-6 py-3 text-xs text-amber-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Work Completion Certificate is not available for this inward record.</p>
              </div>
            )}

            {/* Report metadata */}
            <div className="p-6 sm:p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 pb-8 border-b border-gray-100">
                <div className="space-y-3 text-sm">
                  <div className="flex border-b border-slate-50 pb-2">
                    <span className="font-bold text-slate-500 w-32">Inward Date:</span>
                    <span className="text-slate-900">{reportDate}</span>
                  </div>
                  <div className="flex border-b border-slate-50 pb-2">
                    <span className="font-bold text-slate-500 w-32">DC Number:</span>
                    <span className="text-slate-900 font-mono">{detail.customer_dc_no || "N/A"}</span>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-2">Customer Details</p>
                  <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed font-bold">
                    {detail.customer_name || detailCustomer}
                  </p>
                  <p className="text-xs text-slate-400 mt-2 font-mono">{detail.customer_email || ""}</p>
                </div>
              </div>

              {/* Same equipment table as customer final report */}
              <div className="relative rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse min-w-[1800px]">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 font-bold text-xs uppercase tracking-wider">
                        <th className="border-b border-r border-slate-200 p-3 w-12 text-center sticky left-0 bg-slate-50 z-10">Sl</th>
                        <th className="border-b border-r border-slate-200 p-3 text-left w-40">NEPL ID</th>
                        <th className="border-b border-r border-slate-200 p-3 text-left w-64">Description</th>
                        <th className="border-b border-r border-slate-200 p-3 text-left">Serial No</th>
                        <th className="border-b border-r border-slate-200 p-3 text-center w-16">Qty</th>
                        <th className="border-b border-r border-slate-200 p-3 text-left">Make</th>
                        <th className="border-b border-r border-slate-200 p-3 text-left">Model</th>
                        <th className="border-b border-r border-slate-200 p-3 text-left">Range</th>
                        <th className="border-b border-r border-slate-200 p-3 text-left">Visual Notes</th>
                        <th className="border-b border-r border-slate-200 p-3 text-left">Accessories</th>
                        <th className="border-b border-r border-slate-200 p-3 text-left">Eng Remarks</th>
                        <th className="border-b border-r border-slate-200 p-3 text-left">Cust Remarks</th>
                        <th className="border-b border-r border-slate-200 p-3 text-center w-40">Calib. Status</th>
                        <th className="border-b border-slate-200 p-3 text-left bg-indigo-50 text-indigo-700 w-80">Final Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {finalEquipment.length > 0 ? finalEquipment.map((eq: AnyRecord, idx: number) => (
                        <tr key={eq.inward_eqp_id || idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="border-r border-slate-200 p-3 text-center text-slate-400 bg-white sticky left-0">{idx + 1}</td>
                          <td className="border-r border-slate-200 p-3 font-mono font-bold text-blue-700">{eq.nepl_id || "—"}</td>
                          <td className="border-r border-slate-200 p-3 text-slate-800 font-medium">{eq.material_description || "—"}</td>
                          <td className="border-r border-slate-200 p-3 text-slate-600 font-mono text-xs">{eq.serial_no || "—"}</td>
                          <td className="border-r border-slate-200 p-3 text-center font-bold">{eq.quantity || 1}</td>
                          <td className="border-r border-slate-200 p-3">{eq.make || "—"}</td>
                          <td className="border-r border-slate-200 p-3">{eq.model || "—"}</td>
                          <td className="border-r border-slate-200 p-3 font-mono text-xs">{eq.range || "—"}</td>
                          <td className="border-r border-slate-200 p-3 text-xs text-slate-500 italic">{eq.visual_inspection_notes || "-"}</td>
                          <td className="border-r border-slate-200 p-3 text-xs text-slate-500">{eq.accessories_included || "-"}</td>
                          <td className="border-r border-slate-200 p-3 text-xs text-slate-500">{eq.engineer_remarks || "-"}</td>
                          <td className="border-r border-slate-200 p-3 text-xs text-slate-500">{eq.customer_remarks || "-"}</td>
                          <td className="border-r border-slate-200 p-3 text-center">
                            <span className="px-2 py-1 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700">
                              {eq.job_status || "COMPLETED"}
                            </span>
                          </td>
                          <td className="p-2 bg-indigo-50/20">
                            <div className="w-full text-xs p-2 bg-white border border-indigo-100 rounded text-slate-700 min-h-[40px] whitespace-pre-wrap">
                              {eq.final_remarks || ""}
                            </div>
                          </td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={14} className="p-6 text-center text-sm text-slate-500">
                            No equipment details are available for this report.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Actions only when customer decision is pending */}
            {!hasDecision && (
              <footer className="flex justify-end items-center gap-4 p-6 bg-slate-50 border-t border-slate-200">
                <button
                  type="button"
                  className="flex items-center justify-center gap-2 px-6 py-2.5 bg-red-600 text-white font-semibold rounded-lg shadow-md hover:bg-red-700 transition-all disabled:opacity-60"
                  onClick={() => {
                    setApprovalError(null);
                    setRejectionRemarks("");
                    setShowRejectModal(true);
                  }}
                  disabled={approvalLoading}
                >
                  <XCircle className="h-5 w-5" /> Reject
                </button>

                <button
                  type="button"
                  className="flex items-center justify-center gap-2 px-6 py-2.5 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 transition-all disabled:opacity-60"
                  onClick={() => setShowConfirm(true)}
                  disabled={approvalLoading}
                >
                  {approvalLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                  Approve
                </button>
              </footer>
            )}
          </div>

          <div className="pb-12 text-center">
            <p className="text-slate-400 text-xs italic tracking-widest uppercase">End of Final Inspection Report</p>
          </div>
        </div>

        {/* Read-only WCC modal identical in structure to customer view */}
        {showWccModal && wccData && (
          <WCCReadOnlyModal
            wcc={wccData}
            onClose={() => setShowWccModal(false)}
            onDownload={handleDownloadWccPdf}
          />
        )}

        {/* Delegated rejection requires an audit reason */}
        {showRejectModal && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[120] transition-opacity">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full animate-in fade-in zoom-in duration-200">
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-red-100 rounded-full">
                    <XCircle className="h-6 w-6 text-red-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900">Confirm Rejection</h3>
                </div>

                <p className="text-slate-600 mb-4 text-sm">
                  Provide the reason for rejecting this Final Inspection Report on behalf of the customer.
                </p>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Reason for Rejection <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    autoFocus
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 transition-all resize-none"
                    rows={4}
                    placeholder="Enter the customer's rejection reason..."
                    value={rejectionRemarks}
                    onChange={(event) => setRejectionRemarks(event.target.value)}
                    maxLength={500}
                    disabled={approvalLoading}
                  />
                  <div className="flex justify-between mt-1">
                    <p className="text-[10px] text-slate-400 uppercase font-bold">Required field</p>
                    <p className="text-xs text-slate-500 font-mono">{rejectionRemarks.length}/500 characters</p>
                  </div>
                </div>

                <div className="flex gap-3 justify-end mt-6">
                  <button
                    type="button"
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors"
                    onClick={() => {
                      setShowRejectModal(false);
                      setRejectionRemarks("");
                    }}
                    disabled={approvalLoading}
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
                    onClick={() => void rejectFinalInspection()}
                    disabled={approvalLoading || !rejectionRemarks.trim()}
                  >
                    {approvalLoading ? "Submitting..." : "Confirm Rejection"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Approve confirmation */}
        {showConfirm && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <ShieldCheck size={25} />
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">Confirm delegated approval</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                You are about to approve <strong>{detailSrfNo}</strong> on behalf of <strong>{detailCustomer}</strong>. This decision will be recorded through the existing Final Inspection customer-decision API.
              </p>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={approvalLoading}
                  onClick={() => setShowConfirm(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >Cancel</button>
                <button
                  type="button"
                  disabled={approvalLoading}
                  onClick={() => void approveSelectedRecord()}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {approvalLoading && <Loader2 size={15} className="animate-spin" />}
                  Confirm Approval
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================
  // RECORD DETAIL VIEW
  // ============================================================

  if (selectedItem && detail) {
    const isFinal = activeType === "final";
    const isFir = activeType === "fir";

    const approvalLabel = isFir
      ? "Mark as Reviewed on Behalf of Customer"
      : "Approve on Behalf of Customer";

    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <button
              type="button"
              onClick={resetDetailState}
              className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 transition hover:text-blue-900"
            >
              <ArrowLeft size={16} />
              Back to {selectedCard?.title} list
            </button>

            <h1 className="text-2xl font-bold text-slate-900">
              Review {selectedCard?.title}
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Record ID: {selectedId} · SRF: {detailSrfNo}
            </p>
          </div>

          {statusPresentation && (
            <span
              className={`inline-flex items-center gap-2 self-start rounded-full border px-3 py-1.5 text-xs font-bold ${statusPresentation.className}`}
            >
              {isAlreadyProcessed ? (
                <CheckCircle2 size={14} />
              ) : (
                <Clock3 size={14} />
              )}

              {statusPresentation.label}
            </span>
          )}
        </div>

        {successMessage && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
            {successMessage}
          </div>
        )}

        {detailError && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            {detailError}
          </div>
        )}

        {/* RECORD OVERVIEW */}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-900 px-5 py-4 text-white sm:px-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
                <Eye size={20} />
              </span>

              <div>
                <h2 className="font-bold">Record overview</h2>

                <p className="text-xs text-slate-300">
                  Verify the information before completing the action on behalf of the customer.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4 sm:p-6">
            <DetailField
              label="SRF Number"
              value={detailSrfNo}
            />

            <DetailField
              label="Customer"
              value={detailCustomer}
            />

            <DetailField
              label={isFinal ? "Report Sent" : "Inward Date"}
              value={
                isFinal
                  ? (isTrue(detail.report_sent) ? "Yes" : "No")
                  : formatDate(detailDate)
              }
            />

            <DetailField
              label="Current Status"
              value={
                statusPresentation?.label ||
                detail.status ||
                "Pending"
              }
            />

            {isFir && (
              <DetailField
                label="Customer DC No."
                value={detail.customer_dc_no}
              />
            )}

            {activeType === "srf" && (
              <DetailField
                label="NEPL SRF No."
                value={detail.nepl_srf_no}
              />
            )}

            {activeType === "srf" && (
              <DetailField
                label="Contact Person"
                value={
                  detail.contact_person ||
                  detail.inward?.customer?.contact_person
                }
              />
            )}

            {activeType === "srf" && (
              <DetailField
                label="Email"
                value={
                  detail.email ||
                  detail.inward?.customer?.email
                }
              />
            )}

            {isFinal && (
              <DetailField
                label="Customer DC No."
                value={detail.customer_dc_no}
              />
            )}

            {isFinal && (
              <DetailField
                label="Report Dispatched At"
                value={formatDate(detail.report_sent_at)}
              />
            )}

            {isFir && (
              <DetailField
                label="Pending Equipment"
                value={`${pendingEquipmentCount} item(s)`}
              />
            )}

            {activeType === "srf" && (
              <DetailField
                label="Inward ID"
                value={detail.inward_id}
              />
            )}
          </div>

          {(detail.customer_remarks || detail.remarks) && (
            <div className="mx-5 mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:mx-6 sm:mb-6">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
                Existing remarks
              </p>

              <p className="mt-1 whitespace-pre-wrap text-sm text-amber-950">
                {detail.customer_remarks || detail.remarks}
              </p>
            </div>
          )}
        </section>

        {/* EQUIPMENT DETAILS */}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
            <div>
              <h2 className="font-bold text-slate-900">
                Equipment details
              </h2>

              <p className="mt-0.5 text-xs text-slate-500">
                {equipmentRows.length} equipment item(s) attached to this record.
              </p>
            </div>

            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {equipmentRows.length} items
            </span>
          </div>

          {equipmentRows.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No equipment details were returned for this record.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">
                      Equipment / NEPL ID
                    </th>

                    <th className="px-4 py-3 font-semibold">
                      Description
                    </th>

                    <th className="px-4 py-3 font-semibold">
                      Make / Model
                    </th>

                    <th className="px-4 py-3 font-semibold">
                      Serial No.
                    </th>

                    <th className="px-4 py-3 font-semibold">
                      Status
                    </th>

                    <th className="px-4 py-3 font-semibold">
                      Customer remarks / Details
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {equipmentRows.map((equipment, index) => {
                    const equipmentStatus =
                      normalizeText(
                        equipment?.status || equipment?.job_status
                      ) || "—";

                    const rowRemarks =
                      equipment?.customer_remarks ||
                      equipment?.final_remarks ||
                      equipment?.engineer_remarks ||
                      "—";

                    return (
                      <tr
                        key={
                          equipment?.inward_eqp_id ||
                          equipment?.srf_eqp_id ||
                          index
                        }
                        className="align-top hover:bg-slate-50/70"
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-800">
                          {equipment?.nepl_id ||
                            equipment?.inward_eqp_id ||
                            equipment?.srf_eqp_id ||
                            `Item ${index + 1}`}
                        </td>

                        <td className="min-w-[180px] px-4 py-3 text-slate-700">
                          {equipment?.material_description ||
                            equipment?.description ||
                            "—"}
                        </td>

                        <td className="min-w-[150px] px-4 py-3 text-slate-600">
                          {[equipment?.make, equipment?.model]
                            .filter(Boolean)
                            .join(" / ") || "—"}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {equipment?.serial_no || "—"}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            {equipmentStatus}
                          </span>
                        </td>

                        <td className="min-w-[220px] whitespace-pre-wrap px-4 py-3 text-slate-600">
                          {rowRemarks}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* FINAL INSPECTION REMARKS */}

        {isFinal && !isAlreadyProcessed && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <label className="block text-sm font-bold text-slate-800">
              Delegated approval remarks
            </label>

            <p className="mt-1 text-xs text-slate-500">
              This note is stored in the existing Final Inspection customer remarks field.
            </p>

            <textarea
              value={approvalRemarks}
              onChange={(event) =>
                setApprovalRemarks(event.target.value)
              }
              rows={3}
              disabled={approvalLoading}
              className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
              placeholder="Enter the reason for delegated approval..."
            />
          </section>
        )}

        {approvalError && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            {approvalError}
          </div>
        )}

        {/* APPROVAL ACTIONS */}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={resetDetailState}
            className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Back to List
          </button>

          <button
            type="button"
            disabled={
              isAlreadyProcessed ||
              approvalLoading ||
              (isFinal && !isTrue(detail.report_sent))
            }
            onClick={() => setShowConfirm(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {approvalLoading ? (
              <Loader2 size={17} className="animate-spin" />
            ) : (
              <CheckCircle2 size={17} />
            )}

            {approvalLoading
              ? "Approving..."
              : isAlreadyProcessed
                ? isFir
                  ? "Already Reviewed"
                  : "Already Decided"
                : approvalLabel}
          </button>
        </div>

        {/* CONFIRMATION MODAL */}

        {showConfirm && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <ShieldCheck size={25} />
              </div>

              <h3 className="mt-4 text-lg font-bold text-slate-900">
                Confirm delegated action
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                {isFir ? (
                  <>
                    You are about to mark{" "}
                    <strong>{detailSrfNo}</strong> as reviewed on behalf of{" "}
                    <strong>{detailCustomer}</strong>.
                  </>
                ) : (
                  <>
                    You are about to approve{" "}
                    <strong>{detailSrfNo}</strong> on behalf of{" "}
                    <strong>{detailCustomer}</strong>.
                  </>
                )}{" "}
                This action updates the existing record through its current workflow endpoint.
              </p>

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={approvalLoading}
                  onClick={() => setShowConfirm(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={approvalLoading}
                  onClick={() => void approveSelectedRecord()}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {approvalLoading && (
                    <Loader2 size={15} className="animate-spin" />
                  )}
                  Confirm Approval
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================
  // DETAIL LOADING
  // ============================================================

  if (selectedItem && detailLoading) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />

        <p className="text-sm font-medium">
          Loading record details...
        </p>

        <button
          type="button"
          onClick={resetDetailState}
          className="mt-2 text-sm font-semibold text-blue-700 hover:text-blue-900"
        >
          Back to List
        </button>
      </div>
    );
  }

  if (selectedItem && detailError && !detail) {
    return (
      <div className="space-y-5 animate-fadeIn">
        <button
          type="button"
          onClick={resetDetailState}
          className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-900"
        >
          <ArrowLeft size={16} />
          Back to List
        </button>

        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          {detailError}
        </div>
      </div>
    );
  }

  // ============================================================
  // LIST VIEW
  // ============================================================

  const selectedTabLabel =
    tabs.find((tab) => tab.id === activeTab)?.label || "Records";

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* HEADER */}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <button
            type="button"
            onClick={() => {
              setActiveType(null);
              setItems([]);
              setSearchTerm("");
              resetDetailState();
            }}
            className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 transition hover:text-blue-900"
          >
            <ArrowLeft size={16} />
            Back to Delegated Approval
          </button>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {selectedCard?.title}
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Records available for delegated review and approval
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadList(activeType)}
          disabled={listLoading}
          className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw
            size={16}
            className={listLoading ? "animate-spin" : ""}
          />
          Refresh
        </button>
      </div>

      {/* STATUS TABS */}

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-semibold transition ${
                isActive
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {tab.label}

              <span
                className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {tabCounts[tab.id]}
              </span>
            </button>
          );
        })}
      </div>

      {/* SEARCH */}

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search SRF number, customer or equipment..."
            className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="text-sm text-slate-500">
          <strong className="text-slate-800">
            {filteredItems.length}
          </strong>{" "}
          {selectedTabLabel.toLowerCase()} record(s)
        </div>
      </div>

      {listError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          {listError}
        </div>
      )}

      {/* RECORD TABLE */}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {listLoading ? (
          <div className="flex min-h-[260px] items-center justify-center text-slate-500">
            <div className="text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />

              <p className="mt-3 text-sm font-medium">
                Loading records...
              </p>
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              {activeTab === "pending" ? (
                <Users size={25} />
              ) : (
                <CheckCircle2 size={25} />
              )}
            </span>

            <h3 className="mt-4 text-base font-bold text-slate-800">
              {activeTab === "pending"
                ? "No pending records found"
                : "No records found"}
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              {activeTab === "pending"
                ? "There are no customer-pending records in this section."
                : `There are no ${selectedTabLabel.toLowerCase()} records in this section.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-semibold">
                    SRF Number
                  </th>

                  <th className="px-5 py-4 font-semibold">
                    Customer
                  </th>

                  <th className="px-5 py-4 font-semibold">
                    Inward Date
                  </th>

                  {activeType === "fir" && (
                    <th className="px-5 py-4 font-semibold">
                      Pending Items
                    </th>
                  )}

                  <th className="px-5 py-4 font-semibold">
                    Status
                  </th>

                  <th className="px-5 py-4 text-right font-semibold">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item, index) => {
                  const id = getRecordId(activeType, item);
                  const state = getApprovalState(activeType, item);

                  const status = getStatusPresentation(
                    activeType,
                    state
                  );

                  const equipmentCount = getEquipmentRows(
                    activeType,
                    item
                  ).filter(
                    (equipment) =>
                      normalizeText(equipment?.status).toLowerCase() ===
                      "pending"
                  ).length;

                  const isReadOnly = state !== "pending";

                  return (
                    <tr
                      key={`${activeType}-${id}-${index}`}
                      className="transition hover:bg-slate-50/80"
                    >
                      <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-900">
                        {getSrfNumber(item)}
                      </td>

                      <td className="min-w-[190px] px-5 py-4 text-slate-700">
                        {getCustomerName(item)}
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-slate-500">
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays size={14} />
                          {formatDate(getListDate(activeType, item))}
                        </span>
                      </td>

                      {activeType === "fir" && (
                        <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                          {isReadOnly ? "0" : equipmentCount}
                        </td>
                      )}

                      <td className="whitespace-nowrap px-5 py-4">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${status.className}`}
                        >
                          {status.label}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => void openRecord(item)}
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700"
                        >
                          <Eye size={14} />
                          {isReadOnly ? "View" : "Review"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
        <Building2 size={14} className="mt-0.5 shrink-0" />
        Approval status will automatically be reflected in the customer portal
      </p>
    </div>
  );
};

export default AdminDelegatedApproval;

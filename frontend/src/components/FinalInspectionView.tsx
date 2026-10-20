import React, { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  Loader2,
  Mail,
  Plus,
  Save,
  Send,
  Share2,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { api, ENDPOINTS } from "../api/config";
import toast from "react-hot-toast";

// -----------------------------------------------------------------------------
// Work Completion Certificate (WCC) types and defaults
// Kept in this file so the WCC frontend can be integrated as a single TSX file.
// -----------------------------------------------------------------------------

type WCCDetailItem = {
  po_s_no: number | null;
  description_of_work: string;
  uom: string;
  quantity_completed: number | null;
  sac_no: string;
  status_of_work_completed: string;
};

type WCCSignatureDetails = {
  representative_and_company_seal_name: string;
  vendor_representative_company_seal_name: string;
};

type WCCPayload = {
  inward_id: number | null;
  vendor_company_details: string;
  tax_registration_details: string;
  nextage_dispatch_dc_no: string;
  date: string | null;
  services_delivered_to: string;
  work_location_1: string;
  work_location_2: string;
  work_location_3: string;
  gst_no: string;
  pan_no: string;
  wcc_no: string;
  work_start_date: string | null;
  work_completion_date: string | null;
  po_no: string;
  po_date: string | null;
  project_name: string;
  details_table: WCCDetailItem[];
  remarks: string;
  signature_details: WCCSignatureDetails;
};

type WCCRecord = WCCPayload & {
  id: number;
  // Values returned by the backend from the linked inward record.
  srf_no?: string | null;
  customer_dc_no?: string | null;
  created_at?: string;
  updated_at?: string;
};

const WCC_COLLECTION = "/work-completion-certificates/";

const DEFAULT_VENDOR_DETAILS =
  "Nextage Engineering Pvt Ltd\\nGF-01, Emerald Icon, #104, 5BC, III Block \\nHRBR Layout, Bangalore – 560043";

const emptyWCCDetail = (): WCCDetailItem => ({
  po_s_no: null,
  description_of_work: "",
  uom: "",
  quantity_completed: null,
  sac_no: "",
  status_of_work_completed: "",
});

const createEmptyWCCPayload = (inwardId: number, customerName = ""): WCCPayload => ({
  inward_id: inwardId,
  vendor_company_details: DEFAULT_VENDOR_DETAILS.replace(/\\n/g, "\n"),
  tax_registration_details: "29AAGCN6783L1ZM",
  nextage_dispatch_dc_no: "",
  date: null,
  services_delivered_to: "",
  work_location_1: "",
  work_location_2: "",
  work_location_3: "",
  gst_no: "",
  pan_no: "",
  wcc_no: "",
  work_start_date: null,
  work_completion_date: null,
  po_no: "",
  po_date: null,
  project_name: "",
  details_table: [{ ...emptyWCCDetail(), po_s_no: 1 }],
  remarks: "",
  signature_details: {
    representative_and_company_seal_name: "Nextage Engineering Pvt Ltd",
    vendor_representative_company_seal_name: "",
  },
});

const payloadFromWCCRecord = (record: WCCRecord): WCCPayload => ({
  inward_id: record.inward_id,
  vendor_company_details: record.vendor_company_details ?? "",
  tax_registration_details: record.tax_registration_details ?? "",
  nextage_dispatch_dc_no: record.nextage_dispatch_dc_no ?? "",
  date: record.date ? record.date.slice(0, 10) : null,
  services_delivered_to: record.services_delivered_to ?? "",
  work_location_1: record.work_location_1 ?? "",
  work_location_2: record.work_location_2 ?? "",
  work_location_3: record.work_location_3 ?? "",
  gst_no: record.gst_no ?? "",
  pan_no: record.pan_no ?? "",
  wcc_no: record.wcc_no ?? "",
  work_start_date: record.work_start_date ? record.work_start_date.slice(0, 10) : null,
  work_completion_date: record.work_completion_date ? record.work_completion_date.slice(0, 10) : null,
  po_no: record.po_no ?? "",
  po_date: record.po_date ? record.po_date.slice(0, 10) : null,
  project_name: record.project_name ?? "",
  details_table: Array.isArray(record.details_table) && record.details_table.length
    ? record.details_table.map((row) => ({ ...emptyWCCDetail(), ...row }))
    : [emptyWCCDetail()],
  remarks: record.remarks ?? "",
  signature_details: {
    representative_and_company_seal_name: record.signature_details?.representative_and_company_seal_name ?? "",
    vendor_representative_company_seal_name: record.signature_details?.vendor_representative_company_seal_name ?? "",
  },
});

function WCCTextInput({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder,
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  type?: "text" | "date" | "number";
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block min-w-0 space-y-1.5">
      <span className="text-xs font-semibold text-slate-600">
        {label}{required && <span className="text-red-500"> *</span>}
      </span>
      <input
        type={type}
        required={required}
        step={type === "number" ? "any" : undefined}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder ?? label}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
    </label>
  );
}

function WCCTextArea({
  label,
  value,
  onChange,
  rows = 2,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="block min-w-0 space-y-1.5">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <textarea
        rows={rows}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
    </label>
  );
}

function WCCFormModal({
  open,
  inwardId,
  customerName,
  existing,
  onClose,
  onSaved,
}: {
  open: boolean;
  inwardId: number;
  customerName: string;
  existing: WCCRecord | null;
  onClose: () => void;
  onSaved: (record: WCCRecord) => void;
}) {
  const [form, setForm] = useState<WCCPayload>(() => createEmptyWCCPayload(inwardId, customerName));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(existing ? payloadFromWCCRecord(existing) : createEmptyWCCPayload(inwardId, customerName));
  }, [open, existing, inwardId, customerName]);

  if (!open) return null;

  const setField = <K extends keyof WCCPayload>(key: K, value: WCCPayload[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const setSignature = (key: keyof WCCSignatureDetails, value: string) => {
    setForm((previous) => ({
      ...previous,
      signature_details: { ...previous.signature_details, [key]: value },
    }));
  };

  const updateDetail = (index: number, key: keyof WCCDetailItem, value: string) => {
    setForm((previous) => ({
      ...previous,
      details_table: previous.details_table.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        if (key === "po_s_no" || key === "quantity_completed") {
          const parsed = value.trim() === "" ? null : Number(value);
          return { ...row, [key]: parsed } as WCCDetailItem;
        }
        return { ...row, [key]: value } as WCCDetailItem;
      }),
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!Number.isFinite(inwardId) || inwardId <= 0) {
      toast.error("A valid inward record is required to save this WCC.");
      return;
    }
    if (!form.wcc_no.trim()) {
      toast.error("WCC No is required.");
      return;
    }
    if (form.work_start_date && form.work_completion_date && form.work_completion_date < form.work_start_date) {
      toast.error("Work completion date cannot be before work start date.");
      return;
    }

    const payload: WCCPayload = {
      ...form,
      inward_id: inwardId,
      vendor_company_details: form.vendor_company_details ?? "",
      work_start_date: form.work_start_date || null,
      work_completion_date: form.work_completion_date || null,
      date: form.date || null,
      po_date: form.po_date || null,
      details_table: form.details_table.map((row) => ({ ...row })),
      signature_details: { ...form.signature_details },
    };

    setSaving(true);
    try {
      // Re-check the inward link immediately before creating. The WCC button's
      // initial lookup may be stale (or a previous request may have saved the
      // record even though the browser did not receive its response).
      let certificateToUpdate: WCCRecord | null = existing;

      if (!certificateToUpdate) {
        try {
          const existingResponse = await api.get(
            `${WCC_COLLECTION}by-inward/${inwardId}`
          );
          certificateToUpdate = existingResponse.data as WCCRecord;
        } catch (lookupError: any) {
          if (lookupError?.response?.status !== 404) {
            const detail = lookupError?.response?.data?.detail;
            toast.error(
              typeof detail === "string"
                ? `Could not verify whether a WCC already exists: ${detail}`
                : "Could not verify whether a WCC already exists. Please retry; no save was attempted."
            );
            return;
          }
        }
      }

      // If this inward already has a WCC, update that record rather than
      // inserting a second row against the unique inward_id constraint.
      if (certificateToUpdate) {
        const response = await api.patch(
          `${WCC_COLLECTION}${certificateToUpdate.id}`,
          payload
        );
        toast.success("Work Completion Certificate updated.");
        onSaved(response.data as WCCRecord);
        return;
      }

      try {
        const response = await api.post(WCC_COLLECTION, payload);
        toast.success("Work Completion Certificate saved.");
        onSaved(response.data as WCCRecord);
      } catch (createError: any) {
        if (createError?.response?.status !== 409) throw createError;

        // A 409 can mean another request already created the WCC for this
        // inward. Re-fetch and PATCH that record if it exists.
        try {
          const existingResponse = await api.get(
            `${WCC_COLLECTION}by-inward/${inwardId}`
          );
          const savedRecord = existingResponse.data as WCCRecord;
          const updateResponse = await api.patch(
            `${WCC_COLLECTION}${savedRecord.id}`,
            payload
          );
          toast.success("An existing WCC was found and updated.");
          onSaved(updateResponse.data as WCCRecord);
          return;
        } catch (recoveryError: any) {
          // Only a 404 confirms that no WCC could be found for this inward.
          // For other errors, do not hide the original unique-constraint issue.
          if (recoveryError?.response?.status !== 404) {
            const detail = recoveryError?.response?.data?.detail;
            toast.error(
              typeof detail === "string"
                ? detail
                : "The WCC conflicts with an existing record. Reload the page and open the saved WCC to edit it."
            );
            return;
          }
        }

        toast.error(
          "A WCC with this number may already exist, or this inward already has a certificate. Check the WCC No and reload the page to edit an existing certificate."
        );
      }
    } catch (error: any) {
      const statusCode = error?.response?.status;
      const detail = error?.response?.data?.detail;
      if (statusCode === 409) {
        toast.error(
          "The WCC No is already in use or this inward already has a certificate. Reload the page and edit the existing WCC, or enter a unique WCC No."
        );
      } else {
        toast.error(
          typeof detail === "string"
            ? detail
            : "Unable to save the Work Completion Certificate. Check the server logs for the underlying error."
        );
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center px-3 pb-4 pt-24 sm:px-5 sm:pb-5 sm:pt-28" role="dialog" aria-modal="true" aria-labelledby="wcc-modal-title">
      <button
        type="button"
        aria-label="Close WCC form"
        className="absolute inset-0 cursor-default bg-slate-950/60 backdrop-blur-sm"
        onClick={() => !saving && onClose()}
      />
      <div className="relative flex max-h-[78vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-3 text-white sm:px-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">Nextage Engineering</p>
            <h2 id="wcc-modal-title" className="mt-1 text-lg font-bold sm:text-xl">
              {existing ? "Edit Work Completion Certificate" : "Work Completion Certificate"}
            </h2>
          </div>
          <button type="button" disabled={saving} onClick={onClose} className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50" aria-label="Close">
            <X size={21} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-5 p-4 sm:p-5">
            <section className="space-y-4">
              <h3 className="border-b border-slate-100 pb-2 text-sm font-bold uppercase tracking-wide text-blue-700">Vendor Details</h3>
              <WCCTextArea label="Vendor Company Details" rows={3} value={form.vendor_company_details} onChange={(value) => setField("vendor_company_details", value)} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <WCCTextInput label="Tax Registration Details" value={form.tax_registration_details} onChange={(value) => setField("tax_registration_details", value)} />
                <WCCTextInput label="Services Delivered To" value={form.services_delivered_to} onChange={(value) => setField("services_delivered_to", value)} />
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="border-b border-slate-100 pb-2 text-sm font-bold uppercase tracking-wide text-blue-700">Work Locations and Tax Details</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <WCCTextInput label="Work Location 1" value={form.work_location_1} onChange={(value) => setField("work_location_1", value)} />
                <WCCTextInput label="Work Location 2" value={form.work_location_2} onChange={(value) => setField("work_location_2", value)} />
                <WCCTextInput label="Work Location 3" value={form.work_location_3} onChange={(value) => setField("work_location_3", value)} />
                <WCCTextInput label="GST No" value={form.gst_no} onChange={(value) => setField("gst_no", value)} />
                <WCCTextInput label="PAN No" value={form.pan_no} onChange={(value) => setField("pan_no", value)} />
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="border-b border-slate-100 pb-2 text-sm font-bold uppercase tracking-wide text-blue-700">Certificate and Purchase Order</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <WCCTextInput label="Date" type="date" value={form.date} onChange={(value) => setField("date", value || null)} />
                <WCCTextInput label="Nextage Dispatch DC No" value={form.nextage_dispatch_dc_no} onChange={(value) => setField("nextage_dispatch_dc_no", value)} />
                <WCCTextInput label="WCC No" value={form.wcc_no} required onChange={(value) => setField("wcc_no", value)} />
                <WCCTextInput label="Work Start Date" type="date" value={form.work_start_date} onChange={(value) => setField("work_start_date", value || null)} />
                <WCCTextInput label="Work Completion Date" type="date" value={form.work_completion_date} onChange={(value) => setField("work_completion_date", value || null)} />
                <WCCTextInput label="PO No" value={form.po_no} onChange={(value) => setField("po_no", value)} />
                <WCCTextInput label="PO Date" type="date" value={form.po_date} onChange={(value) => setField("po_date", value || null)} />
                <WCCTextInput label="Project Name" value={form.project_name} onChange={(value) => setField("project_name", value)} />
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-2">
                <h3 className="text-sm font-bold uppercase tracking-wide text-blue-700">Details of Work Completed</h3>
                <button
                  type="button"
                  onClick={() => setField("details_table", [...form.details_table, { ...emptyWCCDetail(), po_s_no: form.details_table.length + 1 }])}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 px-3 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-50"
                >
                  <Plus size={15} /> Add Work Row
                </button>
              </div>
              <div className="space-y-4">
                {form.details_table.map((row, index) => (
                  <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-700">Work Item {index + 1}</p>
                      <button
                        type="button"
                        disabled={form.details_table.length <= 1}
                        onClick={() => setField("details_table", form.details_table.filter((_, rowIndex) => rowIndex !== index))}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                        title={form.details_table.length <= 1 ? "At least one row is kept" : "Remove work row"}
                      >
                        <Trash2 size={14} /> Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <WCCTextInput label="PO S.No" type="number" value={row.po_s_no} onChange={(value) => updateDetail(index, "po_s_no", value)} />
                      <WCCTextInput label="Description of Work" value={row.description_of_work} onChange={(value) => updateDetail(index, "description_of_work", value)} />
                      <WCCTextInput label="UOM" value={row.uom} onChange={(value) => updateDetail(index, "uom", value)} />
                      <WCCTextInput label="Quantity Completed" type="number" value={row.quantity_completed} onChange={(value) => updateDetail(index, "quantity_completed", value)} />
                      <WCCTextInput label="SAC No" value={row.sac_no} onChange={(value) => updateDetail(index, "sac_no", value)} />
                      <WCCTextInput label="Status of Work Completed" value={row.status_of_work_completed} onChange={(value) => updateDetail(index, "status_of_work_completed", value)} />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="border-b border-slate-100 pb-2 text-sm font-bold uppercase tracking-wide text-blue-700">Remarks</h3>
              <WCCTextArea label="Remarks" rows={3} value={form.remarks} onChange={(value) => setField("remarks", value)} />
            </section>

            <section className="space-y-4">
              <h3 className="border-b border-slate-100 pb-2 text-sm font-bold uppercase tracking-wide text-blue-700">Signature Details</h3>
              <p className="text-xs text-slate-500">Authorised Signature, Site Engineer, and Site Incharge are part of template</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <WCCTextInput label="Name of the Representative and Company Seal" value={form.signature_details.representative_and_company_seal_name} onChange={(value) => setSignature("representative_and_company_seal_name", value)} />
                <WCCTextInput label="Name of the Vendor Representative, Company Seal" value={form.signature_details.vendor_representative_company_seal_name} onChange={(value) => setSignature("vendor_representative_company_seal_name", value)} />
              </div>
            </section>
          </div>

          <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
            <button type="button" disabled={saving} onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">
              {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
              {saving ? "Saving..." : existing ? "Save Changes" : "Save WCC"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// WCC PDF generator - A4 landscape, laid out to follow the supplied certificate.
// Requires: npm install jspdf jspdf-autotable
// -----------------------------------------------------------------------------

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
  doc.setFontSize(10.8);
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

function WCCActions({ inwardId, customerName }: { inwardId: number; customerName: string }) {
  const [existingWcc, setExistingWcc] = useState<WCCRecord | null>(null);
  const [loadingWcc, setLoadingWcc] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const loadWcc = useCallback(async () => {
    if (!Number.isFinite(inwardId) || inwardId <= 0) {
      setExistingWcc(null);
      setLoadingWcc(false);
      return;
    }
    setLoadingWcc(true);
    try {
      const response = await api.get(`${WCC_COLLECTION}by-inward/${inwardId}`);
      setExistingWcc(response.data as WCCRecord);
    } catch (error: any) {
      if (error?.response?.status === 404) {
        setExistingWcc(null);
      } else {
        setExistingWcc(null);
        toast.error(error?.response?.data?.detail || "Unable to check the saved WCC.");
      }
    } finally {
      setLoadingWcc(false);
    }
  }, [inwardId]);

  useEffect(() => {
    void loadWcc();
  }, [loadWcc]);

  const handleSaved = (record: WCCRecord) => {
    setExistingWcc(record);
    setIsModalOpen(false);
  };

  const handleDownload = () => {
    if (!existingWcc) return;
    try {
      setDownloading(true);
      downloadWCCPdf(existingWcc);
    } catch (error) {
      console.error("Failed to generate WCC PDF", error);
      toast.error("Could not generate the WCC PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          disabled={loadingWcc}
          title={existingWcc ? "Open and edit the saved Work Completion Certificate" : "Create Work Completion Certificate"}
          className="inline-flex min-w-[112px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-blue-100 transition hover:bg-blue-700 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
        >
          {loadingWcc ? <Loader2 size={17} className="animate-spin" /> : <FileCheck2 size={17} />}
          WCC
          {existingWcc && <span className="h-2 w-2 rounded-full bg-emerald-300" aria-label="WCC saved" />}
        </button>
        {existingWcc && (
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-60"
          >
            {downloading ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}
            Download PDF
          </button>
        )}
      </div>
      <WCCFormModal
        open={isModalOpen}
        inwardId={inwardId}
        customerName={customerName}
        existing={existingWcc}
        onClose={() => setIsModalOpen(false)}
        onSaved={handleSaved}
      />
    </>
  );
}

/** Export the visible Final Inspection Report data to a themed PDF. */
function downloadFinalInspectionPdf(report: any): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 6;

  // White page and the same navy/blue visual style used by the WCC certificate.
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setFillColor(8, 8, 110);
  doc.rect(margin, margin, pageWidth - margin * 2, 15, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("FINAL INSPECTION REPORT", margin + 4, 15.5);
  doc.setFontSize(9);
  doc.text(`SRF: ${wccSafe(report?.srf_no) || "N/A"}`, pageWidth - margin - 4, 15.5, { align: "right" });

  const leftX = margin + 1;
  const rightX = pageWidth / 2 + 2;
  const labelWidth = 29;
  const valueWidth = pageWidth / 2 - 42;
  let metaY = 29;

  const drawPair = (label: string, value: unknown, x: number, y: number, maxWidth = valueWidth) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(label, x, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(15, 23, 42);
    const textValue = wccSafe(value) || "-";
    doc.text(textValue, x + labelWidth, y, { maxWidth });
  };

  drawPair("Inward Date", report?.created_at ? new Date(report.created_at).toLocaleDateString("en-IN") : "N/A", leftX, metaY);
  drawPair("Customer", report?.customer_name, rightX, metaY);
  metaY += 6;
  drawPair("Customer DC No", report?.customer_dc_no, leftX, metaY);
  drawPair("Customer Email", report?.customer_email, rightX, metaY);
  metaY += 6;
  drawPair("Received By", report?.receiver, leftX, metaY);
  drawPair("Decision", report?.customer_decision || (report?.report_sent ? "REPORT DISPATCHED" : "Pending"), rightX, metaY);

  if (report?.customer_decision === "REJECTED" && wccSafe(report?.customer_remarks)) {
    metaY += 6;
    drawPair("Rejection Reason", report.customer_remarks, leftX, metaY, pageWidth - margin * 2 - labelWidth - 4);
  }

  const equipmentRows = (Array.isArray(report?.equipments) ? report.equipments : []).map((eq: any, index: number) => [
    String(index + 1),
    wccSafe(eq?.nepl_id),
    wccSafe(eq?.material_description),
    wccSafe(eq?.serial_no),
    wccSafe(eq?.quantity),
    wccSafe(eq?.make),
    wccSafe(eq?.model),
    wccSafe(eq?.range),
    wccSafe(eq?.visual_inspection_notes) || "-",
    wccSafe(eq?.accessories_included) || "-",
    wccSafe(eq?.engineer_remarks) || "-",
    wccSafe(eq?.customer_remarks) || "-",
    wccSafe(eq?.job_status) || "PENDING",
    wccSafe(eq?.final_remarks) || "-",
  ]);

  autoTable(doc, {
    startY: metaY + 8,
    head: [[
      "SL", "NEPL ID", "DESCRIPTION", "SERIAL NO", "QTY", "MAKE", "MODEL", "RANGE",
      "VISUAL NOTES", "ACCESSORIES", "ENG REMARKS", "CUST REMARKS", "CALIB. STATUS", "FINAL REMARKS",
    ]],
    body: equipmentRows.length ? equipmentRows : [["", "", "No equipment records", "", "", "", "", "", "", "", "", "", "", ""]],
    theme: "grid",
    margin: { left: margin, right: margin, bottom: 12 },
    tableWidth: "auto",
    showHead: "everyPage",
    styles: {
      font: "helvetica",
      fontSize: 5.8,
      textColor: [15, 23, 42],
      lineColor: [100, 116, 139],
      lineWidth: 0.12,
      cellPadding: { top: 1.5, right: 1.1, bottom: 1.5, left: 1.1 },
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: [239, 243, 250],
      textColor: [8, 8, 110],
      fontStyle: "bold",
      halign: "center",
      valign: "middle",
    },
    bodyStyles: { minCellHeight: 6 },
    columnStyles: {
      0: { cellWidth: 7, halign: "center" },
      1: { cellWidth: 17 },
      2: { cellWidth: 32 },
      3: { cellWidth: 18 },
      4: { cellWidth: 8, halign: "center" },
      5: { cellWidth: 14 },
      6: { cellWidth: 13 },
      7: { cellWidth: 15 },
      8: { cellWidth: 23 },
      9: { cellWidth: 19 },
      10: { cellWidth: 20 },
      11: { cellWidth: 20 },
      12: { cellWidth: 20 },
      13: { cellWidth: 34 },
    },
  });

  // Thin border and page numbering on every page, after all table content is rendered.
  const pageCount = doc.getNumberOfPages();
  for (let pageNo = 1; pageNo <= pageCount; pageNo += 1) {
    doc.setPage(pageNo);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.rect(1.2, 1.2, pageWidth - 2.4, pageHeight - 2.4, "S");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Page ${pageNo} of ${pageCount}`, pageWidth - margin, pageHeight - 3, { align: "right" });
  }

  const safeSrf = wccSafe(report?.srf_no).replace(/[^a-zA-Z0-9_-]+/g, "-") || "inspection-report";
  doc.save(`Final-Inspection-Report-${safeSrf}.pdf`);
}

export const FinalInspectionView: React.FC = () => {
  const { inwardId } = useParams<{ inwardId: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any | null>(null);
  const [reportEmails, setReportEmails] = useState<string[]>(['']);
  const [isSending, setIsSending] = useState(false);
  const [showSuccessUI, setShowSuccessUI] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        setLoading(true);
        const res = await api.get(ENDPOINTS.FINAL_INSPECTIONS.GET_DETAILS(Number(inwardId)));
        setData(res.data);
        if (res.data.customer_email) {
            setReportEmails([res.data.customer_email]);
        }
      } catch (err: any) {
        toast.error("Failed to load inspection details.");
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [inwardId]);

  const addEmailField = () => setReportEmails(prev => [...prev, '']);
  const removeEmailField = (index: number) => setReportEmails(prev => prev.filter((_, i) => i !== index));

  const handleSendFir = async (e: React.FormEvent) => {
    e.preventDefault();
    const validEmails = reportEmails.filter(email => email.trim() && email.includes('@'));
    if (validEmails.length === 0) return toast.error("Please enter at least one valid email.");

    setIsSending(true);
    try {
      const payload = {
        inward_id: Number(inwardId),
        srf_no: data.srf_no,
        customer_name: data.customer_name,
        customer_email: data.customer_email,
        customer_dc_no: data.customer_dc_no,
        receiver: data.receiver,
        equipments: data.equipments, 
        emails: validEmails
      };
      await api.post(ENDPOINTS.FINAL_INSPECTIONS.SEND_REPORT(Number(inwardId)), payload);
      toast.success("Final Inspection Report saved and sent!");
      setShowSuccessUI(true);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to process report.");
    } finally {
      setIsSending(false);
    }
  };

  const handleRemarkChange = (index: number, value: string) => {
    if (!data) return;
    const updatedEquipments = [...data.equipments];
    updatedEquipments[index].final_remarks = value;
    setData({ ...data, equipments: updatedEquipments });
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <Loader2 className="h-10 w-10 animate-spin text-indigo-600 mb-4" />
      <p className="text-gray-500 font-medium">Preparing Final Report Preview...</p>
    </div>
  );

  if (!data) return <div className="p-10 text-center">Inward data not found.</div>;

  // New logic for engineer view
  const hasCustomerDecision = !!data.customer_decision;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto space-y-6">
        
        <div className="flex items-center justify-between gap-4 px-2">
            <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium transition-colors">
                <ArrowLeft className="h-4 w-4" /> Back to List
            </button>

            <div className="flex flex-wrap items-center justify-end gap-3">
                <WCCActions
                    inwardId={Number(inwardId)}
                    customerName={data.customer_name || ""}
                />
                {data.report_sent && (
                    <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-full text-xs font-bold">
                        <Send size={12} /> REPORT DISPATCHED
                    </div>
                )}
            </div>
        </div>

        <div className="bg-white shadow-xl rounded-xl border border-gray-200 overflow-hidden">
            
            {/* NEW: CUSTOMER DECISION BANNER FOR ENGINEER */}
            {hasCustomerDecision && (
                <div className={`${data.customer_decision === 'APPROVED' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'} border-b px-6 py-4 flex items-center gap-4`}>
                    <div className={`p-2 rounded-full ${data.customer_decision === 'APPROVED' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                        {data.customer_decision === 'APPROVED' ? <CheckCircle2 size={24} /> : <XCircle size={24} />}
                    </div>
                    <div className="flex-grow">
                        <div className="flex items-center justify-between">
                            <h3 className={`text-sm font-bold uppercase tracking-wide ${data.customer_decision === 'APPROVED' ? 'text-emerald-800' : 'text-red-800'}`}>
                                Customer Decision: {data.customer_decision}
                            </h3>
                            <span className="text-[10px] text-slate-400 font-mono">
                                Updated: {data.updated_at ? new Date(data.updated_at).toLocaleString() : ""}
                            </span>
                        </div>
                        {data.customer_decision === 'REJECTED' && (
                            <div className="mt-1 p-3 bg-white/50 border border-red-100 rounded-lg">
                                <p className="text-sm text-red-900">
                                    <span className="font-bold">Rejection Reason:</span> {data.customer_remarks || "No remarks provided"}
                                </p>
                            </div>
                        )}
                        {data.customer_decision === 'APPROVED' && (
                            <p className="text-xs text-emerald-700 mt-0.5">Report has been reviewed and accepted by the customer.</p>
                        )}
                    </div>
                </div>
            )}

            <div className="bg-slate-800 text-white p-5 sm:p-6 flex flex-wrap justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                    <FileText size={24} className="text-blue-400" />
                    <h2 className="text-xl font-bold tracking-tight">Final Inspection Report</h2>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-4">
                    <button
                        type="button"
                        onClick={() => {
                            try {
                                downloadFinalInspectionPdf(data);
                            } catch (error) {
                                console.error("Failed to export Final Inspection Report PDF", error);
                                toast.error("Could not export the Final Inspection Report PDF. Please try again.");
                            }
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-blue-300/50 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 shadow-sm transition hover:bg-blue-50 hover:text-blue-800"
                    >
                        <Download size={17} /> Export PDF
                    </button>
                    <div className="text-right">
                        <p className="text-[10px] text-slate-400 uppercase font-bold">SRF Number</p>
                        <p className="text-lg font-mono font-bold text-blue-400">{data.srf_no}</p>
                    </div>
                </div>
            </div>

            <div className="p-6 sm:p-8">
                {/* Warnings for Engineer */}
                {data.customer_decision === 'REJECTED' && (
                    <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3 text-amber-800">
                        <AlertCircle size={20} className="text-amber-600 flex-shrink-0" />
                        <p className="text-sm font-medium">
                            Action Required: Please update the "Final Remarks" below based on customer feedback and re-dispatch the report.
                        </p>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 pb-8 border-b border-gray-100">
                    <div className="space-y-3 text-sm">
                        <div className="flex border-b border-slate-50 pb-2">
                            <span className="font-bold text-slate-500 w-32">Inward Date:</span> 
                            <span className="text-slate-900">{data.created_at ? new Date(data.created_at).toLocaleDateString() : "N/A"}</span>
                        </div>
                        <div className="flex border-b border-slate-50 pb-2">
                            <span className="font-bold text-slate-500 w-32">DC Number:</span> 
                            <span className="text-slate-900 font-mono">{data.customer_dc_no}</span>
                        </div>
                        <div className="flex">
                            <span className="font-bold text-slate-500 w-32">Received By:</span> 
                            <span className="text-slate-900">{data.receiver}</span>
                        </div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-lg">
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-2">Customer Details</p>
                        <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed font-bold">
                            {data.customer_name}
                        </p>
                        <p className="text-xs text-slate-400 mt-2 font-mono">{data.customer_email}</p>
                    </div>
                </div>

                {/* Table remains the same but Engineer can still edit Final Remarks */}
                <div className="relative rounded-lg border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto overflow-y-hidden">
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
                            <tbody className="divide-y divide-slate-100">
                                {data.equipments.map((eq: any, idx: number) => (
                                    <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                                        <td className="border-r border-slate-200 p-3 text-center text-slate-400 bg-white sticky left-0 group-hover:bg-slate-50">{idx + 1}</td>
                                        <td className="border-r border-slate-200 p-3 font-mono font-bold text-blue-700">{eq.nepl_id}</td>
                                        <td className="border-r border-slate-200 p-3 text-slate-800 font-medium">{eq.material_description}</td>
                                        <td className="border-r border-slate-200 p-3 text-slate-600 font-mono text-xs">{eq.serial_no}</td>
                                        <td className="border-r border-slate-200 p-3 text-center font-bold">{eq.quantity}</td>
                                        <td className="border-r border-slate-200 p-3">{eq.make}</td>
                                        <td className="border-r border-slate-200 p-3">{eq.model}</td>
                                        <td className="border-r border-slate-200 p-3 font-mono text-xs">{eq.range}</td>
                                        <td className="border-r border-slate-200 p-3 text-xs text-slate-500 italic">{eq.visual_inspection_notes || "-"}</td>
                                        <td className="border-r border-slate-200 p-3 text-xs text-slate-500">{eq.accessories_included || "-"}</td>
                                        <td className="border-r border-slate-200 p-3 text-xs text-slate-500">{eq.engineer_remarks || "-"}</td>
                                        <td className="border-r border-slate-200 p-3 text-xs text-slate-500">{eq.customer_remarks || "-"}</td>
                                        <td className="border-r border-slate-200 p-3 text-center">
                                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${eq.job_status === 'ISSUED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {eq.job_status || "PENDING"}
                                            </span>
                                        </td>
                                        <td className="p-2 bg-indigo-50/20">
                                            <textarea
                                                value={eq.final_remarks || ""}
                                                onChange={(e) => handleRemarkChange(idx, e.target.value)}
                                                placeholder="Update remarks here..."
                                                rows={1}
                                                className="w-full text-xs p-2 bg-white border border-indigo-100 rounded focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all resize-none min-h-[40px]"
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        {/* Action Button: Still available even if approved, but maybe highlight if rejected */}
        <div className="flex justify-end pt-4 pb-12">
            <button 
                onClick={() => setIsModalOpen(true)}
                className={`flex items-center gap-3 px-10 py-4 rounded-xl font-bold transition-all shadow-lg active:scale-95 ${
                    data.customer_decision === 'REJECTED' 
                    ? 'bg-red-600 hover:bg-red-700 shadow-red-100' 
                    : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100'
                } text-white`}
            >
                <Share2 size={20} />
                {data.customer_decision === 'REJECTED' ? 'Re-Dispatch Final Report' : 'Dispatch Final Report'}
            </button>
        </div>

        {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div 
                    className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                    onClick={() => !isSending && setIsModalOpen(false)}
                ></div>

                <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                    <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <Mail size={18} className="text-indigo-600" />
                            Email Final Report
                        </h3>
                        <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                            <X size={20} className="text-slate-500" />
                        </button>
                    </div>

                    {!showSuccessUI ? (
                        <div className="p-6">
                            <p className="text-sm text-slate-500 mb-6">Enter the email addresses where the report and certificates should be sent.</p>
                            <form onSubmit={handleSendFir} className="space-y-4">
                                <div className="max-h-[250px] overflow-y-auto pr-2 space-y-3">
                                    {reportEmails.map((email, index) => (
                                        <div key={index} className="flex gap-2">
                                            <input 
                                                type="email" value={email} 
                                                onChange={(e) => {
                                                    const next = [...reportEmails];
                                                    next[index] = e.target.value;
                                                    setReportEmails(next);
                                                }} 
                                                required placeholder="recipient@email.com" 
                                                className="flex-grow px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" 
                                            />
                                            {reportEmails.length > 1 && (
                                                <button type="button" onClick={() => removeEmailField(index)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><X size={18} /></button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <div className="pt-4 border-t border-slate-100 space-y-4">
                                    <button type="button" onClick={addEmailField} className="text-sm text-indigo-600 font-bold flex items-center gap-1 hover:underline">
                                        <Plus size={16} /> Add Recipient
                                    </button>
                                    <button 
                                        type="submit" disabled={isSending}
                                        className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {isSending ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                                        {isSending ? "Sending..." : "Confirm & Send Emails"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    ) : (
                        <div className="p-10 text-center">
                            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckCircle2 size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-2">Successfully Sent!</h3>
                            <p className="text-sm text-slate-500 mb-6">The documents for SRF {data.srf_no} have been dispatched.</p>
                            <button 
                                onClick={() => { setIsModalOpen(false); setShowSuccessUI(false); navigate(-1); }} 
                                className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all"
                            >
                                Finish & Exit
                            </button>
                        </div>
                    )}
                </div>
            </div>
        )}
      </div>
    </div>
  );
};
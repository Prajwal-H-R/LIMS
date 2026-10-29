import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  XCircle,
  AlertCircle,
  Check,
  X,
  ChevronLeft,
  Download,
  Eye,
  FileCheck2,
  FileText,
} from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { api, ENDPOINTS } from "../api/config";
import toast from "react-hot-toast";

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="customer-wcc-title">
      <button type="button" aria-label="Close WCC view" className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
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
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
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

export const CustomerFinalReportView: React.FC = () => {
  const { inwardId } = useParams<{ inwardId: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [wccLoading, setWccLoading] = useState(true);
  const [wccData, setWccData] = useState<WCCRecord | null>(null);
  const [showWccModal, setShowWccModal] = useState(false);
  
  // Rejection Modal State
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionRemarks, setRejectionRemarks] = useState("");

  const fetchReport = async () => {
    try {
      setLoading(true);
      const res = await api.get(ENDPOINTS.FINAL_INSPECTIONS.CUSTOMER_VIEW(Number(inwardId)));
      setData(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Access denied to this report.");
      navigate("/customer/view-firs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [inwardId]);

  // Fetch the WCC for this exact inward ID. A missing WCC should not block
  // viewing the inspection report; it simply hides the WCC viewing/download actions.
  useEffect(() => {
    let active = true;
    const loadWcc = async () => {
      const id = Number(inwardId);
      if (!Number.isFinite(id) || id <= 0) {
        setWccData(null);
        setWccLoading(false);
        return;
      }
      setWccLoading(true);
      try {
        const response = await api.get(`${WCC_COLLECTION}by-inward/${id}`);
        if (active) setWccData(response.data as WCCRecord);
      } catch (err: any) {
        if (active) {
          setWccData(null);
          if (err?.response?.status !== 404) {
            console.error("Unable to load customer-view WCC", err);
            toast.error(err?.response?.data?.detail || "Unable to load the Work Completion Certificate.");
          }
        }
      } finally {
        if (active) setWccLoading(false);
      }
    };
    void loadWcc();
    return () => { active = false; };
  }, [inwardId]);

  const handleDownloadInspectionPdf = () => {
    try {
      downloadFinalInspectionPdf(data);
    } catch (err) {
      console.error("Failed to export Final Inspection Report PDF", err);
      toast.error("Could not download the Final Inspection Report PDF. Please try again.");
    }
  };

  const handleDownloadWccPdf = () => {
    if (!wccData) {
      toast.error("The Work Completion Certificate is not available for this inward record.");
      return;
    }
    try {
      downloadWCCPdf(wccData);
    } catch (err) {
      console.error("Failed to export WCC PDF", err);
      toast.error("Could not download the Work Completion Certificate PDF. Please try again.");
    }
  };

  const handleSubmitDecision = async (decision: "APPROVED" | "REJECTED") => {
    if (decision === "REJECTED" && !rejectionRemarks.trim()) {
      toast.error("Please provide a reason for rejection.");
      return;
    }

    try {
      setIsSubmitting(true);
      await api.post(
  ENDPOINTS.FINAL_INSPECTIONS.SUBMIT_DECISION(Number(inwardId)),
  {
    decision,
    remarks:
      decision === "REJECTED"
        ? rejectionRemarks
        : "Approved by customer",
  }
);

      toast.success(`Report ${decision.toLowerCase()} successfully!`);
      setShowRejectModal(false);
      setRejectionRemarks("");
      fetchReport(); 
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to submit decision.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    if (window.history.state && window.history.state.idx > 0) {
        navigate(-1);
    } else {
        navigate("/customer/view-firs");
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <Loader2 className="h-10 w-10 animate-spin text-indigo-600 mb-4" />
      <p className="text-gray-500 font-medium">Loading Final Report View...</p>
    </div>
  );

  if (!data) return <div className="p-10 text-center">Report data not found.</div>;

  const hasDecision = !!data.customer_decision;

  // Status Styling Logic (Matching your SRF view)
  const statusInfo = {
    APPROVED: { label: "Approved", color: "bg-green-100 text-green-800", icon: <CheckCircle2 className="h-4 w-4" /> },
    REJECTED: { label: "Rejected", color: "bg-red-100 text-red-800", icon: <XCircle className="h-4 w-4" /> },
    PENDING: { label: "Pending Review", color: "bg-yellow-100 text-yellow-800", icon: <AlertCircle className="h-4 w-4" /> }
  }[data.customer_decision as string || "PENDING"];

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Navigation Header */}
        <div className="flex items-center justify-between px-2">
            <button 
                onClick={handleBack} 
                className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 text-sm font-semibold transition-colors"
            >
                <ChevronLeft className="h-4 w-4" /> Back to Reports List
            </button>

            <div className={`flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-full ${statusInfo?.color}`}>
              {statusInfo?.icon}
              {statusInfo?.label}
            </div>
        </div>

        {/* MAIN REPORT CARD */}
        <div className="bg-white shadow-lg rounded-2xl border border-slate-200 overflow-hidden relative">
            
            {/* Decision Banner (Internal Top Banner like SRF) */}
            {hasDecision && (
    <div className={`${data.customer_decision === 'APPROVED' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} border-b px-6 py-3 flex items-center gap-3`}>
        <div className={`p-1.5 rounded-full ${data.customer_decision === 'APPROVED' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
            {data.customer_decision === 'APPROVED' ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
        </div>
        <div>
            <h3 className={`text-sm font-bold uppercase tracking-wide ${data.customer_decision === 'APPROVED' ? 'text-green-800' : 'text-red-800'}`}>
                Report {data.customer_decision}
            </h3>
            
            {/* Only show remarks if the report is REJECTED */}
            {data.customer_decision === 'REJECTED' && data.customer_remarks && (
                <p className="text-xs text-red-700 mt-0.5">
                   <span className="font-bold">Reason:</span> {data.customer_remarks}
                </p>
            )}
        </div>
    </div>
)}

            <div className="bg-slate-800 text-white p-5 sm:p-6 flex flex-wrap justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                    <ShieldCheck size={24} className="text-emerald-400" />
                    <h2 className="text-xl font-bold tracking-tight">Final Inspection Report</h2>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                    {/* <button
                        type="button"
                        onClick={handleDownloadInspectionPdf}
                        className="inline-flex items-center gap-2 rounded-lg border border-blue-200/60 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm transition hover:bg-blue-50"
                    >
                        <Download className="h-4 w-4" /> Export PDF
                    </button> */}
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
                            <FileText className="h-4 w-4" /> Download WCC PDF
                        </button>
                    )}
                    <div className="min-w-[100px] text-right">
                        <p className="text-[10px] text-slate-400 uppercase font-bold">SRF Number</p>
                        <p className="text-lg font-mono font-bold text-blue-400">{data.srf_no}</p>
                    </div>
                </div>
            </div>
            {!wccLoading && !wccData && (
                <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-6 py-3 text-xs text-amber-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>Work Completion Certificate is not available for this inward record.</p>
                </div>
            )}

            <div className="p-6 sm:p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 pb-8 border-b border-gray-100">
                    <div className="space-y-3 text-sm">
                        <div className="flex border-b border-slate-50 pb-2">
                            <span className="font-bold text-slate-500 w-32">Report Date:</span> 
                            <span className="text-slate-900">
                                {data.report_sent_at ? new Date(data.report_sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : "N/A"}
                            </span>
                        </div>
                        <div className="flex border-b border-slate-50 pb-2">
                            <span className="font-bold text-slate-500 w-32">DC Number:</span> 
                            <span className="text-slate-900 font-mono">{data.customer_dc_no || 'N/A'}</span>
                        </div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-2">Customer Details</p>
                        <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed font-bold">
                            {data.customer_name}
                        </p>
                        <p className="text-xs text-slate-400 mt-2 font-mono">{data.customer_email}</p>
                    </div>
                </div>

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
                                {data.equipments?.map((eq: any, idx: number) => (
                                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="border-r border-slate-200 p-3 text-center text-slate-400 bg-white sticky left-0">{idx + 1}</td>
                                        <td className="border-r border-slate-200 p-3 font-mono font-bold text-blue-700">{eq.nepl_id}</td>
                                        <td className="border-r border-slate-200 p-3 text-slate-800 font-medium">{eq.material_description}</td>
                                        <td className="border-r border-slate-200 p-3 text-slate-600 font-mono text-xs">{eq.serial_no}</td>
                                        <td className="border-r border-slate-200 p-3 text-center font-bold">{eq.quantity || 1}</td>
                                        <td className="border-r border-slate-200 p-3">{eq.make}</td>
                                        <td className="border-r border-slate-200 p-3">{eq.model}</td>
                                        <td className="border-r border-slate-200 p-3 font-mono text-xs">{eq.range}</td>
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
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* ACTION FOOTER (Matching SRF Style) */}
            {!hasDecision && (
                <footer className="flex justify-end items-center gap-4 p-6 bg-slate-50 border-t border-slate-200">
                    <button 
                        className="flex items-center justify-center gap-2 px-6 py-2.5 bg-red-600 text-white font-semibold rounded-lg shadow-md hover:bg-red-700 transition-all disabled:opacity-60" 
                        onClick={() => setShowRejectModal(true)} 
                        disabled={isSubmitting}
                    >
                        <X className="h-5 w-5" /> Reject
                    </button>
                    <button 
                        className="flex items-center justify-center gap-2 px-6 py-2.5 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 transition-all disabled:opacity-60" 
                        onClick={() => handleSubmitDecision("APPROVED")} 
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} Approve
                    </button>
                </footer>
            )}
        </div>
        
        <div className="pb-12 text-center">
            <p className="text-slate-400 text-xs italic tracking-widest uppercase">End of Final Inspection Report</p>
        </div>
      </div>

      {showWccModal && wccData && (
        <WCCReadOnlyModal
          wcc={wccData}
          onClose={() => setShowWccModal(false)}
          onDownload={handleDownloadWccPdf}
        />
      )}

      {/* REJECTION MODAL (Exact match to SRF view structure) */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 transition-opacity">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full animate-in fade-in zoom-in duration-200">
                <div className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-red-100 rounded-full">
                            <XCircle className="h-6 w-6 text-red-600" />
                        </div>
                        <h3 className="text-xl font-semibold text-slate-900">Confirm Rejection</h3>
                    </div>
                    
                    <p className="text-slate-600 mb-4 text-sm">
                        Please provide a clear reason for rejecting this final report. Our team will review your comments and make the necessary corrections.
                    </p>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Reason for Rejection <span className="text-red-500">*</span>
                        </label>
                        <textarea 
                            autoFocus
                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 transition-all resize-none" 
                            rows={4} 
                            placeholder="e.g., 'The model number for NEPL/24/001 is incorrect...'" 
                            value={rejectionRemarks} 
                            onChange={(e) => setRejectionRemarks(e.target.value)} 
                            maxLength={500} 
                        />
                        <div className="flex justify-between mt-1">
                            <p className="text-[10px] text-slate-400 uppercase font-bold">Required field</p>
                            <p className="text-xs text-slate-500 font-mono">{rejectionRemarks.length}/500 characters</p>
                        </div>
                    </div>

                    <div className="flex gap-3 justify-end mt-6">
                        <button 
                            className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors" 
                            onClick={() => { setShowRejectModal(false); setRejectionRemarks(""); }} 
                            disabled={isSubmitting}
                        >
                            Cancel
                        </button>
                        <button 
                            className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50" 
                            onClick={() => handleSubmitDecision("REJECTED")} 
                            disabled={isSubmitting || !rejectionRemarks.trim()}
                        >
                            {isSubmitting ? "Submitting..." : "Confirm Rejection"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

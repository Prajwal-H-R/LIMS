import React, { useEffect, useState, useCallback, useRef } from "react";
import type { AxiosResponse } from "axios";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  BookOpen, XCircle, ArrowLeft, Download, CheckCircle,
  Calendar, User, Phone, Mail, FileText, MapPin,
  Building, Award, Home, Lock
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { api, ENDPOINTS } from "../api/config";
import { useRecordLock } from "../hooks/useRecordLock";
 
// --- Interfaces ---
interface SrfEquipmentDetail {
  srf_eqp_id?: number;
  unit?: string;
  no_of_calibration_points?: string;
  mode_of_calibration?: string;
}
 
interface EquipmentDetail {
  inward_eqp_id: number;
  nepl_id: string;
  material_description: string;
  make: string;
  model: string;
  serial_no: string;
  quantity: number;
  range?: string;
  unit?: string;
  srf_equipment?: SrfEquipmentDetail | null;
}
 
interface CustomerData {
  customer_id: number;
  customer_details: string;
  phone?: string;
  contact_person?: string;
  email?: string;
  bill_to_address?: string;
  ship_to_address?: string;
}
 
interface InwardDetail {
  inward_id: number;
  customer_details: string;
  equipments: EquipmentDetail[];
  customer?: CustomerData;
  srf_no?: string;
  customer_dc_no?: string;
  customer_dc_date?: string;
  material_inward_date?: string;
}
 
interface SrfDetail {
  srf_id: number;
  inward_id: number;
  srf_no: string;
  nepl_srf_no?: string;
  date: string;
  company_name: string;
  customer_name?: string;
  bill_to_address: string;
  ship_to_address: string;
  phone: string;
  telephone?: string;
  contact_person: string;
  email: string;
  certificate_issue_name: string;
  certificate_issue_adress: string;
  status: string;
  inward?: InwardDetail;
  calibration_frequency?: string | null;
  statement_of_conformity?: boolean | null;
  ref_iso_is_doc?: boolean | null;
  ref_manufacturer_manual?: boolean | null;
  ref_customer_requirement?: boolean | null;
  turnaround_time?: string | null;
  remarks?: string | null;
}

interface EquipmentFlowConfig {
  id: number;
  equipment_type: string;
  is_active: boolean;
}
 
// --- Helper Functions ---
const generateNeplSrfNo = (srfNo: string | number | undefined): string => {
  if (!srfNo) return "";
  const srfStr = srfNo.toString();
  if (srfStr.includes("/ SRF-")) return srfStr;
  const match = srfStr.match(/(\d+)$/);
  const lastDigits = match ? match[0].slice(-3) : "000";
  return `${srfStr} / SRF-${lastDigits}`;
};
 
const getTodayDateString = (): string => new Date().toISOString().split("T")[0];
 
const fetchUnitForMakeModel = async (make: string, model: string): Promise<string> => {
  if (!make || !model) return '';
  try {
    const response = await api.get(
      `/staff/inwards/manufacturer/range`,
      { params: { make, model } }
    );
    return response.data.unit || '';
  } catch (error) {
    console.error("Failed to fetch unit", error);
    return '';
  }
};

/**
 * High-performance fetcher for equipment configurations.
 * Returns a Set of lowercase material descriptions for O(1) lookups.
 */
const fetchConfiguredEquipmentTypes = async (): Promise<Set<string>> => {
    try {
        const response = await api.get<EquipmentFlowConfig[]>(`/flow-configs`);
        return new Set(
            response.data
                .filter(cfg => cfg.is_active)
                .map(cfg => cfg.equipment_type.toLowerCase().trim())
        );
    } catch (error) {
        console.error("Failed to fetch equipment flow configs", error);
        return new Set();
    }
};
 
// --- Skeleton Component ---
const SrfSkeleton: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 flex justify-center py-8 px-4 relative animate-pulse">
      <div className="w-full max-w-6xl bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden relative">
        <div className="p-6 md:p-10">
          <div className="flex items-center justify-between border-b pb-4 mb-6">
            <div>
              <div className="h-8 w-48 bg-gray-300 rounded mb-2"></div>
              <div className="h-5 w-32 bg-gray-200 rounded"></div>
            </div>
            <div className="flex gap-3">
              <div className="h-10 w-36 bg-gray-200 rounded-lg"></div>
              <div className="h-10 w-24 bg-gray-200 rounded-lg"></div>
            </div>
          </div>
          <fieldset className="border border-gray-300 rounded-2xl p-6 mb-10 bg-white shadow-sm">
            <div className="h-6 w-40 bg-gray-300 rounded mb-6"></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-6">
              {[1, 2, 3, 4].map(i => (
                <div key={i}><div className="h-3 w-24 bg-gray-200 rounded mb-2"></div><div className="h-10 w-full bg-gray-100 rounded-lg"></div></div>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
               {[1, 2].map(i => (<div key={i} className="h-24 w-full bg-gray-50 rounded-lg"></div>))}
            </div>
          </fieldset>
          <div className="flex justify-end gap-4 mt-8 pt-8 border-t border-gray-200">
             <div className="h-11 w-24 bg-gray-200 rounded-lg"></div>
             <div className="h-11 w-40 bg-gray-300 rounded-lg"></div>
          </div>
        </div>
      </div>
    </div>
  );
};
 
// --- Main Component ---
export const SrfDetailPage: React.FC = () => {
  const { srfId: paramSrfId } = useParams<{ srfId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
 
  const previousTab = (location.state as any)?.activeTab;
 
  // --- Logic to determine what to lock ---
  const isNewSrfFromUrl = paramSrfId?.startsWith("new-");
  const inwardIdFromUrl = isNewSrfFromUrl ? parseInt(paramSrfId!.split("new-")[1]) : undefined;
 
  const lockEntityType = isNewSrfFromUrl ? "INWARD" : "SRF";
  const lockTargetId = isNewSrfFromUrl
    ? inwardIdFromUrl
    : (paramSrfId ? parseInt(paramSrfId) : null);
 
  const { isLocked, lockedBy } = useRecordLock(lockEntityType, lockTargetId || null);
  // ----------------------------------------
 
  const [activeSrfId, setActiveSrfId] = useState<number | null>(null);
  const [srfData, setSrfData] = useState<SrfDetail | null>(null);
  const [configuredTypes, setConfiguredTypes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<string>("");
  const [hasUserEdited, setHasUserEdited] = useState(false);
 
  const justCreatedRef = useRef(false);
 
  const isEngineer = user?.role === "engineer";
  const canEdit = isEngineer && !isLocked;
 
  const goBackToList = () => {
    navigate("/engineer/srfs", { state: { activeTab: previousTab } });
  };
 
  const generatePDF = useCallback(async () => {
    if (!srfData) return;

    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    // Keep print-safe A4 margins for office printers.
    const marginX = 16;
    const marginTop = 12;
    const usableWidth = pageWidth - marginX * 2;
    const refNo = srfData.nepl_srf_no || srfData.srf_no || "-";
    const equipmentRows = srfData.inward?.equipments || [];
    const logoPath = `${window.location.origin}/images/logo.png`;

    const loadLogoDataUrl = async (): Promise<string | null> => {
      try {
        const response = await fetch(logoPath);
        if (!response.ok) return null;
        const blob = await response.blob();
        return await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
          reader.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    };

    const logoDataUrl = await loadLogoDataUrl();

    const tableColumns = [
      "Sl No.",
      "Instrument Nomenclature",
      "Model",
      "Serial No/ID",
      "Range",
      "Unit of Measurement",
      "No. of calibration points",
      "Mode of calibration",
    ];

    const getTableRows = (rows: EquipmentDetail[], startIndex = 1) =>
      rows.map((eq, idx) => [
        String(startIndex + idx),
        eq.material_description || "-",
        eq.model || "-",
        eq.serial_no || "-",
        eq.range || "-",
        eq.srf_equipment?.unit || eq.unit || "-",
        eq.srf_equipment?.no_of_calibration_points || "AS PER STANDARD",
        eq.srf_equipment?.mode_of_calibration || "AS PER STANDARD",
      ]);

    const drawFooter = () => {
      doc.setDrawColor(180);
      doc.setLineWidth(0.2);
      doc.line(marginX, pageHeight - 9.5, pageWidth - marginX, pageHeight - 9.5);
    };

    const drawHeader = (firstPageMeta: boolean) => {
      let y = marginTop;
      if (firstPageMeta) {
        doc.setFontSize(8.5);
        doc.text("PAGE 01 OF 01", pageWidth / 2, y, { align: "center" });
        doc.text(`Dated : ${srfData.date || "-"}`, pageWidth - marginX, y, { align: "right" });
        y += 3;
      }

      doc.setDrawColor(140);
      doc.setLineWidth(0.2);
      doc.rect(marginX, y, usableWidth, 20);

      if (logoDataUrl) {
        doc.addImage(logoDataUrl, "PNG", marginX + 1.5, y + 1.5, 42, 17);
      } else {
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("NEXTAGE", marginX + 4, y + 11);
      }

      doc.setFontSize(15);
      doc.setFont("helvetica", "bold");
      doc.text("SERVICE REQUEST FORM", pageWidth / 2 + 20, y + 9, { align: "center" });
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Ref : ${refNo}`, pageWidth / 2 + 20, y + 15, { align: "center" });

      return y + 24;
    };

    const drawEquipmentTable = (rows: EquipmentDetail[], startY: number, startIndex = 1) => {
      autoTable(doc, {
        startY,
        head: [tableColumns],
        body: getTableRows(rows, startIndex),
        theme: "grid",
        margin: { left: marginX, right: marginX },
        styles: {
          fontSize: 7.6,
          lineColor: [120, 120, 120],
          lineWidth: 0.2,
          valign: "middle",
          cellPadding: 1.2,
        },
        headStyles: {
          fillColor: [235, 239, 245],
          textColor: [20, 20, 20],
          fontStyle: "bold",
          halign: "center",
        },
        bodyStyles: { textColor: [20, 20, 20] },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          1: { cellWidth: 35 },
          2: { cellWidth: 18 },
          3: { cellWidth: 23 },
          4: { cellWidth: 18 },
          5: { cellWidth: 17, halign: "center" },
          6: { cellWidth: 26, halign: "center" },
          7: { cellWidth: 29, halign: "center" },
        },
      });
    };

    doc.setCharSpace(0);

    const font = {
      section: 10.2,
      body: 9,
      small: 8.5,
      tiny: 8.2,
      title: 9.8,
      line: 4.2,
    };
    const bottomSafeY = pageHeight - 14;
    const sectionGap = 5;
    let y = drawHeader(true);
    const ensureSpace = (requiredHeight: number) => {
      if (y + requiredHeight <= bottomSafeY) return;
      drawFooter();
      doc.addPage();
      y = drawHeader(false);
    };

    doc.setDrawColor(160);
    doc.setLineWidth(0.2);
    doc.rect(marginX, y, usableWidth, 32);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(font.section);
    doc.text("Company Name & Address", marginX + 2, y + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(font.body);
    const companyLines = doc.splitTextToSize(`${srfData.company_name || "-"}\n${srfData.bill_to_address || "-"}`, usableWidth - 86);
    doc.text(companyLines, marginX + 2, y + 10);

    doc.setFontSize(font.body);
    const contactX = marginX + (usableWidth * 0.58);
    doc.text(`Telephone : ${srfData.phone || "-"}`, contactX, y + 6);
    doc.text(`E-mail : ${srfData.email || "-"}`, contactX, y + 11);
    doc.text(`Contact Person : ${srfData.contact_person || "-"}`, contactX, y + 16);
    doc.text(`Customer DC Number : ${srfData.inward?.customer_dc_no || "-"}`, contactX, y + 21);
    doc.text(`Customer DC Date : ${srfData.inward?.customer_dc_date || "-"}`, contactX, y + 26);
    y += 38;

    const certName = srfData.certificate_issue_name || srfData.company_name || "-";
    const certAddr = srfData.certificate_issue_adress || srfData.ship_to_address || srfData.bill_to_address || "-";
    doc.setFontSize(font.small);
    doc.text("Note: The Certificate will be issued in the name of organization mentioned above, Otherwise Mention Below", marginX, y);
    y += font.line;
    const certLines = doc.splitTextToSize(`M/s: ${certName}, ${certAddr}`, usableWidth);
    doc.text(certLines, marginX, y);
    y += certLines.length * 3.9 + sectionGap;

    const frequencyValue = srfData.calibration_frequency || "As per Standard";
    const soc = !!srfData.statement_of_conformity;
    const asPerStandard = frequencyValue.toLowerCase() === "as per standard";
    const checkboxText = (checked: boolean) => (checked ? "[✓]" : "[ ]");
    const officeLinesRaw = [
      "FOR OUR OFFICE USE ONLY",
      `1. Calibration by ${checkboxText(true)} NEPL (In-Lab) / ${checkboxText(false)} NEPL (on-site) / ${checkboxText(true)} outsource`,
      `2. Date received: ${srfData.date || "-"}`,
      `3. Nextage Unique ID: ${srfData.srf_no || "-"}`,
      `4. Resources and capability reviewed: ${checkboxText(true)} Meets requirement / ${checkboxText(false)} Does not meet`,
      `5. Nextage Contract Reference: ${srfData.inward?.customer_dc_no || "-"}`,
    ];
    const instructionLinesRaw = [
      "Customer Instructions for Calibration",
      `1. Calibration Frequency: ${checkboxText(asPerStandard)} As per Standard / ${checkboxText(!asPerStandard)} ${!asPerStandard ? frequencyValue : "Specify"}`,
      `2. Statement of Conformity required in certificate: ${soc ? "YES" : "NO"}`,
      "2.1 Decision Rule:",
      `2.1 ${checkboxText(!!srfData.ref_iso_is_doc)} Reference to ISO/IS Doc. Standard`,
      `2.2 ${checkboxText(!!srfData.ref_manufacturer_manual)} Reference to manufacturer manual/specifications`,
      `2.3 ${checkboxText(!!srfData.ref_customer_requirement)} Reference to customer's specific requirement`,
      `3. Turnround time: ${srfData.turnaround_time || "-"}`,
    ];

    const innerPadX = 3;
    const innerPadY = 3;
    const contentWidth = usableWidth - innerPadX * 2;
    const officeLines = officeLinesRaw.map((line) => doc.splitTextToSize(line, contentWidth));
    const instructionLines = instructionLinesRaw.map((line) => doc.splitTextToSize(line, contentWidth));
    const remarkLines = doc.splitTextToSize(`Remark or Special Instruction: ${srfData.remarks || "None"}`, contentWidth);

    const officeBlockHeight =
      innerPadY * 2 +
      officeLines.reduce((acc, lines) => acc + lines.length * 3.8, 0) +
      (officeLines.length - 1) * 0.8 +
      1.2;
    const instructionBlockHeight =
      innerPadY * 2 +
      instructionLines.reduce((acc, lines) => acc + lines.length * 3.8, 0) +
      (instructionLines.length - 1) * 0.8 +
      1.2;
    const remarkBlockHeight =
      innerPadY * 2 +
      remarkLines.length * 3.8 +
      1.2;
    const betweenBlocksGap = 2;
    const totalBlocksHeight =
      instructionBlockHeight +
      betweenBlocksGap +
      remarkBlockHeight +
      betweenBlocksGap +
      officeBlockHeight;

    ensureSpace(totalBlocksHeight + 3);
    doc.setDrawColor(120);
    doc.setLineWidth(0.25);
    doc.rect(marginX, y, usableWidth, instructionBlockHeight);
    doc.rect(marginX, y + instructionBlockHeight + betweenBlocksGap, usableWidth, remarkBlockHeight);
    doc.rect(
      marginX,
      y + instructionBlockHeight + betweenBlocksGap + remarkBlockHeight + betweenBlocksGap,
      usableWidth,
      officeBlockHeight
    );

    let blockY = y + innerPadY + 2;
    const blockX = marginX + innerPadX;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(font.small);
    instructionLines.forEach((lineParts, idx) => {
      if (idx === 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(font.title);
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(font.small);
      }
      doc.text(lineParts, blockX, blockY);
      blockY += lineParts.length * 3.8 + 0.8;
    });

    // Separate remark box
    blockY = y + instructionBlockHeight + betweenBlocksGap + innerPadY + 2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(font.small);
    doc.text(remarkLines, blockX, blockY);

    blockY = y + instructionBlockHeight + betweenBlocksGap + remarkBlockHeight + betweenBlocksGap + innerPadY + 2;
    officeLines.forEach((lineParts, idx) => {
      if (idx === 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(font.title);
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(font.small);
      }
      doc.text(lineParts, blockX, blockY);
      blockY += lineParts.length * 3.8 + 0.8;
    });

    y += totalBlocksHeight + sectionGap;

    ensureSpace(36);
    doc.setFontSize(font.body);
    doc.setFont("helvetica", "normal");
    const signatureTopY = y;
    const signatureGap = 6;
    const signatureWidth = (usableWidth - signatureGap) / 2;
    const signatureHeight = 18;
    const rightSignatureX = marginX + signatureWidth + signatureGap;

    doc.text("Name & Signature of the Customer", marginX, signatureTopY);
    doc.text("Name & Signature of Nextage", rightSignatureX, signatureTopY);
    doc.setDrawColor(130);
    doc.setLineWidth(0.2);
    doc.rect(marginX, signatureTopY + 2, signatureWidth, signatureHeight);
    doc.rect(rightSignatureX, signatureTopY + 2, signatureWidth, signatureHeight);
    doc.setFontSize(font.tiny);
    doc.text("Sign here", marginX + 2, signatureTopY + signatureHeight + 0.2);
    doc.text("Sign here", rightSignatureX + 2, signatureTopY + signatureHeight + 0.2);
    doc.setFontSize(font.body);
    y += signatureHeight + 8;

    ensureSpace(24);
    doc.setFont("helvetica", "bold");
    doc.text("Note:", marginX, y);
    doc.setFont("helvetica", "normal");
    y += 4;
    const note1 = "1. Calibration Method: Calibration will be done by standard methods, unless otherwise specified by customer. Our Calibration method is based on ISO 6789-1 & 2 (2018) for Torque generating tools and DKD-R-6-1 for Pressure Instrument.";
    const note2 = "2. Laboratory activities falling under accredited scope in no way imply that equipment calibrated is approved by NABL.";
    const note1Lines = doc.splitTextToSize(note1, usableWidth);
    doc.text(note1Lines, marginX, y);
    y += note1Lines.length * 3.8;
    const note2Lines = doc.splitTextToSize(note2, usableWidth);
    doc.text(note2Lines, marginX, y);
    y += note2Lines.length * 3.8 + sectionGap;

    ensureSpace(34);
    doc.setFontSize(font.section);
    doc.setFont("helvetica", "bold");
    doc.text("Details of the Equipment", marginX, y);
    y += 2.5;
    drawEquipmentTable(equipmentRows.slice(0, 6), y, 1);
    y = (doc as any).lastAutoTable.finalY + sectionGap;

    drawFooter();

    if (equipmentRows.length > 6) {
      const annexRows = equipmentRows.slice(6);
      let startIndex = 7;
      let remainingRows = annexRows;

      while (remainingRows.length > 0) {
        doc.addPage();
        let annexY = drawHeader(false);
        doc.setFontSize(font.section);
        doc.setFont("helvetica", "bold");
        doc.text("SERVICE REQUEST FORM ANNEXURE-1", pageWidth / 2, annexY, { align: "center" });
        annexY += 5.2;
        doc.setFontSize(font.body);
        doc.setFont("helvetica", "normal");
        doc.text(`REF: ${refNo}`, pageWidth / 2, annexY, { align: "center" });
        annexY += 4;

        // Conservative chunk for readable table per page.
        const chunk = remainingRows.slice(0, 22);
        drawEquipmentTable(chunk, annexY, startIndex);
        drawFooter();

        startIndex += chunk.length;
        remainingRows = remainingRows.slice(chunk.length);
      }
    }

    doc.save(`SRF_${(srfData.nepl_srf_no || srfData.srf_no || "Download").replace(/[\\/:*?"<>|]/g, "_")}.pdf`);
  }, [srfData]);
 
  const loadSrfData = useCallback(
    async (id: number, signal: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        // High Performance: Fetch SRF data and Equipment Flow Config in parallel
        const [srfResponse, configSet] = await Promise.all([
            api.get<SrfDetail>(`${ENDPOINTS.SRFS}${id}`, { signal }),
            fetchConfiguredEquipmentTypes()
        ]);

        setConfiguredTypes(configSet);
        const data = srfResponse.data;
        const rawData = data as any;
 
        // Populate Equipment Defaults
        for (const eq of (data.inward?.equipments || [])) {
          if (!eq.srf_equipment) eq.srf_equipment = {};
          if (eq.srf_equipment.no_of_calibration_points == null) eq.srf_equipment.no_of_calibration_points = "";
         
          if (!eq.srf_equipment.unit && eq.make && eq.model) {
            if ((eq as any).unit) {
              eq.srf_equipment.unit = (eq as any).unit;
            } else {
              const unit = await fetchUnitForMakeModel(eq.make, eq.model);
              if (unit) eq.srf_equipment.unit = unit;
            }
          }
        }
 
        const companyName = data.customer_name || data.inward?.customer?.customer_details || "";
        const contactPerson = data.contact_person || data.inward?.customer?.contact_person || "";
        const email = data.email || data.inward?.customer?.email || "";
        const phone = data.telephone || data.inward?.customer?.phone || data.phone || "";
        const billTo = rawData.address || data.bill_to_address || data.inward?.customer?.bill_to_address || "";
        const shipTo = data.ship_to_address || data.inward?.customer?.ship_to_address || "";
        const displaySrfNo = data.nepl_srf_no || generateNeplSrfNo(data.srf_no);
        const certAddress = rawData.certificate_issue_adress || data.certificate_issue_adress || "";
 
        const sanitizedData: SrfDetail = {
          ...data,
          date: data.date ? data.date.split("T")[0] : "",
          srf_no: data.srf_no,
          nepl_srf_no: displaySrfNo,
          bill_to_address: billTo,
          ship_to_address: shipTo,
          calibration_frequency: data.calibration_frequency ?? "As per Standard",
          statement_of_conformity: data.statement_of_conformity ?? false,
          ref_iso_is_doc: data.ref_iso_is_doc ?? false,
          ref_manufacturer_manual: data.ref_manufacturer_manual ?? false,
          ref_customer_requirement: data.ref_customer_requirement ?? false,
          turnaround_time: data.turnaround_time !== null ? String(data.turnaround_time) : "",
          remarks: data.remarks ?? "",
          company_name: companyName,
          phone: phone,
          contact_person: contactPerson,
          email: email,
          certificate_issue_name: data.certificate_issue_name || companyName,
          certificate_issue_adress: certAddress,
        };
        setSrfData(sanitizedData);
      } catch (err: any) {
        if (err.code !== "ERR_CANCELED") {
          setError(err.response?.data?.detail || "An unknown error occurred.");
        }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    []
  );
 
  useEffect(() => {
    const controller = new AbortController();
 
    if (isNewSrfFromUrl && inwardIdFromUrl) {
      setActiveSrfId(null);
      setLoading(true);
      const fetchInwardData = async () => {
        try {
          const [inwardResponse, configSet] = await Promise.all([
             api.get<InwardDetail>(`${ENDPOINTS.STAFF.INWARDS}/${inwardIdFromUrl}`, { signal: controller.signal }),
             fetchConfiguredEquipmentTypes()
          ]);

          setConfiguredTypes(configSet);
          const inward = inwardResponse.data;
 
          for (const eq of (inward.equipments || [])) {
            if (!eq.srf_equipment) eq.srf_equipment = {};
            if (eq.srf_equipment.no_of_calibration_points == null) eq.srf_equipment.no_of_calibration_points = "1";
           
            if (!eq.srf_equipment.unit && eq.make && eq.model) {
              if ((eq as any).unit) {
                eq.srf_equipment.unit = (eq as any).unit;
              } else {
                const unit = await fetchUnitForMakeModel(eq.make, eq.model);
                if (unit) eq.srf_equipment.unit = unit;
              }
            }
          }
 
          const initialDate = inward.material_inward_date
            ? inward.material_inward_date.split("T")[0]
            : getTodayDateString();
 
          const billTo = inward.customer?.bill_to_address || "";
          const shipTo = inward.customer?.ship_to_address || "";
          const generatedRef = generateNeplSrfNo(inward.srf_no);
 
          const newSrfInitialData: SrfDetail = {
            srf_id: 0,
            inward_id: inward.inward_id,
            srf_no: inward.srf_no || "",
            nepl_srf_no: generatedRef,
            date: initialDate,
            company_name: inward.customer?.customer_details || inward.customer_details || "",
            bill_to_address: billTo,
            ship_to_address: shipTo,
            phone: inward.customer?.phone || "",
            contact_person: inward.customer?.contact_person || "",
            email: inward.customer?.email || "",
            certificate_issue_name: inward.customer?.customer_details || inward.customer_details || "",
            certificate_issue_adress: "",
            status: "draft",
            inward: inward,
            calibration_frequency: "As per Standard",
            statement_of_conformity: false,
            ref_iso_is_doc: false,
            ref_manufacturer_manual: false,
            ref_customer_requirement: false,
            turnaround_time: "",
            remarks: "",
          };
          setSrfData(newSrfInitialData);
        } catch (err: any) {
          if (err.code !== "ERR_CANCELED") {
            setError(`Failed to load Inward data for ID ${inwardIdFromUrl}.`);
          }
        } finally {
          setLoading(false);
        }
      };
      fetchInwardData();
 
    } else if (!isNewSrfFromUrl && paramSrfId) {
      const id = parseInt(paramSrfId);
      setActiveSrfId(id);
 
      if (justCreatedRef.current) {
        justCreatedRef.current = false;
        setLoading(false);
        return;
      }
      loadSrfData(id, controller.signal);
    } else {
      setLoading(false);
    }
 
    return () => controller.abort();
  }, [paramSrfId, isNewSrfFromUrl, inwardIdFromUrl, loadSrfData]);
 
  const handleSrfChange = (key: keyof SrfDetail, value: any) => {
    if (isLocked) return;
    setHasUserEdited(true);
    setSrfData((prev) => (prev ? { ...prev, [key]: value } : null));
  };
 
  const handleSrfEquipmentChange = (inward_eqp_id: number, field: keyof SrfEquipmentDetail, value: any) => {
    if (isLocked) return;
    setHasUserEdited(true);
    setSrfData((prevData) => {
      if (!prevData || !prevData.inward) return prevData;
      const updatedEquipments = prevData.inward.equipments.map((eq) => {
        if (eq.inward_eqp_id === inward_eqp_id) {
          const newSrfEquipment = { ...(eq.srf_equipment || {}), [field]: value };
          return { ...eq, srf_equipment: newSrfEquipment };
        }
        return eq;
      });
      return { ...prevData, inward: { ...prevData.inward, equipments: updatedEquipments } };
    });
  };
 
  const handleSaveSrf = useCallback(
    async (newStatus: string, showAlert: boolean = false) => {
      if (!srfData || isLocked) return;
      setAutoSaving(true);
      setAutoSaveStatus("Saving...");
      setError(null);
 
      try {
        const normalizedTurnaroundTime = (() => {
          const value = srfData.turnaround_time;
          if (value === null || value === undefined) return undefined;
          if (typeof value === "number") return value;
          const trimmed = value.trim();
          if (!trimmed) return undefined;
          const parsed = Number(trimmed);
          return Number.isNaN(parsed) ? undefined : parsed;
        })();
 
        const payload = {
          srf_no: srfData.srf_no,
          date: srfData.date,
          nepl_srf_no: srfData.nepl_srf_no,
          telephone: srfData.phone,
          contact_person: srfData.contact_person,
          email: srfData.email,
          address: srfData.bill_to_address,
          ship_to_address: srfData.ship_to_address,
          certificate_issue_name: srfData.certificate_issue_name,
          certificate_issue_adress: srfData.certificate_issue_adress,
          status: newStatus,
          inward_status: "reviewed",
          inward_id: srfData.inward_id,
          calibration_frequency: srfData.calibration_frequency || null,
          statement_of_conformity: srfData.statement_of_conformity ?? false,
          ref_iso_is_doc: srfData.ref_iso_is_doc ?? false,
          ref_manufacturer_manual: srfData.ref_manufacturer_manual ?? false,
          ref_customer_requirement: srfData.ref_customer_requirement ?? false,
          turnaround_time: normalizedTurnaroundTime,
          remarks: srfData.remarks?.trim() ? srfData.remarks.trim() : undefined,
          equipments: srfData.inward?.equipments.map((eq) => ({
            srf_eqp_id: eq.srf_equipment?.srf_eqp_id,
            inward_eqp_id: eq.inward_eqp_id,
            unit: eq.srf_equipment?.unit,
            no_of_calibration_points: eq.srf_equipment?.no_of_calibration_points,
            mode_of_calibration: eq.srf_equipment?.mode_of_calibration,
          })),
        };
 
        if (activeSrfId || (srfData.srf_id && srfData.srf_id > 0)) {
          // Update existing
          const targetId = activeSrfId || srfData.srf_id;
          await api.put(`${ENDPOINTS.SRFS}${targetId}`, payload);
          setSrfData((prev) => (prev ? { ...prev, status: newStatus } : prev));
        } else {
          // Create new
          const res = await api.post(`${ENDPOINTS.SRFS}`, payload);
          const newId = res.data.srf_id;
         
          await api.put(`${ENDPOINTS.SRFS}${newId}`, payload);
         
          justCreatedRef.current = true;
          setActiveSrfId(newId);
          setSrfData((prev) => (prev ? { ...prev, srf_id: newId, status: newStatus } : prev));
         
          // Redirect to the edit URL of the newly created SRF
          // This ensures the "INWARD" lock releases and "SRF" lock is acquired
          navigate(`/engineer/srfs/${newId}`, { replace: true, state: { activeTab: previousTab } });
        }
 
        if (showAlert) {
          alert("✅ SRF saved successfully!");
          navigate("/engineer/srfs", { state: { activeTab: previousTab } });
        }
 
        setHasUserEdited(false);
        setAutoSaveStatus("All changes saved successfully ✔️");
        setTimeout(() => setAutoSaveStatus(""), 2000);
      } catch (err: any) {
        const errorDetail = err.response?.data?.detail || "An unexpected error occurred.";
        console.error("Save failed error:", err);
        setAutoSaveStatus(`Failed to save ❌ (${errorDetail})`);
        if (showAlert) {
          alert(`❌ Failed to save SRF: ${errorDetail}`);
        }
      } finally {
        setAutoSaving(false);
      }
    },
    [activeSrfId, srfData, navigate, isLocked, previousTab]
  );
 
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!isEngineer || !srfData || !hasUserEdited || isLocked) return;
 
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const statusToSave = (srfData.status === "created" || srfData.status === "draft") ? "draft" : srfData.status;
      handleSaveSrf(statusToSave, false);
    }, 1200);
 
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [srfData, hasUserEdited, isEngineer, handleSaveSrf, isLocked]);
 
  if (loading) {
    return <SrfSkeleton />;
  }
 
  if (error) return <div className="p-12 text-center text-red-600 bg-red-50 rounded-lg">Error: {error}</div>;
  if (!srfData) return <div className="p-12 text-center text-gray-500">SRF not found.</div>;
 
  const isApproved = srfData.status === "approved";
  const isRejected = srfData.status === "rejected";
  const showSpecialInstructions = isApproved || isRejected;
 
  // Disable interaction if locked
  const formOpacity = isLocked ? "opacity-70 pointer-events-none select-none" : "opacity-100";
 
  return (
    <div className="min-h-screen bg-gray-50 flex justify-center py-8 px-4 relative">
      <div className="w-full max-w-6xl bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden relative">
       
        {/* --- Lock Banner --- */}
        {isLocked && (
          <div className="bg-amber-50 border-b border-amber-200 px-8 py-3 flex items-center gap-3 shadow-sm z-20">
              <div className="p-1.5 bg-amber-100 rounded-full text-amber-600">
                  <Lock className="h-5 w-5 animate-pulse" />
              </div>
              <div>
                  <h3 className="text-sm font-bold text-amber-800 uppercase tracking-wide">
                      {isNewSrfFromUrl ? "Inward Processing Locked" : "Record Locked"}
                  </h3>
                  <p className="text-xs text-amber-700">
                      {isNewSrfFromUrl
                        ? `This Inward is currently being processed by ${lockedBy || 'another user'}. You cannot create an SRF from it right now.`
                        : `This SRF is currently being edited by ${lockedBy || 'another user'}. You cannot make changes until they finish.`
                      }
                  </p>
              </div>
          </div>
        )}
 
        <div className={`absolute top-4 right-6 text-sm font-medium transition-all duration-300 px-3 py-1 rounded-lg shadow-sm z-10 ${
            autoSaveStatus.includes("Saving") ? "bg-blue-50 text-blue-700"
              : autoSaveStatus.includes("Failed") ? "bg-red-50 text-red-600"
              : "bg-green-50 text-green-700"
          } ${!autoSaveStatus && "opacity-0"}`}
        >
          {autoSaveStatus || "Saved"}
        </div>
 
        <div className={`p-6 md:p-10 ${formOpacity}`}>
          <header className="flex items-center justify-between border-b pb-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">SRF Details</h1>
              <p className="text-lg text-blue-600 font-mono mt-1">{srfData.nepl_srf_no}</p>
            </div>
            {/* Action buttons are kept clickable (pointer-events-auto) so user can leave */}
            <div className="flex gap-3 pointer-events-auto">
              <button
                onClick={generatePDF}
                className={`flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-sm ${isLocked ? "pointer-events-auto opacity-100 cursor-pointer" : ""}`}
              >
                  <Download size={18} />
                  <span>Download PDF</span>
              </button>
              <button
                type="button"
                onClick={goBackToList}
                className={`flex items-center space-x-2 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-semibold text-sm ${isLocked ? "pointer-events-auto opacity-100 cursor-pointer" : ""}`}
              >
                <ArrowLeft size={18} />
                <span>Back</span>
              </button>
            </div>
          </header>
 
          {(isApproved || isRejected) && (
            <div className={`p-4 mb-8 border-l-4 rounded-r-lg ${isRejected ? "bg-red-50 text-red-800 border-red-400" : "bg-green-50 text-green-800 border-green-400"}`}>
              <div className="flex items-start gap-3">
                {isRejected ? <XCircle className="h-6 w-6 flex-shrink-0" /> : <CheckCircle className="h-6 w-6 flex-shrink-0" />}
                <div>
                  <p className="text-sm font-semibold">
                    Current Status: {srfData.status.charAt(0).toUpperCase() + srfData.status.slice(1)}
                  </p>
                  {isRejected && srfData.remarks && (
                    <div className="mt-2">
                      <p className="text-sm font-medium">Rejection Reason:</p>
                      <p className="text-sm italic">"{srfData.remarks}"</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
 
          <fieldset className="border border-gray-300 rounded-2xl p-6 mb-10 bg-white shadow-sm">
            <legend className="px-3 text-lg font-semibold text-gray-800 bg-white rounded-md shadow-sm border border-gray-200">
              Customer Details
            </legend>
 
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-6 mt-2">
              <div className="relative">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Customer DC No</label>
                  <div className="flex items-center w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                    <FileText size={16} className="mr-2 text-gray-400"/>
                    {srfData.inward?.customer_dc_no || "-"}
                  </div>
              </div>
             
              <div className="relative">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Customer DC Date</label>
                  <div className="flex items-center w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                    <Calendar size={16} className="mr-2 text-gray-400"/>
                    {srfData.inward?.customer_dc_date || "-"}
                  </div>
              </div>
 
              <div className="relative">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Reference (SRF No)</label>
                  <div className="flex items-center w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                    <span className="font-mono text-blue-600">{srfData.nepl_srf_no}</span>
                  </div>
              </div>
 
              <div className="relative">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Material Inward Date</label>
                  <input
                    type="date"
                    readOnly={!canEdit}
                    value={srfData.date}
                    onChange={(e) => handleSrfChange("date", e.target.value)}
                    className={`block w-full rounded-lg border-gray-300 px-3 py-2 text-sm ${canEdit ? "bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500" : "bg-gray-50 cursor-not-allowed"}`}
                  />
              </div>
            </div>
 
            <div className="mb-6">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Company Name</label>
                <div className="flex items-center w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800">
                  <Building size={18} className="mr-2 text-gray-500"/>
                  {srfData.company_name}
                </div>
            </div>
 
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 relative">
                  <div className="flex items-center gap-2 mb-2">
                      <MapPin size={16} className="text-blue-600"/>
                      <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Bill To Address</label>
                  </div>
                  <textarea
                      rows={3}
                      readOnly={true}
                      value={srfData.bill_to_address}
                      className="block w-full rounded border-0 bg-transparent text-sm text-gray-600 resize-none focus:ring-0 p-0"
                  />
                </div>
 
                <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 relative">
                  <div className="flex items-center gap-2 mb-2">
                      <MapPin size={16} className="text-green-600"/>
                      <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Ship To Address</label>
                  </div>
                  <textarea
                      rows={3}
                      readOnly={true}
                      value={srfData.ship_to_address}
                      className="block w-full rounded border-0 bg-transparent text-sm text-gray-600 resize-none focus:ring-0 p-0"
                  />
                </div>
            </div>
 
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Contact Person</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User size={16} className="text-gray-400"/>
                    </div>
                    <input
                        type="text"
                        readOnly={!canEdit}
                        value={srfData.contact_person}
                        onChange={(e) => handleSrfChange("contact_person", e.target.value)}
                        className={`block w-full pl-10 rounded-lg border-gray-300 text-sm ${canEdit ? "bg-white" : "bg-gray-50 cursor-not-allowed"}`}
                    />
                  </div>
                </div>
 
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Phone</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Phone size={16} className="text-gray-400"/>
                    </div>
                    <input
                        type="text"
                        readOnly={!canEdit}
                        value={srfData.phone}
                        onChange={(e) => handleSrfChange("phone", e.target.value)}
                        className={`block w-full pl-10 rounded-lg border-gray-300 text-sm ${canEdit ? "bg-white" : "bg-gray-50 cursor-not-allowed"}`}
                    />
                  </div>
                </div>
 
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Email</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Mail size={16} className="text-gray-400"/>
                    </div>
                    <input
                        type="email"
                        readOnly={!canEdit}
                        value={srfData.email}
                        onChange={(e) => handleSrfChange("email", e.target.value)}
                        className={`block w-full pl-10 rounded-lg border-gray-300 text-sm ${canEdit ? "bg-white" : "bg-gray-50 cursor-not-allowed"}`}
                    />
                  </div>
                </div>
            </div>
 
            <div className="space-y-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Certificate Issue Name</label>
                  <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Award size={16} className="text-indigo-500"/>
                      </div>
                      <input
                          type="text"
                          readOnly={!canEdit}
                          value={srfData.certificate_issue_name}
                          onChange={(e) => handleSrfChange("certificate_issue_name", e.target.value)}
                          className={`block w-full pl-10 rounded-lg border-gray-300 text-sm ${canEdit ? "bg-white" : "bg-gray-50 cursor-not-allowed"}`}
                      />
                  </div>
                </div>
 
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Certificate Issue Address</label>
                  <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 pt-2.5 flex items-start pointer-events-none">
                        <Home size={16} className="text-indigo-500"/>
                      </div>
                      <textarea
                          rows={2}
                          readOnly={!canEdit}
                          value={srfData.certificate_issue_adress || ""}
                          onChange={(e) => handleSrfChange("certificate_issue_adress", e.target.value)}
                          className={`block w-full pl-10 rounded-lg border-gray-300 text-sm ${canEdit ? "bg-white" : "bg-gray-50 cursor-not-allowed"}`}
                          placeholder="Same as Bill To if empty"
                      />
                  </div>
                </div>
            </div>
          </fieldset>
         
          {showSpecialInstructions && (
            <fieldset className="mb-10 border border-gray-300 rounded-2xl bg-gray-50 p-6">
              <legend className="flex items-center gap-2 px-3 py-1.5 text-lg font-semibold text-gray-800 bg-white rounded-md shadow-sm">
                <BookOpen className="h-5 w-5 text-indigo-600" /> Special Instructions from customer for calibration
              </legend>
 
              <div className="mb-6">
                <strong className="text-gray-800 text-sm block mb-3">1. Calibration Frequency:</strong>
                <div className="flex flex-col md:flex-row gap-4 ml-2 text-sm text-gray-700">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="freq"
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                      checked={srfData.calibration_frequency === "As per Standard"}
                      disabled={true}
                    />
                    As per Standard
                  </label>
                 
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="freq"
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                        checked={srfData.calibration_frequency !== "As per Standard"}
                        disabled={true}
                      />
                      Specify
                    </label>
                    {srfData.calibration_frequency !== "As per Standard" && (
                      <input
                        type="text"
                        className="border border-gray-300 rounded-lg px-3 py-1.5 w-64 text-sm bg-gray-100 cursor-not-allowed"
                        value={srfData.calibration_frequency || ""}
                        readOnly={true}
                      />
                    )}
                  </div>
                </div>
              </div>
 
              <div className="mb-6">
                <strong className="text-gray-800 text-sm block mb-3">2. Required 'Statement of conformity' to be reported in the Calibration Certificate?</strong>
                <div className="flex gap-6 ml-2 text-sm text-gray-700">
                  <label className="flex items-center gap-2 cursor-not-allowed">
                    <input
                      type="radio"
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                      checked={srfData.statement_of_conformity === true}
                      disabled={true}
                    />
                    YES
                  </label>
                  <label className="flex items-center gap-2 cursor-not-allowed">
                    <input
                      type="radio"
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                      checked={srfData.statement_of_conformity === false}
                      disabled={true}
                    />
                    NO
                  </label>
                </div>
              </div>
 
              {srfData.statement_of_conformity && (
                <div className="mb-6 ml-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <strong className="text-gray-800 text-sm block mb-3">2.1 Decision Rule (tick √):</strong>
                  <div className="flex flex-col gap-2 text-sm text-gray-700">
                    {[
                      ["ref_iso_is_doc", "Reference to ISO/IS Doc. Standard"],
                      ["ref_manufacturer_manual", "Reference to manufacturer Instruction Manual"],
                      ["ref_customer_requirement", "Reference to Customer Requirement"]
                    ].map(([field, label]) => (
                      <label key={field} className="flex items-center gap-2 cursor-not-allowed">
                        <input
                          type="checkbox"
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                          checked={!!(srfData as any)[field]}
                          disabled={true}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
 
              <div className="grid gap-6 md:grid-cols-2 mt-6 border-t pt-6">
                <div>
                  <strong className="text-gray-800 text-sm block mb-2">3. Turnaround time (Days):</strong>
                  <input
                    type="number"
                    className="border border-gray-300 rounded-lg px-3 py-2 w-full max-w-xs text-sm bg-gray-100 cursor-not-allowed"
                    value={srfData.turnaround_time || ""}
                    readOnly={true}
                  />
                </div>
                <div>
                  <strong className="text-gray-800 text-sm block mb-2">Additional Details / Remarks:</strong>
                  <textarea
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-gray-100 cursor-not-allowed"
                    value={srfData.remarks || ""}
                    readOnly={true}
                  />
                </div>
              </div>
            </fieldset>
          )}
 
          <fieldset className="border border-gray-300 rounded-2xl p-6 bg-gray-50 mb-10">
            <legend className="px-3 text-lg font-semibold text-gray-800 bg-white rounded-md shadow-sm">Equipment Details</legend>
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm text-left text-gray-700">
                <thead className="text-xs uppercase bg-gray-100 text-gray-600">
                  <tr>
                    <th className="px-4 py-3">Instrument Nomenclature</th>
                    <th className="px-4 py-3">Model</th>
                    <th className="px-4 py-3">Serial No/ID</th>
                    <th className="px-4 py-3">Range</th>
                    <th className="px-4 py-3">Unit</th>
                    <th className="px-4 py-3">Calibration Points</th>
                    <th className="px-4 py-3">Mode of Calibration</th>
                  </tr>
                </thead>
                <tbody>
                  {srfData.inward?.equipments.map((eq) => {
                    // Logic check: if the material_description is in our configuration set
                    const isConfigured = configuredTypes.has(eq.material_description.toLowerCase().trim());
                    // Unit is Read Only if: User cannot edit OR Tool is configured (System Driven)
                    const isUnitReadOnly = !canEdit || isConfigured;

                    return (
                        <tr key={eq.inward_eqp_id} className="bg-white border-b hover:bg-blue-50 transition">
                        <td className="px-4 py-2">{eq.material_description}</td>
                        <td className="px-4 py-2 font-medium">{eq.model}</td>
                        <td className="px-4 py-2">{eq.serial_no}</td>
                        <td className="px-4 py-2">{eq.range}</td>
                        <td className="px-4 py-2">
                            <input
                            type="text"
                            readOnly={isUnitReadOnly}
                            value={eq.srf_equipment?.unit || eq.unit || ""}
                            onChange={(e) => handleSrfEquipmentChange(eq.inward_eqp_id, "unit", e.target.value)}
                            className={`block w-full rounded-lg border-gray-300 px-2 py-1 text-sm ${
                                isUnitReadOnly ? "bg-gray-100 cursor-not-allowed" : "bg-white border-blue-400 focus:ring-2 focus:ring-blue-500"
                            }`}
                            placeholder={isConfigured ? "Auto-filled from spec" : "Enter Unit"}
                            />
                        </td>
                        <td className="px-2 py-1"><input type="text" className={`block w-full rounded-lg border-gray-300 px-2 py-1 text-sm ${canEdit ? "bg-white" : "bg-gray-100 cursor-not-allowed"}`} readOnly={!canEdit} value={eq.srf_equipment?.no_of_calibration_points ?? ""} onChange={(e) => handleSrfEquipmentChange(eq.inward_eqp_id, "no_of_calibration_points", e.target.value)} /></td>
                        <td className="px-2 py-1"><input type="text" className={`block w-full rounded-lg border-gray-300 px-2 py-1 text-sm ${canEdit ? "bg-white" : "bg-gray-100 cursor-not-allowed"}`} readOnly={!canEdit} value={eq.srf_equipment?.mode_of_calibration || ""} onChange={(e) => handleSrfEquipmentChange(eq.inward_eqp_id, "mode_of_calibration", e.target.value)} /></td>
                        </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </fieldset>
 
          {canEdit && (
            <div className="flex justify-end items-center gap-4 pt-8 mt-8 border-t border-gray-200 pointer-events-auto">
              <button className="px-5 py-2.5 rounded-lg font-medium text-gray-800 bg-gray-200 hover:bg-gray-300 transition" onClick={goBackToList}>Cancel</button>
              <button
                  className="px-5 py-2.5 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed"
                  onClick={() => handleSaveSrf((srfData.status === "created" || srfData.status === "draft") ? "inward_completed" : srfData.status, true)}
                  disabled={autoSaving || isLocked}
              >
                {activeSrfId ? "Save Changes & Submit" : "Create SRF & Submit"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
 
export default SrfDetailPage;
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface jsPDFCustom extends jsPDF {
  lastAutoTable?: {
    finalY: number;
  };
}

export const generateStandardInwardPDF = (formData: any, equipmentList: any[]) => {
  // 1. Initialize A4 LANDSCAPE
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }) as jsPDFCustom;
  
  const pageWidth = doc.internal.pageSize.width; 
  const pageHeight = doc.internal.pageSize.height;
  const margin = 10;
  
  // NEW: Check if we should include the outsource columns
  const includeOutsource = formData.includeOutsourceDetails === true;

  const THEME = {
    primary: [41, 128, 185],
    headerBg: [241, 245, 249],
    textDark: [30, 41, 59],
    textLight: [100, 116, 139],
    border: [203, 213, 225],
    white: [255, 255, 255]
  };

  let cursorY = 15;

  // Header Strip
  doc.setFillColor(THEME.primary[0], THEME.primary[1], THEME.primary[2]);
  doc.rect(0, 0, pageWidth, 5, 'F');
  
  // Company Info
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(THEME.textDark[0], THEME.textDark[1], THEME.textDark[2]);
  doc.text("Nextage Engineering Pvt. Ltd.", margin, cursorY);

  doc.setFontSize(14);
  doc.setTextColor(THEME.primary[0], THEME.primary[1], THEME.primary[2]);
  doc.text("MATERIAL INWARD RECEIPT", pageWidth - margin, cursorY, { align: 'right' });

  cursorY += 6;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(THEME.textLight[0], THEME.textLight[1], THEME.textLight[2]);
  doc.text("GF-01, Emerald Icon, Outer Ring Road, 104, 5BC III Block, HRBR Layout, Kalyan Nagar, Bangalore – 560043", margin, cursorY);

  cursorY += 5;
  doc.setDrawColor(THEME.border[0], THEME.border[1], THEME.border[2]);
  doc.setLineWidth(0.5);
  doc.line(margin, cursorY, pageWidth - margin, cursorY);

  cursorY += 8;
  const gap = 8;
  const boxWidth = (pageWidth - (margin * 2) - gap) / 2;
  const boxHeight = 42;

  const drawSectionCard = (x: number, title: string, contentCallback: () => void) => {
    doc.setDrawColor(THEME.border[0], THEME.border[1], THEME.border[2]);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, cursorY, boxWidth, boxHeight, 3, 3, 'S');
    doc.setFillColor(THEME.headerBg[0], THEME.headerBg[1], THEME.headerBg[2]);
    doc.roundedRect(x, cursorY, boxWidth, 8, 3, 3, 'F');
    doc.rect(x, cursorY + 5, boxWidth, 3, 'F');
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(THEME.textDark[0], THEME.textDark[1], THEME.textDark[2]);
    doc.text(title.toUpperCase(), x + 5, cursorY + 5.5);
    contentCallback();
  };

  drawSectionCard(margin, "Job Information", () => {
    let y = cursorY + 14;
    const printRow = (label: string, value: string) => {
      doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(THEME.textLight[0], THEME.textLight[1], THEME.textLight[2]);
      doc.text(label, margin + 5, y);
      doc.setTextColor(0).text(value || '-', margin + 45, y);
      y += 6;
    };
    printRow("SRF Number:", formData.srf_no);
    printRow("Received Date:", formData.received_date);
    printRow("Inward Date:", formData.material_inward_date);
    printRow("DC Number:", formData.customer_dc_no);
    printRow("DC Date:", formData.customer_dc_date);
  });

const rightX = margin + boxWidth + gap;
drawSectionCard(rightX, "Customer Information", () => {
    let y = cursorY + 14;

    // Customer Name
    doc.setFont("helvetica", "bold")
        .setFontSize(10)
        .setTextColor(0);

    const name = doc.splitTextToSize(
        formData.customer_details || "Unknown Customer",
        boxWidth - 10
    );

    doc.text(name, rightX + 5, y);
    y += (name.length * 4) + 3;

    // Address
    const addr = formData.ship_to_address || formData.bill_to_address;
    if (addr) {
        doc.setFont("helvetica", "normal")
            .setFontSize(8)
            .setTextColor(THEME.textDark[0]);

        const addrLines = doc.splitTextToSize(addr, boxWidth - 10);
        doc.text(addrLines.slice(0, 3), rightX + 5, y);
        y += (Math.min(addrLines.length, 3) * 4) + 4;
    }

// Contact Person
if (formData.contact_person) {
    doc.setFont("helvetica", "bold");
    doc.text("Contact Person:", rightX + 5, y);

    doc.setFont("helvetica", "normal");
    doc.text(formData.contact_person, rightX + 25, y);
    y += 5;
}

// Phone
if (formData.phone) {
    doc.setFont("helvetica", "bold");
    doc.text("Phone:", rightX + 5, y);

    doc.setFont("helvetica", "normal");
    doc.text(formData.phone, rightX + 25, y);
    y += 5;
}
});

  cursorY += boxHeight + 10;

  // ==========================================
  // DYNAMIC TABLE CONFIGURATION
  // ==========================================
  
  // 1. Define all possible columns
  const allColumns = [
    { header: "S.No", width: 8, key: 'index' },
    { header: "NEPL ID", width: 14, key: 'id' },
    { header: "Description", width: 30, key: 'desc' },
    { header: "Make", width: 16, key: 'make' },
    { header: "Model", width: 16, key: 'model' },
    { header: "Range", width: 16, key: 'range' },
    { header: "Serial", width: 16, key: 'serial' },
    { header: "Qty", width: 8, key: 'qty' },
    // Conditional Columns
    { header: "Supplier", width: 15, key: 'supplier', outsource: true },
    { header: "In DC", width: 12, key: 'in_dc', outsource: true },
    { header: "Out DC", width: 12, key: 'out_dc', outsource: true },
    // Back to normal columns
    { header: "Accessories included.", width: 18, key: 'acc' },
    { header: "Visual Inspection Notes", width: 18, key: 'visual' },
    { header: "Nextage Remarks", width: 22, key: 'eng_rem' },
    { header: "Customer Remarks(If any)", width: 'auto', key: 'cust_rem' }
  ];

  // 2. Filter columns based on user choice
  const activeCols = allColumns.filter(col => !col.outsource || includeOutsource);

  // 3. Map headers and styles
  const tableHeaders = activeCols.map(c => c.header);
  const columnStyles: any = {};
  activeCols.forEach((col, idx) => {
    columnStyles[idx] = { 
        cellWidth: col.width, 
        halign: (col.key === 'index' || col.key === 'qty') ? 'center' : 'left',
        fontStyle: col.key === 'id' ? 'bold' : 'normal'
    };
  });

  // 4. Construct Data Rows
  const tableData = equipmentList.map((eq, index) => {
    const row = [
      index + 1,
      eq.nepl_id || '-',
      eq.material_desc || eq.material_description || '-',
      eq.make || '-',
      eq.model || '-',
      eq.range || '-',
      eq.serial_no || '-',
      eq.qty || eq.quantity || '1',
    ];

    if (includeOutsource) {
      row.push(eq.supplier || '-');
      row.push(eq.in_dc || '-');
      row.push(eq.out_dc || '-');
    }

    row.push(
      eq.accessories_included || '-',
      eq.inspe_status || eq.visual_inspection_notes || '-',
      eq.engineer_remarks || '-',
      eq.remarks_and_decision || eq.customer_remarks || '-'
    );

    return row;
  });

  autoTable(doc, {
    startY: cursorY,
    head: [tableHeaders],
    body: tableData,
    theme: 'grid',
    styles: { 
      fontSize: includeOutsource ? 6 : 7, // Shrink font slightly if more columns exist
      cellPadding: 1.5,
      overflow: 'linebreak', 
      valign: 'middle',
      font: "helvetica",
      lineWidth: 0.1,
      lineColor: THEME.border as [number, number, number]
    },
    headStyles: { 
      fillColor: THEME.primary as [number, number, number], 
      textColor: 255, 
      fontStyle: 'bold',
      halign: 'center',
      fontSize: includeOutsource ? 6 : 7
    },
    columnStyles: columnStyles,
    margin: { left: margin, right: margin },
    didDrawPage: (data) => {
        const h = doc.internal.pageSize.height;
        doc.setFontSize(8);
        doc.setTextColor(THEME.textLight[0], THEME.textLight[1], THEME.textLight[2]);
        doc.text(`Page ${data.pageNumber} | Generated on ${new Date().toLocaleDateString()}`, pageWidth - margin, h - 10, { align: 'right' });
    }
  });

  let finalY = doc.lastAutoTable?.finalY || cursorY;
  if (finalY > pageHeight - 35) { doc.addPage(); finalY = 20; } else { finalY += 10; }

  doc.setDrawColor(THEME.border[0], THEME.border[1], THEME.border[2]);
  doc.setFillColor(252, 252, 252);
  doc.roundedRect(margin, finalY, pageWidth - (margin * 2), 25, 2, 2, 'FD');

  doc.setFontSize(7).setTextColor(THEME.textLight[0], THEME.textLight[1], THEME.textLight[2]);
  doc.text("Disclaimer: All items received subject to detailed verification. Discrepancies must be reported within 24 hours.", margin + 5, finalY + 6);

  doc.setFontSize(9).setTextColor(0).text("Received By:", margin + 5, finalY + 14);
  doc.setFont("helvetica", "bold").text(formData.receiver || 'Staff', margin + 28, finalY + 14);
  doc.setFont("helvetica", "normal").text("For Nextage Engineering Pvt. Ltd.", pageWidth - margin - 5, finalY + 14, { align: 'right' });
  doc.setFont("helvetica", "bold").text("Authorized Signatory", pageWidth - margin - 5, finalY + 20, { align: 'right' });

  doc.save(`Inward_Receipt_${formData.srf_no}.pdf`);
};
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.pagesizes import A4
from reportlab.lib import fonts
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
import io
from datetime import datetime


def generate_pdf_report(data: dict, audit_rows: list):

    buffer = io.BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=40,
        leftMargin=40,
        topMargin=50,
        bottomMargin=40
    )

    elements = []
    styles = getSampleStyleSheet()

    title_style = styles["Heading1"]
    section_style = styles["Heading2"]

    # -------------------------
    # HEADER
    # -------------------------
    elements.append(Paragraph("Yatharthata LIMS USAGE REPORT", title_style))
    elements.append(Spacer(1, 0.2 * inch))

    elements.append(
        Paragraph(
            f"Generated On: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            styles["Normal"]
        )
    )
    elements.append(Spacer(1, 0.4 * inch))

    # -------------------------
    # MAIN TABLE SECTIONS
    # -------------------------
    for table_name, table_data in data.items():

        elements.append(
            Paragraph(table_name.replace("_", " ").upper(), section_style)
        )
        elements.append(Spacer(1, 0.2 * inch))

        table_rows = [["Status", "Count"]]

        for status, count in table_data["statuses"].items():
            table_rows.append([str(status), str(count)])

        table_rows.append(["Total", str(table_data["total"])])

        table = Table(table_rows, colWidths=[3.5 * inch, 1.5 * inch])

        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#667eea")),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('ALIGN', (1, 1), (-1, -1), 'CENTER'),
            ('BACKGROUND', (0, -1), (-1, -1), colors.whitesmoke),
        ]))

        elements.append(table)
        elements.append(Spacer(1, 0.5 * inch))

    # -------------------------
    # LICENSE AUDIT SECTION
    # -------------------------
    elements.append(Paragraph("LICENSE AUDIT HISTORY", section_style))
    elements.append(Spacer(1, 0.2 * inch))

    audit_table_data = [["Old Valid Until", "New Valid Until", "Extended By", "Extended At"]]

    for row in audit_rows:
        audit_table_data.append([str(col) for col in row])

    audit_table = Table(
        audit_table_data,
        colWidths=[1.3 * inch, 1.3 * inch, 1.5 * inch, 2 * inch]
    )

    audit_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#667eea")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (1, 1), (-1, -1), 'CENTER'),
    ]))

    elements.append(audit_table)

    doc.build(elements)

    buffer.seek(0)
    return buffer

import os
import smtplib
from dataclasses import dataclass
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional, List, Dict, Union
from html import escape as html_escape


@dataclass
class SMTPConfig:
    host: str
    port: int
    username: Optional[str]
    password: Optional[str]
    sender_email: str
    use_tls: bool = True
    use_ssl: bool = False
    timeout: int = 30


def load_smtp_config() -> SMTPConfig:
    host = os.getenv("SMTP_SERVER") or os.getenv("SMTP_HOST", "")
    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USER") or os.getenv("SMTP_USERNAME")
    password = os.getenv("SMTP_PASSWORD")
    sender_email = (
        os.getenv("FROM_EMAIL")
        or os.getenv("SMTP_SENDER_EMAIL")
        or username
        or ""
    )

    use_tls = os.getenv("SMTP_USE_TLS", "true").lower() in {"1", "true", "yes", "on"}
    use_ssl = os.getenv("SMTP_USE_SSL", "false").lower() in {"1", "true", "yes", "on"}
    timeout = int(os.getenv("SMTP_TIMEOUT_SECONDS", "30"))

    if not host:
        raise RuntimeError("SMTP_SERVER is not configured in .env.")
    if not sender_email:
        raise RuntimeError("FROM_EMAIL or SMTP_USER is not configured in .env.")
    if not port:
        raise RuntimeError("SMTP_PORT is not configured in .env.")

    return SMTPConfig(
        host=host,
        port=port,
        username=username,
        password=password,
        sender_email=sender_email,
        use_tls=use_tls,
        use_ssl=use_ssl,
        timeout=timeout,
    )


def build_reminder_subject(certificate_id: int, certificate_no: str, due_date: str) -> str:
    return (
        f"Calibration due reminder | certificate_id={certificate_id} "
        f"| cert_no={certificate_no} | due={due_date}"
    )


def build_plain_text_body(
    customer_name: str,
    due_rows: List[Dict],
    days_ahead: int,
    custom_note: Optional[str] = None,
) -> str:
    title_text = (
        f"due for calibration in the next {days_ahead} days"
        if days_ahead <= 7
        else f"due for calibration within the next {days_ahead} days (Advance Notice)"
    )

    lines = [
        f"Hello {customer_name or 'Customer'},",
        "",
        f"The following certificate(s) are {title_text}:",
        "",
    ]

    if custom_note and custom_note.strip():
        lines.extend([f"Note from Lab: {custom_note.strip()}", ""])

    for row in due_rows:
        lines.append(
            f"- Certificate No: {row.get('certificate_no', 'N/A')}, "
            f"Equipment: {row.get('material_description') or row.get('nepl_id') or 'N/A'}, "
            f"NEPL/Serial: {row.get('nepl_id') or row.get('serial_no') or 'N/A'}, "
            f"Due Date: {row.get('recommended_cal_due_date', 'N/A')}"
        )

    lines += [
        "",
        "Please arrange the equipment for calibration at the earliest.",
        "",
        "Regards,",
        "Nextage Engg-YLIMS",
    ]
    return "\n".join(lines)


def build_html_body(
    customer_name: str,
    due_rows: List[Dict],
    days_ahead: int,
    custom_note: Optional[str] = None,
) -> str:
    items = []

    for row in due_rows:
        cert_no = html_escape(str(row.get("certificate_no", "N/A")))
        nepl_id = html_escape(str(row.get("nepl_id") or "—"))
        desc = html_escape(str(row.get("material_description") or "—"))
        serial_no = html_escape(str(row.get("serial_no") or "—"))
        due_date = html_escape(str(row.get("recommended_cal_due_date", "N/A")))

        items.append(
            f"""
            <tr>
                <td style="padding:10px 8px;border:1px solid #e2e8f0;font-weight:600;">{cert_no}</td>
                <td style="padding:10px 8px;border:1px solid #e2e8f0;">{nepl_id}</td>
                <td style="padding:10px 8px;border:1px solid #e2e8f0;">{desc}</td>
                <td style="padding:10px 8px;border:1px solid #e2e8f0;">{serial_no}</td>
                <td style="padding:10px 8px;border:1px solid #e2e8f0;">{due_date}</td>
            </tr>
            """
        )

    rows_html = "".join(items)
    note_block = ""
    if custom_note and custom_note.strip():
        escaped_note = html_escape(custom_note.strip()).replace("\n", "<br/>")
        note_block = f"""
        <div style="margin: 12px 0; padding: 12px 16px; background-color: #eff6ff; border-left: 4px solid #2563eb; border-radius: 6px; color: #1e3a8a;">
          <strong>Note from Calibration Lab:</strong><br/>{escaped_note}
        </div>
        """

    return f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.5;">
        <p>Hello <strong>{html_escape(customer_name or 'Customer')}</strong>,</p>
        <p>The following certificate(s) are due for calibration within the selected window ({days_ahead} day(s)):</p>
        {note_block}
        <table style="border-collapse: collapse; width: 100%; max-width: 900px; font-size: 14px;">
          <thead>
            <tr style="background-color: #f8fafc; color: #475569;">
              <th style="padding:10px 8px;border:1px solid #e2e8f0;text-align:left;">Certificate No</th>
              <th style="padding:10px 8px;border:1px solid #e2e8f0;text-align:left;">NEPL ID</th>
              <th style="padding:10px 8px;border:1px solid #e2e8f0;text-align:left;">Equipment Description</th>
              <th style="padding:10px 8px;border:1px solid #e2e8f0;text-align:left;">Serial No</th>
              <th style="padding:10px 8px;border:1px solid #e2e8f0;text-align:left;">Due Date</th>
            </tr>
          </thead>
          <tbody>
            {rows_html}
          </tbody>
        </table>
        <p style="margin-top: 16px;">Please arrange the equipment for calibration at the earliest.</p>
        <p>Regards,<br/><strong>Nextage Engg-YLIMS</strong></p>
      </body>
    </html>
    """


def _normalize_email_list(emails: Union[str, List[str], None]) -> List[str]:
    if not emails:
        return []
    if isinstance(emails, str):
        raw = emails.replace(";", ",").split(",")
    else:
        raw = []
        for item in emails:
            raw.extend(str(item).replace(";", ",").split(","))
    cleaned: List[str] = []
    seen = set()
    for addr in raw:
        val = addr.strip()
        if val and "@" in val and val.lower() not in seen:
            seen.add(val.lower())
            cleaned.append(val)
    return cleaned


def send_email(
    to_email: Union[str, List[str]],
    subject: str,
    plain_text: str,
    html_body: Optional[str] = None,
    cc_emails: Optional[List[str]] = None,
) -> List[str]:
    cfg = load_smtp_config()

    to_list = _normalize_email_list(to_email)
    cc_list = _normalize_email_list(cc_emails)
    all_recipients = to_list + [e for e in cc_list if e.lower() not in {x.lower() for x in to_list}]

    if not all_recipients:
        raise ValueError("At least one valid recipient email address is required.")

    message = MIMEMultipart("alternative")
    message["From"] = cfg.sender_email
    message["To"] = ", ".join(to_list)
    if cc_list:
        message["Cc"] = ", ".join(cc_list)
    message["Subject"] = subject

    message.attach(MIMEText(plain_text or "", "plain", "utf-8"))
    if html_body:
        message.attach(MIMEText(html_body, "html", "utf-8"))

    smtp_cls = smtplib.SMTP_SSL if cfg.use_ssl else smtplib.SMTP

    with smtp_cls(cfg.host, cfg.port, timeout=cfg.timeout) as server:
        server.ehlo()
        if cfg.use_tls and not cfg.use_ssl:
            server.starttls()
            server.ehlo()

        if cfg.username and cfg.password:
            server.login(cfg.username, cfg.password)

        server.sendmail(cfg.sender_email, all_recipients, message.as_string())

    return all_recipients
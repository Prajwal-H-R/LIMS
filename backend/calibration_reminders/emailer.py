import os
import smtplib
from dataclasses import dataclass
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional, List, Dict
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


def build_plain_text_body(customer_name: str, due_rows: List[Dict], days_ahead: int) -> str:
    lines = [
        f"Hello {customer_name or 'Customer'},",
        "",
        f"The following certificate(s) are due for calibration in the next {days_ahead} day(s):",
        "",
    ]

    for row in due_rows:
        lines.append(
            f"- Certificate No: {row.get('certificate_no', 'N/A')}, "
            f"Equipment: {row.get('nepl_id') or row.get('serial_no') or 'N/A'}, "
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


def build_html_body(customer_name: str, due_rows: List[Dict], days_ahead: int) -> str:
    items = []

    for row in due_rows:
        cert_no = html_escape(str(row.get("certificate_no", "N/A")))
        desc = html_escape(str(row.get("material_description") or ""))
        serial_no = html_escape(str(row.get("serial_no") or ""))
        due_date = html_escape(str(row.get("recommended_cal_due_date", "N/A")))

        items.append(
            f"""
            <tr>
                <td style="padding:8px;border:1px solid #ddd;">{cert_no}</td>
                <td style="padding:8px;border:1px solid #ddd;">{desc}</td>
                <td style="padding:8px;border:1px solid #ddd;">{serial_no}</td>
                <td style="padding:8px;border:1px solid #ddd;">{due_date}</td>
            </tr>
            """
        )

    rows_html = "".join(items)

    return f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #222;">
        <p>Hello <strong>{html_escape(customer_name or 'Customer')}</strong>,</p>
        <p>The following certificate(s) are due for calibration in the next {days_ahead} day(s):</p>
        <table style="border-collapse: collapse; width: 100%; max-width: 900px;">
          <thead>
            <tr>
              <th style="padding:8px;border:1px solid #ddd;text-align:left;">Certificate No</th>
              <th style="padding:8px;border:1px solid #ddd;text-align:left;">Description</th>
              <th style="padding:8px;border:1px solid #ddd;text-align:left;">Serial No</th>
              <th style="padding:8px;border:1px solid #ddd;text-align:left;">Due Date</th>
            </tr>
          </thead>
          <tbody>
            {rows_html}
          </tbody>
        </table>
        <p>Please arrange the equipment for calibration at the earliest.</p>
        <p>Regards,<br/>Nextage Engg-YLIMS</p>
      </body>
    </html>
    """


def send_email(to_email: str, subject: str, plain_text: str, html_body: Optional[str] = None) -> None:
    cfg = load_smtp_config()

    message = MIMEMultipart("alternative")
    message["From"] = cfg.sender_email
    message["To"] = to_email
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

        server.sendmail(cfg.sender_email, [to_email], message.as_string())
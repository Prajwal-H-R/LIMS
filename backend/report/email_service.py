#backend/report/email_service.py
import smtplib
from email.message import EmailMessage
import os
import smtplib
from email.message import EmailMessage
from dotenv import load_dotenv

load_dotenv()  # Loads values from .env



def send_email(subject: str, html_content: str, pdf_buffer):

    smtp_server = os.getenv("SMTP_SERVER")
    smtp_port = int(os.getenv("SMTP_PORT", 587))
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    from_email = os.getenv("FROM_EMAIL")
    to_emails = os.getenv("REPORT_EMAIL_TO")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = to_emails

    msg.add_alternative(html_content, subtype="html")

    msg.add_attachment(
        pdf_buffer.read(),
        maintype="application",
        subtype="pdf",
        filename="lims_report.pdf"
    )

    with smtplib.SMTP(smtp_server, smtp_port) as server:
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.send_message(msg)

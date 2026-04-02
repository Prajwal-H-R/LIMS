import os
from datetime import datetime, timedelta, date

from apscheduler.schedulers.background import BackgroundScheduler
from zoneinfo import ZoneInfo  

scheduler = BackgroundScheduler(timezone=ZoneInfo("Asia/Kolkata"))

from jinja2 import Environment, FileSystemLoader

from .report_service import (
    get_status_counts,
    get_license_audit_data,
    get_last_sent_date,
    log_report_sent
)

from .pdf_service import generate_pdf_report
from .email_service import send_email




# =========================================================
# GENERATE + SEND REPORT
# =========================================================
def generate_and_send_report(from_date, to_date, title):

    status_data = get_status_counts(from_date, to_date)
    audit_data = get_license_audit_data()

    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    env = Environment(loader=FileSystemLoader(BASE_DIR))
    template = env.get_template("report_template.html")

    html = template.render(
        title=title,
        from_date=from_date,
        to_date=to_date,
        status_data=status_data,
        audit=audit_data
    )

    pdf = generate_pdf_report(status_data, audit_data)

    send_email(title, html, pdf)


# =========================================================
# WEEKLY JOB (Tuesday 9 AM)
# =========================================================
def weekly_job():

    today = date.today()

    last_sent = get_last_sent_date("weekly")

    # Prevent duplicate
    if last_sent == today:
        return

    # Calculate last Tuesday → last Monday
    last_tuesday = today - timedelta(days=today.weekday() + 6)
    last_monday = last_tuesday + timedelta(days=6)

    generate_and_send_report(
        last_tuesday,
        last_monday,
        "Weekly LIMS Report"
    )

    log_report_sent("weekly", today)


# =========================================================
# MONTHLY JOB (1st 9 AM)
# =========================================================
def monthly_job():

    today = date.today()

    last_sent = get_last_sent_date("monthly")

    if last_sent == today:
        return

    first_day_this_month = today.replace(day=1)
    last_month_end = first_day_this_month - timedelta(days=1)
    last_month_start = last_month_end.replace(day=1)

    generate_and_send_report(
        last_month_start,
        last_month_end,
        "Monthly LIMS Report"
    )

    log_report_sent("monthly", today)


# =========================================================
# STARTUP MISSED CHECK (PRODUCTION SAFE)
# =========================================================
def check_missed_reports():

    today = date.today()

    # ----------------------
    # WEEKLY MISSED CHECK
    # ----------------------
    last_weekly = get_last_sent_date("weekly")

    # If today is after Tuesday and weekly not sent this week
    this_week_tuesday = today - timedelta(days=today.weekday() - 1)

    if last_weekly is None or last_weekly < this_week_tuesday:
        if today.weekday() >= 1:  # Tuesday or after
            weekly_job()

    # ----------------------
    # MONTHLY MISSED CHECK
    # ----------------------
    last_monthly = get_last_sent_date("monthly")

    first_day_this_month = today.replace(day=1)

    # If monthly not sent this month
    if last_monthly is None or last_monthly < first_day_this_month:
        if today.day > 1:  # If we are already past 1st
            monthly_job()


# =========================================================
# START SCHEDULER
# =========================================================
def start_scheduler():

    # Run missed check on startup
    check_missed_reports()

    # Weekly: Every Tuesday 9:00 AM
    scheduler.add_job(
        weekly_job,
        trigger="cron",
        day_of_week="tue",
        hour=11,
        minute=0
    )

    # Monthly: Every 1st day 9:00 AM
    scheduler.add_job(
        monthly_job,
        trigger="cron",
        day=1,
        hour=11,
        minute=0
    )

    scheduler.start()
print("Scheduler TZ:", scheduler.timezone)

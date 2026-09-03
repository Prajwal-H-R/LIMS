import asyncio
import time
import logging
import os
from pathlib import Path
from contextlib import asynccontextmanager
from datetime import datetime
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

# --- IMPORT DB COMPONENTS & CORE ---
from backend.db import Base, engine, SessionLocal
from backend.core.config import settings
from backend.report import report_log
from backend.report.scheduler import start_scheduler
from backend.services.expiry_services import ExpiryService

print("DATABASE URL:", settings.DATABASE_URL)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- ROUTER IMPORTS ---
from backend.routes import (
    user_routes,
    inward_router,
    customer_routes,
    srf_router,
    password_reset_router,
    invitation_routes,
    notification_router  # Restored from old main
)
from backend.routes.htw.htw_master_standard_router import router as htw_master_standard_router
from backend.routes.htw.htw_manufacturer_spec_router import router as htw_manufacturer_spec_router
from backend.routes.htw.htw_pressure_gauge_res_router import router as htw_pressure_gauge_res_router
from backend.routes.htw.htw_nomenclature_range_router import router as htw_nomenclature_range_router
from backend.routes.htw.htw_job_standard import router as htw_job_standard_router
from backend.routes.htw.htw_job import router as htw_job
from backend.routes.htw.htw_standard_uncertanity_reference_router import router as htw_standard_uncertanity_reference_router
from backend.routes.htw.htw_job_environment_router import router as htw_job_environment_router
from backend.routes.htw.htw_repeatability_router import router as htw_repeatability_router
from backend.routes.htw.htw_const_coverage_factor_router import router as htw_const_coverage_factor_router
from backend.routes.htw.htw_t_distribution_router import router as htw_t_distribution_router
from backend.routes.htw.htw_un_pg_master_router import router as htw_un_pg_master_router

# (Fixed the mixed-up aliases from the new main by using the correct ones from the old main)
from backend.routes.htw.htw_cmc_reference_router import router as htw_cmc_reference_router
from backend.routes.htw.htw_tool_type_router import router as htw_tool_type_router
from backend.routes.htw.htw_max_val_measure_err_router import router as htw_max_val_measure_err_router

from backend.routes.htw.htw_uncertanity_budget_router import router as htw_uncertanity_budget_router
from backend.routes.certificate.certificate_router import router as htw_certificate_router
from backend.routes.certificate.certificate_config import router as certificate_config
from backend.license.license_routes import router as license_router
from backend.routes.htw.htw_environment_config import router as config_router
from backend.routes.htw.expiry_routes import router as expiry_router
from backend.routes.lock_router import router as lock_router
from backend.routes.lab_scope_router import router as lab_scope_router
from backend.routes.deviation_router import router as deviation_router
from backend.routes.equipment_flow import router as equipment_flow
from backend.routes.external_upload import router as external_upload
from backend.routes.external_deviation import router as external_deviation
from backend.routes.external_deviation_attachments import router as external_deviation_attachments
from backend.routes.final_inspection_router import router as final_inspection_router
from backend.routes.scan_routes import router as scan_router

from backend.calibration_reminders.routes import router as calibration_reminder_router

from backend.routes.calibration_booking_router import router as calibration_booking_router
from backend.routes.change_password_router import router as change_password_router

from apscheduler.schedulers.background import BackgroundScheduler
from backend.calibration_reminders.scheduler import run_daily_calibration_reminder_job
# --- BACKGROUND TASKS & LIFESPAN ---
async def automated_daily_maintenance():
    while True:
        db = SessionLocal() 
        bg_tasks = BackgroundTasks() 
        
        try:
            logger.info("Running 12-hour automated background maintenance...")
            
            # Use the new single unified method
            await ExpiryService.process_and_notify_expiries(bg_tasks, db)
            
            # Execute the queued email background tasks
            for task in bg_tasks.tasks:
                if asyncio.iscoroutinefunction(task.func):
                    await task.func(*task.args, **task.kwargs)
                else:
                    task.func(*task.args, **task.kwargs)

            logger.info("Background maintenance completed successfully.")

        except Exception as e:
            logger.error(f"Error in automated daily maintenance: {e}", exc_info=True)
        finally:
            db.close() 
            
        await asyncio.sleep(43200) 

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up server, initializing background tasks...")
 
    start_scheduler()
 
    calibration_scheduler = BackgroundScheduler()
 
    # Change: Add next_run_time=datetime.now() to trigger immediately on start
    calibration_scheduler.add_job(
        run_daily_calibration_reminder_job,
        trigger="interval",
        days=1,
        args=[SessionLocal, 45], # Pass 45 here
        id="calibration_reminder_job",
        replace_existing=True,
        next_run_time=datetime.now() # <--- THIS RUNS IT IMMEDIATELY
    )
 
    calibration_scheduler.start()
    logger.info("Calibration reminder scheduler started successfully.")
    
    asyncio.create_task(automated_daily_maintenance())
    yield
    calibration_scheduler.shutdown()


# --- DB TABLES CREATION ---
max_retries = 5
retry_delay = 2

for attempt in range(max_retries):
    try:
        logger.info(f"Attempting to create database tables (attempt {attempt + 1}/{max_retries})...")
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables created successfully!")
        break
    except Exception as e:
        if attempt < max_retries - 1:
            logger.warning(f"Failed to create tables: {e}. Retrying in {retry_delay} seconds...")
            time.sleep(retry_delay)
        else:
            logger.error(f"Failed to create tables after {max_retries} attempts: {e}")
            raise


# --- FASTAPI APP INIT ---
app = FastAPI(title="LIMS Backend", version="1.0", lifespan=lifespan)


# --- CORS CONFIGURATION ---
# This will look for ALLOWED_ORIGINS in your .env file.
origins_env = os.getenv("ALLOWED_ORIGINS", "")

# This safely splits the URLs by comma
origins = [o.strip() for o in origins_env.split(",") if o.strip()]

print("Allowed origins for Production:", origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, 
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"], 
    allow_headers=["Content-Type", "Authorization", "Accept"], 
)


# --- STATIC FILES ---
BASE_DIR = Path(__file__).resolve().parent   # backend folder
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/api/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

CERT_ASSETS_DIR = BASE_DIR / "certificate_assets"
CERT_ASSETS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/api/certificate-assets", StaticFiles(directory=str(CERT_ASSETS_DIR)), name="certificate-assets")


# --- ROUTER REGISTRATION ---
app.include_router(user_routes.router, prefix="/api")
app.include_router(inward_router.router, prefix="/api")
app.include_router(customer_routes.router, prefix="/api")
app.include_router(srf_router.router, prefix="/api")
app.include_router(password_reset_router.router, prefix="/api")
app.include_router(invitation_routes.router, prefix="/api")
app.include_router(notification_router.router, prefix="/api")  # Restored from old main

# HTW Routers
app.include_router(htw_master_standard_router, prefix="/api")
app.include_router(htw_manufacturer_spec_router, prefix="/api")
app.include_router(htw_pressure_gauge_res_router, prefix="/api")
app.include_router(htw_nomenclature_range_router, prefix="/api")
app.include_router(htw_job_standard_router, prefix="/api")
app.include_router(htw_job, prefix="/api")
app.include_router(htw_repeatability_router, prefix="/api")
app.include_router(htw_job_environment_router, prefix="/api")
app.include_router(htw_const_coverage_factor_router, prefix="/api")
app.include_router(htw_t_distribution_router, prefix="/api")
app.include_router(htw_un_pg_master_router, prefix="/api")
app.include_router(htw_cmc_reference_router, prefix="/api")
app.include_router(htw_tool_type_router, prefix="/api")
app.include_router(htw_max_val_measure_err_router, prefix="/api")
app.include_router(htw_standard_uncertanity_reference_router, prefix="/api")
app.include_router(htw_uncertanity_budget_router, prefix="/api")
app.include_router(htw_certificate_router, prefix="/api")
app.include_router(expiry_router, prefix="/api")
app.include_router(config_router, prefix="/api")
app.include_router(lab_scope_router, prefix="/api")
app.include_router(license_router)

# Lock Router
app.include_router(lock_router, prefix="/api")
app.include_router(deviation_router, prefix="/api")
app.include_router(equipment_flow, prefix="/api")
app.include_router(external_upload, prefix="/api")
app.include_router(external_deviation, prefix="/api")
app.include_router(external_deviation_attachments, prefix="/api")
app.include_router(final_inspection_router, prefix="/api")


app.include_router(calibration_reminder_router, prefix="/api")
app.include_router(scan_router, prefix="/api")

app.include_router(calibration_booking_router, prefix="/api")
app.include_router(change_password_router, prefix="/api")

app.include_router(certificate_config, prefix="/api")
# --- ROOT ENDPOINT ---
@app.get("/")
def root():
    return {"message": "LIMS backend running successfully"}


# --- DB CONNECTION CHECK ---
with engine.connect() as conn:
    result = conn.execute(text("SELECT current_database();"))
    print("Connected DB:", result.scalar())
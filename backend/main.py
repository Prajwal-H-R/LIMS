import asyncio
import time
import logging
from pathlib import Path
from contextlib import asynccontextmanager

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
from backend.license.license_routes import router as license_router
from backend.routes.htw.htw_environment_config import router as config_router
from backend.routes.htw.expiry_routes import router as expiry_router
from backend.routes.lock_router import router as lock_router
from backend.routes.lab_scope_router import router as lab_scope_router
from backend.routes.deviation_router import router as deviation_router


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
    # --- STARTUP LOGIC ---
    logger.info("Starting up server, initializing background tasks...")
    
    # Start Scheduler
    start_scheduler()
    
    # Start the 12-hour background checking loop
    asyncio.create_task(automated_daily_maintenance())
    
    yield
    
    # --- SHUTDOWN LOGIC ---
    logger.info("Server shutting down, stopping background tasks...")


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
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- STATIC FILES ---
BASE_DIR = Path(__file__).resolve().parent   # backend folder
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

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


# --- ROOT ENDPOINT ---
@app.get("/")
def root():
    return {"message": "LIMS backend running successfully"}


# --- DB CONNECTION CHECK ---
with engine.connect() as conn:
    result = conn.execute(text("SELECT current_database();"))
    print("Connected DB:", result.scalar())
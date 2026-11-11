from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List
from datetime import date

# Import your database dependency
from backend.db import get_db
from backend.schemas.analytics import (
    AnalyticsFilter, DashboardSummary, 
    CustomerThroughputResponse, StandardExpiryAlert
)
from backend.services.analytics_service import AnalyticsService

router = APIRouter(prefix="/api/v1/analytics", tags=["Reports & Analytics"])

@router.get("/dashboard-summary", response_model=DashboardSummary)
def get_dashboard_summary(
    start_date: date,
    end_date: date,
    db: Session = Depends(get_db)
):
    """Returns top-level KPIs for the Executive Dashboard tiles."""
    filters = AnalyticsFilter(start_date=start_date, end_date=end_date)
    return AnalyticsService.get_dashboard_summary(db, filters)

@router.get("/customer-throughput", response_model=List[CustomerThroughputResponse])
def get_customer_throughput(
    start_date: date,
    end_date: date,
    customer_id: int = Query(None, description="Optional customer ID filter"),
    db: Session = Depends(get_db)
):
    """Returns customer-wise equipment volumes and certificate dispatch history."""
    filters = AnalyticsFilter(start_date=start_date, end_date=end_date, customer_id=customer_id)
    return AnalyticsService.get_customer_throughput(db, filters)

@router.get("/master-standards/expiring", response_model=List[StandardExpiryAlert])
def get_expiring_standards(
    threshold_days: int = Query(30, description="Alert threshold in days"),
    db: Session = Depends(get_db)
):
    """Returns master standards that are approaching their calibration validity expiry."""
    return AnalyticsService.get_master_standard_expiries(db, threshold_days)

@router.get("/export/customer-throughput")
def export_customer_throughput(
    start_date: date,
    end_date: date,
    customer_id: int = Query(None),
    db: Session = Depends(get_db)
):
    """Generates an on-the-fly Excel report of customer throughput."""
    filters = AnalyticsFilter(start_date=start_date, end_date=end_date, customer_id=customer_id)
    data = AnalyticsService.get_customer_throughput(db, filters)
    
    excel_buffer = AnalyticsService.generate_excel_report(data, sheet_name="Customer Throughput")
    
    filename = f"Customer_Throughput_{start_date}_to_{end_date}.xlsx"
    headers = {
        'Content-Disposition': f'attachment; filename="{filename}"',
        'Access-Control-Expose-Headers': 'Content-Disposition' # Vital for React to read the filename
    }
    
    return StreamingResponse(
        excel_buffer, 
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
        headers=headers
    )
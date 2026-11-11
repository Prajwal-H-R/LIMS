import io
import pandas as pd
from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import select, func, and_, cast, Integer

# Updated to match the exact exports in your models/__init__.py
from backend.models import (
    Customer, Inward, InwardEquipment, Srf, HTWJob, 
    HTWCertificate, Deviation, HTWMasterStandard
)
from backend.schemas.analytics import AnalyticsFilter

class AnalyticsService:

    @staticmethod
    def get_dashboard_summary(db: Session, filters: AnalyticsFilter) -> dict:
        """High-level KPIs for the Executive Dashboard."""
        
        # Base filter condition for date range
        date_filter = and_(
            Inward.material_inward_date >= filters.start_date,
            Inward.material_inward_date <= filters.end_date
        )

        equipments_query = select(func.count(InwardEquipment.inward_eqp_id)).join(
            Inward, InwardEquipment.inward_id == Inward.inward_id
        ).where(date_filter)

        certs_query = select(func.count(HTWCertificate.certificate_id)).where(
            and_(
                func.date(HTWCertificate.issued_at) >= filters.start_date,
                func.date(HTWCertificate.issued_at) <= filters.end_date,
                HTWCertificate.status == 'ISSUED'
            )
        )

        deviations_query = select(func.count(Deviation.id)).where(
            Deviation.status == 'OPEN'
        )

        customers_query = select(func.count(func.distinct(Inward.customer_id))).where(date_filter)

        return {
            "total_equipments_received": db.scalar(equipments_query) or 0,
            "total_certificates_issued": db.scalar(certs_query) or 0,
            "open_deviations": db.scalar(deviations_query) or 0,
            "active_customers": db.scalar(customers_query) or 0,
        }

    @staticmethod
    def get_customer_throughput(db: Session, filters: AnalyticsFilter) -> list[dict]:
        """Calculates volumes and last dispatch info grouped by customer."""
        
        stmt = (
            select(
                Customer.customer_id,
                Customer.customer_details,
                func.count(func.distinct(Inward.inward_id)).label("total_inwards"),
                func.count(func.distinct(Srf.srf_id)).label("total_srfs"),
                func.count(func.distinct(InwardEquipment.inward_eqp_id)).label("total_equipments"),
                func.count(func.distinct(HTWJob.job_id)).label("completed_jobs"),
                func.count(func.distinct(HTWCertificate.certificate_id)).label("issued_certificates"),
                func.max(HTWCertificate.issued_at).label("last_certificate_dispatched_at")
            )
            .select_from(Customer)
            .join(Inward, Customer.customer_id == Inward.customer_id)
            .outerjoin(Srf, Inward.inward_id == Srf.inward_id)
            .outerjoin(InwardEquipment, Inward.inward_id == InwardEquipment.inward_id)
            .outerjoin(HTWJob, InwardEquipment.inward_eqp_id == HTWJob.inward_eqp_id)
            .outerjoin(HTWCertificate, HTWJob.job_id == HTWCertificate.job_id)
            .where(
                and_(
                    Inward.material_inward_date >= filters.start_date,
                    Inward.material_inward_date <= filters.end_date
                )
            )
        )

        if filters.customer_id:
            stmt = stmt.where(Customer.customer_id == filters.customer_id)

        stmt = stmt.group_by(Customer.customer_id)
        
        result = db.execute(stmt).all()
        return [dict(row._mapping) for row in result]

    @staticmethod
    def get_master_standard_expiries(db: Session, threshold_days: int = 30) -> list[dict]:
        """Compliance check: Alerts for master standards expiring soon."""
        
        stmt = (
            select(
                HTWMasterStandard.id.label("master_standard_id"),
                HTWMasterStandard.nomenclature,
                HTWMasterStandard.calibration_valid_upto,
                cast(
                    HTWMasterStandard.calibration_valid_upto - func.current_date(),
                    Integer
                ).label("days_remaining")
            )
            .where(
                and_(
                    HTWMasterStandard.is_active == True,
                    (HTWMasterStandard.calibration_valid_upto - func.current_date()) <= threshold_days
                )
            )
            .order_by("days_remaining")
        )

        result = db.execute(stmt).all()
        return [dict(row._mapping) for row in result]

    @staticmethod
    def generate_excel_report(data: list[dict], sheet_name: str) -> io.BytesIO:
        """Universal export engine. Streams directly to memory buffer."""
        df = pd.DataFrame(data)
        
        # Standardize empty sets
        if df.empty:
            df = pd.DataFrame(["No data available for selected criteria"])
            
        # Clean up column headers for the end-user (e.g., "total_inwards" -> "Total Inwards")
        if not df.empty and isinstance(df.columns[0], str):
            df.columns = [col.replace("_", " ").title() for col in df.columns]

        # Convert timezone-aware datetimes to tz-naive for Excel compatibility
        for col in df.select_dtypes(include=['datetime64[ns, UTC]', 'datetimetz']).columns:
            df[col] = df[col].dt.tz_localize(None)

        buffer = io.BytesIO()
        with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name=sheet_name)
        
        buffer.seek(0)
        return buffer
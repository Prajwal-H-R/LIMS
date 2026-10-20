# backend/models/wcc.py
from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB

from backend.db import Base


class WorkCompletionCertificate(Base):
    """SQLAlchemy model for public.work_completion_certificates."""

    __tablename__ = "work_completion_certificates"
    __table_args__ = (
        CheckConstraint(
            "jsonb_typeof(details_table) = 'array'",
            name="chk_details_table_array",
        ),
        CheckConstraint(
            "jsonb_typeof(signature_details) = 'object'",
            name="chk_signature_details_object",
        ),
        CheckConstraint(
            "work_start_date IS NULL OR work_completion_date IS NULL "
            "OR work_completion_date >= work_start_date",
            name="chk_work_completion_dates",
        ),
        {"schema": "public"},
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    inward_id = Column(BigInteger, nullable=True, unique=True)
    # Vendor details
    vendor_company_details = Column(String, nullable=True)
    tax_registration_details = Column(String, nullable=True)
    #New field added for Nextage Dispatch DC No and Date
    nextage_dispatch_dc_no = Column(String, nullable=True)
    date = Column(Date, nullable=True)

    # Customer and work location details
    services_delivered_to = Column(String, nullable=True)
    work_location_1 = Column(String, nullable=True)
    work_location_2 = Column(String, nullable=True)
    work_location_3 = Column(String, nullable=True)
    gst_no = Column(String, nullable=True)
    pan_no = Column(String, nullable=True)

    # Certificate and purchase order details
    wcc_no = Column(String, nullable=True, unique=True)
    work_start_date = Column(Date, nullable=True)
    work_completion_date = Column(Date, nullable=True)
    po_no = Column(String, nullable=True)
    po_date = Column(Date, nullable=True)
    project_name = Column(String, nullable=True)

    # Work details: JSONB array
    details_table = Column(
        JSONB,
        nullable=False,
        default=lambda: [
            {
                "po_s_no": None,
                "description_of_work": "",
                "uom": "",
                "quantity_completed": None,
                "sac_no": "",
                "status_of_work_completed": "",
            }
        ],
        server_default=text(
            "'["
            '{"po_s_no": null, "description_of_work": "", "uom": "", '
            '"quantity_completed": null, "sac_no": "", '
            '"status_of_work_completed": ""}'
            "]'::jsonb"
        ),
    )

    # Remarks
    remarks = Column(Text, nullable=True)

    
    # Signature details: JSONB object
    signature_details = Column(
        JSONB,
        nullable=False,
        default=lambda: {
            "representative_and_company_seal_name": "",
            "vendor_representative_company_seal_name": "",
        },
        server_default=text(
            """'{
                "representative_and_company_seal_name": "",
                "vendor_representative_company_seal_name": ""
            }'::jsonb"""
        ),
    )
    # Audit fields
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.current_timestamp(),
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )

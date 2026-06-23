# This file contains the FastAPI router for SRF-related operations.

from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import literal, cast, String, Boolean, DateTime, union_all, select, func, or_, and_
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.sql.expression import exists
from datetime import date, datetime

from typing import List, Optional
 
# Import schemas, models, and dependencies
# Make sure SrfPaginatedResponse and SrfFullPaginatedResponse are added to your schemas!
from ..schemas.srf_schemas import (
    Srf, SrfCreate, SrfDetailUpdate, SrfSummary, InwardListSummary,
    WorkItemResponse, WorkItemsPaginatedResponse
)
from .. import models
from ..db import get_db
from ..services.srf_services import SrfService
from ..auth import get_current_user, check_staff_role
from ..schemas.user_schemas import UserResponse

router = APIRouter(
    prefix="/srfs",
    tags=["SRFs"]
)
 
# =====================================================================
# Helper Function
# =====================================================================
def get_srf_with_full_details(srf_id: int, db: Session) -> Optional[models.Srf]:
    """
    Centralized function to fetch an SRF with all its nested relationships
    eagerly loaded using selectinload for maximum speed (prevents Cartesian explosion).
    """
    stmt = select(models.Srf).options(
        selectinload(models.Srf.inward).selectinload(models.Inward.customer),
        selectinload(models.Srf.inward)
        .selectinload(models.Inward.equipments)
        .selectinload(models.InwardEquipment.srf_equipment)
    ).filter(models.Srf.srf_id == srf_id)
    
    return db.scalars(stmt).first()
 
# =====================================================================
# GET: All SRFs (List View - Admin/Staff)
# =====================================================================
# =====================================================================
# GET: Work Item Counts for Tabs
# =====================================================================
@router.get("/work-items/counts")
async def get_work_item_counts(
    search: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db)
):
    """Returns the total counts for all 4 tabs based on current filters."""
    
    # 1. Base Query for Pending Inwards (No SRF)
    srf_exists_stmt = select(1).where(models.Srf.inward_id == models.Inward.inward_id)
    inwards_stmt = select(func.count(models.Inward.inward_id)).select_from(models.Inward)
    
    # 2. Base Query for SRFs
    srfs_stmt = select(models.Srf.status, func.count(models.Srf.srf_id)).select_from(models.Srf).join(
        models.Inward, models.Srf.inward_id == models.Inward.inward_id
    )

    # Apply Search & Date Filters conditionally
    if search or start_date or end_date:
        inwards_stmt = inwards_stmt.outerjoin(models.Customer, models.Inward.customer_id == models.Customer.customer_id)
        srfs_stmt = srfs_stmt.outerjoin(models.Customer, models.Inward.customer_id == models.Customer.customer_id)

        if search:
            search_filter_inward = or_(
                func.concat('SRF No: ', cast(models.Inward.srf_no, String)).ilike(f"%{search}%"),
                models.Customer.customer_details.ilike(f"%{search}%"),
                models.Inward.customer_dc_no.ilike(f"%{search}%")
            )
            search_filter_srf = or_(
                func.concat('SRF No: ', cast(models.Srf.srf_no, String)).ilike(f"%{search}%"),
                models.Customer.customer_details.ilike(f"%{search}%"),
                models.Inward.customer_dc_no.ilike(f"%{search}%")
            )
            inwards_stmt = inwards_stmt.where(search_filter_inward)
            srfs_stmt = srfs_stmt.where(search_filter_srf)

        if start_date:
            inwards_stmt = inwards_stmt.where(models.Inward.material_inward_date >= start_date)
            srfs_stmt = srfs_stmt.where(func.coalesce(models.Srf.created_at, func.now()) >= start_date)
        if end_date:
            end_datetime = datetime.combine(end_date, datetime.max.time())
            inwards_stmt = inwards_stmt.where(models.Inward.material_inward_date <= end_datetime)
            srfs_stmt = srfs_stmt.where(func.coalesce(models.Srf.created_at, func.now()) <= end_datetime)

    # Apply specific status filters
    inwards_pending_stmt = inwards_stmt.where(models.Inward.status == 'updated', ~exists(srf_exists_stmt))
    srfs_grouped_stmt = srfs_stmt.group_by(models.Srf.status)

    # Execute
    pending_inwards_count = db.scalar(inwards_pending_stmt) or 0
    srf_counts = db.execute(srfs_grouped_stmt).all()

    # Map Results
    counts = {
        "pending_creation": pending_inwards_count,
        "customer_review": 0,
        "approved": 0,
        "rejected": 0
    }

    for status, count in srf_counts:
        if status == 'draft':
            counts["pending_creation"] += count
        elif status in ['inward_completed', 'generated']:
            counts["customer_review"] += count
        elif status == 'approved':
            counts["approved"] += count
        elif status == 'rejected':
            counts["rejected"] += count

    return counts

@router.get("/work-items", response_model=WorkItemsPaginatedResponse)
async def get_srf_work_items(
    skip: int = 0,
    limit: int = 50,
    tab_status: str = Query("pending_creation"),
    search: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db)
):
    if limit > 1000: limit = 1000

    # -------------------------------------------------------------
    # 1. BUILD BASE QUERIES 
    # -------------------------------------------------------------
    if tab_status == 'pending_creation':
        
        # UPGRADE 1: Use EXISTS instead of LEFT JOIN for anti-join
        srf_exists_stmt = select(1).where(models.Srf.inward_id == models.Inward.inward_id)

        inwards_stmt = select(
            models.Inward.inward_id.label('id'),
            literal("inward", type_=String).label('type'),
            func.concat('SRF No: ', cast(models.Inward.srf_no, String)).label('displayNumber'),
            models.Customer.customer_details.label('customer_name'),
            models.Inward.customer_dc_no.label('customer_dc_no'),
            # UPGRADE 2: Keep Native DateTime for B-Tree Indexing
            cast(models.Inward.material_inward_date, DateTime).label('item_date'),
            literal("pending_creation", type_=String).label('status'),
            literal(False, type_=Boolean).label('isDraft')
        ).select_from(models.Inward).outerjoin(
            models.Customer, models.Inward.customer_id == models.Customer.customer_id
        ).where(
            models.Inward.status == 'updated',
            ~exists(srf_exists_stmt) # <--- FAST ANTI-JOIN
        )

        drafts_stmt = select(
            models.Srf.srf_id.label('id'),
            literal("srf", type_=String).label('type'),
            func.concat('SRF No: ', cast(models.Srf.srf_no, String)).label('displayNumber'),
            models.Customer.customer_details.label('customer_name'),
            models.Inward.customer_dc_no.label('customer_dc_no'),
            cast(func.coalesce(models.Srf.created_at, func.now()), DateTime).label('item_date'),
            literal("pending_creation", type_=String).label('status'),
            literal(True, type_=Boolean).label('isDraft')
        ).select_from(models.Srf).join(
            models.Inward, models.Srf.inward_id == models.Inward.inward_id
        ).outerjoin(
            models.Customer, models.Inward.customer_id == models.Customer.customer_id
        ).where(
            models.Srf.status == 'draft',
            models.Inward.status == 'srf_created'
        )

        base_query = union_all(inwards_stmt, drafts_stmt).alias("base_query")

    else:
        # Standard query for other tabs
        other_stmt = select(
            models.Srf.srf_id.label('id'),
            literal("srf", type_=String).label('type'),
            func.concat('SRF No: ', cast(models.Srf.srf_no, String)).label('displayNumber'),
            models.Customer.customer_details.label('customer_name'),
            models.Inward.customer_dc_no.label('customer_dc_no'),
            cast(func.coalesce(models.Srf.created_at, func.now()), DateTime).label('item_date'),
            literal(tab_status, type_=String).label('status'),
            literal(False, type_=Boolean).label('isDraft')
        ).select_from(models.Srf).join(
            models.Inward, models.Srf.inward_id == models.Inward.inward_id
        ).outerjoin(
            models.Customer, models.Inward.customer_id == models.Customer.customer_id
        )

        if tab_status == "customer_review":
            other_stmt = other_stmt.where(models.Srf.status.in_(['inward_completed', 'generated']))
        elif tab_status == "approved":
            other_stmt = other_stmt.where(models.Srf.status == 'approved')
        elif tab_status == "rejected":
            other_stmt = other_stmt.where(models.Srf.status == 'rejected')

        base_query = other_stmt.alias("base_query")

    # -------------------------------------------------------------
    # 2. APPLY FILTERS & UPGRADE 3: WINDOW FUNCTION COUNT
    # -------------------------------------------------------------
    # We select all columns from base_query PLUS the window count
    final_stmt = select(
        *base_query.c, 
        func.count().over().label('total_window_count')
    )

    if search:
        final_stmt = final_stmt.where(
            or_(
                base_query.c.displayNumber.ilike(f"%{search}%"),
                base_query.c.customer_name.ilike(f"%{search}%"),
                base_query.c.customer_dc_no.ilike(f"%{search}%")
            )
        )

    # UPGRADE 2 (Continued): Native DateTime comparisons
    if start_date:
        final_stmt = final_stmt.where(base_query.c.item_date >= cast(start_date, DateTime))
    if end_date:
        # Add 23:59:59 to include the entire end date natively
        end_datetime = datetime.combine(end_date, datetime.max.time())
        final_stmt = final_stmt.where(base_query.c.item_date <= cast(end_datetime, DateTime))

    # Apply Pagination & Execute Single Query
    final_stmt = final_stmt.order_by(base_query.c.item_date.desc()).offset(skip).limit(limit)
    items_raw = db.execute(final_stmt).mappings().all()

    # Extract total from the first row (if rows exist)
    total_records = items_raw[0]['total_window_count'] if items_raw else 0

    return {
        "total": total_records,
        "items": [
            {
                "id": row["id"],
                "type": row["type"],
                "displayNumber": row["displayNumber"],
                "customer_name": row["customer_name"],
                "date": row["item_date"].isoformat() if row["item_date"] else "",
                "status": row["status"],
                "isDraft": row["isDraft"]
            } for row in items_raw
        ]
    }

# =====================================================================
# GET: Single SRF (Detail View)
# =====================================================================
@router.get("/{srf_id}", response_model=Srf)
def get_srf_by_id(srf_id: int, db: Session = Depends(get_db)):
    srf = get_srf_with_full_details(srf_id, db)
    if not srf:
        raise HTTPException(status_code=404, detail=f"SRF with ID {srf_id} not found")
    return srf
 
# =====================================================================
# POST: Create SRF
# =====================================================================
@router.post("/", response_model=Srf, status_code=201)
def create_srf(srf_data: SrfCreate, db: Session = Depends(get_db)):
    try:
        srf_service = SrfService(db)
        new_srf = srf_service.create_srf_from_inward(
            inward_id=srf_data.inward_id,
            srf_data=srf_data.model_dump()
        )
        return get_srf_with_full_details(new_srf.srf_id, db)
 
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"An unexpected error occurred in create_srf endpoint: {e}")
        raise HTTPException(status_code=500, detail="An internal server error occurred.")
 
# =====================================================================
# PUT: Update SRF
# =====================================================================
@router.put("/{srf_id}", response_model=Srf)
def update_srf(srf_id: int, srf_update_data: SrfDetailUpdate, db: Session = Depends(get_db)):
    print(f"[INFO] Received update request for SRF ID: {srf_id}")
    
    srf_to_update = get_srf_with_full_details(srf_id, db)
    if not srf_to_update or not srf_to_update.inward:
        print(f"[ERROR] SRF not found or has no associated inward. SRF ID: {srf_id}")
        raise HTTPException(
            status_code=404,
            detail=f"SRF with ID {srf_id} not found or has no associated inward record."
        )

    try:
        # Exclude srf_no and inward_id to prevent DB Integer Error
        update_data = srf_update_data.model_dump(
            exclude={'equipments', 'srf_no', 'inward_id'}, 
            exclude_unset=True
        )
        print(f"[INFO] Update data to apply on SRF: {update_data}")

        # --- Update SRF fields ---
        for key, value in update_data.items():
            if hasattr(srf_to_update, key):
                setattr(srf_to_update, key, value)
                print(f"[INFO] Updated SRF field: {key} = {value}")

        # --- Update inward status if provided ---
        if 'status' in srf_update_data.model_dump() and srf_update_data.status:
            old_status = srf_to_update.inward.status
            srf_to_update.inward.status = "srf_created"
            print(f"[INFO] Updated inward.status: {old_status} → {srf_update_data.status}")

        # --- Update SRF Equipment ---
        if srf_update_data.equipments:
            print(f"[INFO] Updating {len(srf_update_data.equipments)} equipment records")
            inward_equipments_map = {eq.inward_eqp_id: eq for eq in srf_to_update.inward.equipments}
           
            for eq_update in srf_update_data.equipments:
                target_inward_eq = inward_equipments_map.get(eq_update.inward_eqp_id)
                if target_inward_eq:
                    if not target_inward_eq.srf_equipment:
                        target_inward_eq.srf_equipment = models.SrfEquipment(
                            srf_id=srf_id,
                            inward_eqp_id=target_inward_eq.inward_eqp_id
                        )
                        print(f"[INFO] Created new SrfEquipment for inward_eqp_id {target_inward_eq.inward_eqp_id}")

                    update_eq_data = eq_update.model_dump(exclude={'inward_eqp_id'}, exclude_unset=True)
                    for key, value in update_eq_data.items():
                        if hasattr(target_inward_eq.srf_equipment, key):
                            setattr(target_inward_eq.srf_equipment, key, value)
                            print(f"[INFO] Updated equipment field: {key} = {value} for inward_eqp_id {target_inward_eq.inward_eqp_id}")

        db.commit()
        print(f"[SUCCESS] SRF ID {srf_id} updated successfully and committed to DB")
        return get_srf_with_full_details(srf_id, db)

    except SQLAlchemyError as e:
        db.rollback()
        print(f"[DB ERROR] {e}")
        raise HTTPException(status_code=500, detail=f"Database error while updating SRF: {e}")

 
# =====================================================================
# DELETE: SRF
# =====================================================================
@router.delete("/{srf_id}", status_code=204)
def delete_srf(srf_id: int, db: Session = Depends(get_db)):
    srf_to_delete = db.query(models.Srf).filter(models.Srf.srf_id == srf_id).first()
    if not srf_to_delete:
        raise HTTPException(status_code=404, detail=f"SRF with ID {srf_id} not found")
 
    try:
        db.delete(srf_to_delete)
        db.commit()
        return Response(status_code=204)
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete SRF: {e}")
 
# =====================================================================
# GET: SRFs by Customer ID (List View with Full Data - Paginated)
# =====================================================================
@router.get("/customer/", response_model=WorkItemsPaginatedResponse)
def get_srfs_for_current_customer(
    skip: int = 0,
    limit: int = 50, # Lowered default limit to match pagination standards
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Retrieves a highly optimized, paginated summary list of SRFs 
    for the logged-in customer using Window Functions.
    """
    if limit > 1000:
        limit = 1000

    try:
        # 1. Validate Customer Access
        if current_user.customer_id is None:
            raise HTTPException(status_code=403, detail="User is not linked to a customer.")

        # 2. Build the Optimized Base Query with Window Count
        stmt = select(
            models.Srf.srf_id.label('id'),
            literal("srf", type_=String).label('type'),
            func.concat('SRF No: ', cast(models.Inward.srf_no, String)).label('displayNumber'),
            models.Customer.customer_details.label('customer_name'),
            cast(func.coalesce(models.Srf.created_at, func.now()), DateTime).label('item_date'),
            models.Srf.status.label('status'),
            (models.Srf.status == 'draft').label('isDraft'),
            # UPGRADE: Window function eliminates the need for a separate count() query
            func.count().over().label('total_window_count')
        ).select_from(models.Srf).join(
            models.Inward, models.Srf.inward_id == models.Inward.inward_id
        ).join(
            models.Customer, models.Inward.customer_id == models.Customer.customer_id
        ).where(
            models.Inward.customer_id == current_user.customer_id
        )

        # 3. Apply Search (Native DB filtering)
        if search:
            search_term = f"%{search}%"
            stmt = stmt.where(
                or_(
                    cast(models.Inward.srf_no, String).ilike(search_term),
                    models.Inward.customer_dc_no.ilike(search_term)
                )
            )

        # 4. Apply Pagination & Execute Single DB Trip
        stmt = stmt.order_by(models.Srf.srf_id.desc()).offset(skip).limit(limit)
        
        # We use .mappings().all() to fetch rows as dictionaries
        items_raw = db.execute(stmt).mappings().all()

        # Extract total from the first row (if rows exist)
        total_records = items_raw[0]['total_window_count'] if items_raw else 0

        # 5. Map to the flat WorkItemsPaginatedResponse schema
        return {
            "total": total_records,
            "items": [
                {
                    "id": row["id"],
                    "type": row["type"],
                    "displayNumber": row["displayNumber"],
                    "customer_name": row["customer_name"],
                    "date": row["item_date"].isoformat() if row["item_date"] else "",
                    "status": row["status"],
                    "isDraft": row["isDraft"]
                } for row in items_raw
            ]
        }
   
    except SQLAlchemyError as e:
        print(f"Database error in get_srfs_for_current_customer: {e}")
        raise HTTPException(status_code=500, detail="A database error occurred.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        raise HTTPException(status_code=500, detail="An internal server error occurred.")
# =====================================================================
# Export Endpoints for SRF Management Sections (No pagination needed)
# =====================================================================

@router.get("/export/pending")
async def export_pending_srf_section(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(check_staff_role)
):
    """Export Pending SRF Creation section data."""
    srf_service = SrfService(db)
    excel_stream = srf_service.export_pending_srf_section(
        start_date=start_date,
        end_date=end_date,
        search_term=search
    )
    from datetime import datetime
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"pending_srf_export_{timestamp}.xlsx"
    return StreamingResponse(
        excel_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@router.get("/export/{status_filter}")
async def export_srf_section(
    status_filter: str,
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(check_staff_role)
):
    """Export SRF section data by status (customer_review, approved, rejected)."""
    if status_filter not in ["customer_review", "approved", "rejected"]:
        raise HTTPException(status_code=400, detail="Invalid status filter. Must be: customer_review, approved, or rejected")
    
    srf_service = SrfService(db)
    excel_stream = srf_service.export_srf_section_by_status(
        status_filter=status_filter,
        start_date=start_date,
        end_date=end_date,
        search_term=search
    )
    from datetime import datetime
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"srf_{status_filter}_export_{timestamp}.xlsx"
    return StreamingResponse(
        excel_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
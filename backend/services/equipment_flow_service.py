from sqlalchemy.orm import Session
from typing import List, Optional, Tuple, Any
from sqlalchemy import func, case

from backend.models.inward import Inward
from backend.models.inward_equipments import InwardEquipment
from backend.models.equipment_flow_config import EquipmentFlowConfig
from backend.models.htw.htw_job import HTWJob # ⭐ IMPORT THE JOB MODEL

from backend.schemas.equipment_flow_config import (
    EquipmentFlowConfigCreate, 
    EquipmentFlowConfigUpdate, 
    ManualSrfGroup,
    ManualEquipmentDetail,
    SystemDrivenJob,
)

# ✅ DEFINE a constant for the system-driven flow name
SYSTEM_DRIVEN_WORKFLOW = "System Driven Workflow"
DEFAULT_WORKFLOW = "External Calibration Workflow"

# --- CRUD functions for equipment_flow_config ---

def get_config(db: Session, config_id: int) -> Optional[EquipmentFlowConfig]:
    return db.query(EquipmentFlowConfig).filter(EquipmentFlowConfig.id == config_id).first()

def get_config_by_equipment_type(db: Session, equipment_type: str) -> Optional[EquipmentFlowConfig]:
    return db.query(EquipmentFlowConfig).filter(EquipmentFlowConfig.equipment_type == equipment_type).first()

def get_all_configs(db: Session, skip: int = 0, limit: int = 100) -> List[EquipmentFlowConfig]:
    return db.query(EquipmentFlowConfig).offset(skip).limit(limit).all()

def create_config(db: Session, config: EquipmentFlowConfigCreate) -> EquipmentFlowConfig:
    db_config = EquipmentFlowConfig(
        equipment_type=config.equipment_type,
        is_active=config.is_active
    )
    db.add(db_config)
    db.commit()
    db.refresh(db_config)
    return db_config

def update_config(db: Session, db_config: EquipmentFlowConfig, config_in: EquipmentFlowConfigUpdate) -> EquipmentFlowConfig:
    update_data = config_in.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_config, field, value)
    db.add(db_config)
    db.commit()
    db.refresh(db_config)
    return db_config

def delete_config(db: Session, config_id: int) -> Optional[EquipmentFlowConfig]:
    db_config = get_config(db, config_id)
    if db_config:
        db.delete(db_config)
        db.commit()
    return db_config

# --- Core Workflow Routing Logic ---

def determine_workflow(db: Session, equipment_type: str) -> Tuple[str, bool]:
    config = db.query(EquipmentFlowConfig).filter(
        func.lower(EquipmentFlowConfig.equipment_type) == func.lower(equipment_type),
        EquipmentFlowConfig.is_active == True
    ).first()
    return (SYSTEM_DRIVEN_WORKFLOW, False) if config else (DEFAULT_WORKFLOW, True)

# --- High-Performance Calibration Functions ---

# ✅ REPLACED with the high-performance version that includes counts
def get_system_driven_srf_groups(db: Session) -> List[Any]:
    """
    Fetches SRF groups with system-driven workflow counts, using corrected logic.
    """

    system_driven_types_subquery = (
        db.query(func.lower(func.trim(EquipmentFlowConfig.equipment_type)))
        .filter(EquipmentFlowConfig.is_active == True)
        .scalar_subquery()
    )

    # --- CORRECTED LOGIC FOR COUNTS ---

    # PENDING: Correctly counts only when there is NO corresponding job record.
    pending_count = func.count(
        case((HTWJob.job_id.is_(None), 1), else_=None)
    ).label("pending_count")

    # IN-PROGRESS: Correctly counts only when a job record EXISTS and its status is NOT a final one.
    in_progress_count = func.count(
        case(
            (
                (HTWJob.job_id.is_not(None)) & # Condition 1: Job must exist
                (HTWJob.job_status.notin_(['Calibrated', 'Completed', 'Terminated', 'Cancelled', 'Rejected', 'Completed - OOT'])), # Condition 2: Status is active
                1
            ),
            else_=None
        )
    ).label("in_progress_count")

    # COMPLETED: Correctly counts only when a job record EXISTS and its status is a completed one.
    completed_count = func.count(
        case(
            (
                (HTWJob.job_id.is_not(None)) & # Condition 1: Job must exist
                (HTWJob.job_status.in_(['Calibrated', 'Completed' ,'Completed - OOT'])), # Condition 2: Status is complete
                1
            ),
            else_=None
        )
    ).label("completed_count")


    # --- MAIN QUERY (Unchanged from before) ---
    results = (
        db.query(
            Inward.inward_id,
            Inward.srf_no,
            Inward.customer_dc_no,
            Inward.customer_dc_date,
            Inward.status,
            pending_count,
            in_progress_count,
            completed_count,
        )
        .join(InwardEquipment, Inward.inward_id == InwardEquipment.inward_id)
        .outerjoin(HTWJob, InwardEquipment.inward_eqp_id == HTWJob.inward_eqp_id)
        .filter(
            func.lower(func.trim(InwardEquipment.material_description)).in_(
                system_driven_types_subquery
            )
        )
        .group_by(
            Inward.inward_id,
            Inward.srf_no,
            Inward.customer_dc_no,
            Inward.customer_dc_date,
            Inward.status,
        )
        .order_by(Inward.material_inward_date.desc())
        .all()
    )
    
    # --- RESPONSE FORMATTING (Unchanged from before) ---
    return [
        {
            "inward_id": row[0],
            "srf_no": row[1],
            "customer_dc_no": row[2],
            "customer_dc_date": row[3] or None,
            "status": row[4],
            "pending_count": row[5],
            "in_progress_count": row[6],
            "completed_count": row[7],
        }
        for row in results
    ]

# This function is for the DETAIL VIEW and remains unchanged
def get_system_driven_job_details(db: Session, inward_id: int) -> Optional[Inward]:
    """
    Fetches the details for a single Inward record, but only populates the
    'equipments' list with those that are part of the system-driven workflow.
    """
    inward_record = db.query(Inward).filter(Inward.inward_id == inward_id).first()
    if not inward_record:
        return None

    system_driven_types_subquery = (
        db.query(func.lower(func.trim(EquipmentFlowConfig.equipment_type)))
        .filter(EquipmentFlowConfig.is_active == True)
        .scalar_subquery()
    )

    filtered_equipment = (
        db.query(InwardEquipment)
        .filter(
            InwardEquipment.inward_id == inward_id,
            func.lower(func.trim(InwardEquipment.material_description)).in_(
                system_driven_types_subquery
            )
        )
        .all()
    )

    inward_record.equipments = filtered_equipment
    return inward_record


def get_manual_calibration_srf_groups(db: Session) -> List[ManualSrfGroup]:
    system_driven_types_subquery = (
        db.query(func.lower(func.trim(EquipmentFlowConfig.equipment_type)))
        .filter(EquipmentFlowConfig.is_active == True)
        .scalar_subquery()
    )
    results = (
        db.query(
            Inward.srf_no,
            Inward.customer_details.label("customer_name"),
            Inward.material_inward_date.label("received_date"),
            func.count(InwardEquipment.inward_eqp_id).label("equipment_count")
        )
        .join(InwardEquipment, Inward.inward_id == InwardEquipment.inward_id)
        .filter(
            func.lower(func.trim(InwardEquipment.material_description)).notin_(
                system_driven_types_subquery
            )
        )
        .group_by(Inward.inward_id)
        .order_by(Inward.material_inward_date.desc())
        .all()
    )
    return results


def get_manual_equipment_for_srf(db: Session, srf_no: str) -> List[ManualEquipmentDetail]:
    system_driven_types_subquery = (
        db.query(func.lower(func.trim(EquipmentFlowConfig.equipment_type)))
        .filter(EquipmentFlowConfig.is_active == True)
        .scalar_subquery()
    )
    equipment_list = (
        db.query(
            InwardEquipment.inward_eqp_id,
            InwardEquipment.nepl_id,
            InwardEquipment.material_description,
            InwardEquipment.photos.label("documents")
        )
        .join(Inward, Inward.inward_id == InwardEquipment.inward_id)
        .filter(
            Inward.srf_no == srf_no,
            func.lower(func.trim(InwardEquipment.material_description)).notin_(
                system_driven_types_subquery
            )
        )
        .order_by(InwardEquipment.nepl_id)
        .all()
    )
    return equipment_list
# backend/api/v1/endpoints/equipment_flow.py

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from backend.db import get_db
from backend.schemas import equipment_flow_config as schemas
# NOTE: Make sure your schemas file has the new 'SystemDrivenJob' schema
from backend.schemas.equipment_flow_config import SystemDrivenJob 
from backend.schemas.inward_schemas import InwardEquipmentResponse
from backend.services import equipment_flow_service as service

router = APIRouter(
    tags=["Flow Configuration"])

# =============================================================================
# Core Workflow Routing Endpoint
# =============================================================================

@router.post(
    "/workflow/route",
    response_model=schemas.WorkflowRouteResponse,
    summary="Determine Workflow Route for Equipment",
    description="This is the main entry point for the dynamic workflow routing. "
                "Provide an equipment type to find its designated calibration workflow."
)
def route_equipment_workflow(
    request: schemas.WorkflowRouteRequest,
    db: Session = Depends(get_db),
):
    """
    Triggers the workflow routing logic based on the provided equipment type.
    - It queries the `equipment_flow_config` table for an active rule.
    - If a rule exists, it returns the specified `flow_type`.
    - If no rule is found, it returns the default 'External Calibration Workflow'.
    """
    flow_name, is_default = service.determine_workflow(db, equipment_type=request.equipment_type)

    return schemas.WorkflowRouteResponse(
        equipment_type=request.equipment_type,
        determined_flow=flow_name,
        is_default_flow=is_default,
    )

# =============================================================================
# CRUD Endpoints for Managing Flow Configurations
# =============================================================================

@router.post(
    "/flow-configs",
    response_model=schemas.EquipmentFlowConfig,
    status_code=status.HTTP_201_CREATED,
    summary="Create a New Flow Configuration"
)
def create_flow_configuration(
    config_in: schemas.EquipmentFlowConfigCreate,
    db: Session = Depends(get_db)
):
    """Create a new rule for routing an equipment type to a specific workflow."""
    # Check if a config for this equipment type already exists
    existing_config = service.get_config_by_equipment_type(db, equipment_type=config_in.equipment_type)
    if existing_config:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Configuration for equipment type '{config_in.equipment_type}' already exists."
        )
    return service.create_config(db=db, config=config_in)


@router.get(
    "/flow-configs",
    response_model=List[schemas.EquipmentFlowConfig],
    summary="List All Flow Configurations"
)
def get_all_flow_configurations(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Retrieve all existing equipment flow configurations with pagination."""
    return service.get_all_configs(db, skip=skip, limit=limit)


@router.patch(
    "/flow-configs/{config_id}",
    response_model=schemas.EquipmentFlowConfig,
    summary="Update a Flow Configuration"
)
def update_flow_configuration(
    config_id: int,
    config_in: schemas.EquipmentFlowConfigUpdate,
    db: Session = Depends(get_db)
):
    """Update a flow configuration's flow_type or its active status."""
    db_config = service.get_config(db, config_id)
    if not db_config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Configuration with ID {config_id} not found."
        )
    return service.update_config(db=db, db_config=db_config, config_in=config_in)


@router.delete(
    "/flow-configs/{config_id}",
    response_model=schemas.EquipmentFlowConfig,
    summary="Delete a Flow Configuration"
)
def delete_flow_configuration(config_id: int, db: Session = Depends(get_db)):
    """Permanently delete a flow configuration rule."""
    db_config = service.delete_config(db, config_id)
    if not db_config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Configuration with ID {config_id} not found."
        )
    return db_config

# =============================================================================
# Endpoints for Filtered Job/SRF Lists
# =============================================================================

# NEW ENDPOINT FOR THE JOBS MANAGEMENT PAGE
@router.get(
    "/flow-configs/system-driven-jobs",
    response_model=List[SystemDrivenJob],
    summary="Get All SRF Groups for System-Driven Workflow",
    description="""
    **High-performance endpoint for the main Jobs Management page.**
    Fetches a summarized list of all SRF groups that contain at least one piece 
    of equipment designated for the system-driven workflow (i.e., its material_description 
    IS found in the active equipment_flow_config).
    """
)
def get_system_driven_jobs(db: Session = Depends(get_db)):
    """
    Returns a clean, aggregated list of SRF groups intended for the system-driven
    workflow, perfect for the initial page load of the Jobs Management screen.
    """
    return service.get_system_driven_srf_groups(db)
@router.get(
    "/system-driven-jobs/{inward_id}/details",
    response_model=InwardEquipmentResponse,
    summary="Get Filtered Details for a System-Driven Job",
    description="Fetches the details for a single SRF group, but the equipment list "
                "is pre-filtered to only include items designated for the system-driven workflow."
)
def get_system_driven_job_details(inward_id: int, db: Session = Depends(get_db)):
    """
    This endpoint powers the detail view of the Jobs Management page.
    """
    job_details = service.get_system_driven_job_details(db, inward_id=inward_id)
    if not job_details:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inward record with ID {inward_id} not found."
        )
    return job_details

@router.get(
    "/flow-configs/manual-calibration-groups",
    response_model=List[schemas.ManualSrfGroup],
    summary="Get All SRF Groups for Manual Calibration",
    description="""
    **High-performance endpoint.**
    Fetches a summarized list of all SRF groups that contain at least one piece 
    of equipment designated for manual calibration (i.e., its material_description 
    is not found in the active equipment_flow_config).
    """
)
def get_manual_calibration_groups(db: Session = Depends(get_db)):
    """
    Returns a clean, aggregated list of SRF groups, perfect for the initial
    page load of the Manual Calibration screen.
    """
    return service.get_manual_calibration_srf_groups(db)

@router.get(
    "/flow-configs/manual-calibration-groups/{srf_no}/equipment",
    response_model=List[schemas.ManualEquipmentDetail], # Define this schema
    summary="Get Manual Equipment for a specific SRF",
    tags=["Flow Configuration"],
    description="Fetches the detailed list of equipment pending manual calibration for a single SRF number."
)
def get_manual_equipment_for_srf(srf_no: str, db: Session = Depends(get_db)):
    """
    Returns the list of equipment for a given SRF that are designated for
    manual calibration.
    """
    # Create a new service function to implement this query logic.
    return service.get_manual_equipment_for_srf(db, srf_no=srf_no)
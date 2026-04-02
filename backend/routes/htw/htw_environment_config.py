from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from backend.db import get_db
from backend.schemas.htw.htw_environment_config import (
    HTWEnvironmentConfigCreate,
    HTWEnvironmentConfigUpdate,
    HTWEnvironmentConfigResponse
)
from backend.services.htw.htw_environment_config_service import HTWEnvironmentConfigService

# Prefix set to plural to match frontend config
router = APIRouter(
    prefix="/htw/environment-configs",
    tags=["HTW Environment Config"]
)

# ==================================================================
# 1. SPECIFIC ROUTES (MUST BE BEFORE DYNAMIC IDs)
# ==================================================================

# ✅ GET ACTIVE (Latest)
# This MUST be defined ABOVE the /{config_id} route
@router.get("/active", response_model=HTWEnvironmentConfigResponse)
def read_active_environment_config(db: Session = Depends(get_db)):
    """
    Returns the most recently created configuration.
    """
    service = HTWEnvironmentConfigService(db)
    return service.get_latest_config()

# ==================================================================
# 2. GENERAL ROUTES
# ==================================================================

# CREATE
@router.post("/", response_model=HTWEnvironmentConfigResponse, status_code=status.HTTP_201_CREATED)
def create_environment_config(
    config_in: HTWEnvironmentConfigCreate, 
    db: Session = Depends(get_db)
):
    service = HTWEnvironmentConfigService(db)
    return service.create_config(config_in)

# READ ALL
@router.get("/", response_model=List[HTWEnvironmentConfigResponse])
def read_environment_configs(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db)
):
    service = HTWEnvironmentConfigService(db)
    return service.get_all_configs(skip, limit)

# ==================================================================
# 3. DYNAMIC ID ROUTES (MUST BE LAST)
# ==================================================================

# READ ONE BY ID
@router.get("/{config_id}", response_model=HTWEnvironmentConfigResponse)
def read_environment_config(
    config_id: int, 
    db: Session = Depends(get_db)
):
    service = HTWEnvironmentConfigService(db)
    return service.get_config_by_id(config_id)

# UPDATE BY ID
@router.put("/{config_id}", response_model=HTWEnvironmentConfigResponse)
def update_environment_config(
    config_id: int, 
    config_update: HTWEnvironmentConfigUpdate, 
    db: Session = Depends(get_db)
):
    service = HTWEnvironmentConfigService(db)
    return service.update_config(config_id, config_update)

# DELETE BY ID
@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_environment_config(
    config_id: int, 
    db: Session = Depends(get_db)
):
    service = HTWEnvironmentConfigService(db)
    service.delete_config(config_id)
    return None
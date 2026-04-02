# backend/services/htw/htw_environment_config_service.py

from sqlalchemy.orm import Session
from sqlalchemy import desc
from fastapi import HTTPException, status
from typing import List

# ✅ Import MODELS and SCHEMAS only. 
# ❌ DO NOT import HTWEnvironmentConfigService here.
from backend.models.htw.htw_environment_config import HTWEnvironmentConfig
from backend.schemas.htw.htw_environment_config import (
    HTWEnvironmentConfigCreate,
    HTWEnvironmentConfigUpdate
)

class HTWEnvironmentConfigService:
    def __init__(self, db: Session):
        self.db = db

    def get_latest_config(self) -> HTWEnvironmentConfig:
        """
        Fetches the single most recently created configuration.
        """
        config = (
            self.db.query(HTWEnvironmentConfig)
            .order_by(desc(HTWEnvironmentConfig.created_at))
            .first()
        )
        if not config:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No environment configuration found. Please create a configuration first."
            )
        return config

    def get_config_by_id(self, config_id: int) -> HTWEnvironmentConfig:
        config = self.db.query(HTWEnvironmentConfig).filter(HTWEnvironmentConfig.id == config_id).first()
        if not config:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, 
                detail=f"Environment Config with ID {config_id} not found"
            )
        return config

    def get_all_configs(self, skip: int = 0, limit: int = 100) -> List[HTWEnvironmentConfig]:
        return (
            self.db.query(HTWEnvironmentConfig)
            .order_by(desc(HTWEnvironmentConfig.created_at))
            .offset(skip)
            .limit(limit)
            .all()
        )

    def create_config(self, config_in: HTWEnvironmentConfigCreate) -> HTWEnvironmentConfig:
        # Schema validation ensures min < max, so we can just save
        new_config = HTWEnvironmentConfig(
            temp_min=config_in.temp_min,
            temp_max=config_in.temp_max,
            humidity_min=config_in.humidity_min,
            humidity_max=config_in.humidity_max
        )
        self.db.add(new_config)
        self.db.commit()
        self.db.refresh(new_config)
        return new_config

    def update_config(self, config_id: int, config_update: HTWEnvironmentConfigUpdate) -> HTWEnvironmentConfig:
        config = self.get_config_by_id(config_id)
        
        # 1. Update fields locally
        update_data = config_update.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(config, key, value)

        # 2. Logic Check: Ensure integrity after partial updates
        if config.temp_min >= config.temp_max:
             raise HTTPException(
                 status_code=status.HTTP_400_BAD_REQUEST, 
                 detail=f"Temperature Min ({config.temp_min}) cannot be greater than or equal to Max ({config.temp_max})"
             )
        
        if config.humidity_min >= config.humidity_max:
             raise HTTPException(
                 status_code=status.HTTP_400_BAD_REQUEST, 
                 detail=f"Humidity Min ({config.humidity_min}) cannot be greater than or equal to Max ({config.humidity_max})"
             )

        self.db.commit()
        self.db.refresh(config)
        return config

    def delete_config(self, config_id: int):
        config = self.get_config_by_id(config_id)
        self.db.delete(config)
        self.db.commit()
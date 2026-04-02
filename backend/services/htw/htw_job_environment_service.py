import logging
from typing import Optional, List, Dict, Any
from decimal import Decimal

from sqlalchemy.orm import Session
from sqlalchemy import desc
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from fastapi import HTTPException, status

from backend.models.htw.htw_job_environment import HTWJobEnvironment
from backend.models.htw.htw_environment_config import HTWEnvironmentConfig
from backend.schemas.htw.htw_job_environment_schemas import (
    HTWJobEnvironmentCreate,
    HTWJobEnvironmentValidationResponse,
)

logger = logging.getLogger(__name__)

class HTWJobEnvironmentService:
    def __init__(self, db: Session):
        self.db = db

    # ------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------
    def _get_active_config(self) -> HTWEnvironmentConfig:
        """
        Fetches the most recently created environment configuration.
        """
        config = (
            self.db.query(HTWEnvironmentConfig)
            .order_by(desc(HTWEnvironmentConfig.created_at))
            .first()
        )
        if not config:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="No environment configuration found. Please configure system limits first."
            )
        return config

    def _get_by_job_and_stage(
        self,
        job_id: int,
        stage: str,
    ) -> Optional[HTWJobEnvironment]:
        return (
            self.db.query(HTWJobEnvironment)
            .filter(
                HTWJobEnvironment.job_id == job_id,
                HTWJobEnvironment.condition_stage == stage,
            )
            .first()
        )

    # ------------------------------------------------------------
    # Validation (Dynamic based on Config)
    # ------------------------------------------------------------
    def validate_environment_values(
        self,
        temperature: Decimal,
        humidity: Decimal,
        config: HTWEnvironmentConfig,
    ) -> HTWJobEnvironmentValidationResponse:
        
        warnings: List[str] = []

        # Sanity checks
        if temperature <= 0:
            warnings.append(f"Temperature value ({temperature} °C) is zero or negative")
        if humidity <= 0:
            warnings.append(f"Humidity value ({humidity} %) is zero or negative")

        # SAFETY: Ensure config values are Decimals for comparison
        c_temp_min = Decimal(str(config.temp_min))
        c_temp_max = Decimal(str(config.temp_max))
        c_hum_min = Decimal(str(config.humidity_min))
        c_hum_max = Decimal(str(config.humidity_max))

        is_temperature_in_range = c_temp_min <= temperature <= c_temp_max
        is_humidity_in_range = c_hum_min <= humidity <= c_hum_max
        
        is_valid = is_temperature_in_range and is_humidity_in_range

        return HTWJobEnvironmentValidationResponse(
            is_temperature_in_range=is_temperature_in_range,
            is_humidity_in_range=is_humidity_in_range,
            is_valid=is_valid,
            warnings=warnings,
            blocks_job_flow=not is_valid,
            limit_temp_min=c_temp_min,
            limit_temp_max=c_temp_max,
            limit_humidity_min=c_hum_min,
            limit_humidity_max=c_hum_max
        )

    # ------------------------------------------------------------
    # CREATE
    # ------------------------------------------------------------
    def create_environment(
        self,
        job_id: int,
        payload: HTWJobEnvironmentCreate,
    ):
        # 1. Fetch the Active Config (Always use latest for new records)
        active_config = self._get_active_config()

        # 2. Logic: POST requires PRE
        if payload.condition_stage == "POST":
            if not self._get_by_job_and_stage(job_id, "PRE"):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="POST environment cannot be recorded before PRE",
                )

        # 3. Logic: Prevent duplicate PRE / POST
        if self._get_by_job_and_stage(job_id, payload.condition_stage):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"{payload.condition_stage} environment already exists for this job",
            )

        # 4. Validate values using the Active Config
        validation = self.validate_environment_values(
            payload.ambient_temperature,
            payload.relative_humidity,
            config=active_config
        )

        # 5. Block save if invalid (Strict Mode)
        if not validation.is_valid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "message": "Environmental values are outside the acceptable range",
                    "validation": validation.model_dump(),
                },
            )

        try:
            record = HTWJobEnvironment(
                job_id=job_id,
                environment_config_id=active_config.id,
                condition_stage=payload.condition_stage,
                ambient_temperature=payload.ambient_temperature,
                temperature_unit=payload.temperature_unit,
                relative_humidity=payload.relative_humidity,
                humidity_unit=payload.humidity_unit,
            )

            self.db.add(record)
            self.db.commit()
            self.db.refresh(record)

            return record, validation

        except IntegrityError as e:
            self.db.rollback()
            msg = str(e.orig).lower()

            if "unique" in msg:
                detail = f"{payload.condition_stage} environment already exists for this job"
                code = status.HTTP_409_CONFLICT
            elif "foreign key" in msg:
                detail = f"Job ID {job_id} does not exist"
                code = status.HTTP_400_BAD_REQUEST
            else:
                detail = "Integrity constraint violation"
                code = status.HTTP_400_BAD_REQUEST

            raise HTTPException(status_code=code, detail=detail)

        except SQLAlchemyError:
            self.db.rollback()
            logger.exception("Database error while creating environment")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error while creating environment record",
            )

    # ------------------------------------------------------------
    # READ (Updated to match Response Schema Structure)
    # ------------------------------------------------------------
    def get_environment_by_job(
        self,
        job_id: int,
        stage: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Fetches environment records and reconstructs the validation object
        so it matches the HTWJobEnvironmentResponse schema.
        """
        query = self.db.query(HTWJobEnvironment).filter(
            HTWJobEnvironment.job_id == job_id
        )

        if stage:
            query = query.filter(HTWJobEnvironment.condition_stage == stage)

        records = query.order_by(HTWJobEnvironment.recorded_at.desc()).all()
        
        results = []
        for record in records:
            # 1. Determine which config applies (Historical vs Active Fallback)
            config = None
            if record.environment_config_id:
                config = self.db.query(HTWEnvironmentConfig).get(record.environment_config_id)
            
            if not config:
                # Fallback to active if historical config is missing (e.g. deleted or legacy record)
                try:
                    config = self._get_active_config()
                except Exception:
                    # Extreme fallback if even active config is missing (unlikely)
                    # We create a dummy config object to allow read to proceed
                    config = HTWEnvironmentConfig(
                        temp_min=22.0, temp_max=24.0, 
                        humidity_min=50.0, humidity_max=70.0
                    )

            # 2. Re-run validation logic to populate the 'validation' field in response
            validation = self.validate_environment_values(
                record.ambient_temperature,
                record.relative_humidity,
                config
            )

            # 3. Construct the response object structure
            results.append({
                "data": record,
                "validation": validation
            })

        return results
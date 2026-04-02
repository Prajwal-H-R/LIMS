from sqlalchemy.orm import Session
from backend.models import (
    HTWMasterStandard,
    HTWNomenclatureRange,
    HTWStandardUncertaintyReference,
    HTWUnPGMaster,
    HTWPressureGaugeResolution
)
from datetime import date

def deactivate_expired_records(db: Session, browser_date: date):
    # List of model classes to check
    models_to_check = [
        HTWMasterStandard,
        HTWNomenclatureRange,
        HTWStandardUncertaintyReference,
        HTWUnPGMaster,
        HTWPressureGaugeResolution
    ]
    
    affected_tables = []

    for model in models_to_check:
        # 1. Determine which column to check for the date
        if model == HTWMasterStandard:
            date_column = model.calibration_valid_upto
        else:
            date_column = model.valid_upto

        # 2. Perform the update (Maintain data integrity)
        # We still update only those that are currently True to False
        updated_count = db.query(model).filter(
            date_column < browser_date,
            model.is_active == True
        ).update(
            {model.is_active: False},
            synchronize_session=False
        )

        # 3. Determine if table should be listed
        # If we updated records, we definitely know the table had expired entries.
        if updated_count > 0:
            affected_tables.append(model.__tablename__)
        else:
            # If nothing was updated, it might be because they were ALREADY inactive.
            # We check if ANY record exists with an expired date.
            record_exists = db.query(model).filter(
                date_column < browser_date
            ).first()
            
            if record_exists:
                affected_tables.append(model.__tablename__)

    db.commit()

    return affected_tables
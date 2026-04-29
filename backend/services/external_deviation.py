from sqlalchemy.orm import Session, joinedload # Added joinedload
from typing import List, Optional

from ..models import external_deviation as models
from ..schemas import external_deviation as schemas

# --- GET (Read) Operations ---

def get_external_deviation(db: Session, deviation_id: int) -> Optional[models.ExternalDeviation]:
    """
    Retrieves a single record WITH attachments.
    """
    return db.query(models.ExternalDeviation)\
             .options(joinedload(models.ExternalDeviation.attachments))\
             .filter(models.ExternalDeviation.id == deviation_id)\
             .first()


def get_external_deviations(
    db: Session, 
    inward_eqp_id: Optional[int] = None, 
    skip: int = 0, 
    limit: int = 100
) -> List[models.ExternalDeviation]:
    """
    Retrieves a list of records WITH attachments.
    """
    # Start with the base query and EAGERLY LOAD attachments
    query = db.query(models.ExternalDeviation).options(joinedload(models.ExternalDeviation.attachments))
    
    if inward_eqp_id is not None:
        query = query.filter(models.ExternalDeviation.inward_eqp_id == inward_eqp_id)
        
    return query.offset(skip).limit(limit).all()


# --- POST (Create) Operation ---

def create_external_deviation(db: Session, deviation: schemas.ExternalDeviationCreate) -> models.ExternalDeviation:
    db_deviation = models.ExternalDeviation(**deviation.dict())
    db.add(db_deviation)
    db.commit()
    
    # After commit, fetch it back using the ID to include the attachments list (even if empty)
    return get_external_deviation(db, db_deviation.id)

# --- PATCH (Update) Operation ---

def update_external_deviation(
    db: Session, deviation_id: int, deviation_update: schemas.ExternalDeviationUpdate
) -> Optional[models.ExternalDeviation]:
    db_deviation = db.query(models.ExternalDeviation).filter(models.ExternalDeviation.id == deviation_id).first()
    if not db_deviation:
        return None

    update_data = deviation_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_deviation, key, value)
        
    db.add(db_deviation)
    db.commit()
    
    # Return the updated record with attachments loaded
    return get_external_deviation(db, deviation_id)

# --- DELETE Operation ---

def delete_external_deviation(db: Session, deviation_id: int) -> Optional[models.ExternalDeviation]:
    db_deviation = get_external_deviation(db, deviation_id)
    if not db_deviation:
        return None
        
    db.delete(db_deviation)
    db.commit()
    return db_deviation
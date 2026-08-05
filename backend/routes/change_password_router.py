# backend/routes/change_password_router.py
#
# Dependencies:
#   - Requires the ChangePasswordRequest schema in backend/schemas/change_password_schemas.py
#   - Requires the change_password service in backend/services/change_password_service.py
#   - DB columns: users.user_id, users.password_hash
#   - Must be registered in main.py via app.include_router

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.auth import get_current_user
from backend.db import get_db
from backend.schemas.change_password_schemas import ChangePasswordRequest
from backend.schemas.user_schemas import UserResponse
from backend.services.change_password_service import change_password
from backend.services.user_services import get_user_by_id

router = APIRouter(prefix="/users", tags=["Authentication & Users"])


@router.post("/me/change-password")
def change_my_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Allows the authenticated user to change their password."""
    user = get_user_by_id(db, current_user.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return change_password(db, user, payload)

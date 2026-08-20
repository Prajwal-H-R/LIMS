# backend/services/change_password_service.py
#
# Dependencies:
#   - DB columns: users.password_hash, users.updated_at
#   - Python: passlib (bcrypt), re
#   - Env: none beyond existing JWT/security config
#   - Imports: backend.core.security.hash_password, backend.core.security.LOCAL_TIMEZONE

import re
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session
from passlib.context import CryptContext

from backend.models.users import User
from backend.schemas.change_password_schemas import ChangePasswordRequest
from backend.core.security import LOCAL_TIMEZONE, hash_password

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def change_password(
    db: Session,
    user: User,
    payload: ChangePasswordRequest,
) -> dict:
    current = payload.current_password.strip()
    new_pw = payload.new_password.strip()

    if not current:
        raise HTTPException(status_code=400, detail="Current password is required.")
    if not new_pw:
        raise HTTPException(status_code=400, detail="New password cannot be empty.")
    if len(new_pw) < 8:
        raise HTTPException(
            status_code=400, detail="New password must be at least 8 characters."
        )
    if not re.search(r'[A-Za-z]', new_pw) or not re.search(r'[0-9]', new_pw):
        raise HTTPException(
            status_code=400,
            detail="New password must contain at least one letter and one number.",
        )
    if not verify_password(current, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    if verify_password(new_pw, user.password_hash):
        raise HTTPException(
            status_code=400, detail="New password must be different from current password."
        )

    user.password_hash = hash_password(new_pw)
    user.updated_at = datetime.now(LOCAL_TIMEZONE)
    db.commit()
    db.refresh(user)

    return {"message": "Password changed successfully."}

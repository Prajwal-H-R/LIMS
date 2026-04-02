# backend/services/user_services.py

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from passlib.context import CryptContext
from datetime import datetime

from backend.models.users import User
from backend.models.customers import Customer
from typing import List, Optional

from backend.schemas.user_schemas import (
    AdminUserUpdateRequest,
    UserProfileUpdateRequest,
    UserResponse,
)
from backend.core.security import LOCAL_TIMEZONE, hash_password
from backend.services.token_service import revoke_refresh_tokens_for_user
# Import for the purpose of full structure, although not directly used here
from fastapi.security import OAuth2PasswordRequestForm 


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plaintext password against a bcrypt hash."""
    return pwd_context.verify(plain_password, hashed_password)

# --- Primary Authentication Service (Used by JWT Login Route) ---
def authenticate_user(db: Session, username: str, password: str) -> Optional[User]:
    """
    Authenticates a user by username (email) and password.
    Returns the User ORM object on success, or None on failure.
    """
    # Note: Using 'username' here corresponds to the email in your database/User model.
    user = db.query(User).filter(User.email == username).first()

    # Reason 1 for failure: User does not exist.
    if not user:
        return None

    # Reason 2 for failure: Password does not match or the hash is missing.
    if not user.password_hash or not verify_password(password, user.password_hash):
        return None

    # Reason 3 for failure: User is marked as inactive.
    if not user.is_active:
        return None 

    # If all checks pass, authentication is successful.
    return user


# --- Helper Services ---

def get_all_users(db: Session) -> List[User]:
    """Retrieves all users from the database."""
    return db.query(User).all()

def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
    """Retrieves a user by their ID."""
    return db.query(User).filter(User.user_id == user_id).first()


def get_user_by_id_with_customer(db: Session, user_id: int) -> Optional[User]:
    """User row with customer relationship loaded (for profile read/update)."""
    stmt = (
        select(User)
        .options(selectinload(User.customer))
        .where(User.user_id == user_id)
    )
    return db.scalars(stmt).first()


def user_orm_to_response(user: User) -> UserResponse:
    """Map User ORM (+ optional customer) to API UserResponse."""
    r = UserResponse.model_validate(user)
    if user.customer:
        r.customer_details = user.customer.customer_details
        r.contact_person = user.customer.contact_person
        r.phone = user.customer.phone
        r.ship_to_address = user.customer.ship_to_address
        r.bill_to_address = user.customer.bill_to_address
    return r


def update_own_profile(
    db: Session,
    user: User,
    payload: UserProfileUpdateRequest,
) -> User:
    """
    Apply self-service profile fields. Email is never modified here.
    Customer org fields only apply when user.customer is present.
    """
    data = payload.model_dump(exclude_unset=True)
    role_lower = (user.role or "").lower()

    if "username" in data and data["username"] is not None:
        new_username = (data["username"] or "").strip()
        if not new_username:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username cannot be empty.",
            )
        taken = (
            db.query(User)
            .filter(User.username == new_username, User.user_id != user.user_id)
            .first()
        )
        if taken:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This username is already in use.",
            )
        user.username = new_username

    if "full_name" in data:
        user.full_name = data["full_name"]

    if role_lower == "customer" and user.customer_id and user.customer:
        cust: Customer = user.customer
        for key in ("contact_person", "phone"):
            if key not in data:
                continue
            raw = data[key]
            if raw is None:
                setattr(cust, key, None)
            else:
                stripped = str(raw).strip()
                setattr(cust, key, stripped or None)

        for key in ("ship_to_address", "bill_to_address"):
            if key not in data:
                continue
            raw = data[key]
            if raw is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"{key.replace('_', ' ').title()} cannot be empty.",
                )
            stripped = str(raw).strip()
            if not stripped:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"{key.replace('_', ' ').title()} cannot be empty.",
                )
            setattr(cust, key, stripped)

    current_password = data.get("current_password")
    new_password = data.get("new_password")
    wants_password_change = current_password is not None or new_password is not None
    if wants_password_change:
        current_password_str = (current_password or "").strip()
        new_password_str = (new_password or "").strip()
        if not current_password_str:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is required to change password.",
            )
        if not new_password_str:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password cannot be empty.",
            )
        if len(new_password_str) < 8:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password must be at least 8 characters.",
            )
        if not verify_password(current_password_str, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect.",
            )
        user.password_hash = hash_password(new_password_str)

    user.updated_at = datetime.now(LOCAL_TIMEZONE)
    db.commit()
    db.refresh(user)
    if user.customer:
        db.refresh(user.customer)
    return user


def admin_update_user_by_id(
    db: Session,
    target_user_id: int,
    payload: AdminUserUpdateRequest,
) -> User:
    """Apply admin-controlled user + customer record updates."""
    user = get_user_by_id_with_customer(db, target_user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    data = payload.model_dump(exclude_unset=True)

    if "email" in data and data["email"] is not None:
        new_email = str(data["email"]).strip().lower()
        if not new_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email cannot be empty.",
            )
        taken = (
            db.query(User)
            .filter(User.email == new_email, User.user_id != user.user_id)
            .first()
        )
        if taken:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Another account already uses this email.",
            )
        user.email = new_email

    if "username" in data and data["username"] is not None:
        new_username = (data["username"] or "").strip()
        if not new_username:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username cannot be empty.",
            )
        taken = (
            db.query(User)
            .filter(User.username == new_username, User.user_id != user.user_id)
            .first()
        )
        if taken:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This username is already in use.",
            )
        user.username = new_username

    if "full_name" in data:
        user.full_name = data["full_name"]

    role_lower = (user.role or "").lower()
    if role_lower == "customer" and user.customer_id and user.customer:
        cust: Customer = user.customer
        for key in ("contact_person", "phone"):
            if key not in data:
                continue
            raw = data[key]
            if raw is None:
                setattr(cust, key, None)
            else:
                setattr(cust, key, str(raw).strip() or None)

        for key in ("customer_details", "ship_to_address", "bill_to_address"):
            if key not in data:
                continue
            raw = data[key]
            if raw is None or not str(raw).strip():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"{key.replace('_', ' ').title()} cannot be empty.",
                )
            setattr(cust, key, str(raw).strip())

    user.updated_at = datetime.now(LOCAL_TIMEZONE)
    db.commit()
    db.refresh(user)
    if user.customer:
        db.refresh(user.customer)
    return user


def set_user_active_status(db: Session, user_id: int, is_active: bool) -> User:
    """Enable or disable a user account."""
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found."
        )

    if user.is_active == is_active:
        return user

    user.is_active = is_active
    db.commit()
    db.refresh(user)

    # Revoke active refresh tokens so the user must re-authenticate.
    revoke_refresh_tokens_for_user(db, user_id=user.user_id)

    return user

# --- Legacy/Mock Token Service (To be replaced by JWT decoding) ---
def get_current_user_id(token: Optional[str] = None) -> int:
    """
    Placeholder dependency to extract the user ID from a mock token (MOCK_TOKEN_{role}_{id}).
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Token missing."
        )
    
    # MOCK: Extract user ID from the mock token string
    try:
        parts = token.split('_')
        user_id = int(parts[-1])
        return user_id
    except:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token format."
        )
# backend/routers/users.py

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session, selectinload 
from sqlalchemy import select

from backend.auth import get_current_user
from backend.core import security
from backend.core.security import LOCAL_TIMEZONE
from backend.core.config import settings
from ..db import get_db

# Import User and Customer Models
from backend.models.users import User 
from backend.models.customers import Customer # <--- Added this import

from backend.schemas.user_schemas import (
    AdminUserUpdateRequest,
    CurrentUserResponse,
    LoginResponse,
    LogoutRequest,
    RefreshTokenRequest,
    TokenRefreshResponse,
    UserListResponse,
    UserResponse,
    UserProfileUpdateRequest,
    UserStatusUpdateRequest,
    BatchCustomerUserStatusRequest, # <--- Added this import
)
from backend.services import token_service
from backend.services.email_services import send_welcome_email
from backend.services.user_services import (
    admin_update_user_by_id,
    authenticate_user,
    get_all_users,
    get_user_by_id,
    get_user_by_id_with_customer,
    set_user_active_status,
    update_own_profile,
    user_orm_to_response,
)
from backend.core.email import send_email_with_logging

router = APIRouter(
    prefix="/users",
    tags=["Authentication & Users"]
)


@router.post("/login", response_model=LoginResponse, status_code=status.HTTP_200_OK)
def login(
    background_tasks: BackgroundTasks,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """
    Authenticates a user, returns a JWT token, and sends a welcome email on first login.
    """
    user = authenticate_user(db, form_data.username, form_data.password)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if this is the user's first login
    now_local = datetime.now(LOCAL_TIMEZONE)
    user_created_at = user.created_at
    if user_created_at is not None:
        if user_created_at.tzinfo is None:
            user_created_at = user_created_at.replace(tzinfo=LOCAL_TIMEZONE)
        else:
            user_created_at = user_created_at.astimezone(LOCAL_TIMEZONE)
    is_first_login = (
        user_created_at and 
        user_created_at > now_local - timedelta(days=1) and
        user.updated_at is None
    )

    access_token_data = {
        "user_id": user.user_id,
        "sub": str(user.user_id), # 'sub' (subject) is often the user_id or username
        "email": user.email,
        "role": user.role,
        "customer_id": user.customer_id
    }

    access_token = security.create_access_token(data=access_token_data)

    refresh_token_payload = {
        "user_id": user.user_id,
        "sub": str(user.user_id),
        "email": user.email,
        "type": "refresh",
    }
    refresh_token = security.create_refresh_token(refresh_token_payload)

    token_service.create_refresh_token_record(
        db,
        user_id=user.user_id,
        token=refresh_token,
    )

    if is_first_login:
        background_tasks.add_task(
            send_welcome_email,
            email=user.email,
            name=user.full_name or user.username,
            role=user.role
        )
        
        user.updated_at = datetime.now(LOCAL_TIMEZONE)
        db.commit()

    return LoginResponse(
        user_id=user.user_id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        customer_id=user.customer_id,
        is_active=user.is_active,
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=security.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.get("/me", response_model=CurrentUserResponse)
def read_current_user(current_user: UserResponse = Depends(get_current_user)):
    """Returns currently authenticated user details."""
    current_user.token = None 
    return current_user


@router.patch("/me/profile", response_model=UserResponse)
async def update_my_profile(
    payload: UserProfileUpdateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Self-service profile updates. For customers, notify all admins by email."""
    user = get_user_by_id_with_customer(db, current_user.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    before = user_orm_to_response(user)
    updated = update_own_profile(db, user, payload)
    result = user_orm_to_response(updated)

    if (updated.role or "").lower() == "customer":
        changed_fields: list[str] = []
        if before.username != result.username:
            changed_fields.append(f"Username: '{before.username}' -> '{result.username}'")
        if (before.full_name or "") != (result.full_name or ""):
            changed_fields.append(f"Full Name: '{before.full_name or '-'}' -> '{result.full_name or '-'}'")
        if (before.contact_person or "") != (result.contact_person or ""):
            changed_fields.append(f"Contact Person: '{before.contact_person or '-'}' -> '{result.contact_person or '-'}'")
        if (before.phone or "") != (result.phone or ""):
            changed_fields.append(f"Phone: '{before.phone or '-'}' -> '{result.phone or '-'}'")
        if (before.ship_to_address or "") != (result.ship_to_address or ""):
            changed_fields.append("Ship To Address was updated")
        if (before.bill_to_address or "") != (result.bill_to_address or ""):
            changed_fields.append("Bill To Address was updated")

        if changed_fields:
            target_users = (
                db.query(User)
                .filter(User.role.in_(["admin", "engineer"]), User.is_active == True)
                .all()
            )
            admin_link = f"{settings.FRONTEND_URL}/admin/dashboard"
            customer_name = result.full_name or result.username
            customer_company = (result.customer_details or "").strip() or "Unknown Company"
            for target_user in target_users:
                await send_email_with_logging(
                    background_tasks=background_tasks,
                    subject=f"Profile update by customer: {customer_name} (Company: {customer_company})",
                    recipient=target_user.email,
                    template_name="profile_update_admin_notification.html",
                    template_body={
                        "title": "Customer Profile Updated",
                        "customer_full_name": customer_name,
                        "customer_company": customer_company,
                        "changed_fields": changed_fields,
                        "admin_user_management_link": admin_link,
                    },
                    db=db,
                    recipient_user_id=target_user.user_id,
                    created_by="profile_update",
                    body_text_override=f"Company: {customer_company} | Customer profile updated: {', '.join(changed_fields)}",
                )

    return result


@router.put("/{user_id}", response_model=UserResponse)
def admin_update_user(
    user_id: int,
    payload: AdminUserUpdateRequest,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Admin updates user profile details."""
    if current_user.role.lower() != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Must be an administrator."
        )
    updated_user = admin_update_user_by_id(db, target_user_id=user_id, payload=payload)
    return user_orm_to_response(updated_user)


@router.get("", response_model=UserListResponse)
def get_all_users_list(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Returns a list of all users with Customer Details. Requires Admin privileges."""
    if current_user.role.lower() != 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Must be an administrator."
        )

    # Fetch users and eager load customer details
    stmt = (
        select(User)
        .options(selectinload(User.customer)) 
        .order_by(User.user_id)
    )
    users = db.scalars(stmt).all()
    
    # Map full user + customer profile fields for admin edit prefill
    user_responses = [user_orm_to_response(u) for u in users]

    return UserListResponse(users=user_responses)


@router.patch("/{user_id}/status", response_model=UserResponse)
def update_user_status(
    user_id: int,
    payload: UserStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Allow administrators to activate or deactivate user accounts."""
    if current_user.role.lower() != 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Must be an administrator."
        )

    if current_user.user_id == user_id and not payload.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own account."
        )

    updated_user = set_user_active_status(db, user_id=user_id, is_active=payload.is_active)
    return UserResponse.from_orm(updated_user)


# --- NEW ENDPOINT: Batch Update Status by Customer ---
@router.post("/batch-status-by-customer")
def update_users_status_by_customer(
    payload: BatchCustomerUserStatusRequest,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Updates the is_active status for ALL users associated with a specific company name.
    """
    if current_user.role.lower() != 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Must be an administrator."
        )

    # 1. Find the customer IDs that match the string name
    customer_subquery = select(Customer.customer_id).where(Customer.customer_details == payload.customer_details)
    
    # 2. Update Users linked to those customers
    # We prevent deactivating the current admin if they belong to that company (safety check)
    stmt = (
        select(User)
        .where(User.customer_id.in_(customer_subquery))
        .where(User.user_id != current_user.user_id) 
    )
    
    users_to_update = db.scalars(stmt).all()
    
    if not users_to_update:
        return {"message": "No users found for this company", "updated_count": 0}

    count = 0
    for user in users_to_update:
        user.is_active = payload.is_active
        count += 1
    
    db.commit()
    
    return {
        "message": f"Successfully {'activated' if payload.is_active else 'deactivated'} {count} users.",
        "updated_count": count
    }


@router.post("/logout")
def logout(
    payload: LogoutRequest,
    db: Session = Depends(get_db),
):
    """Revoke the provided refresh token."""
    token_record = token_service.get_refresh_token_by_token(db, payload.refresh_token)

    if token_record:
        token_service.revoke_refresh_token(db, token_record=token_record)

    return JSONResponse(
        content={"message": "Logout successful. Client should discard token."},
        status_code=status.HTTP_200_OK,
    )


@router.post("/refresh", response_model=TokenRefreshResponse)
def refresh_access_token(
    payload: RefreshTokenRequest,
    db: Session = Depends(get_db),
):
    """Exchange a valid refresh token for a new access/refresh token pair."""
    token_record = token_service.get_refresh_token_by_token(db, payload.refresh_token)

    if not token_record or token_record.is_revoked:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    current_utc = datetime.now(timezone.utc)

    # Ensure both datetimes are comparable (handle DB returning timezone-aware)
    expiry = token_record.expiry_time
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)

    if expiry < current_utc:
        token_service.revoke_refresh_token(db, token_record=token_record)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload_data = security.decode_refresh_token(payload.refresh_token)
    except security.InvalidTokenError:
        token_service.revoke_refresh_token(db, token_record=token_record)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload_data.get("user_id") or payload_data.get("sub")

    try:
        user_id = int(user_id)
    except (ValueError, TypeError):
        token_service.revoke_refresh_token(db, token_record=token_record)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token subject.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = get_user_by_id(db, user_id)
    if not user or not user.is_active:
        token_service.revoke_refresh_token(db, token_record=token_record)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_data = {
        "user_id": user.user_id,
        "sub": str(user.user_id),
        "email": user.email,
        "role": user.role,
        "customer_id": user.customer_id,
    }
    access_token = security.create_access_token(access_token_data)

    new_refresh_payload = {
        "user_id": user.user_id,
        "sub": str(user.user_id),
        "email": user.email,
        "type": "refresh",
    }
    new_refresh_token = security.create_refresh_token(new_refresh_payload)
    token_service.revoke_refresh_token(db, token_record=token_record, commit=False)
    new_token_record = token_service.create_refresh_token_record(
        db,
        user_id=user.user_id,
        token=new_refresh_token,
        commit=False,
    )
    db.commit()
    db.refresh(new_token_record)

    return TokenRefreshResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        expires_in=security.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
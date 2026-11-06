# backend/schemas/user_schemas.py

from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Optional, List
from datetime import datetime

# ====================================================================
# BASE SCHEMAS FOR JWT & INTERNAL DEPENDENCIES
# ====================================================================

class TokenData(BaseModel):
    user_id: Optional[int] = None
    sub: Optional[EmailStr] = None

class User(BaseModel):
    user_id: int
    email: EmailStr
    role: str
    is_active: bool
    email_notifications_enabled: bool = True

    model_config = ConfigDict(from_attributes=True)

class UserStatsResponse(BaseModel):
    total_users: int
    active_users: int
    inactive_users: int
    admin_users: int
    engineer_users: int
    customer_users: int

# ====================================================================
# REQUEST SCHEMAS
# ====================================================================

class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str

# --- Token exchange schemas ---
class LoginResponse(BaseModel):
    user_id: int
    username: str
    email: EmailStr
    full_name: Optional[str] = None
    role: str
    customer_id: Optional[int] = None
    is_active: bool
    email_notifications_enabled: bool = True
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int

class RefreshTokenRequest(BaseModel):
    refresh_token: str

class TokenRefreshResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int

class LogoutRequest(BaseModel):
    refresh_token: str

class UserStatusUpdateRequest(BaseModel):
    is_active: bool

class UserNotificationPreferenceUpdateRequest(BaseModel):
    """Request body for a user's own email-notification preference."""
    email_notifications_enabled: bool

class UserProfileUpdateRequest(BaseModel):
    username: Optional[str] = None
    full_name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    ship_to_address: Optional[str] = None
    bill_to_address: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None

class AdminUserUpdateRequest(BaseModel):
    email: Optional[EmailStr] = None
    email_notifications_enabled: Optional[bool] = None
    username: Optional[str] = None
    full_name: Optional[str] = None
    location_name: Optional[str] = None
    customer_details: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    ship_to_address: Optional[str] = None
    bill_to_address: Optional[str] = None

# --- NEW: Schema for Batch Company Update ---
class BatchCustomerUserStatusRequest(BaseModel):
    customer_details: str
    is_active: bool

# -------------------- InvitationRequest --------------------
class InvitationRequest(BaseModel):
    email: EmailStr
    role: str
    invited_name: Optional[str] = None
    location_name: Optional[str] = None
    company_name: Optional[str] = None
    company_address: Optional[str] = None
    phone_number: Optional[str] = None
    customer_id: Optional[int] = None
    ship_to_address: Optional[str] = None
    bill_to_address: Optional[str] = None
    # Controls whether to send the one-time invitation email.
    # Defaults to True to preserve existing behavior.
    send_invitation_email: bool = False

# ====================================================================
# RESPONSE SCHEMAS
# ====================================================================

class UserResponse(BaseModel):
    user_id: int
    username: str
    email: EmailStr
    full_name: Optional[str] = None
    role: str
    customer_id: Optional[int] = None

    # Customer/company fields used by the frontend for grouping and profiles.
    customer_details: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    ship_to_address: Optional[str] = None
    bill_to_address: Optional[str] = None
    location_name: Optional[str] = None

    is_active: bool
    email_notifications_enabled: bool = True
    created_at: datetime
    updated_at: Optional[datetime] = None
    token: Optional[str] = None
    refresh_token: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class CurrentUserResponse(UserResponse):
    pass

class UserListResponse(BaseModel):
    users: List[UserResponse]

class UserListPaginatedResponse(BaseModel):
    total_count: int
    users: List[UserResponse]

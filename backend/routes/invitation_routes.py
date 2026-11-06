# backend/routes/invitation_routes.py

from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException, status
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.schemas.user_schemas import InvitationRequest, UserResponse
from backend.services.invitation_service import InvitationService
from backend.auth import get_current_user


router = APIRouter(
    prefix="/invitations",
    tags=["Invitations"]
)


# ====================================================================
# CREATE NEW INVITATION
# ====================================================================

@router.post("/send", response_model=dict)
async def send_invitation(
    invitation_request: InvitationRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Create a new user invitation.

    The user and invitation records are always created.
    The send_invitation_email flag controls whether the
    invitation email is sent.

    Only active authenticated users can send invitations.
    """

    invitation_service = InvitationService(db)

    try:
        result = await invitation_service.create_invitation(
            email=invitation_request.email,
            role=invitation_request.role,
            invited_name=invitation_request.invited_name,
            company_name=invitation_request.company_name,
            location_name=invitation_request.location_name,
            ship_to_address=invitation_request.ship_to_address,
            bill_to_address=invitation_request.bill_to_address,
            phone_number=invitation_request.phone_number,
            created_by=current_user.user_id,
            background_tasks=background_tasks,
            customer_id=invitation_request.customer_id,
            send_invitation_email=invitation_request.send_invitation_email
        )

        return result

    except HTTPException:
        raise


# ====================================================================
# RESEND EXISTING INVITATION
# ====================================================================

@router.post("/resend/{user_id}", response_model=dict)
async def resend_invitation(
    user_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Resend an invitation email for an existing user.

    This endpoint is used by the Resend Invitation option
    in the Admin User Management table.

    Only administrators can resend invitations.
    """

    # Only administrators can resend invitations.
    if current_user.role.lower() != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Must be an administrator."
        )

    invitation_service = InvitationService(db)

    try:
        result = await invitation_service.resend_invitation(
            user_id=user_id,
            background_tasks=background_tasks,
            created_by=current_user.user_id
        )

        return result

    except HTTPException:
        raise


# ====================================================================
# ACCEPT INVITATION
# ====================================================================

@router.post("/accept", response_model=UserResponse)
async def accept_invitation(
    token: str,
    new_password: str,
    db: Session = Depends(get_db)
):
    """
    Accept an invitation using the token and set a new password.
    """

    invitation_service = InvitationService(db)

    try:
        user = await invitation_service.accept_invitation(
            token=token,
            new_password=new_password
        )

        return user

    except HTTPException:
        raise
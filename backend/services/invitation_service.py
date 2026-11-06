from fastapi import HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from typing import Optional

from backend.models.users import User
from backend.models.customers import Customer
from backend.models.invitations import Invitation
from backend.core.security import hash_password, create_invitation_token
from backend.services.password_service import generate_secure_password
from backend.core.email import send_general_invitation_email, UserRole
from backend.schemas.user_schemas import UserResponse


class InvitationService:
    def __init__(self, db: Session):
        self.db = db

    async def create_invitation(
        self,
        email: str,
        role: str,
        created_by: int,
        background_tasks: BackgroundTasks,
        user_full_name: Optional[str] = None,
        invited_name: Optional[str] = None,
        company_name: Optional[str] = None,
        location_name: Optional[str] = None,
        ship_to_address: Optional[str] = None,
        bill_to_address: Optional[str] = None,
        phone_number: Optional[str] = None,
        customer_id: Optional[int] = None,
        send_invitation_email: bool = True
    ) -> dict:
        """
        Creates a new user invitation with a secure temporary password.

        Also creates the user record immediately so login works.

        Handles branching logic for staff/engineer/admin vs. customer roles.
        Supports multiple locations for the same company name.

        Invitation email behavior:
        - True: Creates the user and invitation, then queues the invitation email.
        - False: Creates the user and invitation without sending an email
                 or creating an email notification record.
        """

        # 1. Check if user already exists.
        existing_user = (
            self.db.query(User)
            .filter(User.email == email)
            .first()
        )

        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User with this email already exists"
            )

        # 2. Check for existing unused invitation.
        existing_invitation = (
            self.db.query(Invitation)
            .filter(
                Invitation.email == email,
                Invitation.used_at.is_(None),
                Invitation.expires_at > datetime.utcnow()
            )
            .first()
        )

        if existing_invitation:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Active invitation already exists for this email"
            )

        # 3. Normalize role to lowercase for consistent enum matching.
        normalized_role = role.lower()

        if normalized_role not in [
            role_enum.value for role_enum in UserRole
        ]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Invalid role '{role}'. Must be one of: "
                    f"{', '.join([role_enum.value for role_enum in UserRole])}"
                )
            )

        # Resolve the invited user's name.
        resolved_user_full_name = user_full_name or invited_name

        # 4. Handle customer creation/linking for CUSTOMER role.
        if normalized_role == UserRole.CUSTOMER.value:

            if not customer_id:

                if not company_name or not ship_to_address or not invited_name:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Missing required fields"
                    )

                # Search customer_details using company name.
                # Match the requested branch/location when provided.
                query = self.db.query(Customer).filter(
                    func.lower(Customer.customer_details)
                    == company_name.strip().lower()
                )

                if location_name:
                    query = query.filter(
                        func.lower(Customer.location_name)
                        == location_name.strip().lower()
                    )
                else:
                    query = query.filter(
                        Customer.location_name.is_(None)
                    )

                existing_customer = query.first()

                if existing_customer:
                    customer_id = existing_customer.customer_id

                else:
                    # Create a new branch/location for this company.
                    customer = Customer(
                        customer_details=company_name.strip(),
                        location_name=(
                            location_name.strip()
                            if location_name else None
                        ),
                        contact_person=invited_name,
                        phone=phone_number,
                        email=email,
                        ship_to_address=ship_to_address,
                        bill_to_address=bill_to_address or ship_to_address,
                        is_active=True
                    )

                    self.db.add(customer)
                    self.db.flush()

                    customer_id = customer.customer_id

            # Link found/created customer ID.
            resolved_user_full_name = invited_name

        # 5. Generate secure password and invitation token.
        temp_password = generate_secure_password()
        temp_password_hash = hash_password(temp_password)
        invitation_token = create_invitation_token()

        # 6. Generate a unique username.
        username = email.split("@")[0]
        counter = 1
        original_username = username

        while (
            self.db.query(User)
            .filter(User.username == username)
            .first()
        ):
            username = f"{original_username}{counter}"
            counter += 1

        # 7. Create user immediately.
        user = User(
            username=username,
            email=email,
            full_name=resolved_user_full_name,
            password_hash=temp_password_hash,
            role=normalized_role,
            customer_id=customer_id,
            is_active=True,
            email_notifications_enabled=True
        )

        self.db.add(user)

        # 8. Create invitation record.
        invitation = Invitation(
            email=email,
            token=invitation_token,
            user_role=normalized_role,
            invited_name=resolved_user_full_name,
            temp_password_hash=temp_password_hash,
            expires_at=datetime.utcnow() + timedelta(hours=48),
            created_by=created_by,
            customer_id=customer_id
        )

        self.db.add(invitation)

        # 9. Commit user and invitation records.
        # This happens regardless of the email toggle.
        self.db.commit()

        self.db.refresh(invitation)
        self.db.refresh(user)

        # 10. Send role-specific invitation email only when enabled.
        # When disabled, the email helper is not called at all.
        if send_invitation_email:

            email_queued = await send_general_invitation_email(
                background_tasks=background_tasks,
                email=email,
                name=resolved_user_full_name or username,
                role=UserRole(normalized_role),
                temporary_password=temp_password,
                token=invitation_token,
                expires_hours=48,
                db=self.db,
                created_by=created_by,
                recipient_user_id=user.user_id
            )

            if not email_queued:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=(
                        "User and invitation were created, but the "
                        "invitation email could not be queued."
                    )
                )

            response_message = (
                "Invitation sent and user created successfully"
            )

        else:

            response_message = (
                "User created and invitation record saved successfully. "
                "Invitation email was not sent."
            )

        return {
            "message": response_message,
            "email": email,
            "role": normalized_role,
            "expires_at": invitation.expires_at,
            "invitation_email_sent": send_invitation_email
        }

       # =================================================================
    # RESEND EXISTING INVITATION
    # =================================================================

    async def resend_invitation(
        self,
        user_id: int,
        background_tasks: BackgroundTasks,
        created_by: int
    ) -> dict:
        """
        Resend an invitation for an existing user.

        Important password handling:
        - Generate a fresh temporary password.
        - Hash that exact password.
        - Save the same hash in users.password_hash.
        - Save the same hash in invitations.temp_password_hash.
        - Send the corresponding plaintext password in the email.
        - Verify that the saved hash accepts the generated password.

        No new user or invitation record is created.
        """

        # 1. Find the existing user.
        user = (
            self.db.query(User)
            .filter(User.user_id == user_id)
            .first()
        )

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found."
            )

        # 2. Do not resend invitations to inactive accounts.
        # Login authentication rejects inactive users.
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "This user account is inactive. "
                    "Activate the account before resending the invitation."
                )
            )

        # 3. Validate the role.
        normalized_role = (user.role or "").lower()

        if normalized_role not in [
            role_enum.value for role_enum in UserRole
        ]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid user role: {user.role}"
            )

        # 4. Check email-notification preference.
        if not user.email_notifications_enabled:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Email notifications are disabled for this user. "
                    "Enable email notifications before resending the invitation."
                )
            )

        # 5. Find existing unused invitations.
        # Include expired invitations because they can be renewed.
        pending_invitations = (
            self.db.query(Invitation)
            .filter(
                func.lower(Invitation.email) == user.email.lower(),
                Invitation.used_at.is_(None)
            )
            .order_by(Invitation.created_at.desc())
            .all()
        )

        if not pending_invitations:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    "No pending invitation found for this user. "
                    "The invitation may already have been accepted."
                )
            )

        # Reuse the latest existing invitation.
        invitation = pending_invitations[0]

        # 6. Preserve the existing credentials in case email queuing fails.
        old_user_password_hash = user.password_hash

        old_invitation_values = {
            "token": invitation.token,
            "temp_password_hash": invitation.temp_password_hash,
            "expires_at": invitation.expires_at,
            "user_role": invitation.user_role,
            "invited_name": invitation.invited_name,
            "customer_id": invitation.customer_id,
        }

        old_expiry_values = {
            old_invitation.id: old_invitation.expires_at
            for old_invitation in pending_invitations
        }

        # 7. Generate a new temporary password and token.
        new_temporary_password = generate_secure_password()

        # Generate the hash only once.
        # This exact hash is saved in both tables.
        new_password_hash = hash_password(new_temporary_password)

        new_invitation_token = create_invitation_token()

        current_time = datetime.utcnow()
        new_expiry = current_time + timedelta(hours=48)

        # 8. Update the existing user's password.
        user.password_hash = new_password_hash

        # 9. Update the existing invitation record.
        invitation.token = new_invitation_token
        invitation.temp_password_hash = new_password_hash
        invitation.expires_at = new_expiry
        invitation.user_role = normalized_role
        invitation.invited_name = user.full_name
        invitation.customer_id = user.customer_id

        # Expire any other unused invitation records for this email.
        for old_invitation in pending_invitations[1:]:
            old_invitation.expires_at = current_time

        self.db.add(user)
        self.db.add(invitation)

        try:
            # 10. Save the new credentials.
            self.db.commit()

            self.db.refresh(user)
            self.db.refresh(invitation)

            # 11. Verify the saved password hash.
            # Uses the same bcrypt verification mechanism as authentication.
            from backend.core.security import verify_password

            password_matches = verify_password(
                new_temporary_password,
                user.password_hash
            )

            if not password_matches:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=(
                        "The new temporary password could not be verified "
                        "against the saved user password."
                    )
                )

            # 12. Send the exact same plaintext password whose hash
            # has been saved in users.password_hash.
            email_queued = await send_general_invitation_email(
                background_tasks=background_tasks,
                email=user.email,
                name=user.full_name or user.username,
                role=UserRole(normalized_role),
                temporary_password=new_temporary_password,
                token=new_invitation_token,
                expires_hours=48,
                db=self.db,
                created_by=created_by,
                recipient_user_id=user.user_id
            )

            if not email_queued:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=(
                        "The invitation email could not be queued. "
                        "The previous password and invitation credentials "
                        "have been restored."
                    )
                )

            return {
                "message": (
                    f"Invitation email queued successfully for {user.email}."
                ),
                "email": user.email,
                "role": normalized_role,
                "expires_at": invitation.expires_at,
                "invitation_email_sent": True
            }

        except HTTPException as exc:

            # Restore the previous credentials if the email could not
            # be queued or password verification failed.
            if (
                exc.status_code ==
                status.HTTP_500_INTERNAL_SERVER_ERROR
            ):
                user.password_hash = old_user_password_hash

                invitation.token = old_invitation_values["token"]
                invitation.temp_password_hash = (
                    old_invitation_values["temp_password_hash"]
                )
                invitation.expires_at = (
                    old_invitation_values["expires_at"]
                )
                invitation.user_role = (
                    old_invitation_values["user_role"]
                )
                invitation.invited_name = (
                    old_invitation_values["invited_name"]
                )
                invitation.customer_id = (
                    old_invitation_values["customer_id"]
                )

                for old_invitation in pending_invitations[1:]:
                    old_invitation.expires_at = old_expiry_values[
                        old_invitation.id
                    ]

                self.db.commit()

            raise

        except Exception:
            self.db.rollback()
            raise
    # =================================================================
    # ACCEPT INVITATION
    # =================================================================

    async def accept_invitation(
        self,
        token: str,
        new_password: str
    ) -> UserResponse:
        """
        Accept an invitation by updating the user's password.

        The user record is already created at invitation time.
        """

        invitation = (
            self.db.query(Invitation)
            .filter(
                Invitation.token == token,
                Invitation.used_at.is_(None),
                Invitation.expires_at > datetime.utcnow()
            )
            .first()
        )

        if not invitation:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired invitation token"
            )

        # Update the user's password.
        user = (
            self.db.query(User)
            .filter(User.email == invitation.email)
            .first()
        )

        if not user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Associated user not found"
            )

        user.password_hash = hash_password(new_password)
        invitation.used_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(user)

        return UserResponse.model_validate(user)
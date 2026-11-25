"""API routes for multi-customer split dispatch batches."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.auth import get_current_user
from backend.db import get_db
from backend.schemas.dispatch_batch import (
    DispatchBatchCreate,
    DispatchBatchResponse,
    DispatchBatchUpdate,
    DispatchDestinationCustomer,
    InwardDispatchOverviewResponse,
)
from backend.schemas.user_schemas import UserResponse
from backend.services.dispatch_batch_service import (
    DispatchBatchConflictError,
    DispatchBatchNotFoundError,
    DispatchBatchService,
    DispatchBatchStateError,
    get_company_customer_ids,
)

router = APIRouter(
    prefix="/dispatch-batches",
    tags=["Dispatch Batches"],
)


class DispatchBatchCancelRequest(BaseModel):
    remarks: Optional[str] = None


class InwardDispatchProgressResponse(BaseModel):
    inward_id: int
    total_equipments: int
    assigned_equipments: int
    dispatched_equipments: int
    remaining_equipments: int
    dispatch_status: str


def _require_staff(
    current_user: UserResponse = Depends(get_current_user),
) -> UserResponse:
    role = (current_user.role or "").lower()
    if role not in ("admin", "engineer"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff access (admin or engineer) required.",
        )
    return current_user


def _resolve_portal_customer_scope(
    db: Session, current_user: UserResponse
) -> Optional[List[int]]:
    """
    Return None for staff (unrestricted) or company-wide branch customer_ids
    for customer portal users.
    """
    role = (current_user.role or "").lower()
    if role in ("admin", "engineer"):
        return None
    if role == "customer":
        if not current_user.customer_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User is not associated with a customer account.",
            )
        return get_company_customer_ids(db, current_user.customer_id)
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access denied.",
    )


@router.get(
    "/destination-customers",
    response_model=List[DispatchDestinationCustomer],
)
@router.get(
    "/customers",
    response_model=List[DispatchDestinationCustomer],
    include_in_schema=False,
)
def list_destination_customers(
    search: Optional[str] = Query(None, description="Filter by company, location, contact, or email"),
    db: Session = Depends(get_db),
    _: UserResponse = Depends(_require_staff),
):
    """List active customer/branch accounts for the 'Dispatch To' selector."""
    return DispatchBatchService.list_destination_customers(db, search=search)


@router.get(
    "/inward/{inward_id}/overview",
    response_model=InwardDispatchOverviewResponse,
)
def get_inward_dispatch_overview(
    inward_id: int,
    db: Session = Depends(get_db),
    _: UserResponse = Depends(_require_staff),
):
    """Return available undispatched equipments and all dispatch batches for an inward."""
    try:
        return DispatchBatchService.get_inward_overview(db, inward_id)
    except DispatchBatchNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get(
    "/inward/{inward_id}/progress",
    response_model=InwardDispatchProgressResponse,
)
def get_inward_dispatch_progress(
    inward_id: int,
    db: Session = Depends(get_db),
    _: UserResponse = Depends(_require_staff),
):
    """Return derived dispatch progress from dispatch tables without touching Inward.status."""
    return DispatchBatchService.get_inward_dispatch_progress(db, inward_id)


@router.get(
    "/inward/{inward_id}",
    response_model=List[DispatchBatchResponse],
)
def list_batches_for_inward(
    inward_id: int,
    include_cancelled: bool = Query(True),
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    List dispatch batches for an inward.
    - Staff: all batches (optionally excluding cancelled).
    - Customers: non-cancelled batches dispatched to any branch of their company.
    """
    customer_scope = _resolve_portal_customer_scope(db, current_user)
    try:
        return DispatchBatchService.list_batches_for_inward(
            db,
            inward_id,
            customer_id_filter=customer_scope,
            include_cancelled=include_cancelled if customer_scope is None else False,
        )
    except DispatchBatchNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get(
    "/{dispatch_id}",
    response_model=DispatchBatchResponse,
)
def get_dispatch_batch(
    dispatch_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
):
    """Fetch a single dispatch batch with company-level isolation for customer users."""
    customer_scope = _resolve_portal_customer_scope(db, current_user)
    batch = DispatchBatchService.get_batch_by_id(
        db,
        dispatch_id,
        customer_id_filter=customer_scope,
    )
    if batch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dispatch batch not found.",
        )
    return batch


@router.post(
    "",
    response_model=DispatchBatchResponse,
    status_code=status.HTTP_201_CREATED,
)
@router.post(
    "/",
    response_model=DispatchBatchResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
def create_dispatch_batch(
    payload: DispatchBatchCreate,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(_require_staff),
):
    """Create a new split dispatch batch and lock selected equipments."""
    try:
        return DispatchBatchService.create_batch(
            db,
            payload,
            created_by=current_user.user_id,
        )
    except DispatchBatchNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except DispatchBatchConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except (DispatchBatchStateError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.put(
    "/{dispatch_id}",
    response_model=DispatchBatchResponse,
)
@router.patch(
    "/{dispatch_id}",
    response_model=DispatchBatchResponse,
)
def update_dispatch_batch(
    dispatch_id: int,
    payload: DispatchBatchUpdate,
    db: Session = Depends(get_db),
    _: UserResponse = Depends(_require_staff),
):
    """Update a dispatch batch's destination customer, equipment list, or metadata."""
    try:
        return DispatchBatchService.update_batch(db, dispatch_id, payload)
    except DispatchBatchNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except DispatchBatchConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except (DispatchBatchStateError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post(
    "/{dispatch_id}/cancel",
    response_model=DispatchBatchResponse,
)
def cancel_dispatch_batch(
    dispatch_id: int,
    payload: Optional[DispatchBatchCancelRequest] = None,
    db: Session = Depends(get_db),
    _: UserResponse = Depends(_require_staff),
):
    """Cancel a non-dispatched batch and release its equipments for reassignment."""
    try:
        return DispatchBatchService.cancel_batch(
            db,
            dispatch_id,
            remarks=payload.remarks if payload else None,
        )
    except DispatchBatchNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except DispatchBatchStateError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
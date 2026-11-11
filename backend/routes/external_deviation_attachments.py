
import json
from typing import List

from fastapi import (
    APIRouter,
    Depends,
    UploadFile,
    File,
    Form,
    HTTPException,
)
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.auth import get_current_user
from backend.models.users import User

from backend.services.external_deviation_attachments import (
    DeviationAttachmentService,
)
from backend.schemas.external_deviation_attachments import (
    ExternalDeviationRead,
    AttachmentRead,
)

router = APIRouter(
    prefix="/external-deviations",
    tags=["Deviations"],
)


@router.get(
    "/",
    response_model=List[ExternalDeviationRead],
)
async def get_deviation(
    inward_eqp_id: int,
    db: Session = Depends(get_db),
):
    deviation = DeviationAttachmentService.get_deviation_by_eqp_id(
        db, inward_eqp_id
    )

    if not deviation:
        return []

    print(
        f"DEBUG: Found {len(deviation.attachments)} "
        f"attachments for EQP {inward_eqp_id}"
    )

    return [deviation]


@router.post(
    "/",
    response_model=ExternalDeviationRead,
)
async def create_deviation_with_files(
    data: str = Form(...),
    files: List[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        deviation_dict = json.loads(data)

        return await DeviationAttachmentService.create_deviation_with_attachments(
            db=db,
            deviation_data=deviation_dict,
            files=files or [],
            user_id=current_user.user_id,
        )

    except json.JSONDecodeError:
        raise HTTPException(
            status_code=400,
            detail="Invalid deviation data JSON.",
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e),
        )


@router.post(
    "/{deviation_id}/attachments",
    response_model=AttachmentRead,
)
async def upload_single_attachment(
    deviation_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return await DeviationAttachmentService.save_attachment(
            db=db,
            deviation_id=deviation_id,
            file=file,
            user_id=current_user.user_id,
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e),
        )


@router.delete(
    "/attachments/{attachment_id}",
)
def delete_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    success = DeviationAttachmentService.delete_attachment(
        db, attachment_id
    )

    if not success:
        raise HTTPException(
            status_code=404,
            detail="Attachment not found",
        )

    return {"message": "Deleted successfully"}

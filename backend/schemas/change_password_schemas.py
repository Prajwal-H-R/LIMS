# backend/schemas/change_password_schemas.py
#
# Dependencies:
#   - Python: pydantic (built-in with FastAPI)
#   - No additional env vars

from pydantic import BaseModel


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

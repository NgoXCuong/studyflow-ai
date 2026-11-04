from fastapi import APIRouter, Depends

from app.api.dependencies import CurrentUser, Database, require_same_origin
from app.schemas.auth import ProfileInput, UserOutput

router = APIRouter(prefix="/users", tags=["users"])


@router.patch("/me", response_model=UserOutput, dependencies=[Depends(require_same_origin)])
def update_profile(data: ProfileInput, user: CurrentUser, db: Database):
    user.full_name = data.full_name
    db.flush()
    return user

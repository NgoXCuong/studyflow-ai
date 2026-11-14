from uuid import UUID

from fastapi import APIRouter, Depends

from app.api.dependencies import CurrentUser, Database, require_roles
from app.schemas.overview import StudentOverview
from app.services.overview import student_overview

router = APIRouter(tags=["overview"], dependencies=[Depends(require_roles("student"))])


@router.get("/overview", response_model=StudentOverview)
def read_overview(user: CurrentUser, db: Database, course_id: UUID | None = None):
    return student_overview(db, user, course_id)

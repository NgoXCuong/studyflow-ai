from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import CurrentUser, Database, require_roles
from app.schemas.attempts import StudentAttemptOutput
from app.schemas.classroom_reports import ClassroomReport, StudentReport
from app.services.classroom_reports import classroom_report, report_attempts, student_reports

router = APIRouter(tags=["classroom-reports"], dependencies=[Depends(require_roles("teacher"))])


@router.get("/classrooms/{classroom_id}/report", response_model=ClassroomReport)
def read_report(classroom_id: UUID, user: CurrentUser, db: Database,
                limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0)):
    return classroom_report(db, user, classroom_id, limit, offset)


@router.get("/classrooms/{classroom_id}/report/students", response_model=list[StudentReport])
def read_students(classroom_id: UUID, user: CurrentUser, db: Database, include_left: bool = False,
                  limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0)):
    return student_reports(db, user, classroom_id, include_left, limit, offset)


@router.get("/classrooms/{classroom_id}/report/attempts", response_model=list[StudentAttemptOutput])
def read_attempts(classroom_id: UUID, user: CurrentUser, db: Database, student_id: UUID | None = None,
                  limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0)):
    return report_attempts(db, user, classroom_id, student_id, limit, offset)

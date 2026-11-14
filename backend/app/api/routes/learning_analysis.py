from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import CurrentUser, Database, require_roles
from app.schemas.learning_analysis import CourseAnalysis, TopicHistory
from app.schemas.quizzes import Title
from app.services.learning_analysis import analyze_course, topic_history

router = APIRouter(tags=["learning-analysis"], dependencies=[Depends(require_roles("student"))])


@router.get("/courses/{course_id}/learning-analysis", response_model=CourseAnalysis)
def read_analysis(course_id: UUID, user: CurrentUser, db: Database):
    return analyze_course(db, user, course_id)


@router.get("/courses/{course_id}/learning-analysis/history", response_model=list[TopicHistory])
def read_history(course_id: UUID, topic: Title, user: CurrentUser, db: Database,
                 limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0)):
    return topic_history(db, user, course_id, topic, limit, offset)

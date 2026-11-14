from fastapi import APIRouter
from app.api.routes import study_materials

from app.api.routes import admin, attempts, auth, classroom_reports, classrooms, courses, documents, health, learning_analysis, operations, overview, processing, qa, quizzes, study_plans, users

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(study_materials.router)
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(courses.router)
api_router.include_router(classrooms.router)
api_router.include_router(admin.router)
api_router.include_router(documents.router)
api_router.include_router(processing.router)

api_router.include_router(qa.router)

api_router.include_router(quizzes.router)
api_router.include_router(attempts.router)
api_router.include_router(learning_analysis.router)

api_router.include_router(study_plans.router)

api_router.include_router(overview.router)

api_router.include_router(classroom_reports.router)

api_router.include_router(operations.router)

from fastapi import APIRouter

from app.api.routes import admin, auth, classrooms, courses, documents, health, processing, qa, quizzes, users

api_router = APIRouter(prefix="/api/v1")
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

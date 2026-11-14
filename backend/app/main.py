from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.api.middleware import DocumentUploadLimit
from app.core.config import get_settings

app = FastAPI(title="StudyFlow AI API", version="0.1.0")
app.add_middleware(DocumentUploadLimit)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.middleware("http")
async def protect_auth_responses(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith(("/api/v1/auth/", "/api/v1/users/", "/api/v1/courses", "/api/v1/classrooms", "/api/v1/admin/", "/api/v1/documents/", "/api/v1/conversations/", "/api/v1/quizzes", "/api/v1/attempts/", "/api/v1/study-materials", "/api/v1/study-plans", "/api/v1/overview")):
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"
    return response

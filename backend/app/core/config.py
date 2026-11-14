from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[3] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    postgres_host: str = "127.0.0.1"
    postgres_port: int = 5432
    postgres_db: str = "studyflow"
    postgres_user: str = "studyflow"
    postgres_password: SecretStr = SecretStr("")
    auth_secret: SecretStr = SecretStr("")
    email_verification_required: bool = True
    access_token_minutes: int = Field(default=15, gt=0)
    refresh_token_days: int = Field(default=7, gt=0)
    verification_token_hours: int = Field(default=24, gt=0)
    reset_token_minutes: int = Field(default=30, gt=0)
    cookie_secure: bool = False
    allowed_origins: list[str] = ["http://localhost:3000"]
    frontend_url: str = "http://localhost:3000"
    smtp_host: str = "127.0.0.1"
    smtp_port: int = 1025
    smtp_starttls: bool = False
    smtp_username: str = ""
    smtp_password: SecretStr = SecretStr("")
    mail_from: str = "no-reply@studyflow.local"
    document_storage_dir: Path = Path(__file__).resolve().parents[2] / "storage" / "documents"
    document_max_size_bytes: int = Field(default=20 * 1024 * 1024, gt=0)
    document_max_pages: int = Field(default=500, gt=0)
    document_storage_backend: Literal["local", "r2"] = "local"
    document_user_quota_bytes: int = Field(default=1024 * 1024 * 1024, gt=0)
    document_retention_days: int = Field(default=7, ge=0)
    r2_account_id: str = ""
    r2_bucket_name: str = ""
    r2_access_key_id: SecretStr = SecretStr("")
    r2_secret_access_key: SecretStr = SecretStr("")
    embedding_provider: Literal["cohere", "gemini"] = "cohere"
    cohere_api_key: SecretStr = SecretStr("")
    cohere_embedding_model: Literal["embed-v5.0-fast", "embed-v5.0-pro"] = "embed-v5.0-fast"
    gemini_api_key: SecretStr = SecretStr("")
    gemini_embedding_model: Literal["gemini-embedding-001"] = "gemini-embedding-001"
    cohere_chat_model: str = "command-a-03-2025"
    cohere_quiz_model: str = "command-r7b-12-2024"
    quiz_context_chunks: int = Field(default=12, ge=1, le=30)
    quiz_timeout_seconds: int = Field(default=180, ge=30, le=600)
    rag_top_k: int = Field(default=5, ge=1, le=10)
    rag_timeout_seconds: int = Field(default=60, ge=1, le=120)
    document_chunk_size: int = Field(default=1500, ge=200, le=6000)
    document_chunk_overlap: int = Field(default=200, ge=0)
    document_max_chunks: int = Field(default=1000, gt=0)
    ocr_tessdata_dir: Path = Path(__file__).resolve().parents[2] / "storage" / "tessdata"
    ocr_languages: str = Field(default="vie+eng", pattern=r"^[a-z_]+(?:\+[a-z_]+)*$")
    ocr_timeout_seconds: int = Field(default=60, ge=1, le=120)
    embedding_batch_size: int = Field(default=32, ge=1, le=100)
    embedding_timeout_seconds: int = Field(default=30, ge=1, le=120)
    processing_lease_seconds: int = Field(default=300, ge=180)

    @property
    def embedding_model(self) -> str:
        return self.cohere_embedding_model if self.embedding_provider == "cohere" else self.gemini_embedding_model

    @model_validator(mode="after")
    def validate_chunking(self):
        if self.document_chunk_overlap >= self.document_chunk_size:
            raise ValueError("DOCUMENT_CHUNK_OVERLAP must be smaller than DOCUMENT_CHUNK_SIZE")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()

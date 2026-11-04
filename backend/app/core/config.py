from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
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


@lru_cache
def get_settings() -> Settings:
    return Settings()

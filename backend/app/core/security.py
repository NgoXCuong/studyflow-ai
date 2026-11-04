import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
from fastapi import HTTPException
from pwdlib import PasswordHash

from app.core.config import get_settings

password_hasher = PasswordHash.recommended()
DUMMY_PASSWORD_HASH = password_hasher.hash(secrets.token_urlsafe(32))
ACCESS_COOKIE = "studyflow_access"
REFRESH_COOKIE = "studyflow_refresh"


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def auth_secret() -> str:
    secret = get_settings().auth_secret.get_secret_value()
    if len(secret) < 32:
        raise HTTPException(503, "Cần cấu hình AUTH_SECRET có ít nhất 32 ký tự.")
    return secret


def create_access_token(user_id: UUID, session_id: UUID) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": str(user_id), "sid": str(session_id), "iat": now,
            "exp": now + timedelta(minutes=get_settings().access_token_minutes),
            "iss": "studyflow-api", "aud": "studyflow-web",
        },
        auth_secret(), algorithm="HS256",
    )


def decode_access_token(token: str) -> tuple[UUID, UUID]:
    try:
        payload = jwt.decode(
            token, auth_secret(), algorithms=["HS256"],
            issuer="studyflow-api", audience="studyflow-web",
            options={"require": ["exp", "iat", "sub", "sid"]},
        )
        if not isinstance(payload["sub"], str) or not isinstance(payload["sid"], str):
            raise ValueError("Invalid token identity")
        return UUID(payload["sub"]), UUID(payload["sid"])
    except (jwt.InvalidTokenError, ValueError, TypeError) as exc:
        raise HTTPException(401, "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.") from exc

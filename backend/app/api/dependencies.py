from collections import defaultdict, deque
from threading import Lock
from time import monotonic
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import ACCESS_COOKIE, decode_access_token
from app.db.connection import get_db
from app.models.auth import AuthSession, User

Database = Annotated[Session, Depends(get_db, scope="function")]


def require_same_origin(request: Request) -> None:
    if request.headers.get("origin") not in get_settings().allowed_origins:
        raise HTTPException(403, "Nguồn yêu cầu không được phép.")


_attempts: dict[str, deque[float]] = defaultdict(deque)
_attempts_lock = Lock()


def limit_auth_requests(request: Request) -> None:
    if request.url.path in {"/api/v1/auth/logout", "/api/v1/auth/logout-all"}:
        return
    # Giới hạn trong một process; không tin X-Forwarded-For từ client.
    key = request.client.host if request.client else "unknown"
    now = monotonic()
    with _attempts_lock:
        for host in list(_attempts):
            while _attempts[host] and _attempts[host][0] <= now - 60:
                _attempts[host].popleft()
            if not _attempts[host]:
                del _attempts[host]
        attempts = _attempts[key]
        if len(attempts) >= 20:
            raise HTTPException(429, "Quá nhiều yêu cầu. Vui lòng thử lại sau một phút.", headers={"Retry-After": "60"})
        attempts.append(now)


def get_current_user(request: Request, db: Database) -> User:
    token = request.cookies.get(ACCESS_COOKIE)
    if not token:
        raise HTTPException(401, "Bạn cần đăng nhập.")
    user_id, session_id = decode_access_token(token)
    user = db.scalar(
        select(User).join(AuthSession).where(
            User.id == user_id, AuthSession.id == session_id,
            AuthSession.revoked_at.is_(None), AuthSession.expires_at > func.now(),
        )
    )
    if not user:
        raise HTTPException(401, "Phiên đăng nhập đã hết hạn hoặc bị thu hồi.")
    if user.status != "active":
        raise HTTPException(403, "Tài khoản đã bị khóa.")
    if get_settings().email_verification_required and user.email_verified_at is None:
        raise HTTPException(403, "Bạn cần xác thực email.")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*roles: str):
    def check_role(user: CurrentUser) -> User:
        if user.role not in roles:
            raise HTTPException(403, "Bạn không có quyền thực hiện thao tác này.")
        return user
    return check_role

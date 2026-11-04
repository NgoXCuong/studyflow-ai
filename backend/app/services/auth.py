import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Response
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session
from uuid import UUID

from app.core.config import get_settings
from app.core.security import (
    ACCESS_COOKIE, DUMMY_PASSWORD_HASH, REFRESH_COOKIE,
    create_access_token, password_hasher, token_hash,
)
from app.schemas.auth import RegisterInput
from app.models.auth import AuthSession, AuthToken, User
from app.services.mail import send_token_email


def issue_email_token(db: Session, user: User, purpose: str) -> None:
    settings = get_settings()
    lifetime = (
        timedelta(hours=settings.verification_token_hours)
        if purpose == "email_verification"
        else timedelta(minutes=settings.reset_token_minutes)
    )
    token = secrets.token_urlsafe(48)
    db.execute(
        update(AuthToken).where(
            AuthToken.user_id == user.id, AuthToken.purpose == purpose, AuthToken.consumed_at.is_(None),
        ).values(consumed_at=func.now())
    )
    db.add(AuthToken(
        user_id=user.id, purpose=purpose, token_hash=token_hash(token),
        expires_at=datetime.now(timezone.utc) + lifetime,
    ))
    db.flush()
    send_token_email(user.email, token, purpose)


def register(db: Session, data: RegisterInput) -> str:
    user = db.scalar(
        insert(User).values(
            email=data.email, password_hash=password_hasher.hash(data.password), full_name=data.full_name,
        ).on_conflict_do_nothing(index_elements=[User.email]).returning(User)
    )
    if not user:
        raise HTTPException(409, "Email đã được sử dụng.")
    if get_settings().email_verification_required:
        issue_email_token(db, user, "email_verification")
        return "Đăng ký thành công. Vui lòng kiểm tra email để xác thực tài khoản."
    return "Đăng ký thành công. Bạn có thể đăng nhập."


def authenticate(db: Session, email: str, password: str) -> User:
    user = db.scalar(select(User).where(User.email == email).with_for_update())
    valid = password_hasher.verify(password, user.password_hash if user else DUMMY_PASSWORD_HASH)
    if not user or not valid:
        raise HTTPException(401, "Email hoặc mật khẩu không đúng.")
    ensure_active(user)
    return user


def ensure_active(user: User) -> None:
    if user.status != "active":
        raise HTTPException(403, "Tài khoản đã bị khóa.")
    if get_settings().email_verification_required and user.email_verified_at is None:
        raise HTTPException(403, "Bạn cần xác thực email trước khi đăng nhập.")


def set_session_cookies(response: Response, user: User, session: AuthSession, refresh: str) -> None:
    settings = get_settings()
    options = {"httponly": True, "secure": settings.cookie_secure, "samesite": "lax", "path": "/"}
    response.set_cookie(
        ACCESS_COOKIE, create_access_token(user.id, session.id),
        max_age=settings.access_token_minutes * 60, **options,
    )
    remaining = max(0, int((session.expires_at - datetime.now(timezone.utc)).total_seconds()))
    response.set_cookie(REFRESH_COOKIE, refresh, max_age=remaining, **options)


def start_session(db: Session, user: User, response: Response) -> None:
    token = secrets.token_urlsafe(48)
    session = AuthSession(
        user_id=user.id, refresh_token_hash=token_hash(token),
        expires_at=datetime.now(timezone.utc) + timedelta(days=get_settings().refresh_token_days),
    )
    db.add(session)
    db.flush()
    set_session_cookies(response, user, session, token)


def refresh_session(db: Session, token: str, response: Response) -> None:
    # Khóa user trước session, cùng thứ tự với đổi/reset mật khẩu.
    user = db.scalar(
        select(User).join(AuthSession).where(AuthSession.refresh_token_hash == token_hash(token))
        .with_for_update(of=User)
    )
    if not user:
        raise HTTPException(401, "Phiên đăng nhập không hợp lệ.")
    ensure_active(user)
    new_token = secrets.token_urlsafe(48)
    session = db.scalar(
        update(AuthSession).where(
            AuthSession.refresh_token_hash == token_hash(token),
            AuthSession.revoked_at.is_(None), AuthSession.expires_at > func.now(),
        ).values(refresh_token_hash=token_hash(new_token)).returning(AuthSession)
    )
    if not session:
        raise HTTPException(401, "Phiên đăng nhập đã hết hạn hoặc bị thu hồi.")
    set_session_cookies(response, user, session, new_token)


def clear_session_cookies(response: Response) -> None:
    for name in (ACCESS_COOKIE, REFRESH_COOKIE):
        response.delete_cookie(name, path="/", httponly=True, secure=get_settings().cookie_secure, samesite="lax")


def revoke_sessions(db: Session, user_id: UUID) -> None:
    db.execute(
        update(AuthSession).where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=func.now())
    )


def replace_password(db: Session, user: User, password: str) -> None:
    user.password_hash = password_hasher.hash(password)
    revoke_sessions(db, user.id)
    db.execute(
        update(AuthToken).where(
            AuthToken.user_id == user.id, AuthToken.purpose == "password_reset", AuthToken.consumed_at.is_(None),
        ).values(consumed_at=func.now())
    )


def consume_email_token(db: Session, token: str, purpose: str) -> User:
    user = db.scalar(
        select(User).join(AuthToken).where(AuthToken.token_hash == token_hash(token), AuthToken.purpose == purpose)
        .with_for_update(of=User)
    )
    if not user or user.status != "active":
        raise HTTPException(400, "Liên kết không hợp lệ hoặc đã hết hạn.")
    consumed = db.scalar(
        update(AuthToken).where(
            AuthToken.token_hash == token_hash(token), AuthToken.purpose == purpose,
            AuthToken.consumed_at.is_(None), AuthToken.expires_at > func.now(),
        ).values(consumed_at=func.now()).returning(AuthToken.id)
    )
    if not consumed:
        raise HTTPException(400, "Liên kết không hợp lệ hoặc đã hết hạn.")
    return user

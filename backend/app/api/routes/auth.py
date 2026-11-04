from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, select, update

from app.api.dependencies import CurrentUser, Database, limit_auth_requests, require_same_origin
from app.core.security import ACCESS_COOKIE, REFRESH_COOKIE, decode_access_token, password_hasher, token_hash
from app.schemas.auth import (
    ChangePasswordInput, EmailInput, LoginInput, MessageOutput, RegisterInput,
    ResetPasswordInput, TokenInput, UserOutput,
)
from app.services import auth
from app.models.auth import AuthSession, User

router = APIRouter(prefix="/auth", tags=["auth"])
write_router = APIRouter(dependencies=[Depends(require_same_origin), Depends(limit_auth_requests)])


@write_router.post("/register", response_model=MessageOutput, status_code=201)
def register(data: RegisterInput, db: Database):
    return {"message": auth.register(db, data)}


@write_router.post("/login", response_model=UserOutput)
def login(data: LoginInput, db: Database, response: Response):
    user = auth.authenticate(db, data.email, data.password)
    auth.start_session(db, user, response)
    return user


@write_router.post("/refresh", response_model=MessageOutput)
def refresh(request: Request, response: Response, db: Database):
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise HTTPException(401, "Bạn cần đăng nhập.")
    auth.refresh_session(db, token, response)
    return {"message": "Đã làm mới phiên đăng nhập."}


@write_router.post("/logout", response_model=MessageOutput)
def logout(request: Request, response: Response, db: Database):
    token = request.cookies.get(REFRESH_COOKIE)
    if token:
        db.execute(
            update(AuthSession).where(
                AuthSession.refresh_token_hash == token_hash(token), AuthSession.revoked_at.is_(None),
            ).values(revoked_at=func.now())
        )
    access = request.cookies.get(ACCESS_COOKIE)
    if access:
        try:
            user_id, session_id = decode_access_token(access)
        except HTTPException as exc:
            if exc.status_code != 401:
                raise
        else:
            db.execute(
                update(AuthSession).where(
                    AuthSession.id == session_id, AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None),
                ).values(revoked_at=func.now())
            )
    auth.clear_session_cookies(response)
    return {"message": "Đã đăng xuất."}


@write_router.post("/logout-all", response_model=MessageOutput)
def logout_all(user: CurrentUser, db: Database, response: Response):
    db.scalar(select(User.id).where(User.id == user.id).with_for_update())
    auth.revoke_sessions(db, user.id)
    auth.clear_session_cookies(response)
    return {"message": "Đã đăng xuất khỏi tất cả phiên."}


@write_router.post("/verify-email", response_model=MessageOutput)
def verify_email(data: TokenInput, db: Database):
    user = auth.consume_email_token(db, data.token, "email_verification")
    user.email_verified_at = func.now()
    return {"message": "Xác thực email thành công. Bạn có thể đăng nhập."}


@write_router.post("/resend-verification", response_model=MessageOutput)
def resend_verification(data: EmailInput, db: Database):
    user = db.scalar(select(User).where(User.email == data.email).with_for_update())
    if user and user.status == "active" and user.email_verified_at is None:
        auth.issue_email_token(db, user, "email_verification")
    return {"message": "Nếu tài khoản cần xác thực, email hướng dẫn sẽ được gửi."}


@write_router.post("/forgot-password", response_model=MessageOutput)
def forgot_password(data: EmailInput, db: Database):
    user = db.scalar(select(User).where(User.email == data.email).with_for_update())
    if user and user.status == "active":
        auth.issue_email_token(db, user, "password_reset")
    return {"message": "Nếu tài khoản tồn tại và đang hoạt động, email đặt lại mật khẩu sẽ được gửi."}


@write_router.post("/reset-password", response_model=MessageOutput)
def reset_password(data: ResetPasswordInput, db: Database):
    user = auth.consume_email_token(db, data.token, "password_reset")
    auth.replace_password(db, user, data.password)
    return {"message": "Đã đặt lại mật khẩu và thu hồi tất cả phiên. Vui lòng đăng nhập lại."}


@write_router.post("/change-password", response_model=MessageOutput)
def change_password(data: ChangePasswordInput, user: CurrentUser, db: Database, response: Response):
    current = db.scalar(
        select(User).where(User.id == user.id).with_for_update().execution_options(populate_existing=True)
    )
    if not password_hasher.verify(data.current_password, current.password_hash):
        raise HTTPException(400, "Mật khẩu hiện tại không đúng.")
    auth.replace_password(db, current, data.new_password)
    auth.clear_session_cookies(response)
    return {"message": "Đã đổi mật khẩu và thu hồi tất cả phiên. Vui lòng đăng nhập lại."}


@router.get("/me", response_model=UserOutput)
def me(user: CurrentUser):
    return user


router.include_router(write_router)

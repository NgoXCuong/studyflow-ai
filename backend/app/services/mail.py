import smtplib
import ssl
from email.message import EmailMessage

from fastapi import HTTPException

from app.core.config import get_settings


def send_token_email(email: str, token: str, purpose: str) -> None:
    settings = get_settings()
    verification = purpose == "email_verification"
    action = "verify-email" if verification else "reset-password"
    title = "Xác thực email" if verification else "Đặt lại mật khẩu"
    url = f"{settings.frontend_url.rstrip('/')}/{action}#token={token}"
    message = EmailMessage()
    message["Subject"] = f"StudyFlow AI — {title}"
    message["From"] = settings.mail_from
    message["To"] = email
    message.set_content(
        f"{title} tại liên kết sau:\n{url}\n\n"
        "Liên kết chỉ dùng được một lần và có thời hạn. "
        "Nếu bạn không yêu cầu, hãy bỏ qua email này."
    )
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            if settings.smtp_starttls:
                smtp.starttls(context=ssl.create_default_context())
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password.get_secret_value())
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException) as exc:
        raise HTTPException(503, "Chưa gửi được email. Vui lòng thử lại sau.") from exc

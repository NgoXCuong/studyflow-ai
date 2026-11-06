from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import get_settings


class DocumentUploadLimit:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path = scope.get("path", "").rstrip("/")
        if scope["type"] != "http" or scope["method"] != "POST" or not (
            path.startswith("/api/v1/courses/") and path.endswith("/documents")
        ):
            await self.app(scope, receive, send)
            return
        # Chừa phần bao multipart; dung lượng file riêng vẫn được kiểm tra ở service.
        limit = get_settings().document_max_size_bytes + 64 * 1024
        content_length = dict(scope["headers"]).get(b"content-length")
        if content_length and content_length.isdigit() and int(content_length) > limit:
            response = JSONResponse({"detail": "Yêu cầu upload vượt giới hạn dung lượng cho phép."}, status_code=413)
            await response(scope, receive, send)
            return
        size = 0

        async def limited_receive() -> Message:
            nonlocal size
            message = await receive()
            if message["type"] == "http.request":
                size += len(message.get("body", b""))
                if size > limit:
                    raise HTTPException(413, "Yêu cầu upload vượt giới hạn dung lượng cho phép.")
            return message

        await self.app(scope, limited_receive, send)

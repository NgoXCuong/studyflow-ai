import logging
import re
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from starlette.background import BackgroundTask

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def storage_root() -> Path:
    configured = get_settings().document_storage_dir
    if not configured.is_absolute():
        configured = Path(__file__).resolve().parents[2] / configured
    return configured.resolve()


def local_path(key: str) -> Path:
    root = storage_root()
    path = (root / key).resolve()
    if path.parent != root:
        raise HTTPException(404, "Không tìm thấy file tài liệu.")
    return path


@lru_cache
def r2_client():
    settings = get_settings()
    if not (re.fullmatch(r"[a-fA-F0-9]{32}", settings.r2_account_id)
            and settings.r2_bucket_name and settings.r2_access_key_id.get_secret_value()
            and settings.r2_secret_access_key.get_secret_value()):
        raise HTTPException(503, "Chưa cấu hình đầy đủ kho lưu trữ R2.")
    return boto3.client(
        "s3", endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.r2_access_key_id.get_secret_value(),
        aws_secret_access_key=settings.r2_secret_access_key.get_secret_value(),
        region_name="auto",
        config=Config(signature_version="s3v4", connect_timeout=5, read_timeout=30,
                      retries={"mode": "standard", "total_max_attempts": 3},
                      request_checksum_calculation="when_required", response_checksum_validation="when_required"),
    )


def store_file(content: bytes) -> str:
    settings = get_settings()
    key = f"{uuid4().hex}.pdf"
    if settings.document_storage_backend == "r2":
        # Prefix records the backend so existing local PDFs remain readable.
        key = f"r2/{key}"
        try:
            r2_client().put_object(Bucket=settings.r2_bucket_name, Key=key, Body=content,
                                   ContentType="application/pdf", CacheControl="private, no-store")
        except (BotoCoreError, ClientError) as exc:
            cleanup_file(key)
            raise HTTPException(503, "Chưa lưu được file tài liệu. Vui lòng thử lại sau.") from exc
        return key
    path = local_path(key)
    created = False
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("xb") as output:
            created = True
            output.write(content)
    except OSError as exc:
        if created:
            cleanup_file(key)
        raise HTTPException(503, "Chưa lưu được file tài liệu. Vui lòng thử lại sau.") from exc
    return key


def delete_file(key: str) -> None:
    if key.startswith("r2/"):
        try:
            r2_client().delete_object(Bucket=get_settings().r2_bucket_name, Key=key)
        except (BotoCoreError, ClientError) as exc:
            raise HTTPException(503, "Chưa xóa được file trong kho lưu trữ.") from exc
    else:
        local_path(key).unlink(missing_ok=True)


def cleanup_file(key: str) -> None:
    try:
        delete_file(key)
    except (HTTPException, OSError):
        # Keep the original database/storage error; log the key for reconciliation.
        logger.exception("Unable to clean up document object %s", key)


def read_file_bytes(key: str) -> bytes:
    limit = get_settings().document_max_size_bytes
    if key.startswith("r2/"):
        try:
            result = r2_client().get_object(Bucket=get_settings().r2_bucket_name, Key=key)
            body = result["Body"]
            try:
                content = body.read(limit + 1)
            finally:
                body.close()
        except (BotoCoreError, ClientError) as exc:
            raise HTTPException(503, "Không đọc được PDF từ kho R2.") from exc
    else:
        with local_path(key).open("rb") as source:
            content = source.read(limit + 1)
    if len(content) > limit:
        raise HTTPException(413, "PDF trong kho vượt dung lượng xử lý cho phép.")
    return content


def file_response(document, byte_range: str | None = None):
    headers = {"X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox",
               "Cache-Control": "no-store"}
    if not document.storage_key.startswith("r2/"):
        path = local_path(document.storage_key)
        if not path.is_file():
            raise HTTPException(404, "File tài liệu không còn trong kho lưu trữ.")
        return FileResponse(path, media_type="application/pdf", filename=document.original_filename,
                            content_disposition_type="inline", headers=headers)
    if byte_range and not re.fullmatch(r"bytes=(?:\d+-\d*|-\d+)", byte_range):
        raise HTTPException(416, "Kho lưu trữ chỉ hỗ trợ một khoảng byte hợp lệ.",
                            headers={"Content-Range": f"bytes */{document.size_bytes}"})
    params = {"Bucket": get_settings().r2_bucket_name, "Key": document.storage_key}
    if byte_range:
        params["Range"] = byte_range
    try:
        result = r2_client().get_object(**params)
    except ClientError as exc:
        status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        if status == 404:
            raise HTTPException(404, "File tài liệu không còn trong kho lưu trữ.") from exc
        if status == 416:
            raise HTTPException(416, "Khoảng byte vượt nội dung file.",
                                headers={"Content-Range": f"bytes */{document.size_bytes}"}) from exc
        raise HTTPException(503, "Chưa đọc được file tài liệu. Vui lòng thử lại sau.") from exc
    except BotoCoreError as exc:
        raise HTTPException(503, "Chưa đọc được file tài liệu. Vui lòng thử lại sau.") from exc
    body = result["Body"]
    headers.update({"Content-Length": str(result["ContentLength"]), "Accept-Ranges": "bytes",
                    "Content-Disposition": f"inline; filename*=utf-8''{quote(document.original_filename, safe='')}"})
    if "ContentRange" in result:
        headers["Content-Range"] = result["ContentRange"]

    def chunks():
        try:
            yield from body.iter_chunks(chunk_size=64 * 1024)
        finally:
            body.close()

    return StreamingResponse(chunks(), status_code=206 if "ContentRange" in result else 200,
                             media_type="application/pdf", headers=headers,
                             background=BackgroundTask(body.close))

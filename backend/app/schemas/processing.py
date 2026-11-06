from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ProcessingOutput(BaseModel):
    document_id: UUID
    status: Literal["queued", "processing", "ready", "failed"]
    attempt_count: int
    chunk_count: int
    started_at: datetime | None
    finished_at: datetime | None
    error_code: str | None
    error_message: str | None


class ChunkOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    document_id: UUID
    position: int
    page_number: int
    content: str

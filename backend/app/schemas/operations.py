from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ProcessingItem(BaseModel):
    document_id: UUID
    owner_id: UUID
    status: str
    source_removed: bool
    attempt_count: int
    started_at: datetime | None
    finished_at: datetime | None
    lease_expires_at: datetime | None
    error_code: str | None
    created_at: datetime
    updated_at: datetime


class ProcessingOverview(BaseModel):
    total: int
    counts: dict[str, int]
    items: list[ProcessingItem]


class UsageItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    document_id: UUID
    owner_id: UUID
    provider: str
    model: str
    operation: str
    status: str
    input_characters: int
    chunk_count: int
    duration_ms: int
    total_tokens: int | None
    error_code: str | None
    created_at: datetime


class UsageOverview(BaseModel):
    total: int
    success_count: int
    failed_count: int
    recorded_tokens: int | None
    token_recorded_count: int
    average_duration_ms: float | None
    operations: dict[str, int]
    items: list[UsageItem]

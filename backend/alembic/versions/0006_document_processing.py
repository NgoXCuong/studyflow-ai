"""Add durable PDF processing, chunks, vectors and Gemini usage logs."""

from alembic import op
from pgvector.sqlalchemy import Vector
import sqlalchemy as sa

revision = "0006_document_processing"
down_revision = "0005_document_storage"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public")
    op.create_table(
        "document_processing_jobs",
        sa.Column("document_id", sa.Uuid(), sa.ForeignKey("documents.id"), primary_key=True),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("claim_token", sa.Uuid()),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True)),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("error_code", sa.Text()),
        sa.Column("error_message", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("attempt_count >= 0"),
    )
    op.create_index("document_processing_jobs_lease_idx", "document_processing_jobs", ["lease_expires_at"])
    op.create_table(
        "document_chunks",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("document_id", sa.Uuid(), sa.ForeignKey("documents.id"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(768), nullable=False),
        sa.Column("embedding_model", sa.Text(), nullable=False),
        sa.UniqueConstraint("document_id", "position"),
        sa.CheckConstraint("position >= 0"),
        sa.CheckConstraint("page_number > 0"),
        sa.CheckConstraint("btrim(content) <> ''"),
    )
    op.create_table(
        "ai_usage_logs",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("document_id", sa.Uuid(), sa.ForeignKey("documents.id"), nullable=False),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("model", sa.Text(), nullable=False),
        sa.Column("operation", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("input_characters", sa.Integer(), nullable=False),
        sa.Column("chunk_count", sa.Integer(), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.Column("total_tokens", sa.Integer()),
        sa.Column("error_code", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('success','failed')"),
        sa.CheckConstraint("input_characters >= 0"),
        sa.CheckConstraint("chunk_count > 0"),
        sa.CheckConstraint("duration_ms >= 0"),
        sa.CheckConstraint("total_tokens >= 0"),
    )
    op.create_index("ai_usage_logs_document_idx", "ai_usage_logs", ["document_id", "created_at"])
    op.execute("INSERT INTO document_processing_jobs (document_id) SELECT id FROM documents WHERE status IN ('queued','processing','failed')")


def downgrade() -> None:
    op.drop_table("ai_usage_logs")
    op.drop_table("document_chunks")
    op.drop_table("document_processing_jobs")
    # The vector extension may be shared with other modules.

"""Add private PDF documents and publication metadata."""

from alembic import op
import sqlalchemy as sa

revision = "0004_documents"
down_revision = "0003_admin"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "documents",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("course_id", sa.Uuid(), sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("classroom_id", sa.Uuid()),
        sa.Column("chapter_id", sa.Uuid()),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("original_filename", sa.Text(), nullable=False),
        sa.Column("storage_key", sa.Text(), nullable=False, unique=True),
        sa.Column("mime_type", sa.Text(), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("page_count", sa.Integer()),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'queued'")),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("id", "course_id"),
        sa.ForeignKeyConstraint(["classroom_id", "course_id"], ["classrooms.id", "classrooms.course_id"]),
        sa.ForeignKeyConstraint(["chapter_id", "course_id"], ["chapters.id", "chapters.course_id"]),
        sa.CheckConstraint("btrim(title) <> ''"),
        sa.CheckConstraint("btrim(original_filename) <> ''"),
        sa.CheckConstraint("btrim(storage_key) <> ''"),
        sa.CheckConstraint("mime_type = 'application/pdf'"),
        sa.CheckConstraint("size_bytes > 0"),
        sa.CheckConstraint("page_count > 0"),
        sa.CheckConstraint("status IN ('queued','processing','ready','failed')"),
        sa.CheckConstraint("published_at IS NULL OR classroom_id IS NOT NULL"),
        sa.CheckConstraint("status <> 'ready' OR page_count IS NOT NULL"),
    )
    op.create_index("documents_owner_idx", "documents", ["owner_id", "course_id"], postgresql_where=sa.text("deleted_at IS NULL"))
    op.create_index("documents_course_idx", "documents", ["course_id"], postgresql_where=sa.text("deleted_at IS NULL"))
    op.create_index("documents_classroom_idx", "documents", ["classroom_id"], postgresql_where=sa.text("deleted_at IS NULL"))
    op.create_index("documents_chapter_idx", "documents", ["chapter_id"])


def downgrade() -> None:
    op.drop_table("documents")

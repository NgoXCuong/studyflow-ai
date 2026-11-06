"""Track successful document file cleanup."""

from alembic import op
import sqlalchemy as sa

revision = "0005_document_storage"
down_revision = "0004_documents"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("storage_deleted_at", sa.DateTime(timezone=True)))
    op.create_index("documents_storage_owner_idx", "documents", ["owner_id"],
                    postgresql_where=sa.text("storage_deleted_at IS NULL"))


def downgrade() -> None:
    op.drop_index("documents_storage_owner_idx", table_name="documents")
    op.drop_column("documents", "storage_deleted_at")

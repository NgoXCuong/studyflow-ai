"""Personal flashcard decks and mind maps linked to documents."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0012_study_materials"
down_revision = "0011_study_plans"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("study_materials",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("document_id", sa.Uuid(), sa.ForeignKey("documents.id"), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("content", JSONB(), nullable=False),
        sa.Column("generation_model", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("kind IN ('flashcards','mindmap')"),
        sa.CheckConstraint("btrim(title) <> ''"))
    op.create_index("study_materials_owner_document_idx", "study_materials", ["owner_id", "document_id"])


def downgrade():
    op.drop_table("study_materials")

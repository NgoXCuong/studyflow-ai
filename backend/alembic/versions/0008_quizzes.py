"""Add private AI generated draft quizzes."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0008_quizzes"
down_revision = "0007_conversations"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("quizzes",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("document_id", sa.Uuid(), sa.ForeignKey("documents.id"), nullable=False),
        sa.Column("title", sa.Text(), nullable=False), sa.Column("difficulty", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'draft'")),
        sa.Column("generation_model", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status = 'draft'"), sa.CheckConstraint("difficulty IN ('easy','medium','hard')"))
    op.create_index("quizzes_owner_document_idx", "quizzes", ["owner_id", "document_id"])
    op.create_table("quiz_questions",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("quiz_id", sa.Uuid(), sa.ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False), sa.Column("question", sa.Text(), nullable=False),
        sa.Column("choices", JSONB(), nullable=False), sa.Column("correct_index", sa.Integer(), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False), sa.Column("topic", sa.Text(), nullable=False),
        sa.Column("sources", JSONB(), nullable=False), sa.UniqueConstraint("quiz_id", "position"),
        sa.CheckConstraint("position >= 0"), sa.CheckConstraint("correct_index BETWEEN 0 AND 3"),
        sa.CheckConstraint("jsonb_array_length(choices) = 4"))


def downgrade():
    op.drop_table("quiz_questions")
    op.drop_table("quizzes")

"""Personal study plans and scheduled tasks."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0011_study_plans"
down_revision = "0010_quiz_attempts"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("study_plans",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("course_id", sa.Uuid(), sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("goal", sa.Text(), nullable=False),
        sa.Column("exam_date", sa.Date(), nullable=False),
        sa.Column("availability", JSONB(), nullable=False),
        sa.Column("read_minutes", sa.Integer(), nullable=False),
        sa.Column("quiz_minutes", sa.Integer(), nullable=False),
        sa.Column("review_minutes", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("btrim(goal) <> ''"),
        sa.CheckConstraint("read_minutes BETWEEN 1 AND 1440 AND quiz_minutes BETWEEN 1 AND 1440 AND review_minutes BETWEEN 1 AND 1440"))
    op.create_index("study_plans_user_idx", "study_plans", ["user_id", "created_at"])
    op.create_table("study_tasks",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("plan_id", sa.Uuid(), sa.ForeignKey("study_plans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("topic_key", sa.Text(), nullable=False), sa.Column("topic", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False), sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("document_id", sa.Uuid(), sa.ForeignKey("documents.id")),
        sa.Column("quiz_id", sa.Uuid(), sa.ForeignKey("quizzes.id")),
        sa.Column("page_number", sa.Integer()),
        sa.Column("scheduled_at", sa.DateTime(timezone=True)), sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("unscheduled_reason", sa.Text()),
        sa.CheckConstraint("kind IN ('read','quiz','review')"),
        sa.CheckConstraint("duration_minutes BETWEEN 1 AND 1440"),
        sa.UniqueConstraint("plan_id", "topic_key", "kind"))
    op.create_index("study_tasks_plan_idx", "study_tasks", ["plan_id"])


def downgrade():
    op.drop_table("study_tasks")
    op.drop_table("study_plans")

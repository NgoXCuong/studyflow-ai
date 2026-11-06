"""Add account administration audit logs."""

from alembic import op
import sqlalchemy as sa

revision = "0003_admin"
down_revision = "0002_courses"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admin_audit_logs",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("actor_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("target_user_id", sa.Uuid(), sa.ForeignKey("users.id")),
        sa.Column("old_role", sa.Text()),
        sa.Column("new_role", sa.Text()),
        sa.Column("old_status", sa.Text()),
        sa.Column("new_status", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("btrim(action) <> ''"),
        sa.CheckConstraint("old_role IN ('student','teacher','admin')"),
        sa.CheckConstraint("new_role IN ('student','teacher','admin')"),
        sa.CheckConstraint("old_status IN ('active','locked')"),
        sa.CheckConstraint("new_status IN ('active','locked')"),
    )
    op.create_index("admin_audit_logs_actor_idx", "admin_audit_logs", ["actor_id", sa.text("created_at DESC")])
    op.create_index("admin_audit_logs_target_idx", "admin_audit_logs", ["target_user_id", sa.text("created_at DESC")])


def downgrade() -> None:
    op.drop_table("admin_audit_logs")

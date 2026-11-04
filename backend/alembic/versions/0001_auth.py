"""Initial auth schema, compatible with the existing 0001_auth database."""

from alembic import op
import sqlalchemy as sa

revision = "0001_auth"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("email", sa.Text(), nullable=False, unique=True),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("full_name", sa.Text(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False, server_default=sa.text("'student'")),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'active'")),
        sa.Column("email_verified_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("email = lower(btrim(email)) AND email <> ''", name="users_email_check"),
        sa.CheckConstraint("btrim(password_hash) <> ''", name="users_password_hash_check"),
        sa.CheckConstraint("btrim(full_name) <> ''", name="users_full_name_check"),
        sa.CheckConstraint("role IN ('student','teacher','admin')", name="users_role_check"),
        sa.CheckConstraint("status IN ('active','locked')", name="users_status_check"),
    )
    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("refresh_token_hash", sa.Text(), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("btrim(refresh_token_hash) <> ''", name="auth_sessions_refresh_token_hash_check"),
        sa.CheckConstraint("expires_at > created_at", name="auth_sessions_check"),
        sa.CheckConstraint("revoked_at IS NULL OR revoked_at >= created_at", name="auth_sessions_check1"),
    )
    op.create_index("auth_sessions_user_idx", "auth_sessions", ["user_id"])
    op.create_table(
        "auth_tokens",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("purpose", sa.Text(), nullable=False),
        sa.Column("token_hash", sa.Text(), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("purpose IN ('email_verification','password_reset')", name="auth_tokens_purpose_check"),
        sa.CheckConstraint("btrim(token_hash) <> ''", name="auth_tokens_token_hash_check"),
        sa.CheckConstraint("expires_at > created_at", name="auth_tokens_check"),
        sa.CheckConstraint("consumed_at IS NULL OR consumed_at >= created_at", name="auth_tokens_check1"),
    )
    op.create_index("auth_tokens_user_idx", "auth_tokens", ["user_id", "purpose"])


def downgrade() -> None:
    op.drop_index("auth_tokens_user_idx", table_name="auth_tokens")
    op.drop_table("auth_tokens")
    op.drop_index("auth_sessions_user_idx", table_name="auth_sessions")
    op.drop_table("auth_sessions")
    op.drop_table("users")

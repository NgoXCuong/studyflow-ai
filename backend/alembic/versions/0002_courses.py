"""Add courses, chapters, topics and classrooms."""

from alembic import op
import sqlalchemy as sa

revision = "0002_courses"
down_revision = "56422fe37906"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "courses",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.CheckConstraint("kind IN ('personal','teaching')"),
        sa.Column("title", sa.Text(), nullable=False),
        sa.CheckConstraint("btrim(title) <> ''"),
        sa.Column("description", sa.Text()),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("courses_owner_idx", "courses", ["owner_id"], postgresql_where=sa.text("deleted_at IS NULL"))
    op.create_table(
        "classrooms",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("course_id", sa.Uuid(), sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.CheckConstraint("btrim(title) <> ''"),
        sa.Column("join_code_hash", sa.Text(), unique=True),
        sa.CheckConstraint("join_code_hash IS NULL OR btrim(join_code_hash) <> ''"),
        sa.Column("join_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("id", "course_id"),
        sa.CheckConstraint("NOT join_enabled OR join_code_hash IS NOT NULL"),
    )
    op.create_index("classrooms_course_idx", "classrooms", ["course_id"])
    op.create_table(
        "classroom_members",
        sa.Column("classroom_id", sa.Uuid(), sa.ForeignKey("classrooms.id"), nullable=False),
        sa.Column("student_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("left_at", sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint("classroom_id", "student_id"),
        sa.CheckConstraint("left_at IS NULL OR left_at >= joined_at"),
    )
    op.create_index("classroom_members_student_idx", "classroom_members", ["student_id", "classroom_id"])
    op.create_table(
        "chapters",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("course_id", sa.Uuid(), sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.CheckConstraint("btrim(title) <> ''"),
        sa.Column("position", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.CheckConstraint("position >= 0"),
        sa.UniqueConstraint("id", "course_id"),
    )
    op.create_index("chapters_course_idx", "chapters", ["course_id", "position"])
    op.create_table(
        "topics",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("course_id", sa.Uuid(), sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("chapter_id", sa.Uuid()),
        sa.Column("title", sa.Text(), nullable=False),
        sa.CheckConstraint("btrim(title) <> ''"),
        sa.Column("description", sa.Text()),
        sa.UniqueConstraint("id", "course_id"),
        sa.ForeignKeyConstraint(["chapter_id", "course_id"], ["chapters.id", "chapters.course_id"]),
    )
    op.create_index("topics_course_idx", "topics", ["course_id"])
    op.create_index("topics_chapter_idx", "topics", ["chapter_id"])



def downgrade() -> None:
    for table in ("topics", "chapters", "classroom_members", "classrooms", "courses"):
        op.drop_table(table)

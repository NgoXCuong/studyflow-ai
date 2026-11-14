"""Publish immutable personal and reviewed classroom quizzes."""
from alembic import op
import sqlalchemy as sa

revision = "0009_quiz_publication"
down_revision = "0008_quizzes"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("quizzes", sa.Column("classroom_id", sa.Uuid(), sa.ForeignKey("classrooms.id")))
    op.add_column("quizzes", sa.Column("reviewed_by", sa.Uuid(), sa.ForeignKey("users.id")))
    op.add_column("quizzes", sa.Column("published_at", sa.DateTime(timezone=True)))
    op.add_column("quizzes", sa.Column("copied_from_id", sa.Uuid(), sa.ForeignKey("quizzes.id")))
    op.drop_constraint("quizzes_status_check", "quizzes", type_="check")
    op.create_check_constraint("quizzes_status_check", "quizzes", "status IN ('draft','published')")
    op.create_check_constraint("quizzes_publication_check", "quizzes",
        "(status = 'draft' AND published_at IS NULL AND reviewed_by IS NULL AND classroom_id IS NULL) OR "
        "(status = 'published' AND published_at IS NOT NULL AND (classroom_id IS NULL OR reviewed_by = owner_id))")
    op.create_check_constraint("quizzes_review_check", "quizzes", "classroom_id IS NULL OR reviewed_by IS NOT NULL")
    op.create_index("quizzes_classroom_idx", "quizzes", ["classroom_id", "status"])
    op.execute("""
        CREATE FUNCTION guard_published_quiz() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF OLD.status = 'published' THEN
                RAISE EXCEPTION 'Published quizzes are immutable; create a draft copy';
            END IF;
            IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
            RETURN NEW;
        END $$;
        CREATE TRIGGER guard_published_quiz BEFORE UPDATE OR DELETE ON quizzes
        FOR EACH ROW EXECUTE FUNCTION guard_published_quiz();

        CREATE FUNCTION guard_published_quiz_question() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE quiz_key uuid; quiz_status text;
        BEGIN
            IF TG_OP = 'UPDATE' AND NEW.quiz_id <> OLD.quiz_id THEN
                RAISE EXCEPTION 'Moving quiz questions is not allowed';
            END IF;
            IF TG_OP = 'DELETE' THEN quiz_key := OLD.quiz_id; ELSE quiz_key := NEW.quiz_id; END IF;
            SELECT status INTO quiz_status FROM quizzes WHERE id = quiz_key FOR UPDATE;
            IF quiz_status = 'published' THEN
                RAISE EXCEPTION 'Published quiz questions are immutable; create a draft copy';
            END IF;
            IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
            RETURN NEW;
        END $$;
        CREATE TRIGGER guard_published_quiz_question BEFORE INSERT OR UPDATE OR DELETE ON quiz_questions
        FOR EACH ROW EXECUTE FUNCTION guard_published_quiz_question();
    """)


def downgrade():
    # Refuse downgrade while published rows exist rather than rewriting their history.
    op.drop_constraint("quizzes_status_check", "quizzes", type_="check")
    op.create_check_constraint("quizzes_status_check", "quizzes", "status = 'draft'")
    op.execute("DROP TRIGGER guard_published_quiz_question ON quiz_questions")
    op.execute("DROP FUNCTION guard_published_quiz_question()")
    op.execute("DROP TRIGGER guard_published_quiz ON quizzes")
    op.execute("DROP FUNCTION guard_published_quiz()")
    op.drop_index("quizzes_classroom_idx", "quizzes")
    op.drop_constraint("quizzes_review_check", "quizzes", type_="check")
    op.drop_constraint("quizzes_publication_check", "quizzes", type_="check")
    for column in ("copied_from_id", "published_at", "reviewed_by", "classroom_id"):
        op.drop_column("quizzes", column)

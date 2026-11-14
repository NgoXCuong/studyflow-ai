"""Add quiz attempts, database grading and immutable submitted history."""
from alembic import op
import sqlalchemy as sa

revision = "0010_quiz_attempts"
down_revision = "0009_quiz_publication"
branch_labels = None
depends_on = None


def upgrade():
    op.create_unique_constraint("quiz_questions_id_quiz_key", "quiz_questions", ["id", "quiz_id"])
    op.create_table("quiz_attempts",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("quiz_id", sa.Uuid(), sa.ForeignKey("quizzes.id"), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("source_attempt_id", sa.Uuid()),
        sa.Column("scope", sa.Text(), nullable=False, server_default=sa.text("'full'")),
        sa.Column("purpose", sa.Text(), nullable=False, server_default=sa.text("'practice'")),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'in_progress'")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("submitted_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("id", "quiz_id"), sa.UniqueConstraint("id", "quiz_id", "user_id"),
        sa.ForeignKeyConstraint(["source_attempt_id", "quiz_id", "user_id"],
                                ["quiz_attempts.id", "quiz_attempts.quiz_id", "quiz_attempts.user_id"]),
        sa.CheckConstraint("scope IN ('full','wrong_only')"),
        sa.CheckConstraint("purpose IN ('practice','diagnostic')"),
        sa.CheckConstraint("status IN ('in_progress','submitted')"),
        sa.CheckConstraint("scope <> 'wrong_only' OR source_attempt_id IS NOT NULL"),
        sa.CheckConstraint("source_attempt_id IS NULL OR source_attempt_id <> id"),
        sa.CheckConstraint("(status = 'submitted') = (submitted_at IS NOT NULL)"),
        sa.CheckConstraint("submitted_at IS NULL OR submitted_at >= started_at"))
    op.create_index("quiz_attempts_user_idx", "quiz_attempts", ["user_id", "started_at"])
    op.create_index("quiz_attempts_quiz_idx", "quiz_attempts", ["quiz_id", "status"])
    op.create_index("quiz_attempts_active_idx", "quiz_attempts", ["quiz_id", "user_id"],
                    unique=True, postgresql_where=sa.text("status = 'in_progress'"))
    op.create_table("attempt_answers",
        sa.Column("attempt_id", sa.Uuid(), primary_key=True),
        sa.Column("question_id", sa.Uuid(), primary_key=True),
        sa.Column("quiz_id", sa.Uuid(), nullable=False),
        sa.Column("selected_index", sa.Integer()), sa.Column("is_correct", sa.Boolean()),
        sa.ForeignKeyConstraint(["attempt_id", "quiz_id"], ["quiz_attempts.id", "quiz_attempts.quiz_id"]),
        sa.ForeignKeyConstraint(["question_id", "quiz_id"], ["quiz_questions.id", "quiz_questions.quiz_id"]),
        sa.CheckConstraint("selected_index IS NULL OR selected_index BETWEEN 0 AND 3"))
    op.execute("""
        CREATE FUNCTION guard_attempt_answer() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE attempt_key uuid; attempt_status text; correct_index integer;
        BEGIN
            IF TG_OP = 'UPDATE' AND ROW(NEW.attempt_id,NEW.quiz_id,NEW.question_id)
                IS DISTINCT FROM ROW(OLD.attempt_id,OLD.quiz_id,OLD.question_id) THEN
                RAISE EXCEPTION 'Attempt answer identity is immutable';
            END IF;
            IF TG_OP = 'DELETE' THEN attempt_key := OLD.attempt_id; ELSE attempt_key := NEW.attempt_id; END IF;
            SELECT status INTO attempt_status FROM quiz_attempts WHERE id = attempt_key FOR UPDATE;
            IF attempt_status IS DISTINCT FROM 'in_progress' THEN
                RAISE EXCEPTION 'Only in-progress attempts can change';
            END IF;
            IF TG_OP IN ('INSERT','DELETE') AND pg_trigger_depth() < 2 THEN
                RAISE EXCEPTION 'Attempt question set is managed at attempt start';
            END IF;
            IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
            IF TG_OP = 'UPDATE' AND pg_trigger_depth() >= 2 THEN
                SELECT q.correct_index INTO correct_index FROM quiz_questions q
                WHERE q.id = NEW.question_id AND q.quiz_id = NEW.quiz_id;
                NEW.is_correct := COALESCE(NEW.selected_index = correct_index,false);
            ELSE NEW.is_correct := NULL;
            END IF;
            RETURN NEW;
        END $$;
        CREATE TRIGGER guard_attempt_answer BEFORE INSERT OR UPDATE OR DELETE ON attempt_answers
        FOR EACH ROW EXECUTE FUNCTION guard_attempt_answer();

        CREATE FUNCTION guard_quiz_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Attempt history cannot be deleted'; END IF;
            IF TG_OP = 'INSERT' THEN
                IF NEW.status <> 'in_progress' OR NOT EXISTS (
                    SELECT 1 FROM quizzes WHERE id = NEW.quiz_id AND status = 'published'
                ) THEN RAISE EXCEPTION 'Only published quizzes can be attempted'; END IF;
                IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id AND role = 'student' AND status = 'active') THEN
                    RAISE EXCEPTION 'Only active students can start attempts';
                END IF;
                IF NEW.source_attempt_id IS NOT NULL AND NOT EXISTS (
                    SELECT 1 FROM quiz_attempts WHERE id = NEW.source_attempt_id AND quiz_id = NEW.quiz_id
                    AND user_id = NEW.user_id AND status = 'submitted' AND purpose = NEW.purpose
                ) THEN RAISE EXCEPTION 'Retry source must be a submitted attempt of the same user, quiz and purpose'; END IF;
                RETURN NEW;
            END IF;
            IF OLD.status <> 'in_progress' OR ROW(NEW.id,NEW.quiz_id,NEW.user_id,NEW.source_attempt_id,NEW.scope,NEW.purpose,NEW.started_at)
                IS DISTINCT FROM ROW(OLD.id,OLD.quiz_id,OLD.user_id,OLD.source_attempt_id,OLD.scope,OLD.purpose,OLD.started_at) THEN
                RAISE EXCEPTION 'Submitted history and attempt identity are immutable';
            END IF;
            IF NEW.status = 'submitted' THEN
                UPDATE attempt_answers SET is_correct = false WHERE attempt_id = OLD.id;
                IF NOT FOUND THEN RAISE EXCEPTION 'Cannot submit an empty attempt'; END IF;
                NEW.submitted_at := clock_timestamp();
            END IF;
            RETURN NEW;
        END $$;
        CREATE TRIGGER guard_quiz_attempt BEFORE INSERT OR UPDATE OR DELETE ON quiz_attempts
        FOR EACH ROW EXECUTE FUNCTION guard_quiz_attempt();

        CREATE FUNCTION start_quiz_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            INSERT INTO attempt_answers (attempt_id,quiz_id,question_id)
            SELECT NEW.id,NEW.quiz_id,q.id FROM quiz_questions q WHERE q.quiz_id = NEW.quiz_id
            AND (NEW.scope = 'full' OR EXISTS (
                SELECT 1 FROM attempt_answers a WHERE a.attempt_id = NEW.source_attempt_id
                AND a.question_id = q.id AND a.is_correct = false));
            IF NOT FOUND THEN RAISE EXCEPTION 'No questions available for this attempt'; END IF;
            RETURN NEW;
        END $$;
        CREATE TRIGGER start_quiz_attempt AFTER INSERT ON quiz_attempts
        FOR EACH ROW EXECUTE FUNCTION start_quiz_attempt();
    """)


def downgrade():
    op.execute("DROP TRIGGER start_quiz_attempt ON quiz_attempts")
    op.execute("DROP FUNCTION start_quiz_attempt()")
    op.execute("DROP TRIGGER guard_quiz_attempt ON quiz_attempts")
    op.execute("DROP FUNCTION guard_quiz_attempt()")
    op.execute("DROP TRIGGER guard_attempt_answer ON attempt_answers")
    op.execute("DROP FUNCTION guard_attempt_answer()")
    op.drop_table("attempt_answers")
    op.drop_table("quiz_attempts")
    op.drop_constraint("quiz_questions_id_quiz_key", "quiz_questions", type_="unique")

from alembic import context

from app.db.base import Base
from app.db.connection import get_engine
from app.models import study_materials  # noqa: F401
from app.models import admin, attempts, auth, conversations, courses, documents, processing, quizzes, study_plans  # noqa: F401

config = context.config
target_metadata = Base.metadata


def include_object(obj, name, type_, reflected, compare_to):
    # Không đề xuất xóa bảng chưa được module hiện tại quản lý.
    return not (type_ == "table" and reflected and compare_to is None)


def run_migrations(connection):
    context.configure(
        connection=connection,
        version_table_schema=connection.dialect.default_schema_name,
        target_metadata=target_metadata,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    context.configure(
        url=get_engine().url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()
else:
    connection = config.attributes.get("connection")
    if connection is not None:
        run_migrations(connection)
    else:
        with get_engine().connect() as connection:
            run_migrations(connection)

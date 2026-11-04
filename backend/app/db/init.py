from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from app.db.connection import get_engine


def main() -> None:
    required = {"users", "auth_sessions", "auth_tokens"}
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    with get_engine().begin() as connection:
        existing = set(inspect(connection).get_table_names())
        if required & existing and "alembic_version" not in existing:
            raise SystemExit(
                "Existing unversioned auth schema. Compare it with revision 0001_auth "
                "before using alembic stamp; no schema or data was changed."
            )
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
    print("Database is at the latest Alembic revision.")


if __name__ == "__main__":
    main()

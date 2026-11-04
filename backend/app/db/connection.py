from collections.abc import Iterator
from functools import lru_cache

from fastapi import HTTPException
from sqlalchemy import URL, Engine, create_engine
from sqlalchemy.exc import OperationalError, TimeoutError
from sqlalchemy.orm import Session

from app.core.config import get_settings


@lru_cache
def get_engine() -> Engine:
    settings = get_settings()
    url = URL.create(
        "postgresql+psycopg",
        host=settings.postgres_host,
        port=settings.postgres_port,
        database=settings.postgres_db,
        username=settings.postgres_user,
        password=settings.postgres_password.get_secret_value(),
    )
    return create_engine(url, pool_pre_ping=True, connect_args={"connect_timeout": 5})


def get_db() -> Iterator[Session]:
    try:
        with Session(get_engine(), expire_on_commit=False) as session, session.begin():
            yield session
    except (OperationalError, TimeoutError) as exc:
        raise HTTPException(503, "Không kết nối được database.") from exc

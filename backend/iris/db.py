"""Database engine and session management (SQLite by default).

The rest of the application only depends on SQLAlchemy sessions, so the
backing store can be changed by pointing ``IRIS_DATABASE_URL`` elsewhere.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from iris.config import DB_PATH

DATABASE_URL = os.environ.get("IRIS_DATABASE_URL", f"sqlite:///{DB_PATH}")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_session() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def create_all() -> None:
    from iris import models  # noqa: F401  (register models)

    Base.metadata.create_all(engine)


def drop_all() -> None:
    from iris import models  # noqa: F401

    Base.metadata.drop_all(engine)

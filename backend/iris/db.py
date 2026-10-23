"""Database engine and session management (SQLite by default).

The rest of the application only depends on SQLAlchemy sessions, so the
backing store can be changed by pointing ``IRIS_DATABASE_URL`` elsewhere.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

from sqlalchemy import create_engine, inspect, text
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
    add_missing_columns(engine)


def add_missing_columns(bind) -> list[str]:
    """Add nullable columns that the models define but an existing database lacks.

    create_all creates missing tables but never alters existing ones. This adds
    only *nullable* columns, so it never rewrites or deletes data; existing rows
    get NULL until the demo is reset. Returns the columns added.
    """
    added = []
    insp = inspect(bind)
    existing_tables = set(insp.get_table_names())
    with bind.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue
            have = {c["name"] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name in have or not col.nullable or col.primary_key:
                    continue
                ddl = col.type.compile(dialect=bind.dialect)
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {ddl}'))
                added.append(f"{table.name}.{col.name}")
    return added


def drop_all() -> None:
    from iris import models  # noqa: F401

    Base.metadata.drop_all(engine)

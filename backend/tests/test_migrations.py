from sqlalchemy import create_engine, text

from iris.db import Base, add_missing_columns


def test_missing_nullable_columns_are_added_without_losing_rows(tmp_path):
    import iris.models  # noqa: F401  (register every table)

    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        # Simulate a database created before these columns existed.
        conn.execute(text("ALTER TABLE reporting_units DROP COLUMN geo_x"))
        conn.execute(text("ALTER TABLE reporting_units DROP COLUMN geo_y"))
        conn.execute(text("INSERT INTO reporting_units (id, name, unit_type, province, active, is_sentinel, notes, x, y, simulated) "
                          "VALUES ('U1', 'Unit one', 'rhu', 'P', 1, 0, '', 0, 0, 1)"))
    assert sorted(add_missing_columns(engine)) == ["reporting_units.geo_x", "reporting_units.geo_y"]
    with engine.connect() as conn:
        row = conn.execute(text("SELECT id, name, geo_x FROM reporting_units")).one()
    assert row.id == "U1" and row.name == "Unit one" and row.geo_x is None
    assert add_missing_columns(engine) == []  # idempotent

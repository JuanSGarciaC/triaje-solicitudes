"""Migraciones: base vacía, base anterior a Alembic (creada con create_all) y sin deriva con los modelos."""
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect, text

from app.database import Base, migrate


def engine_at(tmp_path, name):
    return create_engine(f"sqlite:///{(tmp_path / name).as_posix()}")


def legacy_db(tmp_path):
    """Base como la dejaba create_all: esquema 0001 sin tabla alembic_version, con una fila."""
    from alembic import command
    from alembic.config import Config

    from app.database import MIGRATIONS

    eng = engine_at(tmp_path, "legacy.db")
    cfg = Config(str(MIGRATIONS.parent / "alembic.ini"))
    cfg.set_main_option("script_location", str(MIGRATIONS))
    with eng.begin() as conn:
        cfg.attributes["connection"] = conn
        command.upgrade(cfg, "0001")
        conn.execute(text("DROP TABLE alembic_version"))
        conn.execute(text(
            "INSERT INTO requests (subject, body, requester, created_at, status, pred_category, pred_priority,"
            " pred_summary, pred_confidence, pred_reasoning, classifier_version)"
            " VALUES ('VPN', 'No conecta la VPN', 'Ana', '2026-11-01 10:00:00', 'needs_review', 'red_conectividad',"
            " 'alta', 'VPN', 0.9, 'x', 'mock-keywords-v1')"
        ))
    return eng


def test_base_vacia_queda_en_la_ultima_version_sin_deriva(tmp_path):
    eng = engine_at(tmp_path, "vacia.db")
    migrate(eng)
    with eng.connect() as conn:
        assert compare_metadata(MigrationContext.configure(conn), Base.metadata) == []


def test_base_anterior_a_alembic_conserva_sus_datos(tmp_path):
    eng = legacy_db(tmp_path)
    migrate(eng)
    migrate(eng)  # idempotente
    with eng.connect() as conn:
        assert conn.execute(text("SELECT subject FROM requests")).scalar_one() == "VPN"
        assert "alembic_version" in inspect(conn).get_table_names()
        assert compare_metadata(MigrationContext.configure(conn), Base.metadata) == []

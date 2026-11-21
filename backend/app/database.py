from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def migrate(eng=None) -> None:
    """Lleva la base a la última migración. Una base creada con create_all (antes de Alembic)
    se marca como 0001 sin tocarla y sigue desde ahí."""
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import inspect

    cfg = Config(str(MIGRATIONS.parent / "alembic.ini"))
    cfg.set_main_option("script_location", str(MIGRATIONS))
    with (eng or engine).begin() as conn:
        cfg.attributes["connection"] = conn
        tables = inspect(conn).get_table_names()
        if "requests" in tables and "alembic_version" not in tables:
            command.stamp(cfg, "0001")
        command.upgrade(cfg, "head")

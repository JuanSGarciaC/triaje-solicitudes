from alembic import context
from sqlalchemy import engine_from_config, pool

from app import models  # noqa: F401  registra las tablas en Base.metadata
from app.config import settings
from app.database import Base

config = context.config
connection = config.attributes.get("connection")


def run(conn) -> None:
    # render_as_batch: SQLite no altera columnas; Alembic recrea la tabla cuando hace falta.
    context.configure(connection=conn, target_metadata=Base.metadata, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()


if connection is not None:  # llamada desde app.database.migrate()
    run(connection)
else:  # CLI
    engine = engine_from_config({"sqlalchemy.url": settings.database_url}, prefix="sqlalchemy.", poolclass=pool.NullPool)
    with engine.connect() as conn:
        run(conn)

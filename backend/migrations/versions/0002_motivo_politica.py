"""Motivo de la política, umbral vigente y marca de fallo del modelo.

Revision ID: 0002
Revises: 0001
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("requests") as t:
        t.add_column(sa.Column("classifier_failed", sa.Boolean(), server_default=sa.false(), nullable=False))
        t.add_column(sa.Column("policy_reason", sa.String(80), nullable=True))
        t.add_column(sa.Column("policy_threshold", sa.Float(), nullable=True))
        t.create_index("ix_requests_classifier_failed", ["classifier_failed"])
    # Filas anteriores: el respaldo se reconoce por su texto fijo y confianza 0 (ver classifier.fallback).
    # El motivo y el umbral de entonces no se guardaron: quedan vacíos en vez de inventarlos.
    op.execute(
        "UPDATE requests SET classifier_failed = 1 "
        "WHERE pred_confidence = 0 AND pred_reasoning LIKE 'El clasificador falló%'"
    )


def downgrade() -> None:
    with op.batch_alter_table("requests") as t:
        t.drop_index("ix_requests_classifier_failed")
        t.drop_column("policy_threshold")
        t.drop_column("policy_reason")
        t.drop_column("classifier_failed")

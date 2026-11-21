"""Esquema inicial (el que creaba create_all antes de Alembic).

Revision ID: 0001
"""
import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("subject", sa.String(200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("requester", sa.String(120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("pred_category", sa.String(40), nullable=False),
        sa.Column("pred_priority", sa.String(10), nullable=False),
        sa.Column("pred_summary", sa.Text(), nullable=False),
        sa.Column("pred_confidence", sa.Float(), nullable=False),
        sa.Column("pred_reasoning", sa.Text(), nullable=False),
        sa.Column("classifier_version", sa.String(80), nullable=False),
        sa.Column("final_category", sa.String(40), nullable=True),
        sa.Column("final_priority", sa.String(10), nullable=True),
        sa.Column("reviewer", sa.String(120), nullable=True),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_requests_status", "requests", ["status"])
    op.create_table(
        "idempotency_keys",
        sa.Column("key", sa.String(200), primary_key=True),
        sa.Column("request_id", sa.Integer(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("idempotency_keys")
    op.drop_index("ix_requests_status", "requests")
    op.drop_table("requests")

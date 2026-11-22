"""Avisos al cambiar de estado (webhook saliente o simulado).

Revision ID: 0005
Revises: 0004
"""
import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("request_id", sa.Integer(), sa.ForeignKey("requests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("signature", sa.String(80), nullable=True),
        sa.Column("delivery", sa.String(12), nullable=False),
    )
    op.create_index("ix_notifications_request_id", "notifications", ["request_id"])


def downgrade() -> None:
    op.drop_index("ix_notifications_request_id", "notifications")
    op.drop_table("notifications")

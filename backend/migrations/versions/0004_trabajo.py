"""Estado de trabajo (abierta, en curso, resuelta), persona asignada y fecha de resolución.

Revision ID: 0004
Revises: 0003
"""
import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("requests") as t:
        t.add_column(sa.Column("work_state", sa.String(12), server_default="abierta", nullable=False))
        t.add_column(sa.Column("assignee", sa.String(120), nullable=True))
        t.add_column(sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True))
        t.create_index("ix_requests_work_state", ["work_state"])


def downgrade() -> None:
    with op.batch_alter_table("requests") as t:
        t.drop_index("ix_requests_work_state")
        t.drop_column("resolved_at")
        t.drop_column("assignee")
        t.drop_column("work_state")

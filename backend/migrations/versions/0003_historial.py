"""Historial de eventos por solicitud.

Revision ID: 0003
Revises: 0002
"""
import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    events = op.create_table(
        "request_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("request_id", sa.Integer(), sa.ForeignKey("requests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("actor", sa.String(120), nullable=False),
        sa.Column("detail", sa.JSON(), nullable=False),
    )
    op.create_index("ix_request_events_request_id", "request_events", ["request_id"])
    # Reconstruye lo que se sabe de las filas anteriores; "backfill" avisa que no se registró en su momento.
    rows = op.get_bind().execute(sa.text(
        "SELECT id, requester, created_at, status, pred_category, pred_priority, pred_confidence,"
        " classifier_version, classifier_failed, final_category, final_priority, reviewer, reviewed_at FROM requests"
    ).columns(created_at=sa.DateTime(timezone=True), reviewed_at=sa.DateTime(timezone=True))).mappings()
    out = []
    for r in rows:
        base = {"request_id": r["id"], "at": r["created_at"]}
        out += [
            {**base, "kind": "received", "actor": r["requester"], "detail": {"backfill": True}},
            {**base, "kind": "classified", "actor": "sistema", "detail": {
                "backfill": True, "version": r["classifier_version"], "category": r["pred_category"],
                "priority": r["pred_priority"], "confidence": r["pred_confidence"], "failed": bool(r["classifier_failed"])}},
        ]
        if r["reviewed_at"]:
            corrected = (r["final_category"], r["final_priority"]) != (r["pred_category"], r["pred_priority"])
            out.append({"request_id": r["id"], "at": r["reviewed_at"], "kind": "reviewed", "actor": r["reviewer"] or "?",
                        "detail": {"backfill": True, "category": r["final_category"], "priority": r["final_priority"],
                                   "corrected": corrected}})
    if out:
        op.bulk_insert(events, out)


def downgrade() -> None:
    op.drop_index("ix_request_events_request_id", "request_events")
    op.drop_table("request_events")

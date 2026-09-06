"""创作者结算批次状态。"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "20260906_0007"
down_revision = "20260906_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if "settlements" in set(inspect(op.get_bind()).get_table_names()):
        return
    op.create_table(
        "settlements",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("creator_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="CNY"),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("idempotency_key", sa.String(100), nullable=False),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("provider_reference", sa.String(128), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("idempotency_key", name="uq_settlement_idempotency_key"),
        sa.CheckConstraint("amount_cents > 0", name="ck_settlement_positive_amount"),
        sa.CheckConstraint("status IN ('pending', 'processing', 'paid', 'failed')", name="ck_settlement_status"),
    )
    op.create_index("ix_settlements_creator_id", "settlements", ["creator_id"])
    op.create_index("ix_settlements_status", "settlements", ["status"])


def downgrade() -> None:
    raise RuntimeError("结算审计记录不允许自动降级或删除")

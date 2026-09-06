"""交易复式账本。历史数据不推断资金事实，仅从上线后开始记账。"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "20260906_0006"
down_revision = "20260906_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if "ledger_transactions" in set(inspect(op.get_bind()).get_table_names()):
        return
    op.create_table(
        "ledger_transactions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("reference_type", sa.String(24), nullable=False),
        sa.Column("reference_id", sa.String(36), nullable=False),
        sa.Column("order_id", sa.String(36), sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="CNY"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("reference_type", "reference_id", name="uq_ledger_reference"),
    )
    op.create_index("ix_ledger_transactions_order_id", "ledger_transactions", ["order_id"])
    op.create_table(
        "ledger_entries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("transaction_id", sa.String(36), sa.ForeignKey("ledger_transactions.id"), nullable=False),
        sa.Column("account_code", sa.String(100), nullable=False),
        sa.Column("direction", sa.String(6), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("direction IN ('debit', 'credit')", name="ck_ledger_direction"),
        sa.CheckConstraint("amount_cents > 0", name="ck_ledger_positive_amount"),
    )
    op.create_index("ix_ledger_entries_transaction_id", "ledger_entries", ["transaction_id"])
    op.create_index("ix_ledger_entries_account", "ledger_entries", ["account_code"])


def downgrade() -> None:
    raise RuntimeError("财务账本不允许自动降级或删除")

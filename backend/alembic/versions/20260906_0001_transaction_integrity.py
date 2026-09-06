"""建立迁移基线并补齐不可变交易事实。"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

from app.database import Base
from app import models  # noqa: F401

revision = "20260906_0001"
down_revision = None
branch_labels = None
depends_on = None


def has_column(table: str, column: str) -> bool:
    return column in {item["name"] for item in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    # 新数据库直接从当前模型创建；已有 MVP 数据库只补缺失字段和表。
    Base.metadata.create_all(bind=bind)
    if not has_column("orders", "work_id"):
        op.add_column("orders", sa.Column("work_id", sa.String(36), nullable=True))
        op.add_column("orders", sa.Column("version_id", sa.String(36), nullable=True))
        op.add_column("orders", sa.Column("creator_id", sa.String(36), nullable=True))
        op.add_column("orders", sa.Column("title_snapshot", sa.String(120), nullable=True))
        op.add_column("orders", sa.Column("license_snapshot", sa.String(80), nullable=False, server_default="standard"))
        op.add_column("orders", sa.Column("currency", sa.String(3), nullable=False, server_default="CNY"))
        op.add_column("orders", sa.Column("idempotency_key", sa.String(100), nullable=True))
        op.execute("""
            UPDATE orders o SET
              work_id = l.work_id,
              version_id = l.version_id,
              creator_id = w.creator_id,
              title_snapshot = w.title,
              currency = l.currency,
              idempotency_key = 'legacy:' || o.id
            FROM listings l JOIN works w ON w.id = l.work_id
            WHERE o.listing_id = l.id
        """)
        for column in ("work_id", "version_id", "creator_id", "title_snapshot", "idempotency_key"):
            op.alter_column("orders", column, nullable=False)
        op.create_foreign_key("fk_orders_work", "orders", "works", ["work_id"], ["id"])
        op.create_foreign_key("fk_orders_version", "orders", "work_versions", ["version_id"], ["id"])
        op.create_foreign_key("fk_orders_creator", "orders", "users", ["creator_id"], ["id"])
        op.create_unique_constraint("uq_orders_idempotency_key", "orders", ["idempotency_key"])
        # 旧 MVP 允许重复待支付订单；保留最新一笔，其余关闭后再建立唯一约束。
        op.execute("""
            WITH ranked AS (
              SELECT id, row_number() OVER (PARTITION BY buyer_id, listing_id ORDER BY created_at DESC, id DESC) AS n
              FROM orders
              WHERE status IN ('created', 'payment_submitted', 'payment_failed', 'paid', 'delivered')
            )
            UPDATE orders SET status = 'cancelled' WHERE id IN (SELECT id FROM ranked WHERE n > 1)
        """)
        op.create_index("uq_orders_active_buyer_listing", "orders", ["buyer_id", "listing_id"], unique=True, postgresql_where=sa.text("status IN ('created', 'payment_submitted', 'payment_failed', 'paid', 'delivered')"))
    if not has_column("entitlements", "status"):
        op.add_column("entitlements", sa.Column("status", sa.String(20), nullable=False, server_default="active"))
        op.add_column("entitlements", sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True))
        op.add_column("entitlements", sa.Column("revoked_reason", sa.String(255), nullable=False, server_default=""))
        op.create_index("ix_entitlements_status", "entitlements", ["status"])


def downgrade() -> None:
    raise RuntimeError("交易审计字段不允许自动降级；请从备份恢复")

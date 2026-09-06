"""仅约束有效权益唯一，允许保留退款历史并再次购买。"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "20260906_0004"
down_revision = "20260906_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = inspect(op.get_bind())
    unique_names = {item.get("name") for item in inspector.get_unique_constraints("entitlements")}
    if "uq_user_work_entitlement" in unique_names:
        op.drop_constraint("uq_user_work_entitlement", "entitlements", type_="unique")
    index_names = {item.get("name") for item in inspect(op.get_bind()).get_indexes("entitlements")}
    if "uq_active_user_work_entitlement" not in index_names:
        op.create_index(
            "uq_active_user_work_entitlement",
            "entitlements",
            ["user_id", "work_id"],
            unique=True,
            postgresql_where=sa.text("status = 'active'"),
        )


def downgrade() -> None:
    raise RuntimeError("权益审计历史不允许自动降级")

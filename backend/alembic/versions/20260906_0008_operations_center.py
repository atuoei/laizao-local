"""数据运营快照、质量检查结果与管理员查询审计。"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "20260906_0008"
down_revision = "20260906_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    tables = set(inspect(op.get_bind()).get_table_names())
    if "metric_daily_snapshots" not in tables:
        op.create_table(
            "metric_daily_snapshots",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("metric_date", sa.DateTime(timezone=True), nullable=False),
            sa.Column("metric_name", sa.String(80), nullable=False),
            sa.Column("dimension_key", sa.String(160), nullable=False, server_default="all"),
            sa.Column("value_numeric", sa.Integer(), nullable=False),
            sa.Column("calculated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("metric_date", "metric_name", "dimension_key", name="uq_daily_metric_dimension"),
        )
        op.create_index("ix_metric_daily_snapshots_metric_date", "metric_daily_snapshots", ["metric_date"])
        op.create_index("ix_metric_daily_snapshots_metric_name", "metric_daily_snapshots", ["metric_name"])
    if "data_quality_checks" not in tables:
        op.create_table(
            "data_quality_checks",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("check_name", sa.String(100), nullable=False),
            sa.Column("status", sa.String(16), nullable=False),
            sa.Column("issue_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("details_json", sa.Text(), nullable=False, server_default="{}"),
            sa.Column("checked_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_data_quality_checks_check_name", "data_quality_checks", ["check_name"])
        op.create_index("ix_data_quality_checks_status", "data_quality_checks", ["status"])
        op.create_index("ix_data_quality_checks_checked_at", "data_quality_checks", ["checked_at"])
    if "admin_query_audits" not in tables:
        op.create_table(
            "admin_query_audits",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("admin_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("report_name", sa.String(100), nullable=False),
            sa.Column("filters_json", sa.Text(), nullable=False, server_default="{}"),
            sa.Column("row_count", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_admin_query_audits_admin_id", "admin_query_audits", ["admin_id"])
        op.create_index("ix_admin_query_audits_report_name", "admin_query_audits", ["report_name"])
        op.create_index("ix_admin_query_audits_created_at", "admin_query_audits", ["created_at"])


def downgrade() -> None:
    raise RuntimeError("运营审计与质量历史不允许自动降级")

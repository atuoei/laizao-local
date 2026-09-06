"""审核状态下沉至作品版本，发布指针仅在批准时切换。"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

revision = "20260906_0005"
down_revision = "20260906_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {item["name"] for item in inspect(op.get_bind()).get_columns("work_versions")}
    if "review_status" not in columns:
        review_enum = postgresql.ENUM(name="reviewstatus", create_type=False)
        op.add_column("work_versions", sa.Column("review_status", review_enum, nullable=False, server_default="draft"))
        op.add_column("work_versions", sa.Column("reviewer_id", sa.String(36), nullable=True))
        op.add_column("work_versions", sa.Column("review_note", sa.Text(), nullable=False, server_default=""))
        op.add_column("work_versions", sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
        op.add_column("work_versions", sa.Column("published_at", sa.DateTime(timezone=True), nullable=True))
        op.create_foreign_key("fk_work_versions_reviewer", "work_versions", "users", ["reviewer_id"], ["id"])
        op.create_index("ix_work_versions_review_status", "work_versions", ["review_status"])
        op.execute("""
            UPDATE work_versions AS version
            SET review_status = work.review_status::text::reviewstatus,
                reviewer_id = work.reviewer_id,
                review_note = work.review_note,
                reviewed_at = work.reviewed_at,
                published_at = CASE WHEN work.review_status = 'approved' THEN work.reviewed_at ELSE NULL END
            FROM works AS work
            WHERE version.work_id = work.id
        """)


def downgrade() -> None:
    raise RuntimeError("版本审核历史不允许自动降级")

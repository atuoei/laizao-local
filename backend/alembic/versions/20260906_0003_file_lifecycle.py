"""文件生命周期和版本内容指纹。"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "20260906_0003"
down_revision = "20260906_0002"
branch_labels = None
depends_on = None

def upgrade() -> None:
    inspector = inspect(op.get_bind())
    file_columns = {x["name"] for x in inspector.get_columns("stored_files")}
    if "sha256" not in file_columns:
        op.add_column("stored_files", sa.Column("sha256", sa.String(64), nullable=True))
        op.add_column("stored_files", sa.Column("scan_status", sa.String(24), nullable=False, server_default="pending"))
        op.add_column("stored_files", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
        op.execute("UPDATE stored_files SET sha256 = md5(storage_key) || md5(storage_key), scan_status = 'legacy_unverified'")
        op.alter_column("stored_files", "sha256", nullable=False)
        op.create_index("ix_stored_files_sha256", "stored_files", ["sha256"])
        op.create_index("ix_stored_files_scan_status", "stored_files", ["scan_status"])
    version_columns = {x["name"] for x in inspect(op.get_bind()).get_columns("work_versions")}
    if "stored_file_id" not in version_columns:
        op.add_column("work_versions", sa.Column("stored_file_id", sa.String(36), nullable=True))
        op.add_column("work_versions", sa.Column("snapshot_hash", sa.String(64), nullable=False, server_default=""))
        op.execute("UPDATE work_versions SET stored_file_id = split_part(source_url, '/v1/files/', 2) WHERE source_url LIKE '%/v1/files/%'")
        op.execute("UPDATE work_versions SET snapshot_hash = md5(source_url) || md5(source_url) WHERE snapshot_hash = ''")
        op.create_foreign_key("fk_work_versions_stored_file", "work_versions", "stored_files", ["stored_file_id"], ["id"])
        op.create_index("ix_work_versions_stored_file_id", "work_versions", ["stored_file_id"])

def downgrade() -> None:
    raise RuntimeError("文件审计字段不允许自动降级")

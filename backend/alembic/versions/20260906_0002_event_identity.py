"""事件参与者与去重键。"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "20260906_0002"
down_revision = "20260906_0001"
branch_labels = None
depends_on = None

def upgrade() -> None:
    columns = {x["name"] for x in inspect(op.get_bind()).get_columns("events")}
    if "dedupe_key" not in columns:
        op.add_column("events", sa.Column("dedupe_key", sa.String(255), nullable=True))
        op.create_unique_constraint("uq_events_dedupe_key", "events", ["dedupe_key"])

def downgrade() -> None:
    op.drop_constraint("uq_events_dedupe_key", "events", type_="unique")
    op.drop_column("events", "dedupe_key")

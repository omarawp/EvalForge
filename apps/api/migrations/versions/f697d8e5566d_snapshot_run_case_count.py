"""snapshot_run_case_count

Revision ID: f697d8e5566d
Revises: 4ae67158c4ba
"""

import sqlalchemy as sa
from alembic import op

revision = "f697d8e5566d"
down_revision = "4ae67158c4ba"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "evaluation_runs",
        sa.Column("total_cases", sa.Integer(), nullable=False, server_default="0"),
    )
    op.execute(
        "UPDATE evaluation_runs SET total_cases = "
        "(SELECT COUNT(*) FROM test_cases "
        "WHERE test_cases.dataset_id = evaluation_runs.dataset_id)"
    )


def downgrade() -> None:
    op.drop_column("evaluation_runs", "total_cases")
    # ### end Alembic commands ###

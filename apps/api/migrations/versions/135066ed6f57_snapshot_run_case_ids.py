"""Snapshot test cases selected for each run.

Revision ID: 135066ed6f57
Revises: f697d8e5566d
"""

import sqlalchemy as sa
from alembic import op

revision = "135066ed6f57"
down_revision = "f697d8e5566d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "evaluation_runs", sa.Column("case_ids", sa.JSON(), nullable=False, server_default="[]")
    )
    connection = op.get_bind()
    update = sa.text(
        "UPDATE evaluation_runs SET case_ids = :case_ids, total_cases = :total_cases WHERE id = :id"
    ).bindparams(sa.bindparam("case_ids", type_=sa.JSON()))
    for run_id, dataset_id in connection.execute(
        sa.text("SELECT id, dataset_id FROM evaluation_runs")
    ):
        case_ids = list(
            connection.execute(
                sa.text(
                    "SELECT test_case_id FROM evaluation_results "
                    "WHERE run_id = :id ORDER BY created_at"
                ),
                {"id": run_id},
            ).scalars()
        )
        if not case_ids:
            case_ids = list(
                connection.execute(
                    sa.text("SELECT id FROM test_cases WHERE dataset_id = :id ORDER BY created_at"),
                    {"id": dataset_id},
                ).scalars()
            )
        connection.execute(
            update, {"id": run_id, "case_ids": case_ids, "total_cases": len(case_ids)}
        )


def downgrade() -> None:
    op.drop_column("evaluation_runs", "case_ids")

"""add_price_to_access_codes

Revision ID: 672b4ee7
Revises: 7bf4bbccb2f1
Create Date: 2026-05-03 16:31:39.680569
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '672b4ee7'
down_revision: Union[str, None] = '7bf4bbccb2f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('access_codes', sa.Column('price', sa.INTEGER(), nullable=True))


def downgrade() -> None:
    op.drop_column('access_codes', 'price')

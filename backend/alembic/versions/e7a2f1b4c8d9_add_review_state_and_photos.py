"""add review state and photos column

Revision ID: e7a2f1b4c8d9
Revises: d596d3d1a363
Create Date: 2026-04-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers
revision = 'e7a2f1b4c8d9'
down_revision = 'd596d3d1a363'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add photos JSONB column
    op.add_column(
        'kiosk_sessions',
        sa.Column('photos', JSONB, nullable=True, server_default='[]'),
    )


def downgrade() -> None:
    op.drop_column('kiosk_sessions', 'photos')

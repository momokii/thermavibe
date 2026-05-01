"""add access codes table

Revision ID: 7bf4bbccb2f1
Revises: a3f7c2e1b8d4
Create Date: 2026-05-01 01:38:42.576606
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7bf4bbccb2f1'
down_revision: Union[str, None] = 'a3f7c2e1b8d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('access_codes',
        sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
        sa.Column('code', sa.String(length=32), nullable=False),
        sa.Column('code_type', sa.String(length=16), nullable=False),
        sa.Column('max_uses', sa.INTEGER(), nullable=False),
        sa.Column('use_count', sa.INTEGER(), nullable=False),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('expires_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_by', sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_access_codes_code'), 'access_codes', ['code'], unique=True)
    op.create_index(op.f('ix_access_codes_code_type'), 'access_codes', ['code_type'], unique=False)
    op.create_index(op.f('ix_access_codes_expires_at'), 'access_codes', ['expires_at'], unique=False)
    op.create_index(op.f('ix_access_codes_status'), 'access_codes', ['status'], unique=False)
    op.add_column('kiosk_sessions', sa.Column('access_code_id', sa.INTEGER(), nullable=True))
    op.create_index(op.f('ix_kiosk_sessions_access_code_id'), 'kiosk_sessions', ['access_code_id'], unique=False)
    op.create_foreign_key('fk_kiosk_sessions_access_code_id', 'kiosk_sessions', 'access_codes', ['access_code_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint('fk_kiosk_sessions_access_code_id', 'kiosk_sessions', type_='foreignkey')
    op.drop_index(op.f('ix_kiosk_sessions_access_code_id'), table_name='kiosk_sessions')
    op.drop_column('kiosk_sessions', 'access_code_id')
    op.drop_index(op.f('ix_access_codes_status'), table_name='access_codes')
    op.drop_index(op.f('ix_access_codes_expires_at'), table_name='access_codes')
    op.drop_index(op.f('ix_access_codes_code_type'), table_name='access_codes')
    op.drop_index(op.f('ix_access_codes_code'), table_name='access_codes')
    op.drop_table('access_codes')

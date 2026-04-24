"""add photobooth support

Revision ID: a3f7c2e1b8d4
Revises: e7a2f1b4c8d9
Create Date: 2026-04-24
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers
revision = 'a3f7c2e1b8d4'
down_revision = 'e7a2f1b4c8d9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- Add columns to kiosk_sessions ---
    op.add_column(
        'kiosk_sessions',
        sa.Column(
            'session_type',
            sa.String(16),
            nullable=False,
            server_default='vibe_check',
        ),
    )
    op.create_index(
        'idx_kiosk_sessions_session_type',
        'kiosk_sessions',
        ['session_type'],
    )

    op.add_column(
        'kiosk_sessions',
        sa.Column('composite_image_path', sa.String(512), nullable=True),
    )

    op.add_column(
        'kiosk_sessions',
        sa.Column('photobooth_layout', JSONB, nullable=True),
    )

    # --- Create photobooth_themes table ---
    op.create_table(
        'photobooth_themes',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(128), nullable=False),
        sa.Column('display_name', sa.String(255), nullable=False),
        sa.Column('config', JSONB, nullable=False),
        sa.Column('preview_image_path', sa.String(512), nullable=True),
        sa.Column('is_builtin', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('is_enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column(
            'created_at',
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            'updated_at',
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )


def downgrade() -> None:
    op.drop_table('photobooth_themes')

    op.drop_column('kiosk_sessions', 'photobooth_layout')
    op.drop_column('kiosk_sessions', 'composite_image_path')
    op.drop_index('idx_kiosk_sessions_session_type', table_name='kiosk_sessions')
    op.drop_column('kiosk_sessions', 'session_type')

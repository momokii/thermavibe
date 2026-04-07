"""SQLAlchemy DeclarativeBase re-export.

Re-exports Base from app.core.database for convenience.
"""

from app.core.database import Base

__all__ = ['Base']

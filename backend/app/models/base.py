"""SQLAlchemy DeclarativeBase and common mixins."""

# Re-exports Base from app.core.database.
# Common mixin provides:
# - id: UUID primary key
# - created_at: DateTime (auto-set on insert)
# - updated_at: DateTime (auto-set on update)

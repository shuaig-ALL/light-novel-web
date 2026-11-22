from collections.abc import AsyncGenerator

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import DATABASE_URL


class Base(DeclarativeBase):
    pass


engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    future=True,
)


@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragma(dbapi_connection, _connection_record) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


def _ensure_user_preference_columns(sync_conn) -> None:
    """Non-destructive SQLite schema upgrade for existing local databases."""
    rows = sync_conn.execute(text("PRAGMA table_info(users)")).fetchall()
    existing_cols = {row[1] for row in rows}
    if not existing_cols:
        return

    if "enable_gallery" not in existing_cols:
        sync_conn.execute(
            text(
                "ALTER TABLE users ADD COLUMN enable_gallery BOOLEAN NOT NULL DEFAULT 0"
            )
        )
    if "hide_unread_illustrations" not in existing_cols:
        sync_conn.execute(
            text(
                "ALTER TABLE users ADD COLUMN hide_unread_illustrations BOOLEAN NOT NULL DEFAULT 1"
            )
        )
    if "reading_mode" not in existing_cols:
        sync_conn.execute(
            text(
                "ALTER TABLE users ADD COLUMN reading_mode VARCHAR(16) NOT NULL DEFAULT 'scroll'"
            )
        )


def _ensure_book_sort_order_column(sync_conn) -> None:
    """Non-destructive SQLite schema upgrade adding books.sort_order for existing databases."""
    rows = sync_conn.execute(text("PRAGMA table_info(books)")).fetchall()
    existing_cols = {row[1] for row in rows}
    if not existing_cols:
        return

    if "sort_order" not in existing_cols:
        sync_conn.execute(
            text("ALTER TABLE books ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0")
        )
    sync_conn.execute(
        text("CREATE INDEX IF NOT EXISTS ix_books_sort_order ON books (sort_order)")
    )


async def init_db() -> None:
    # Ensure all ORM models are registered on Base.metadata before creating tables.
    import app.models.book  # noqa: F401
    import app.models.reading_progress  # noqa: F401
    import app.models.user  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_ensure_user_preference_columns)
        await conn.run_sync(_ensure_book_sort_order_column)

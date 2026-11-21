import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
STORAGE_DIR = BASE_DIR / "storage"
BOOKS_STORAGE_DIR = STORAGE_DIR / "books"
STATIC_URL_PREFIX = "/static"

DB_PATH = BASE_DIR / "light_novel.db"
DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH.as_posix()}"

DEFAULT_SPINE_COLOR = "#4A5568"

# JWT configuration (override via environment variables in production)
JWT_SECRET_KEY = os.getenv(
    "JWT_SECRET_KEY",
    "dev-light-novel-library-secret-key-change-in-production-2026",
)
JWT_ALGORITHM = "HS256"
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24 * 7))
)

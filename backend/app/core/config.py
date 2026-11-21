from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
STORAGE_DIR = BASE_DIR / "storage"
BOOKS_STORAGE_DIR = STORAGE_DIR / "books"
STATIC_URL_PREFIX = "/static"

DB_PATH = BASE_DIR / "light_novel.db"
DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH.as_posix()}"

DEFAULT_SPINE_COLOR = "#4A5568"

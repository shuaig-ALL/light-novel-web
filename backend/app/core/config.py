import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import dotenv_values, load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent
PROJECT_ROOT = BASE_DIR.parent
ROOT_ENV_PATH = PROJECT_ROOT / ".env"
BACKEND_ENV_PATH = BASE_DIR / ".env"

# Always load via absolute paths so CWD (project root vs backend/) never matters.
# utf-8-sig safely handles Windows editors that save UTF-8 with BOM.
load_dotenv(ROOT_ENV_PATH, override=False, encoding="utf-8-sig")
load_dotenv(BACKEND_ENV_PATH, override=False, encoding="utf-8-sig")

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

# OpenAI-compatible LLM configuration for the spoiler-free reading assistant
LLM_API_KEY = os.getenv("LLM_API_KEY", "").strip()
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1").strip().rstrip("/")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini").strip()
LLM_MAX_CONTEXT_CHARS = int(os.getenv("LLM_MAX_CONTEXT_CHARS", "24000"))


@dataclass(frozen=True)
class LLMSettings:
    api_key: str
    base_url: str
    model: str
    max_context_chars: int


def get_llm_settings() -> LLMSettings:
    """Resolve latest LLM settings from module config, OS env, or absolute .env files."""
    file_values: dict[str, str] = {}
    for env_path in (ROOT_ENV_PATH, BACKEND_ENV_PATH):
        if env_path.is_file():
            for k, v in dotenv_values(env_path, encoding="utf-8-sig").items():
                if k and v is not None and v.strip():
                    file_values[k] = v.strip()

    api_key = (
        LLM_API_KEY
        or os.getenv("LLM_API_KEY", "").strip()
        or file_values.get("LLM_API_KEY", "")
    )
    base_url = (
        os.getenv("LLM_BASE_URL", "").strip()
        or file_values.get("LLM_BASE_URL", "")
        or LLM_BASE_URL
        or "https://api.openai.com/v1"
    ).rstrip("/")
    model = (
        os.getenv("LLM_MODEL", "").strip()
        or file_values.get("LLM_MODEL", "")
        or LLM_MODEL
        or "gpt-4o-mini"
    )
    raw_max_chars = (
        os.getenv("LLM_MAX_CONTEXT_CHARS", "").strip()
        or file_values.get("LLM_MAX_CONTEXT_CHARS", "")
        or str(LLM_MAX_CONTEXT_CHARS)
    )
    try:
        max_chars = int(raw_max_chars)
    except ValueError:
        max_chars = LLM_MAX_CONTEXT_CHARS

    return LLMSettings(
        api_key=api_key,
        base_url=base_url,
        model=model,
        max_context_chars=max_chars,
    )

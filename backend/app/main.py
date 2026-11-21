from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.books import router as books_router
from app.core.config import BOOKS_STORAGE_DIR, STATIC_URL_PREFIX, STORAGE_DIR
from app.core.database import engine, init_db

STORAGE_DIR.mkdir(parents=True, exist_ok=True)
BOOKS_STORAGE_DIR.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await init_db()
    yield
    await engine.dispose()


app = FastAPI(
    title="Light Novel Library API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount(STATIC_URL_PREFIX, StaticFiles(directory=str(STORAGE_DIR)), name="static")
app.include_router(books_router, prefix="/api/v1")


@app.get("/api/v1/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "light-novel-library"}

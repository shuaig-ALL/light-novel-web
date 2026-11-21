import asyncio
import logging
import shutil
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import BOOKS_STORAGE_DIR
from app.core.database import get_db
from app.models.book import Book, Chapter
from app.schemas.book import (
    BookDeleteResponse,
    BookListItem,
    BookTocResponse,
    BookUploadResponse,
    ChapterDetailResponse,
    ChapterTocItem,
)
from app.services.epub_parser import parse_epub_book

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/books", tags=["books"])


@router.post(
    "/upload",
    response_model=BookUploadResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def upload_epub(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> BookUploadResponse:
    original_filename = file.filename or ""
    if not original_filename.lower().endswith(".epub"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="仅支持上传 .epub 格式的轻小说文件。",
        )

    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="上传的文件内容为空。",
        )

    fallback_title = Path(original_filename).stem.strip() or "未命名轻小说"

    book = Book(
        title=fallback_title[:255],
        file_path="",
        parse_status="pending",
    )
    db.add(book)
    await db.flush()

    book_dir = BOOKS_STORAGE_DIR / str(book.id)
    book_dir.mkdir(parents=True, exist_ok=True)

    rel_epub_path = f"books/{book.id}/source.epub"
    (book_dir / "source.epub").write_bytes(content)

    book.file_path = rel_epub_path
    await db.commit()
    await db.refresh(book)

    background_tasks.add_task(parse_epub_book, book.id)

    return BookUploadResponse(
        id=book.id,
        title=book.title,
        parse_status=book.parse_status,
        message="EPUB 已接收，正在后台异步解析。",
    )


@router.get("", response_model=list[BookListItem])
async def list_books(
    db: AsyncSession = Depends(get_db),
) -> list[BookListItem]:
    result = await db.execute(select(Book).order_by(Book.created_at.desc(), Book.id.desc()))
    books = result.scalars().all()
    return [BookListItem.model_validate(book) for book in books]


@router.get("/{book_id}/toc", response_model=BookTocResponse)
async def get_book_toc(
    book_id: int,
    db: AsyncSession = Depends(get_db),
) -> BookTocResponse:
    book = await db.get(Book, book_id)
    if book is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"未找到书籍 (id={book_id})。",
        )

    chapter_rows = await db.execute(
        select(
            Chapter.id,
            Chapter.order_index,
            Chapter.title,
            Chapter.word_count,
        )
        .where(Chapter.book_id == book_id)
        .order_by(Chapter.order_index.asc())
    )
    chapters = [
        ChapterTocItem(
            id=row.id,
            order_index=row.order_index,
            title=row.title,
            word_count=row.word_count,
        )
        for row in chapter_rows.all()
    ]

    return BookTocResponse(
        book_id=book.id,
        title=book.title,
        author=book.author,
        cover_url=book.cover_url,
        spine_color=book.spine_color,
        parse_status=book.parse_status,
        total_chapters=book.total_chapters,
        chapters=chapters,
    )


@router.get("/{book_id}/chapters/{chapter_id}", response_model=ChapterDetailResponse)
async def get_chapter_detail(
    book_id: int,
    chapter_id: int,
    db: AsyncSession = Depends(get_db),
) -> ChapterDetailResponse:
    result = await db.execute(
        select(Chapter).where(Chapter.book_id == book_id, Chapter.id == chapter_id)
    )
    chapter = result.scalar_one_or_none()
    if chapter is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"未找到章节 (book_id={book_id}, chapter_id={chapter_id})。",
        )

    prev_result = await db.execute(
        select(Chapter.id)
        .where(
            Chapter.book_id == book_id,
            Chapter.order_index < chapter.order_index,
        )
        .order_by(Chapter.order_index.desc())
        .limit(1)
    )
    next_result = await db.execute(
        select(Chapter.id)
        .where(
            Chapter.book_id == book_id,
            Chapter.order_index > chapter.order_index,
        )
        .order_by(Chapter.order_index.asc())
        .limit(1)
    )

    return ChapterDetailResponse(
        id=chapter.id,
        book_id=chapter.book_id,
        order_index=chapter.order_index,
        title=chapter.title,
        content_html=chapter.content_html,
        word_count=chapter.word_count,
        prev_chapter_id=prev_result.scalar_one_or_none(),
        next_chapter_id=next_result.scalar_one_or_none(),
    )


@router.delete("/{book_id}", response_model=BookDeleteResponse)
async def delete_book(
    book_id: int,
    db: AsyncSession = Depends(get_db),
) -> BookDeleteResponse:
    book = await db.get(Book, book_id)
    if book is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"未找到书籍 (id={book_id})。",
        )

    book_title = book.title
    await db.delete(book)
    await db.commit()

    books_root = BOOKS_STORAGE_DIR.resolve()
    target_dir = (books_root / str(book_id)).resolve()
    if target_dir.parent == books_root and target_dir.exists() and target_dir.is_dir():
        try:
            await asyncio.to_thread(shutil.rmtree, target_dir)
        except OSError as exc:
            logger.warning(
                "Deleted book %s from DB, but failed to clean directory %s: %s",
                book_id,
                target_dir,
                exc,
            )

    return BookDeleteResponse(
        id=book_id,
        title=book_title,
        message="书籍及相关本地文件已删除。",
    )

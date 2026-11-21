import asyncio
import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path

from bs4 import BeautifulSoup
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import BOOKS_STORAGE_DIR
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.book import Book, Chapter
from app.models.reading_progress import ReadingProgress
from app.models.user import User
from app.schemas.book import (
    BookDeleteResponse,
    BookIllustrationsResponse,
    BookListItem,
    BookTocResponse,
    BookUploadResponse,
    ChapterDetailResponse,
    ChapterTocItem,
    IllustrationItem,
    ReadingProgressResponse,
    ReadingProgressUpdate,
)
from app.services.epub_parser import parse_epub_book

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/books", tags=["books"])


async def _get_owned_book(
    book_id: int,
    user_id: int,
    db: AsyncSession,
) -> Book:
    result = await db.execute(
        select(Book).where(Book.id == book_id, Book.user_id == user_id)
    )
    book = result.scalar_one_or_none()
    if book is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"未找到书籍 (id={book_id})。",
        )
    return book


@router.post(
    "/upload",
    response_model=BookUploadResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def upload_epub(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
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
        user_id=current_user.id,
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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[BookListItem]:
    result = await db.execute(
        select(
            Book,
            ReadingProgress.scroll_percent,
            ReadingProgress.updated_at.label("last_read_at"),
            Chapter.title.label("last_chapter_title"),
            Chapter.order_index.label("last_chapter_order_index"),
        )
        .outerjoin(
            ReadingProgress,
            and_(
                ReadingProgress.book_id == Book.id,
                ReadingProgress.user_id == current_user.id,
            ),
        )
        .outerjoin(Chapter, Chapter.id == ReadingProgress.chapter_id)
        .where(Book.user_id == current_user.id)
        .order_by(Book.created_at.desc(), Book.id.desc())
    )

    items: list[BookListItem] = []
    for row in result.all():
        book: Book = row[0]
        scroll_percent = row.scroll_percent
        last_read_at = row.last_read_at
        last_chapter_title = row.last_chapter_title
        last_chapter_order_index = row.last_chapter_order_index

        progress_percent: float | None = None
        if last_read_at is not None and last_chapter_order_index is not None:
            total = max(1, book.total_chapters)
            clamped_order = min(total, max(1, int(last_chapter_order_index)))
            clamped_scroll = min(100.0, max(0.0, float(scroll_percent or 0.0)))
            progress_percent = round(
                min(
                    100.0,
                    max(0.0, (((clamped_order - 1) + clamped_scroll / 100.0) / total) * 100.0),
                ),
                1,
            )

        items.append(
            BookListItem(
                id=book.id,
                title=book.title,
                author=book.author,
                description=book.description,
                cover_url=book.cover_url,
                spine_color=book.spine_color,
                parse_status=book.parse_status,
                parse_error=book.parse_error,
                total_chapters=book.total_chapters,
                last_chapter_title=last_chapter_title if last_read_at is not None else None,
                progress_percent=progress_percent,
                last_read_at=last_read_at,
                created_at=book.created_at,
                updated_at=book.updated_at,
            )
        )

    return items


@router.get("/{book_id}/toc", response_model=BookTocResponse)
async def get_book_toc(
    book_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookTocResponse:
    book = await _get_owned_book(book_id, current_user.id, db)

    chapter_rows = await db.execute(
        select(
            Chapter.id,
            Chapter.order_index,
            Chapter.title,
            Chapter.word_count,
        )
        .where(Chapter.book_id == book.id)
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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChapterDetailResponse:
    book = await _get_owned_book(book_id, current_user.id, db)

    result = await db.execute(
        select(Chapter).where(Chapter.book_id == book.id, Chapter.id == chapter_id)
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
            Chapter.book_id == book.id,
            Chapter.order_index < chapter.order_index,
        )
        .order_by(Chapter.order_index.desc())
        .limit(1)
    )
    next_result = await db.execute(
        select(Chapter.id)
        .where(
            Chapter.book_id == book.id,
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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookDeleteResponse:
    book = await _get_owned_book(book_id, current_user.id, db)

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


@router.get("/{book_id}/progress", response_model=ReadingProgressResponse | None)
async def get_reading_progress(
    book_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReadingProgressResponse | None:
    book = await _get_owned_book(book_id, current_user.id, db)

    result = await db.execute(
        select(ReadingProgress).where(
            ReadingProgress.user_id == current_user.id,
            ReadingProgress.book_id == book.id,
        )
    )
    progress = result.scalar_one_or_none()
    if progress is None:
        return None
    return ReadingProgressResponse.model_validate(progress)


@router.put("/{book_id}/progress", response_model=ReadingProgressResponse)
async def update_reading_progress(
    book_id: int,
    payload: ReadingProgressUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReadingProgressResponse:
    book = await _get_owned_book(book_id, current_user.id, db)

    chapter_check = await db.execute(
        select(Chapter.id).where(
            Chapter.id == payload.chapter_id,
            Chapter.book_id == book.id,
        )
    )
    if chapter_check.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"未找到章节 (book_id={book_id}, chapter_id={payload.chapter_id})。",
        )

    normalized_percent = round(min(100.0, max(0.0, float(payload.scroll_percent))), 2)

    result = await db.execute(
        select(ReadingProgress).where(
            ReadingProgress.user_id == current_user.id,
            ReadingProgress.book_id == book.id,
        )
    )
    progress = result.scalar_one_or_none()

    if progress is None:
        progress = ReadingProgress(
            user_id=current_user.id,
            book_id=book.id,
            chapter_id=payload.chapter_id,
            scroll_percent=normalized_percent,
        )
        db.add(progress)
    else:
        progress.chapter_id = payload.chapter_id
        progress.scroll_percent = normalized_percent
        progress.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(progress)
    return ReadingProgressResponse.model_validate(progress)


@router.get("/{book_id}/illustrations", response_model=BookIllustrationsResponse)
async def get_book_illustrations(
    book_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookIllustrationsResponse:
    book = await _get_owned_book(book_id, current_user.id, db)

    illustrations: list[IllustrationItem] = []
    seen_urls: set[str] = set()

    if book.cover_url:
        seen_urls.add(book.cover_url)
        illustrations.append(
            IllustrationItem(
                url=book.cover_url,
                alt=f"{book.title} 封面",
                is_cover=True,
                chapter_id=None,
                chapter_order_index=0,
                chapter_title="封面",
            )
        )

    chapter_rows = await db.execute(
        select(
            Chapter.id,
            Chapter.order_index,
            Chapter.title,
            Chapter.content_html,
        )
        .where(Chapter.book_id == book.id)
        .order_by(Chapter.order_index.asc())
    )

    for row in chapter_rows.all():
        if not row.content_html or "<img" not in row.content_html.lower():
            continue
        soup = BeautifulSoup(row.content_html, "lxml")
        for img_tag in soup.find_all("img"):
            src = str(img_tag.get("src") or "").strip()
            if not src or src in seen_urls:
                continue
            seen_urls.add(src)
            alt_text = str(img_tag.get("alt") or "").strip() or None
            illustrations.append(
                IllustrationItem(
                    url=src,
                    alt=alt_text,
                    is_cover=False,
                    chapter_id=row.id,
                    chapter_order_index=row.order_index,
                    chapter_title=row.title,
                )
            )

    return BookIllustrationsResponse(
        book_id=book.id,
        title=book.title,
        total=len(illustrations),
        illustrations=illustrations,
    )

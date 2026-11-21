from datetime import datetime

from pydantic import BaseModel, ConfigDict


class BookUploadResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    parse_status: str
    message: str


class BookListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    author: str | None = None
    description: str | None = None
    cover_url: str | None = None
    spine_color: str
    parse_status: str
    parse_error: str | None = None
    total_chapters: int
    created_at: datetime
    updated_at: datetime


class ChapterTocItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_index: int
    title: str
    word_count: int


class BookTocResponse(BaseModel):
    book_id: int
    title: str
    author: str | None = None
    cover_url: str | None = None
    spine_color: str
    parse_status: str
    total_chapters: int
    chapters: list[ChapterTocItem]


class ChapterDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    book_id: int
    order_index: int
    title: str
    content_html: str
    word_count: int
    prev_chapter_id: int | None = None
    next_chapter_id: int | None = None

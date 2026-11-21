from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


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
    last_chapter_title: str | None = None
    progress_percent: float | None = None
    last_read_at: datetime | None = None
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


class BookDeleteResponse(BaseModel):
    id: int
    title: str
    message: str


class ReadingProgressUpdate(BaseModel):
    chapter_id: int = Field(..., gt=0)
    scroll_percent: float = Field(default=0.0, ge=0.0, le=100.0)


class ReadingProgressResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    book_id: int
    chapter_id: int
    scroll_percent: float
    updated_at: datetime


class IllustrationItem(BaseModel):
    url: str
    alt: str | None = None
    is_cover: bool = False
    chapter_id: int | None = None
    chapter_order_index: int
    chapter_title: str


class BookIllustrationsResponse(BaseModel):
    book_id: int
    title: str
    total: int
    illustrations: list[IllustrationItem]


class AIAssistRequest(BaseModel):
    mode: Literal["recap", "characters", "qa"]
    chapter_id: int | None = Field(default=None, gt=0)
    question: str | None = Field(default=None, max_length=1000)

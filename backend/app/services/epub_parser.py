import asyncio
import colorsys
import io
import logging
import mimetypes
import posixpath
import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import unquote

import ebooklib
from bs4 import BeautifulSoup, Comment, Tag
from ebooklib import epub
from PIL import Image
from sqlalchemy import delete, select

from app.core.config import (
    BOOKS_STORAGE_DIR,
    DEFAULT_SPINE_COLOR,
    STATIC_URL_PREFIX,
    STORAGE_DIR,
)
from app.core.database import AsyncSessionLocal
from app.models.book import Book, Chapter

logger = logging.getLogger(__name__)

DANGEROUS_TAGS = {
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "applet",
    "form",
    "input",
    "button",
    "textarea",
    "select",
    "option",
    "meta",
    "link",
    "base",
    "noscript",
    "canvas",
    "audio",
    "video",
    "source",
}

ALLOWED_ATTRS: dict[str, set[str]] = {
    "img": {"src", "alt", "class"},
    "a": {"href", "title"},
    "div": {"class"},
    "p": {"class"},
    "span": {"class"},
    "ruby": {"class"},
    "rt": {"class"},
    "rp": {"class"},
    "rb": {"class"},
    "rtc": {"class"},
    "td": {"colspan", "rowspan"},
    "th": {"colspan", "rowspan"},
}

XML_DECL_RE = re.compile(r"^\s*<\?xml[^>]*\?>", re.IGNORECASE)
SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


@dataclass
class ParsedChapter:
    order_index: int
    title: str
    content_html: str
    word_count: int


@dataclass
class ParsedBookResult:
    title: str
    author: str | None
    description: str | None
    cover_url: str | None
    spine_color: str
    chapters: list[ParsedChapter]


def _normalize_epub_path(path: str) -> str:
    cleaned = unquote(path or "").replace("\\", "/").strip()
    cleaned = cleaned.split("#", 1)[0].split("?", 1)[0]
    if not cleaned:
        return ""
    normalized = posixpath.normpath(cleaned).lstrip("/")
    return "" if normalized == "." else normalized


def _sanitize_filename(name: str, fallback: str) -> str:
    base = posixpath.basename(unquote(name or "").replace("\\", "/"))
    safe = SAFE_FILENAME_RE.sub("_", base).strip("._")
    return safe or fallback


def _guess_image_ext(item_name: str, media_type: str | None) -> str:
    ext = Path(item_name).suffix.lower()
    if ext in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        return ext
    if media_type:
        guessed = mimetypes.guess_extension(media_type.split(";")[0].strip())
        if guessed == ".jpe":
            return ".jpg"
        if guessed:
            return guessed
    return ".jpg"


def _extract_dominant_color(image_bytes: bytes) -> str:
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            rgb_img = img.convert("RGB").resize((64, 64))
            quantized = rgb_img.quantize(colors=8, method=Image.Quantize.MEDIANCUT)
            palette = quantized.getpalette() or []
            color_counts = quantized.getcolors() or []
            color_counts.sort(key=lambda pair: pair[0], reverse=True)

            fallback_rgb: tuple[int, int, int] | None = None
            for _count, palette_idx in color_counts:
                offset = palette_idx * 3
                if offset + 2 >= len(palette):
                    continue
                r, g, b = palette[offset], palette[offset + 1], palette[offset + 2]
                if fallback_rgb is None:
                    fallback_rgb = (r, g, b)

                _h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
                # Skip near-white background and near-black borders when picking spine color.
                if (v > 0.94 and s < 0.12) or v < 0.08:
                    continue
                return f"#{r:02X}{g:02X}{b:02X}"

            if fallback_rgb is not None:
                r, g, b = fallback_rgb
                return f"#{r:02X}{g:02X}{b:02X}"
    except Exception as exc:  # pragma: no cover - defensive fallback
        logger.warning("Failed to extract cover dominant color: %s", exc)
    return DEFAULT_SPINE_COLOR


def _extract_toc_titles(
    toc_entries,
    by_path: dict[str, str],
    by_basename: dict[str, str],
) -> None:
    if not toc_entries:
        return
    for entry in toc_entries:
        if isinstance(entry, epub.Link):
            title = (entry.title or "").strip()
            norm_href = _normalize_epub_path(entry.href)
            if title and norm_href:
                by_path.setdefault(norm_href.lower(), title)
                basename = posixpath.basename(norm_href).lower()
                if basename:
                    by_basename.setdefault(basename, title)
        elif isinstance(entry, tuple) and len(entry) == 2:
            section, children = entry
            if isinstance(section, epub.Section) and getattr(section, "href", None):
                title = (section.title or "").strip()
                norm_href = _normalize_epub_path(section.href)
                if title and norm_href:
                    by_path.setdefault(norm_href.lower(), title)
                    basename = posixpath.basename(norm_href).lower()
                    if basename:
                        by_basename.setdefault(basename, title)
            _extract_toc_titles(children, by_path, by_basename)


def _find_cover_item(book: epub.EpubBook, image_items: list) -> object | None:
    # 1. Explicit ITEM_COVER
    for item in book.get_items_of_type(ebooklib.ITEM_COVER):
        return item

    # 2. OPF <meta name="cover" content="...">
    cover_meta = book.get_metadata("OPF", "cover")
    for _val, attrs in cover_meta:
        cover_id = attrs.get("content") if isinstance(attrs, dict) else None
        if cover_id:
            matched = book.get_item_with_id(cover_id)
            if matched is not None:
                return matched
            for item in image_items:
                if item.get_id() == cover_id or _normalize_epub_path(
                    item.get_name()
                ).endswith(cover_id):
                    return item

    # 3. EPUB 3 cover-image property
    for item in image_items:
        props = getattr(item, "properties", None) or []
        if "cover-image" in props:
            return item

    # 4. Filename or id containing 'cover'
    for item in image_items:
        name = (item.get_name() or "").lower()
        item_id = (item.get_id() or "").lower()
        if "cover" in name or "cover" in item_id:
            return item

    # 5. Fallback to first image in the book
    return image_items[0] if image_items else None


def _resolve_image_url(
    raw_src: str,
    doc_dir: str,
    image_map_by_path: dict[str, str],
    image_map_by_name: dict[str, str],
) -> str | None:
    cleaned = unquote((raw_src or "").strip())
    if not cleaned or cleaned.lower().startswith(("http://", "https://", "data:", "javascript:")):
        return None
    joined = posixpath.join(doc_dir, cleaned) if doc_dir else cleaned
    norm_key = _normalize_epub_path(joined).lower()
    if norm_key in image_map_by_path:
        return image_map_by_path[norm_key]

    direct_key = _normalize_epub_path(cleaned).lower()
    if direct_key in image_map_by_path:
        return image_map_by_path[direct_key]

    basename = posixpath.basename(norm_key).lower()
    return image_map_by_name.get(basename)


def _clean_chapter_html(
    raw_bytes: bytes,
    doc_path: str,
    image_map_by_path: dict[str, str],
    image_map_by_name: dict[str, str],
) -> tuple[str, str | None, int, bool]:
    html_text = raw_bytes.decode("utf-8", errors="ignore")
    html_text = XML_DECL_RE.sub("", html_text, count=1)
    soup = BeautifulSoup(html_text, "lxml")

    root: Tag = soup.body if soup.body is not None else soup

    # Remove HTML comments.
    for comment in root.find_all(string=lambda s: isinstance(s, Comment)):
        comment.extract()

    # Remove dangerous tags completely.
    for tag in list(root.find_all(DANGEROUS_TAGS)):
        tag.decompose()

    doc_dir = posixpath.dirname(_normalize_epub_path(doc_path))

    # Convert <svg> wrappers containing illustration <image> tags into standard <img>.
    for svg_tag in list(root.find_all("svg")):
        svg_images = svg_tag.find_all("image")
        replacement_urls: list[str] = []
        for img_node in svg_images:
            href = (
                img_node.get("xlink:href")
                or img_node.get("href")
                or img_node.get("l:href")
                or ""
            )
            resolved = _resolve_image_url(
                str(href), doc_dir, image_map_by_path, image_map_by_name
            )
            if resolved:
                replacement_urls.append(resolved)

        if replacement_urls:
            wrapper = soup.new_tag("div", attrs={"class": "ln-illustration"})
            for url in replacement_urls:
                img_tag = soup.new_tag("img", attrs={"src": url, "alt": "illustration"})
                wrapper.append(img_tag)
            svg_tag.replace_with(wrapper)
        else:
            svg_tag.decompose()

    # Rewrite <img> tags.
    has_images = False
    static_prefix = f"{STATIC_URL_PREFIX}/"
    for img_tag in list(root.find_all("img")):
        raw_src = str(img_tag.get("src") or "")
        if raw_src.startswith(static_prefix):
            has_images = True
            continue
        resolved = _resolve_image_url(
            raw_src, doc_dir, image_map_by_path, image_map_by_name
        )
        if resolved:
            alt_text = str(img_tag.get("alt") or "").strip()
            img_tag.attrs = {"src": resolved}
            if alt_text:
                img_tag["alt"] = alt_text
            has_images = True
        else:
            img_tag.decompose()

    # Sanitize remaining attributes across all tags while keeping <ruby>/<rt>/<rp>.
    for tag in list(root.find_all(True)):
        tag_name = tag.name.lower()
        allowed = ALLOWED_ATTRS.get(tag_name, set())
        cleaned_attrs: dict[str, object] = {}
        for attr_name, attr_val in list(tag.attrs.items()):
            lower_attr = attr_name.lower()
            if lower_attr.startswith("on"):
                continue
            if lower_attr not in allowed:
                continue
            if lower_attr == "href":
                href_str = str(attr_val).strip()
                if href_str.lower().startswith(("javascript:", "vbscript:", "data:")):
                    continue
            cleaned_attrs[lower_attr] = attr_val
        tag.attrs = cleaned_attrs

    heading_title: str | None = None
    for heading_name in ("h1", "h2", "h3"):
        heading = root.find(heading_name)
        if heading:
            candidate = " ".join(heading.get_text(" ", strip=True).split())
            if candidate and len(candidate) <= 120:
                heading_title = candidate
                break

    plain_text = "".join(root.get_text().split())
    word_count = len(plain_text)

    if root.name == "body":
        cleaned_html = "".join(str(child) for child in root.contents).strip()
    else:
        cleaned_html = str(root).strip()

    return cleaned_html, heading_title, word_count, has_images


def _parse_epub_sync(
    book_id: int, epub_path: Path, fallback_title: str
) -> ParsedBookResult:
    book = epub.read_epub(str(epub_path))

    # Metadata extraction
    title_meta = book.get_metadata("DC", "title")
    title = (
        title_meta[0][0].strip()
        if title_meta and title_meta[0][0] and title_meta[0][0].strip()
        else fallback_title
    )

    creator_meta = book.get_metadata("DC", "creator")
    creators = [c[0].strip() for c in creator_meta if c and c[0] and c[0].strip()]
    author = " / ".join(dict.fromkeys(creators)) if creators else None

    desc_meta = book.get_metadata("DC", "description")
    description: str | None = None
    if desc_meta and desc_meta[0][0]:
        raw_desc = str(desc_meta[0][0]).strip()
        description = (
            BeautifulSoup(raw_desc, "lxml").get_text("\n", strip=True) or None
        )

    book_dir = BOOKS_STORAGE_DIR / str(book_id)
    images_dir = book_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    # Extract all image resources
    image_items = [
        item
        for item in book.get_items()
        if item.get_type() in (ebooklib.ITEM_IMAGE, ebooklib.ITEM_COVER)
        or (getattr(item, "media_type", "") or "").startswith("image/")
    ]

    image_map_by_path: dict[str, str] = {}
    image_map_by_name: dict[str, str] = {}
    used_filenames: set[str] = set()

    for idx, item in enumerate(image_items, start=1):
        content = item.get_content()
        if not content:
            continue
        item_name = item.get_name() or f"img_{idx}"
        ext = _guess_image_ext(item_name, getattr(item, "media_type", None))
        safe_base = _sanitize_filename(Path(item_name).stem, f"img_{idx}")
        saved_name = f"{safe_base}{ext}"
        counter = 1
        while saved_name.lower() in used_filenames:
            saved_name = f"{safe_base}_{counter}{ext}"
            counter += 1
        used_filenames.add(saved_name.lower())

        (images_dir / saved_name).write_bytes(content)
        static_url = f"{STATIC_URL_PREFIX}/books/{book_id}/images/{saved_name}"

        norm_path = _normalize_epub_path(item_name).lower()
        if norm_path:
            image_map_by_path[norm_path] = static_url
            basename = posixpath.basename(norm_path).lower()
            if basename:
                image_map_by_name.setdefault(basename, static_url)

    # Cover extraction & dominant color calculation
    cover_url: str | None = None
    spine_color = DEFAULT_SPINE_COLOR
    cover_item = _find_cover_item(book, image_items)
    if cover_item is not None:
        cover_bytes = cover_item.get_content()
        if cover_bytes:
            cover_ext = _guess_image_ext(
                cover_item.get_name() or "cover",
                getattr(cover_item, "media_type", None),
            )
            cover_filename = f"cover{cover_ext}"
            (book_dir / cover_filename).write_bytes(cover_bytes)
            cover_url = f"{STATIC_URL_PREFIX}/books/{book_id}/{cover_filename}"
            spine_color = _extract_dominant_color(cover_bytes)

    # TOC title mapping
    toc_by_path: dict[str, str] = {}
    toc_by_basename: dict[str, str] = {}
    _extract_toc_titles(book.toc, toc_by_path, toc_by_basename)

    # Parse spine chapters in reading order
    chapters: list[ParsedChapter] = []
    seen_item_ids: set[str] = set()

    for spine_entry in book.spine:
        item_id = spine_entry[0] if isinstance(spine_entry, tuple) else spine_entry
        if not item_id or item_id in seen_item_ids:
            continue
        seen_item_ids.add(item_id)

        item = book.get_item_with_id(item_id)
        if item is None or item.get_type() != ebooklib.ITEM_DOCUMENT:
            continue

        raw_bytes = item.get_content()
        if not raw_bytes:
            continue

        doc_path = item.get_name() or ""
        cleaned_html, heading_title, word_count, has_images = _clean_chapter_html(
            raw_bytes, doc_path, image_map_by_path, image_map_by_name
        )

        # Skip empty structural documents with neither text nor images.
        if word_count == 0 and not has_images:
            continue

        order_index = len(chapters) + 1
        norm_doc = _normalize_epub_path(doc_path).lower()
        doc_basename = posixpath.basename(norm_doc).lower()
        toc_title = toc_by_path.get(norm_doc) or toc_by_basename.get(doc_basename)

        if toc_title:
            chapter_title = toc_title
        elif heading_title:
            chapter_title = heading_title
        elif has_images and word_count == 0:
            chapter_title = f"插画 {order_index}"
        else:
            chapter_title = f"第 {order_index} 章"

        chapters.append(
            ParsedChapter(
                order_index=order_index,
                title=chapter_title[:255],
                content_html=cleaned_html,
                word_count=word_count,
            )
        )

    return ParsedBookResult(
        title=title[:255],
        author=author[:255] if author else None,
        description=description,
        cover_url=cover_url,
        spine_color=spine_color,
        chapters=chapters,
    )


async def parse_epub_book(book_id: int) -> None:
    """Background task entry point: parse an uploaded EPUB and persist results."""
    async with AsyncSessionLocal() as session:
        book = await session.get(Book, book_id)
        if book is None:
            logger.warning("Book %s not found for EPUB parsing.", book_id)
            return

        epub_abs_path = STORAGE_DIR / book.file_path
        fallback_title = book.title
        book.parse_status = "processing"
        book.parse_error = None
        await session.commit()

    try:
        parsed = await asyncio.to_thread(
            _parse_epub_sync, book_id, epub_abs_path, fallback_title
        )

        async with AsyncSessionLocal() as session:
            book = await session.get(Book, book_id)
            if book is None:
                return

            await session.execute(delete(Chapter).where(Chapter.book_id == book_id))

            book.title = parsed.title
            book.author = parsed.author
            book.description = parsed.description
            book.cover_url = parsed.cover_url
            book.spine_color = parsed.spine_color
            book.total_chapters = len(parsed.chapters)
            book.parse_status = "completed"
            book.parse_error = None

            session.add_all(
                [
                    Chapter(
                        book_id=book_id,
                        order_index=ch.order_index,
                        title=ch.title,
                        content_html=ch.content_html,
                        word_count=ch.word_count,
                    )
                    for ch in parsed.chapters
                ]
            )
            await session.commit()
            logger.info(
                "Parsed book_id=%s (%s): %s chapters, spine_color=%s",
                book_id,
                parsed.title,
                len(parsed.chapters),
                parsed.spine_color,
            )
    except Exception as exc:
        logger.exception("Failed to parse EPUB for book_id=%s", book_id)
        async with AsyncSessionLocal() as session:
            book = await session.get(Book, book_id)
            if book is not None:
                book.parse_status = "failed"
                book.parse_error = str(exc)[:1000]
                await session.commit()

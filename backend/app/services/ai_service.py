import json
import logging
import re
from collections.abc import AsyncGenerator
from typing import Literal

import httpx
from bs4 import BeautifulSoup

from app.core import config
from app.models.book import Chapter

logger = logging.getLogger(__name__)

AIAssistMode = Literal["recap", "characters", "qa"]

MULTI_NEWLINE_RE = re.compile(r"\n{3,}")


BLOCK_TAGS = ("p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "tr")


def strip_html_for_llm(content_html: str) -> str:
    """Convert sanitized chapter HTML to clean plain text while removing furigana <rt>/<rp>."""
    if not content_html:
        return ""
    soup = BeautifulSoup(content_html, "lxml")
    for ruby_noise in soup.find_all(["rt", "rp"]):
        ruby_noise.decompose()

    for br in soup.find_all("br"):
        br.replace_with("\n")
    for block in soup.find_all(BLOCK_TAGS):
        block.append("\n")

    raw_text = soup.get_text("")
    lines = [line.strip() for line in raw_text.splitlines()]
    cleaned = "\n".join(line for line in lines if line)
    return MULTI_NEWLINE_RE.sub("\n\n", cleaned).strip()


def build_spoiler_free_context(
    read_chapters: list[Chapter],
    max_chars: int | None = None,
) -> tuple[str, int]:
    """Assemble plain-text context strictly from already-read chapters within char budget."""
    budget = max_chars if max_chars is not None else config.LLM_MAX_CONTEXT_CHARS
    budget = max(2000, budget)

    formatted_chapters: list[tuple[int, str]] = []
    for ch in read_chapters:
        plain = strip_html_for_llm(ch.content_html)
        if not plain:
            continue
        block = f"【第 {ch.order_index} 章 · {ch.title}】\n{plain}"
        formatted_chapters.append((ch.order_index, block))

    if not formatted_chapters:
        return "（已读章节中暂无可提取的正文文本。）", 0

    full_text = "\n\n".join(block for _, block in formatted_chapters)
    if len(full_text) <= budget:
        return full_text, len(formatted_chapters)

    # Smart truncation: preserve recent chapters first (80% budget) + opening setup (20% budget)
    opening_budget = int(budget * 0.2)
    recent_budget = budget - opening_budget

    recent_blocks: list[str] = []
    recent_indices: set[int] = set()
    used_recent = 0

    for order_idx, block in reversed(formatted_chapters):
        if used_recent + len(block) + 2 <= recent_budget:
            recent_blocks.append(block)
            recent_indices.add(order_idx)
            used_recent += len(block) + 2
        else:
            remaining = recent_budget - used_recent
            if remaining > 300 and not recent_blocks:
                recent_blocks.append(block[-remaining:])
                recent_indices.add(order_idx)
                used_recent = recent_budget
            elif remaining > 500:
                recent_blocks.append(block[-remaining:])
                recent_indices.add(order_idx)
                used_recent = recent_budget
            break

    recent_blocks.reverse()

    opening_blocks: list[str] = []
    opening_indices: set[int] = set()
    used_opening = 0

    for order_idx, block in formatted_chapters:
        if order_idx in recent_indices:
            break
        if used_opening + len(block) + 2 <= opening_budget:
            opening_blocks.append(block)
            opening_indices.add(order_idx)
            used_opening += len(block) + 2
        else:
            remaining = opening_budget - used_opening
            if remaining > 300:
                opening_blocks.append(block[:remaining] + "…")
                opening_indices.add(order_idx)
            break

    total_included = len(opening_indices | recent_indices)
    if opening_blocks:
        assembled = (
            "\n\n".join(opening_blocks)
            + "\n\n……（为控制上下文长度，中间部分已读章节已省略）……\n\n"
            + "\n\n".join(recent_blocks)
        )
    else:
        assembled = "\n\n".join(recent_blocks)

    return assembled, total_included


def build_ai_messages(
    *,
    book_title: str,
    book_author: str | None,
    max_order_index: int,
    max_chapter_title: str,
    context_text: str,
    mode: AIAssistMode,
    question: str | None = None,
) -> list[dict[str, str]]:
    author_part = f"（作者：{book_author}）" if book_author else ""
    system_prompt = (
        f"你是一位专业、克制且严守防剧透原则的轻小说伴读助手，正在协助读者阅读《{book_title}》{author_part}。\n"
        f"当前读者只读到第 {max_order_index} 章（{max_chapter_title}）。\n"
        "严格遵守以下规则：\n"
        "1. 只能依据下方提供的「已读章节正文」作答，绝对禁止使用你预训练记忆中关于本书后续章节、后续卷或结局的任何知识，绝不剧透。\n"
        "2. 如果读者的问题涉及尚未出现的剧情、伏笔真相或后续发展，请明确告知「截至当前章节尚未揭示」。\n"
        "3. 始终使用自然流畅的简体中文，条理清晰、重点突出。"
    )

    if mode == "recap":
        task_instruction = (
            f"请基于读者截至第 {max_order_index} 章（{max_chapter_title}）的已读内容，生成一份精炼的前情提要：\n"
            "- 用简洁的分点梳理目前为止的核心剧情脉络；\n"
            "- 概括当前章节所处的关键局势与尚未解开的悬念（不要猜测剧透）。"
        )
    elif mode == "characters":
        task_instruction = (
            f"请基于读者截至第 {max_order_index} 章（{max_chapter_title}）的已读内容，梳理目前已出场的主要角色卡：\n"
            "- 每位角色列出：姓名 / 身份与阵营 / 截至当前章节的关键经历与人物关系；\n"
            "- 只收录下方正文中实际出场或被明确提及的角色，切勿补充未揭示的隐藏身份。"
        )
    else:
        clean_question = (question or "").strip()
        task_instruction = (
            f"读者在读到第 {max_order_index} 章（{max_chapter_title}）时提出以下问题，请严格在不剧透的前提下解答：\n"
            f"问题：{clean_question}"
        )

    user_prompt = (
        f"{task_instruction}\n\n"
        f"=== 以下为第 1 章至第 {max_order_index} 章的已读正文内容 ===\n"
        f"{context_text}"
    )

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def _format_sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def stream_ai_assist(
    *,
    messages: list[dict[str, str]],
    max_order_index: int,
    max_chapter_title: str,
    included_chapters: int,
    api_key: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
    http_client: httpx.AsyncClient | None = None,
) -> AsyncGenerator[str, None]:
    """Stream SSE chunks from an OpenAI-compatible Chat Completions endpoint."""
    settings = config.get_llm_settings()
    resolved_key = (api_key if api_key is not None else settings.api_key).strip()
    resolved_base = (base_url if base_url is not None else settings.base_url).strip().rstrip("/")
    resolved_model = (model if model is not None else settings.model).strip()

    yield _format_sse(
        {
            "type": "meta",
            "max_order_index": max_order_index,
            "chapter_title": max_chapter_title,
            "included_chapters": included_chapters,
        }
    )

    endpoint = f"{resolved_base}/chat/completions"
    headers = {
        "Authorization": f"Bearer {resolved_key}",
        "Content-Type": "application/json",
    }
    request_body = {
        "model": resolved_model,
        "messages": messages,
        "stream": True,
        "temperature": 0.4,
    }

    owns_client = http_client is None
    client = http_client or httpx.AsyncClient(
        timeout=httpx.Timeout(connect=15.0, read=120.0, write=15.0, pool=15.0)
    )

    try:
        async with client.stream(
            "POST",
            endpoint,
            headers=headers,
            json=request_body,
        ) as response:
            if response.status_code >= 400:
                raw_err = (await response.aread()).decode("utf-8", errors="ignore").strip()
                err_detail = raw_err[:300] if raw_err else f"HTTP {response.status_code}"
                logger.warning("LLM upstream returned %s: %s", response.status_code, err_detail)
                yield _format_sse(
                    {
                        "type": "error",
                        "message": f"模型服务返回异常（HTTP {response.status_code}），请检查 LLM_API_KEY、LLM_BASE_URL 与 LLM_MODEL 配置。",
                    }
                )
                return

            async for line in response.aiter_lines():
                stripped = line.strip()
                if not stripped or not stripped.startswith("data:"):
                    continue
                data_str = stripped[5:].strip()
                if data_str == "[DONE]":
                    break

                try:
                    chunk = json.loads(data_str)
                except json.JSONDecodeError:
                    continue

                choices = chunk.get("choices") or []
                if not choices:
                    continue
                delta = choices[0].get("delta") or {}
                content = delta.get("content")
                if content:
                    yield _format_sse({"type": "delta", "content": content})

        yield _format_sse({"type": "done"})
    except httpx.TimeoutException:
        yield _format_sse(
            {
                "type": "error",
                "message": "连接 AI 模型服务超时，请稍后重试或检查网络代理配置。",
            }
        )
    except httpx.HTTPError as exc:
        logger.warning("LLM HTTP error: %s", exc)
        yield _format_sse(
            {
                "type": "error",
                "message": "无法连接到配置的 AI 模型端点，请检查 LLM_BASE_URL 与网络连接。",
            }
        )
    except Exception as exc:  # pragma: no cover - defensive stream guard
        logger.exception("Unexpected error during AI streaming: %s", exc)
        yield _format_sse(
            {
                "type": "error",
                "message": "AI 生成过程中出现意外错误，请稍后重试。",
            }
        )
    finally:
        if owns_client:
            await client.aclose()

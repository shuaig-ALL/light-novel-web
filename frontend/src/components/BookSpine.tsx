import { AlertCircle, BookOpen, GripVertical, Loader2, Trash2 } from 'lucide-react'
import {
  useEffect,
  useRef,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import type { BookListItem } from '../api/books'

interface BookSpineProps {
  book: BookListItem
  isExpanded: boolean
  isReordering?: boolean
  orderNumber?: number
  isDragging?: boolean
  dropIndicator?: 'before' | 'after' | null
  onExpand: (bookId: number) => void
  onSelect: (book: BookListItem) => void
  onRequestDelete: (book: BookListItem) => void
  onDragStartBook?: (bookId: number, event: DragEvent<HTMLDivElement>) => void
  onDragOverBook?: (bookId: number, event: DragEvent<HTMLDivElement>) => void
  onDropOnBook?: (bookId: number, event: DragEvent<HTMLDivElement>) => void
  onDragEndBook?: () => void
}

export function BookSpine({
  book,
  isExpanded,
  isReordering = false,
  orderNumber,
  isDragging = false,
  dropIndicator = null,
  onExpand,
  onSelect,
  onRequestDelete,
  onDragStartBook,
  onDragOverBook,
  onDropOnBook,
  onDragEndBook,
}: BookSpineProps) {
  const isParsing = book.parse_status === 'pending' || book.parse_status === 'processing'
  const isFailed = book.parse_status === 'failed'
  const isReadable = book.parse_status === 'completed'

  const rootRef = useRef<HTMLDivElement | null>(null)
  const lastPointerTypeRef = useRef<string>('mouse')

  // On narrow touch shelves, keep the expanded cover cleanly scrolled inside the row viewport
  useEffect(() => {
    if (!isExpanded || !rootRef.current) {
      return
    }
    const timer = window.setTimeout(() => {
      rootRef.current?.scrollIntoView({
        behavior: 'smooth',
        inline: 'nearest',
        block: 'nearest',
      })
    }, 120)
    return () => window.clearTimeout(timer)
  }, [isExpanded])

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    lastPointerTypeRef.current = event.pointerType || 'mouse'
  }

  const handleCardClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation()

    if (isReordering) {
      return
    }

    const isTouchInteraction =
      lastPointerTypeRef.current === 'touch' ||
      lastPointerTypeRef.current === 'pen' ||
      window.matchMedia('(hover: none)').matches

    // On touch devices without hover: first tap expands the book; second tap opens the reader
    if (isTouchInteraction && !isExpanded) {
      onExpand(book.id)
      return
    }

    if (isReadable) {
      onSelect(book)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isReordering) {
      return
    }
    if (isReadable && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      onSelect(book)
    }
  }

  const handleDeleteClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onRequestDelete(book)
  }

  const handleReadButtonClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (isReadable) {
      onSelect(book)
    }
  }

  return (
    <div
      ref={rootRef}
      role="button"
      tabIndex={0}
      draggable={isReordering}
      data-book-spine="true"
      data-expanded={isExpanded && !isReordering ? 'true' : 'false'}
      data-reordering={isReordering ? 'true' : 'false'}
      aria-label={isReordering ? `拖动调整《${book.title}》的顺序` : book.title}
      aria-expanded={isExpanded && !isReordering}
      title={isReordering ? `按住拖动调整《${book.title}》的位置` : book.title}
      onPointerDown={handlePointerDown}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      onDragStart={isReordering ? (e) => onDragStartBook?.(book.id, e) : undefined}
      onDragOver={isReordering ? (e) => onDragOverBook?.(book.id, e) : undefined}
      onDrop={isReordering ? (e) => onDropOnBook?.(book.id, e) : undefined}
      onDragEnd={isReordering ? () => onDragEndBook?.() : undefined}
      className={`book-stage relative flex shrink-0 flex-col items-start pt-2 pb-0 text-left transition-all duration-300 ease-out focus-visible:outline-none ${
        isReordering
          ? 'cursor-grab active:cursor-grabbing'
          : isReadable || !isExpanded
            ? 'cursor-pointer'
            : 'cursor-default'
      } ${isDragging ? 'scale-[0.97] opacity-35' : ''}`}
    >
      {/* Clear vertical insertion bar highlighting target drop slot in PC reorder mode */}
      {isReordering && dropIndicator && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute top-1 bottom-1 z-30 flex flex-col items-center justify-between ${
            dropIndicator === 'before' ? '-left-[3px]' : '-right-[3px]'
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-zinc-900 shadow-xs" />
          <span className="w-[3px] flex-1 rounded-full bg-zinc-900 shadow-[0_0_10px_rgba(24,24,27,0.45)]" />
          <span className="h-2 w-2 rounded-full bg-zinc-900 shadow-xs" />
        </div>
      )}

      {/* Reorder mode order badge & subtle grip cue above spine */}
      {isReordering && typeof orderNumber === 'number' && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-5 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 shadow-xs tabular-nums"
        >
          <GripVertical className="h-2.5 w-2.5 text-zinc-400" strokeWidth={2} />
          <span>{orderNumber}</span>
        </div>
      )}

      {/* 3D Book Volume: 160x240 (2:3 bunko ratio) with 34px pure-white spine */}
      <div className="book-3d pointer-events-none relative h-[240px] w-[160px]">
        {/* Left Spine Face (34px wide, pure white, vertical charcoal title) */}
        <div
          className={`book-face-spine absolute top-0 left-0 flex h-full w-[34px] flex-col items-center justify-between overflow-hidden rounded-l-[2px] border bg-white px-1 py-3 shadow-[inset_-2px_0_4px_rgba(24,24,27,0.05)] transition-colors ${
            dropIndicator
              ? 'border-zinc-900 bg-zinc-50'
              : isReordering
                ? 'border-zinc-300'
                : 'border-zinc-200'
          }`}
        >
          <span className="block h-px w-4 shrink-0 bg-zinc-200" />

          <div className="flex max-h-[178px] flex-1 items-center justify-center overflow-hidden py-1.5">
            <span className="writing-vertical max-h-[172px] overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-semibold tracking-[0.12em] text-zinc-900">
              {book.title}
            </span>
          </div>

          <div className="flex shrink-0 flex-col items-center gap-1">
            {isParsing ? (
              <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
            ) : isFailed ? (
              <AlertCircle className="h-3 w-3 text-zinc-400" />
            ) : (
              <span className="max-w-[26px] truncate text-[9px] font-medium text-zinc-400">
                {book.total_chapters}
              </span>
            )}
            <span className="block h-px w-4 bg-zinc-200" />
          </div>
        </div>

        {/* Front Cover Face (2:3 ratio) */}
        <div className="book-face-front book-cover-card absolute inset-0 overflow-hidden rounded-r-[3px] border border-zinc-200 bg-white transition-all duration-300">
          {book.cover_url ? (
            <img
              src={book.cover_url}
              alt={book.title}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col justify-between bg-white p-4 text-zinc-900">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium tracking-widest text-zinc-400 uppercase">
                  Light Novel
                </span>
                <BookOpen className="h-3.5 w-3.5 text-zinc-400" strokeWidth={1.6} />
              </div>
              <div className="my-auto py-3">
                <p className="line-clamp-4 text-sm font-semibold leading-snug tracking-tight text-zinc-900">
                  {book.title}
                </p>
                {book.author && (
                  <p className="mt-2 truncate text-[11px] text-zinc-500">
                    {book.author}
                  </p>
                )}
              </div>
              <div className="h-px w-full bg-zinc-100" />
            </div>
          )}

          {/* Subtle binding hinge shading along the left edge of the cover */}
          <div className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/10 to-transparent" />

          {/* Status badge when parsing or failed (top-left, clear of delete button) */}
          {(isParsing || isFailed) && (
            <div className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-zinc-900/80 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-xs">
              {isParsing ? (
                <>
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  解析中
                </>
              ) : (
                <>
                  <AlertCircle className="h-2.5 w-2.5" />
                  解析失败
                </>
              )}
            </div>
          )}

          {/* Minimalist translucent delete button (visible only when expanded / hovered) */}
          <button
            type="button"
            aria-label={`删除《${book.title}》`}
            title="删除书籍"
            onClick={handleDeleteClick}
            onKeyDown={(e) => e.stopPropagation()}
            className="book-delete-btn absolute top-2 right-2 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-zinc-900/55 text-white/95 backdrop-blur-xs transition-all duration-200 hover:bg-zinc-900/85 hover:text-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:h-7 sm:w-7"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>

          {/* Expanded / hover info overlay: title, author, reading progress & read CTA */}
          <div className="book-overlay absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-950/95 via-zinc-950/84 to-transparent px-3 pt-11 pb-3 text-white transition-all duration-300">
            <h3 className="line-clamp-2 text-xs font-semibold leading-snug tracking-tight">
              {book.title}
            </h3>
            <p className="mt-0.5 truncate text-[11px] text-zinc-300">
              {book.author || '未知作者'}
            </p>

            {isReadable && (
              <div className="mt-2">
                {book.progress_percent !== null ? (
                  <>
                    <p className="truncate text-[10px] text-zinc-200">
                      已读 {Math.round(book.progress_percent)}%
                      {book.last_chapter_title ? ` · ${book.last_chapter_title}` : ''}
                    </p>
                    <div className="mt-1 h-[2px] w-full overflow-hidden rounded-full bg-white/20">
                      <div
                        className="h-full rounded-full bg-white transition-all duration-300"
                        style={{
                          width: `${Math.min(100, Math.max(2, book.progress_percent))}%`,
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-[10px] text-zinc-400">未开始阅读</p>
                )}
              </div>
            )}

            <div className="mt-2 flex items-center justify-between text-[10px]">
              {isReadable ? (
                <>
                  <span className="rounded bg-white/15 px-1.5 py-0.5 text-zinc-100 backdrop-blur-xs">
                    共 {book.total_chapters} 章
                  </span>
                  <button
                    type="button"
                    onClick={handleReadButtonClick}
                    onKeyDown={(e) => e.stopPropagation()}
                    className={`rounded bg-white/15 px-2 py-0.5 font-medium text-white transition hover:bg-white/25 ${
                      isExpanded ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'
                    }`}
                  >
                    阅读 →
                  </button>
                </>
              ) : isParsing ? (
                <span className="text-zinc-200">正在解析章节...</span>
              ) : (
                <span className="truncate text-zinc-300">
                  {book.parse_error || '解析异常'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Paper Pages Edge */}
        <div
          aria-hidden="true"
          className="book-face-pages absolute top-[2px] right-0 h-[236px] w-[32px] border-y border-zinc-200 bg-[repeating-linear-gradient(to_right,#fafafa_0px,#fafafa_2px,#e4e4e7_2px,#e4e4e7_3px)]"
        />

        {/* Back Cover Face */}
        <div
          aria-hidden="true"
          className="book-face-back absolute inset-0 rounded-l-[3px] border border-zinc-200 bg-zinc-50"
        />
      </div>

      {/* Soft contact shadow that widens and deepens when expanded / hovered */}
      <div
        aria-hidden="true"
        className="book-shadow pointer-events-none -mt-1 h-[7px] rounded-full transition-all duration-300 ease-out"
      />
    </div>
  )
}

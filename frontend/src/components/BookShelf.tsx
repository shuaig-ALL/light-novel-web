import { BookMarked, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import type { BookListItem } from '../api/books'
import { BookSpine } from './BookSpine'

interface BookShelfProps {
  books: BookListItem[]
  expandedBookId: number | null
  isReordering?: boolean
  onExpandBook: (bookId: number) => void
  onSelectBook: (book: BookListItem) => void
  onDeleteBook: (book: BookListItem) => void
  onRequestUpload: () => void
  onReorderBooks?: (orderedBookIds: number[]) => void
}

const COLLAPSED_SLOT_PX = 56 // 54px spine slot + 2px flex gap
const EXPAND_EXTRA_PX = 134 // 188px expanded width - 54px collapsed width (reserved once per row)
const LAST_BOOK_OVERHANG_PX = 38 // rightmost book's angled 3D cover peek past its 54px slot
const DESKTOP_PADDING_X_PX = 32 // sm:px-4 (16px left + 16px right)
const MOBILE_PADDING_X_PX = 24 // px-3 (12px left + 12px right)

function computeBooksPerRow(containerWidth: number): number {
  if (containerWidth <= 0) {
    return 5
  }
  // Mobile portrait (<640px): fill width cleanly without horizontal overflow when collapsed
  if (containerWidth < 640) {
    const usable = containerWidth - MOBILE_PADDING_X_PX - LAST_BOOK_OVERHANG_PX
    return Math.max(3, Math.floor(usable / COLLAPSED_SLOT_PX))
  }
  // Tablet & Desktop (>=640px): no artificial row cap; reserve room for 1 expanded book + last-book overhang
  const usable =
    containerWidth - DESKTOP_PADDING_X_PX - EXPAND_EXTRA_PX - LAST_BOOK_OVERHANG_PX
  return Math.max(4, Math.floor(usable / COLLAPSED_SLOT_PX))
}

function chunkBooks(books: BookListItem[], size: number): BookListItem[][] {
  const safeSize = Math.max(1, size)
  const rows: BookListItem[][] = []
  for (let i = 0; i < books.length; i += safeSize) {
    rows.push(books.slice(i, i + safeSize))
  }
  return rows
}

export function BookShelf({
  books,
  expandedBookId,
  isReordering = false,
  onExpandBook,
  onSelectBook,
  onDeleteBook,
  onRequestUpload,
  onReorderBooks,
}: BookShelfProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const draggedBookIdRef = useRef<number | null>(null)
  const [draggedBookId, setDraggedBookId] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<{
    bookId: number
    position: 'before' | 'after'
  } | null>(null)
  const [booksPerRow, setBooksPerRow] = useState<number>(() =>
    typeof window !== 'undefined'
      ? computeBooksPerRow(Math.min(window.innerWidth - 32, 1216))
      : 10,
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) {
      return
    }

    const updateCapacity = () => {
      const nextWidth = Math.floor(el.getBoundingClientRect().width)
      if (nextWidth > 0) {
        setBooksPerRow(computeBooksPerRow(nextWidth))
      }
    }

    const rafId = window.requestAnimationFrame(updateCapacity)
    const observer = new ResizeObserver(updateCapacity)
    observer.observe(el)

    return () => {
      window.cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [books.length])

  const shelfRows = useMemo(
    () => chunkBooks(books, booksPerRow),
    [books, booksPerRow],
  )

  const bookOrderMap = useMemo(() => {
    const map = new Map<number, number>()
    books.forEach((book, idx) => {
      map.set(book.id, idx + 1)
    })
    return map
  }, [books])

  const resetDragState = () => {
    draggedBookIdRef.current = null
    setDraggedBookId(null)
    setDropTarget(null)
  }

  const commitReorder = (
    sourceId: number,
    targetId: number,
    position: 'before' | 'after',
  ) => {
    if (sourceId === targetId) {
      return
    }
    const currentIds = books.map((b) => b.id)
    if (!currentIds.includes(sourceId) || !currentIds.includes(targetId)) {
      return
    }
    const remaining = currentIds.filter((id) => id !== sourceId)
    const targetIdx = remaining.indexOf(targetId)
    if (targetIdx === -1) {
      return
    }
    const insertIdx = position === 'before' ? targetIdx : targetIdx + 1
    remaining.splice(insertIdx, 0, sourceId)

    const changed = remaining.some((id, idx) => id !== currentIds[idx])
    if (changed) {
      onReorderBooks?.(remaining)
    }
  }

  const handleDragStartBook = (bookId: number, event: DragEvent<HTMLDivElement>) => {
    if (!isReordering) {
      return
    }
    draggedBookIdRef.current = bookId
    setDraggedBookId(bookId)
    setDropTarget(null)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(bookId))
  }

  const handleDragOverBook = (bookId: number, event: DragEvent<HTMLDivElement>) => {
    if (!isReordering || draggedBookIdRef.current === null) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'

    if (draggedBookIdRef.current === bookId) {
      if (dropTarget !== null) {
        setDropTarget(null)
      }
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const position: 'before' | 'after' =
      event.clientX < rect.left + rect.width / 2 ? 'before' : 'after'

    if (dropTarget?.bookId !== bookId || dropTarget.position !== position) {
      setDropTarget({ bookId, position })
    }
  }

  const handleDropOnBook = (bookId: number, event: DragEvent<HTMLDivElement>) => {
    if (!isReordering) {
      return
    }
    event.preventDefault()
    event.stopPropagation()

    const sourceId =
      draggedBookIdRef.current ?? Number(event.dataTransfer.getData('text/plain'))
    const rect = event.currentTarget.getBoundingClientRect()
    const position: 'before' | 'after' =
      dropTarget?.bookId === bookId
        ? dropTarget.position
        : event.clientX < rect.left + rect.width / 2
          ? 'before'
          : 'after'

    resetDragState()
    if (Number.isFinite(sourceId) && sourceId > 0) {
      commitReorder(sourceId, bookId, position)
    }
  }

  const handleDragOverRowEnd = (lastBookId: number, event: DragEvent<HTMLDivElement>) => {
    if (!isReordering || draggedBookIdRef.current === null) {
      return
    }
    if (event.target !== event.currentTarget) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    if (draggedBookIdRef.current === lastBookId) {
      return
    }
    if (dropTarget?.bookId !== lastBookId || dropTarget.position !== 'after') {
      setDropTarget({ bookId: lastBookId, position: 'after' })
    }
  }

  const handleDropRowEnd = (lastBookId: number, event: DragEvent<HTMLDivElement>) => {
    if (!isReordering || event.target !== event.currentTarget) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const sourceId =
      draggedBookIdRef.current ?? Number(event.dataTransfer.getData('text/plain'))
    resetDragState()
    if (Number.isFinite(sourceId) && sourceId > 0) {
      commitReorder(sourceId, lastBookId, 'after')
    }
  }

  if (books.length === 0) {
    return (
      <div ref={containerRef} className="mx-auto mt-10 max-w-2xl">
        <div className="rounded-2xl border border-dashed border-zinc-200 bg-white px-6 py-14 text-center sm:px-8 sm:py-16">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-900">
            <BookMarked className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <h2 className="mt-5 text-base font-semibold text-zinc-900">
            书架还是空的
          </h2>
          <p className="mt-2 text-sm text-zinc-500">
            上传你的第一本 <code className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-xs text-zinc-700">.epub</code> 轻小说，系统会自动提取封面、章节目录与书内插画。
          </p>
          <button
            type="button"
            onClick={onRequestUpload}
            className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            <Upload className="h-4 w-4" strokeWidth={1.75} />
            导入本地 EPUB
          </button>
        </div>

        {/* Minimalist pure-white/light-gray shelf bar */}
        <div className="mt-8 h-2.5 rounded-xs border border-zinc-200/80 bg-gradient-to-b from-white to-zinc-100/90 shadow-[0_8px_20px_-6px_rgba(24,24,27,0.12)]" />
      </div>
    )
  }

  return (
    <div ref={containerRef} className="space-y-10 sm:space-y-14">
      {shelfRows.map((row, rowIndex) => {
        const lastBookInRow = row[row.length - 1]
        return (
          <section key={rowIndex} aria-label={`书架第 ${rowIndex + 1} 层`}>
            {/* Desktop uses overflow-x-visible so rightmost hover expansion & 3D shadow never clip or create scrollbars */}
            <div
              onDragOver={
                isReordering && lastBookInRow
                  ? (e) => handleDragOverRowEnd(lastBookInRow.id, e)
                  : undefined
              }
              onDrop={
                isReordering && lastBookInRow
                  ? (e) => handleDropRowEnd(lastBookInRow.id, e)
                  : undefined
              }
              className="overflow-x-auto px-3 pt-8 pb-1 sm:overflow-x-visible sm:px-4 sm:pt-9"
            >
              <div className="flex w-max flex-nowrap items-end gap-0.5">
                {row.map((book) => (
                  <BookSpine
                    key={book.id}
                    book={book}
                    isExpanded={expandedBookId === book.id}
                    isReordering={isReordering}
                    orderNumber={bookOrderMap.get(book.id)}
                    isDragging={isReordering && draggedBookId === book.id}
                    dropIndicator={
                      isReordering && dropTarget?.bookId === book.id
                        ? dropTarget.position
                        : null
                    }
                    onExpand={onExpandBook}
                    onSelect={onSelectBook}
                    onRequestDelete={onDeleteBook}
                    onDragStartBook={handleDragStartBook}
                    onDragOverBook={handleDragOverBook}
                    onDropOnBook={handleDropOnBook}
                    onDragEndBook={resetDragState}
                  />
                ))}
              </div>
            </div>

            {/* Minimalist pale-gray / pure-white shelf bar with soft bottom shadow */}
            <div className="relative">
              <div
                className={`h-[10px] rounded-xs border bg-gradient-to-b from-white via-zinc-50 to-zinc-100/90 shadow-[0_10px_22px_-6px_rgba(24,24,27,0.14)] transition-colors ${
                  isReordering ? 'border-zinc-300' : 'border-zinc-200/80'
                }`}
              />
              <div className="mx-6 h-[3px] rounded-b-full bg-zinc-900/5 blur-[2px]" />
            </div>
          </section>
        )
      })}
    </div>
  )
}

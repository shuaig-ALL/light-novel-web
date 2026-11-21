import { BookMarked, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { BookListItem } from '../api/books'
import { BookSpine } from './BookSpine'

interface BookShelfProps {
  books: BookListItem[]
  expandedBookId: number | null
  onExpandBook: (bookId: number) => void
  onSelectBook: (book: BookListItem) => void
  onDeleteBook: (book: BookListItem) => void
  onRequestUpload: () => void
}

const COLLAPSED_SLOT_PX = 56 // 54px spine slot + 2px gap
const EXPAND_EXTRA_PX = 162  // 216px expanded - 54px collapsed
const MAX_BOOKS_PER_ROW = 14

function computeBooksPerRow(containerWidth: number): number {
  if (containerWidth <= 0) {
    return 5
  }
  // On mobile portrait (<640px), wrap cleanly so collapsed rows never overflow horizontally
  if (containerWidth < 640) {
    // Reserve ~44px for left/right shelf padding + rightmost angled cover peek
    return Math.max(3, Math.floor((containerWidth - 44) / COLLAPSED_SLOT_PX))
  }
  // On tablet & desktop (>=640px), reserve room for 1 expanded book so hovering parts neighbors cleanly
  const usable = containerWidth - 80 - EXPAND_EXTRA_PX
  return Math.min(
    MAX_BOOKS_PER_ROW,
    Math.max(5, Math.floor(usable / COLLAPSED_SLOT_PX) + 1),
  )
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
  onExpandBook,
  onSelectBook,
  onDeleteBook,
  onRequestUpload,
}: BookShelfProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [booksPerRow, setBooksPerRow] = useState<number>(() =>
    typeof window !== 'undefined'
      ? computeBooksPerRow(Math.min(window.innerWidth - 32, 1088))
      : 6,
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
      {shelfRows.map((row, rowIndex) => (
        <section key={rowIndex} aria-label={`书架第 ${rowIndex + 1} 层`}>
          {/* Responsive multi-row shelf: overflows gently only if a touch-expanded book needs momentary glide */}
          <div className="overflow-x-auto pt-7 pr-8 pb-1 pl-3 sm:pt-8 sm:pr-16 sm:pl-8">
            <div className="flex w-max flex-nowrap items-end gap-0.5">
              {row.map((book) => (
                <BookSpine
                  key={book.id}
                  book={book}
                  isExpanded={expandedBookId === book.id}
                  onExpand={onExpandBook}
                  onSelect={onSelectBook}
                  onRequestDelete={onDeleteBook}
                />
              ))}
            </div>
          </div>

          {/* Minimalist pale-gray / pure-white shelf bar with soft bottom shadow */}
          <div className="relative">
            <div className="h-[10px] rounded-xs border border-zinc-200/80 bg-gradient-to-b from-white via-zinc-50 to-zinc-100/90 shadow-[0_10px_22px_-6px_rgba(24,24,27,0.14)]" />
            <div className="mx-6 h-[3px] rounded-b-full bg-zinc-900/5 blur-[2px]" />
          </div>
        </section>
      ))}
    </div>
  )
}

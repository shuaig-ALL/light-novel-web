import { BookMarked, Upload } from 'lucide-react'
import type { BookListItem } from '../api/books'
import { BookSpine } from './BookSpine'

interface BookShelfProps {
  books: BookListItem[]
  onSelectBook: (book: BookListItem) => void
  onDeleteBook: (book: BookListItem) => void
  onRequestUpload: () => void
}

const BOOKS_PER_SHELF = 14

function chunkBooks(books: BookListItem[], size: number): BookListItem[][] {
  const rows: BookListItem[][] = []
  for (let i = 0; i < books.length; i += size) {
    rows.push(books.slice(i, i + size))
  }
  return rows
}

export function BookShelf({
  books,
  onSelectBook,
  onDeleteBook,
  onRequestUpload,
}: BookShelfProps) {
  if (books.length === 0) {
    return (
      <div className="mx-auto mt-10 max-w-2xl">
        <div className="rounded-2xl border border-dashed border-zinc-200 bg-white px-8 py-16 text-center">
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

  const shelfRows = chunkBooks(books, BOOKS_PER_SHELF)

  return (
    <div className="space-y-14">
      {shelfRows.map((row, rowIndex) => (
        <section key={rowIndex} aria-label={`书架第 ${rowIndex + 1} 层`}>
          {/* Single non-wrapping shelf row: tightly stacked by default, smoothly parts neighbors on hover */}
          <div className="overflow-x-auto pt-8 pr-16 pb-1 pl-6 sm:pr-20 sm:pl-10">
            <div className="flex w-max flex-nowrap items-end gap-0.5">
              {row.map((book) => (
                <BookSpine
                  key={book.id}
                  book={book}
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

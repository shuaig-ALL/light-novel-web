import { AlertCircle, BookOpen, Loader2 } from 'lucide-react'
import type { BookListItem } from '../api/books'

interface BookSpineProps {
  book: BookListItem
  onSelect: (book: BookListItem) => void
}

export function BookSpine({ book, onSelect }: BookSpineProps) {
  const isParsing = book.parse_status === 'pending' || book.parse_status === 'processing'
  const isFailed = book.parse_status === 'failed'
  const isReadable = book.parse_status === 'completed'

  return (
    <button
      type="button"
      onClick={() => isReadable && onSelect(book)}
      disabled={!isReadable}
      title={book.title}
      className={`book-stage group relative z-0 flex w-[54px] shrink-0 flex-col items-start pt-2 pb-0 text-left transition-all duration-300 ease-out hover:z-20 hover:w-[216px] focus-visible:z-20 focus-visible:w-[216px] focus-visible:outline-none ${
        isReadable ? 'cursor-pointer' : 'cursor-default'
      }`}
    >
      {/* 3D Book Volume: 160x240 (2:3 bunko ratio) with 34px pure-white spine */}
      <div className="book-3d pointer-events-none relative h-[240px] w-[160px]">
        {/* Left Spine Face (34px wide, pure white, vertical charcoal title) */}
        <div className="book-face-spine absolute top-0 left-0 flex h-full w-[34px] flex-col items-center justify-between overflow-hidden rounded-l-[2px] border border-zinc-200 bg-white px-1 py-3 shadow-[inset_-2px_0_4px_rgba(24,24,27,0.05)]">
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
        <div className="book-face-front absolute inset-0 overflow-hidden rounded-r-[3px] border border-zinc-200 bg-white shadow-[0_6px_14px_rgba(24,24,27,0.08)] transition-shadow duration-300 group-hover:border-zinc-300 group-hover:shadow-[0_22px_40px_rgba(24,24,27,0.18)] group-focus-visible:ring-2 group-focus-visible:ring-zinc-900">
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

          {/* Status badge when parsing or failed */}
          {(isParsing || isFailed) && (
            <div className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-zinc-900/80 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-xs">
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

          {/* Hover info overlay: title, author, chapter count */}
          <div className="absolute inset-x-0 bottom-0 translate-y-1 bg-gradient-to-t from-zinc-950/92 via-zinc-950/78 to-transparent px-3 pt-10 pb-3 text-white opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
            <h3 className="line-clamp-2 text-xs font-semibold leading-snug tracking-tight">
              {book.title}
            </h3>
            <p className="mt-0.5 truncate text-[11px] text-zinc-300">
              {book.author || '未知作者'}
            </p>
            <div className="mt-2 flex items-center justify-between text-[10px]">
              {isReadable ? (
                <>
                  <span className="rounded bg-white/15 px-1.5 py-0.5 text-zinc-100 backdrop-blur-xs">
                    共 {book.total_chapters} 章
                  </span>
                  <span className="font-medium text-white">阅读 →</span>
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

      {/* Soft contact shadow that widens and deepens when the book turns forward */}
      <div
        aria-hidden="true"
        className="pointer-events-none -mt-1 ml-1 h-[7px] w-[48px] -skew-x-[24deg] rounded-full bg-zinc-900/12 blur-[4px] transition-all duration-300 ease-out group-hover:ml-7 group-hover:w-[156px] group-hover:skew-x-0 group-hover:bg-zinc-900/24 group-hover:blur-[8px] group-focus-visible:ml-7 group-focus-visible:w-[156px] group-focus-visible:skew-x-0 group-focus-visible:bg-zinc-900/24 group-focus-visible:blur-[8px]"
      />
    </button>
  )
}

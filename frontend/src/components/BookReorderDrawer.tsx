import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  GripVertical,
  Loader2,
  X,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from 'react'
import type { BookListItem } from '../api/books'

interface BookReorderDrawerProps {
  books: BookListItem[]
  saving: boolean
  errorMsg: string | null
  onSave: (orderedBookIds: number[]) => Promise<void>
  onClose: () => void
}

export function BookReorderDrawer({
  books,
  saving,
  errorMsg,
  onSave,
  onClose,
}: BookReorderDrawerProps) {
  const [draftBooks, setDraftBooks] = useState<BookListItem[]>(() => [...books])
  const [draggingBookId, setDraggingBookId] = useState<number | null>(null)

  const listContainerRef = useRef<HTMLDivElement | null>(null)
  const rowNodesRef = useRef<Map<number, HTMLLIElement>>(new Map())
  const draftBooksRef = useRef<BookListItem[]>(draftBooks)
  const draggingIdRef = useRef<number | null>(null)
  const activePointerIdRef = useRef<number | null>(null)

  useEffect(() => {
    draftBooksRef.current = draftBooks
  }, [draftBooks])

  // Escape closes drawer when not saving
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [saving, onClose])

  // Lock background page scroll while bottom sheet is open
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [])

  const hasChanged = useMemo(() => {
    if (draftBooks.length !== books.length) {
      return true
    }
    for (let i = 0; i < draftBooks.length; i += 1) {
      if (draftBooks[i].id !== books[i].id) {
        return true
      }
    }
    return false
  }, [draftBooks, books])

  const moveBookBy = (index: number, delta: -1 | 1) => {
    const targetIndex = index + delta
    if (targetIndex < 0 || targetIndex >= draftBooksRef.current.length) {
      return
    }
    setDraftBooks((prev) => {
      if (targetIndex < 0 || targetIndex >= prev.length) {
        return prev
      }
      const next = [...prev]
      const [moved] = next.splice(index, 1)
      next.splice(targetIndex, 0, moved)
      draftBooksRef.current = next
      return next
    })
  }

  const handleGripPointerDown = (
    bookId: number,
    event: PointerEvent<HTMLButtonElement>,
  ) => {
    if (saving || !event.isPrimary) {
      return
    }
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    draggingIdRef.current = bookId
    activePointerIdRef.current = event.pointerId
    setDraggingBookId(bookId)
  }

  const handleGripPointerMove = (
    bookId: number,
    event: PointerEvent<HTMLButtonElement>,
  ) => {
    if (
      draggingIdRef.current !== bookId ||
      activePointerIdRef.current !== event.pointerId
    ) {
      return
    }
    event.preventDefault()

    const listEl = listContainerRef.current
    if (listEl) {
      const containerRect = listEl.getBoundingClientRect()
      const edgeZone = 54
      if (event.clientY < containerRect.top + edgeZone) {
        listEl.scrollTop -= 10
      } else if (event.clientY > containerRect.bottom - edgeZone) {
        listEl.scrollTop += 10
      }
    }

    const currentList = draftBooksRef.current
    const currentIndex = currentList.findIndex((b) => b.id === bookId)
    if (currentIndex === -1) {
      return
    }

    // Check upward swap against previous sibling midpoint
    if (currentIndex > 0) {
      const prevBook = currentList[currentIndex - 1]
      const prevNode = rowNodesRef.current.get(prevBook.id)
      if (prevNode) {
        const rect = prevNode.getBoundingClientRect()
        if (event.clientY < rect.top + rect.height * 0.55) {
          const next = [...currentList]
          next[currentIndex - 1] = currentList[currentIndex]
          next[currentIndex] = prevBook
          draftBooksRef.current = next
          setDraftBooks(next)
          return
        }
      }
    }

    // Check downward swap against next sibling midpoint
    if (currentIndex < currentList.length - 1) {
      const nextBook = currentList[currentIndex + 1]
      const nextNode = rowNodesRef.current.get(nextBook.id)
      if (nextNode) {
        const rect = nextNode.getBoundingClientRect()
        if (event.clientY > rect.top + rect.height * 0.45) {
          const next = [...currentList]
          next[currentIndex + 1] = currentList[currentIndex]
          next[currentIndex] = nextBook
          draftBooksRef.current = next
          setDraftBooks(next)
        }
      }
    }
  }

  const endGripDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (activePointerIdRef.current === event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      draggingIdRef.current = null
      activePointerIdRef.current = null
      setDraggingBookId(null)
    }
  }

  const handleConfirm = async () => {
    if (saving) {
      return
    }
    if (!hasChanged) {
      onClose()
      return
    }
    await onSave(draftBooks.map((b) => b.id))
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reorder-drawer-title"
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-zinc-950/40 backdrop-blur-[2px]"
        onClick={() => !saving && onClose()}
      />

      {/* Drawer Panel */}
      <div className="relative z-10 flex max-h-[86dvh] w-full flex-col rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
          <div className="min-w-0">
            <h2
              id="reorder-drawer-title"
              className="text-base font-semibold tracking-tight text-zinc-900"
            >
              调整书架顺序
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              按住右侧手柄上下拖动，或轻点上下箭头微调
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            aria-label="关闭排序面板"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="mx-5 mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
          >
            {errorMsg}
          </div>
        )}

        {/* Scrollable Vertical Book List */}
        <div
          ref={listContainerRef}
          className="flex-1 overflow-y-auto px-4 py-3"
        >
          <ul className="space-y-2">
            {draftBooks.map((book, index) => {
              const isDragging = draggingBookId === book.id
              return (
                <li
                  key={book.id}
                  ref={(node) => {
                    if (node) {
                      rowNodesRef.current.set(book.id, node)
                    } else {
                      rowNodesRef.current.delete(book.id)
                    }
                  }}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all select-none ${
                    isDragging
                      ? 'relative z-20 scale-[1.01] border-zinc-900 bg-zinc-50 shadow-lg ring-2 ring-zinc-900/10'
                      : 'border-zinc-200/80 bg-white'
                  }`}
                >
                  {/* Position number */}
                  <span className="w-5 shrink-0 text-center text-[11px] font-medium text-zinc-400 tabular-nums">
                    {index + 1}
                  </span>

                  {/* Mini 2:3 cover thumbnail */}
                  <div className="flex h-12 w-8 shrink-0 items-center justify-center overflow-hidden rounded border border-zinc-200 bg-zinc-50">
                    {book.cover_url ? (
                      <img
                        src={book.cover_url}
                        alt={book.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <BookOpen className="h-3.5 w-3.5 text-zinc-400" strokeWidth={1.6} />
                    )}
                  </div>

                  {/* Book title & author */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900">
                      {book.title}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-zinc-400">
                      {book.author || '未知作者'}
                    </p>
                  </div>

                  {/* Step up/down buttons + touch drag grip */}
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={saving || index === 0}
                      aria-label={`将《${book.title}》上移一位`}
                      onClick={() => moveBookBy(index, -1)}
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      disabled={saving || index === draftBooks.length - 1}
                      aria-label={`将《${book.title}》下移一位`}
                      onClick={() => moveBookBy(index, 1)}
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      aria-label={`按住拖动调整《${book.title}》的顺序`}
                      onPointerDown={(e) => handleGripPointerDown(book.id, e)}
                      onPointerMove={(e) => handleGripPointerMove(book.id, e)}
                      onPointerUp={endGripDrag}
                      onPointerCancel={endGripDrag}
                      className="flex h-9 w-9 touch-none cursor-grab items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 active:cursor-grabbing active:bg-zinc-100 active:text-zinc-900 disabled:opacity-30"
                    >
                      <GripVertical className="h-4.5 w-4.5" strokeWidth={1.75} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Footer */}
        <div className="pb-safe-4 flex items-center justify-between gap-3 border-t border-zinc-100 px-5 pt-3.5">
          <span className="text-xs text-zinc-400">
            {hasChanged ? '顺序已调整，点击完成保存' : `共 ${draftBooks.length} 本书`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="cursor-pointer rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleConfirm()}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? '保存中...' : '完成'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

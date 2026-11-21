import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Images,
  Loader2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getBookIllustrations,
  type BookIllustrationsResponse,
  type IllustrationItem,
} from '../api/books'
import { getApiErrorMessage } from '../api/client'

interface IllustrationGalleryModalProps {
  bookId: number
  bookTitle: string
  currentReadOrderIndex: number
  hideUnread: boolean
  onClose: () => void
}

export function IllustrationGalleryModal({
  bookId,
  bookTitle,
  currentReadOrderIndex,
  hideUnread,
  onClose,
}: IllustrationGalleryModalProps) {
  const [data, setData] = useState<BookIllustrationsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [revealedIndices, setRevealedIndices] = useState<Set<number>>(() => new Set())
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false

    void getBookIllustrations(bookId)
      .then((res) => {
        if (!cancelled) {
          setData(res)
          setErrorMsg(null)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMsg(getApiErrorMessage(error, '无法加载全书插画列表'))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [bookId])

  const illustrations = useMemo(() => data?.illustrations ?? [], [data])

  const isSpoilerLocked = useCallback(
    (item: IllustrationItem, index: number): boolean => {
      if (!hideUnread || item.is_cover) {
        return false
      }
      if (revealedIndices.has(index)) {
        return false
      }
      return item.chapter_order_index > currentReadOrderIndex
    },
    [hideUnread, currentReadOrderIndex, revealedIndices],
  )

  const unlockedIndices = useMemo(() => {
    const result: number[] = []
    illustrations.forEach((item, index) => {
      if (!isSpoilerLocked(item, index)) {
        result.push(index)
      }
    })
    return result
  }, [illustrations, isSpoilerLocked])

  const stepLightbox = useCallback(
    (direction: -1 | 1) => {
      if (lightboxIndex === null || unlockedIndices.length <= 1) {
        return
      }
      const pos = unlockedIndices.indexOf(lightboxIndex)
      if (pos === -1) {
        return
      }
      const nextPos = pos + direction
      if (nextPos >= 0 && nextPos < unlockedIndices.length) {
        setLightboxIndex(unlockedIndices[nextPos])
      }
    },
    [lightboxIndex, unlockedIndices],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (lightboxIndex !== null) {
          setLightboxIndex(null)
        } else {
          onClose()
        }
      } else if (lightboxIndex !== null && event.key === 'ArrowLeft') {
        event.preventDefault()
        stepLightbox(-1)
      } else if (lightboxIndex !== null && event.key === 'ArrowRight') {
        event.preventDefault()
        stepLightbox(1)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lightboxIndex, onClose, stepLightbox])

  const handleCardClick = (item: IllustrationItem, index: number) => {
    if (isSpoilerLocked(item, index)) {
      setRevealedIndices((prev) => {
        const next = new Set(prev)
        next.add(index)
        return next
      })
      return
    }
    setLightboxIndex(index)
  }

  const activeLightboxItem =
    lightboxIndex !== null ? illustrations[lightboxIndex] ?? null : null
  const activeUnlockedPos =
    lightboxIndex !== null ? unlockedIndices.indexOf(lightboxIndex) : -1
  const hasPrevLightbox = activeUnlockedPos > 0
  const hasNextLightbox =
    activeUnlockedPos >= 0 && activeUnlockedPos < unlockedIndices.length - 1

  const lockedCount = illustrations.length - unlockedIndices.length

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="插画画廊"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-zinc-950/45 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Minimalist pure-white gallery container */}
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white text-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-zinc-100 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-900">
              <Images className="h-4.5 w-4.5" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold tracking-tight text-zinc-900">
                插画画廊 · {bookTitle}
              </h2>
              <p className="mt-0.5 text-xs text-zinc-400">
                {loading
                  ? '正在整理全书插画...'
                  : `共 ${illustrations.length} 张${
                      hideUnread && lockedCount > 0
                        ? ` · 已防剧透隐藏 ${lockedCount} 张未读章节插画`
                        : ''
                    }`}
              </p>
            </div>
          </div>

          <button
            type="button"
            aria-label="关闭插画画廊"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Grid body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-zinc-400">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
              <p className="mt-3 text-sm">正在加载插画...</p>
            </div>
          ) : errorMsg ? (
            <div className="py-20 text-center text-sm text-rose-600">
              {errorMsg}
            </div>
          ) : illustrations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-zinc-400">
              <Images className="h-8 w-8 text-zinc-300" strokeWidth={1.5} />
              <p className="mt-3 text-sm text-zinc-500">
                本书暂未提取到插画资源
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {illustrations.map((item, index) => {
                const locked = isSpoilerLocked(item, index)
                return (
                  <button
                    key={`${item.url}-${index}`}
                    type="button"
                    onClick={() => handleCardClick(item, index)}
                    className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 text-left transition hover:border-zinc-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
                  >
                    <div className="relative aspect-[3/4] w-full overflow-hidden bg-zinc-100">
                      <img
                        src={item.url}
                        alt={locked ? '未读章节插画' : item.alt || item.chapter_title}
                        loading="lazy"
                        className={`h-full w-full object-cover transition duration-300 ${
                          locked
                            ? 'scale-110 blur-xl brightness-90'
                            : 'group-hover:scale-[1.03]'
                        }`}
                      />

                      {locked ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/35 px-3 text-center text-white backdrop-blur-[2px]">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 backdrop-blur-xs">
                            <EyeOff className="h-4 w-4" strokeWidth={1.75} />
                          </div>
                          <span className="mt-2.5 text-xs font-medium tracking-wide">
                            未读章节
                          </span>
                          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] text-zinc-100">
                            <Eye className="h-2.5 w-2.5" />
                            点击临时查看
                          </span>
                        </div>
                      ) : (
                        <div className="pointer-events-none absolute inset-0 bg-zinc-950/0 transition group-hover:bg-zinc-950/10" />
                      )}
                    </div>

                    <div className="border-t border-zinc-100 bg-white px-3 py-2">
                      <p className="truncate text-xs font-medium text-zinc-800">
                        {item.chapter_title}
                      </p>
                      <p className="mt-0.5 text-[10px] text-zinc-400">
                        {item.is_cover ? '书籍封面' : `第 ${item.chapter_order_index} 章`}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Lightbox */}
      {activeLightboxItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="插画全屏预览"
          className="fixed inset-0 z-60 flex flex-col bg-zinc-950/92 text-white backdrop-blur-sm"
          onClick={() => setLightboxIndex(null)}
        >
          {/* Top bar */}
          <div
            className="flex items-center justify-between px-4 py-3.5 sm:px-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">
                {activeLightboxItem.chapter_title}
              </p>
              <p className="text-xs text-zinc-400 tabular-nums">
                {activeUnlockedPos + 1} / {unlockedIndices.length}
                {hideUnread && lockedCount > 0 ? '（仅在已解锁插画间切换）' : ''}
              </p>
            </div>

            <button
              type="button"
              aria-label="退出全屏预览"
              onClick={() => setLightboxIndex(null)}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>

          {/* Center image stage */}
          <div className="relative flex flex-1 items-center justify-center overflow-hidden px-12 pb-6 sm:px-16">
            {hasPrevLightbox && (
              <button
                type="button"
                aria-label="上一张插画"
                onClick={(e) => {
                  e.stopPropagation()
                  stepLightbox(-1)
                }}
                className="absolute left-3 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:left-6"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}

            <img
              src={activeLightboxItem.url}
              alt={activeLightboxItem.alt || activeLightboxItem.chapter_title}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[82vh] max-w-full rounded-md object-contain shadow-2xl select-none"
            />

            {hasNextLightbox && (
              <button
                type="button"
                aria-label="下一张插画"
                onClick={(e) => {
                  e.stopPropagation()
                  stepLightbox(1)
                }}
                className="absolute right-3 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:right-6"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

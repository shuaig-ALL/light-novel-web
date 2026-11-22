import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type TouchEvent,
} from 'react'
import type { ChapterDetailResponse } from '../api/books'

export type PaginatedLanding =
  | { type: 'first' }
  | { type: 'last' }
  | { type: 'percent'; value: number }

export interface PaginatedChapterHandle {
  nextPage: () => void
  prevPage: () => void
  getCurrentPercent: () => number
}

interface PaginatedChapterViewProps {
  chapter: ChapterDetailResponse
  chapterPosition: number | null
  totalChapters: number
  mode: 'slide' | 'flip'
  fontSize: number
  theme: 'light' | 'sepia' | 'dark'
  landing: PaginatedLanding
  onPageStateChange: (state: {
    currentPage: number
    totalPages: number
    percent: number
  }) => void
  onUserPageTurn: (percent: number) => void
  onRequestPrevChapter: () => void
  onRequestNextChapter: () => void
  onToggleChrome: () => void
  onImageClick: (image: { src: string; alt: string | null }) => void
}

const COLUMN_GAP = 48
const SWIPE_THRESHOLD_PX = 42
const SWIPE_HORIZONTAL_RATIO = 1.4
const CLICK_DRAG_MAX_PX = 8
const DESKTOP_GUTTER_MIN_WIDTH = 864

const LEAF_PAPER_STYLES: Record<'light' | 'sepia' | 'dark', string> = {
  light: 'bg-gradient-to-r from-stone-100 via-white to-stone-50 border-r border-stone-200',
  sepia: 'bg-gradient-to-r from-[#eadbc0] via-[#f5ecd9] to-[#efe3cb] border-r border-[#d7c5a3]',
  dark: 'bg-gradient-to-r from-[#1a1d24] via-[#1f232c] to-[#171a20] border-r border-stone-700',
}

function pageToPercent(page: number, total: number): number {
  if (total <= 1) {
    return 0
  }
  return Math.round((Math.min(total - 1, Math.max(0, page)) / (total - 1)) * 1000) / 10
}

function percentToPage(percent: number, total: number): number {
  if (total <= 1) {
    return 0
  }
  const clamped = Math.min(100, Math.max(0, percent))
  return Math.min(total - 1, Math.max(0, Math.round((clamped / 100) * (total - 1))))
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Normalize standalone illustration blocks in EPUB chapter HTML into dedicated
 * full-page `.ln-paginated-plate` containers so iOS Safari never slices an image
 * across two columns or packs two half-images onto one page.
 */
function preparePaginatedHtml(
  rawHtml: string,
  headerInfo?: { position: number; totalChapters: number; wordCount: number; title: string } | null,
): string {
  let processed = rawHtml
  if (rawHtml && /<(img|svg)\b/i.test(rawHtml)) {
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(rawHtml, 'text/html')
      const body = doc.body

      const wrapMediaIntoPlates = (container: Element, mediaNodes: Element[]) => {
        const parent = container.parentNode
        if (!parent) return
        const frag = doc.createDocumentFragment()
        for (const media of mediaNodes) {
          const plate = doc.createElement('div')
          plate.className = 'ln-paginated-plate'
          plate.appendChild(media.cloneNode(true))
          frag.appendChild(plate)
        }
        parent.replaceChild(frag, container)
      }

      const candidates = Array.from(body.querySelectorAll('figure, div, p'))
      for (const el of candidates) {
        if (!el.isConnected) continue
        const mediaNodes = Array.from(el.querySelectorAll('img, svg'))
        if (mediaNodes.length === 0) continue

        const textContent = (el.textContent || '').replace(/[\s\u3000\u00a0]+/g, '')
        if (textContent.length === 0) {
          wrapMediaIntoPlates(el, mediaNodes)
        }
      }

      for (const child of Array.from(body.children)) {
        const tag = child.tagName.toLowerCase()
        if (tag === 'img' || tag === 'svg') {
          const plate = doc.createElement('div')
          plate.className = 'ln-paginated-plate'
          child.replaceWith(plate)
          plate.appendChild(child)
        }
      }

      processed = body.innerHTML
    } catch {
      processed = rawHtml
    }
  }

  if (!headerInfo) {
    return processed
  }

  const wordsBadge =
    headerInfo.wordCount > 0 ? ` · ${headerInfo.wordCount.toLocaleString()} 字` : ''
  const headerHtml =
    `<header class="mb-5 border-b border-current/15 pb-3" style="break-after:avoid;-webkit-column-break-after:avoid">` +
    `<p style="text-indent:0;margin-bottom:0" class="text-xs font-medium tracking-wider uppercase opacity-55">` +
    `Chapter ${headerInfo.position} / ${headerInfo.totalChapters}${wordsBadge}` +
    `</p>` +
    `<h1 class="mt-1.5 text-xl font-bold leading-snug sm:text-2xl">${escapeHtml(headerInfo.title)}</h1>` +
    `</header>`

  return headerHtml + processed
}

export const PaginatedChapterView = forwardRef<
  PaginatedChapterHandle,
  PaginatedChapterViewProps
>(function PaginatedChapterView(
  {
    chapter,
    chapterPosition,
    totalChapters,
    mode,
    fontSize,
    theme,
    landing,
    onPageStateChange,
    onUserPageTurn,
    onRequestPrevChapter,
    onRequestNextChapter,
    onToggleChrome,
    onImageClick,
  },
  ref,
) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)

  const [frameSize, setFrameSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  })
  const [pageState, setPageState] = useState<{
    chapterId: number
    currentPage: number
    totalPages: number
  }>({
    chapterId: chapter.id,
    currentPage: 0,
    totalPages: 1,
  })
  const [flipAnim, setFlipAnim] = useState<{
    key: number
    direction: 'next' | 'prev'
  } | null>(null)

  const ratioRef = useRef<number>(
    landing.type === 'percent' ? landing.value : landing.type === 'last' ? 100 : 0,
  )
  const pendingLastPageRef = useRef<boolean>(landing.type === 'last')
  const flipTimerRef = useRef<number | null>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null)
  const lastSwipeAtRef = useRef<number>(0)

  // Pure illustration frontispiece chapters (0 text words) skip the large header block
  // so every color plate opens cleanly without a blank heading-only page before it.
  const paginatedHtml = useMemo(
    () =>
      preparePaginatedHtml(
        chapter.content_html,
        chapter.word_count > 0
          ? {
              position: chapterPosition ?? chapter.order_index,
              totalChapters,
              wordCount: chapter.word_count,
              title: chapter.title,
            }
          : null,
      ),
    [
      chapter.content_html,
      chapter.word_count,
      chapter.order_index,
      chapter.title,
      chapterPosition,
      totalChapters,
    ],
  )

  // Reset desired target when chapter or landing changes
  useEffect(() => {
    if (landing.type === 'last') {
      ratioRef.current = 100
      pendingLastPageRef.current = true
    } else if (landing.type === 'percent') {
      ratioRef.current = landing.value
      pendingLastPageRef.current = false
    } else {
      ratioRef.current = 0
      pendingLastPageRef.current = false
    }
  }, [chapter.id, landing])

  // Observe frame dimensions cleanly
  useEffect(() => {
    const frameEl = frameRef.current
    if (!frameEl) {
      return
    }

    const updateSize = () => {
      const rect = frameEl.getBoundingClientRect()
      const nextWidth = Math.floor(rect.width)
      const nextHeight = Math.floor(rect.height)
      setFrameSize((prev) =>
        prev.width === nextWidth && prev.height === nextHeight
          ? prev
          : { width: nextWidth, height: nextHeight },
      )
    }

    const rafId = window.requestAnimationFrame(updateSize)
    const observer = new ResizeObserver(() => {
      updateSize()
    })
    observer.observe(frameEl)

    return () => {
      window.cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [])

  // Recalculate total pages whenever chapter, frame size, fontSize, or image loads settle
  useEffect(() => {
    if (frameSize.width <= 0 || frameSize.height <= 0) {
      return
    }

    const measurePages = () => {
      const trackEl = trackRef.current
      if (!trackEl) {
        return
      }
      const stride = frameSize.width + COLUMN_GAP
      const rawScrollWidth = trackEl.scrollWidth
      const computedTotal = Math.max(
        1,
        Math.round((rawScrollWidth + COLUMN_GAP) / stride),
      )

      const nextPage = pendingLastPageRef.current
        ? computedTotal - 1
        : percentToPage(ratioRef.current, computedTotal)

      const nextPercent = pageToPercent(nextPage, computedTotal)
      setPageState({
        chapterId: chapter.id,
        currentPage: nextPage,
        totalPages: computedTotal,
      })
      onPageStateChange({
        currentPage: nextPage,
        totalPages: computedTotal,
        percent: nextPercent,
      })
    }

    let raf2 = 0
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(measurePages)
    })

    const imgNodes = Array.from(trackRef.current?.querySelectorAll('img') ?? [])
    const handleImageSettled = () => {
      window.requestAnimationFrame(measurePages)
    }
    for (const img of imgNodes) {
      if (!img.complete) {
        img.addEventListener('load', handleImageSettled, { once: true })
        img.addEventListener('error', handleImageSettled, { once: true })
      }
    }

    return () => {
      window.cancelAnimationFrame(raf1)
      window.cancelAnimationFrame(raf2)
      for (const img of imgNodes) {
        img.removeEventListener('load', handleImageSettled)
        img.removeEventListener('error', handleImageSettled)
      }
    }
  }, [chapter.id, paginatedHtml, frameSize.width, frameSize.height, fontSize, onPageStateChange])

  useEffect(() => {
    return () => {
      if (flipTimerRef.current !== null) {
        window.clearTimeout(flipTimerRef.current)
      }
    }
  }, [])

  const currentPage =
    pageState.chapterId === chapter.id ? pageState.currentPage : 0
  const totalPages =
    pageState.chapterId === chapter.id ? pageState.totalPages : 1

  const triggerFlipOverlay = useCallback(
    (direction: 'next' | 'prev') => {
      if (mode !== 'flip') {
        return
      }
      if (flipTimerRef.current !== null) {
        window.clearTimeout(flipTimerRef.current)
      }
      setFlipAnim({ key: Date.now() + Math.random(), direction })
      flipTimerRef.current = window.setTimeout(() => {
        setFlipAnim(null)
        flipTimerRef.current = null
      }, 430)
    },
    [mode],
  )

  const goToPage = useCallback(
    (nextPage: number, direction: 'next' | 'prev') => {
      pendingLastPageRef.current = false
      const clamped = Math.min(totalPages - 1, Math.max(0, nextPage))
      const nextPercent = pageToPercent(clamped, totalPages)
      ratioRef.current = nextPercent
      setPageState({
        chapterId: chapter.id,
        currentPage: clamped,
        totalPages,
      })
      triggerFlipOverlay(direction)
      onPageStateChange({
        currentPage: clamped,
        totalPages,
        percent: nextPercent,
      })
      onUserPageTurn(nextPercent)
    },
    [chapter.id, totalPages, triggerFlipOverlay, onPageStateChange, onUserPageTurn],
  )

  const nextPage = useCallback(() => {
    if (currentPage < totalPages - 1) {
      goToPage(currentPage + 1, 'next')
    } else {
      onRequestNextChapter()
    }
  }, [currentPage, totalPages, goToPage, onRequestNextChapter])

  const prevPage = useCallback(() => {
    if (currentPage > 0) {
      goToPage(currentPage - 1, 'prev')
    } else {
      onRequestPrevChapter()
    }
  }, [currentPage, goToPage, onRequestPrevChapter])

  useImperativeHandle(
    ref,
    () => ({
      nextPage,
      prevPage,
      getCurrentPercent: () => pageToPercent(currentPage, totalPages),
    }),
    [nextPage, prevPage, currentPage, totalPages],
  )

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.isPrimary && (event.pointerType !== 'mouse' || event.button === 0)) {
      pointerDownRef.current = { x: event.clientX, y: event.clientY }
    }
  }

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) {
      touchStartRef.current = null
      return
    }
    const touch = event.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start || event.changedTouches.length === 0) {
      return
    }
    const touch = event.changedTouches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    const absX = Math.abs(dx)
    const absY = Math.abs(dy)

    if (absX >= SWIPE_THRESHOLD_PX && absX > absY * SWIPE_HORIZONTAL_RATIO) {
      lastSwipeAtRef.current = Date.now()
      if (dx < 0) {
        nextPage()
      } else {
        prevPage()
      }
    }
  }

  const handleTouchCancel = () => {
    touchStartRef.current = null
  }

  const handleFrameClick = (event: MouseEvent<HTMLDivElement>) => {
    if (Date.now() - lastSwipeAtRef.current < 350) {
      return
    }

    // Ignore click if pointer moved > 8px (drag / swipe / text selection gesture)
    const down = pointerDownRef.current
    pointerDownRef.current = null
    if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > CLICK_DRAG_MAX_PX) {
      return
    }

    const target = event.target as HTMLElement | null
    if (!target) {
      return
    }

    // Priority 1: Inline illustration click always opens fullscreen lightbox
    const imgEl = target.closest('img')
    if (imgEl instanceof HTMLImageElement) {
      event.stopPropagation()
      onImageClick({ src: imgEl.src, alt: imgEl.alt || null })
      return
    }

    // Priority 2: Do not trigger on interactive elements or non-empty text selection
    if (target.closest('a, button, input, textarea')) {
      return
    }
    const selection = window.getSelection()
    if (selection && selection.toString().trim().length > 0) {
      return
    }

    const viewportWidth = window.innerWidth
    if (viewportWidth <= 0) {
      return
    }

    const hasDesktopSideGutters =
      viewportWidth >= DESKTOP_GUTTER_MIN_WIDTH &&
      window.matchMedia('(pointer: fine)').matches

    const relativeX = event.clientX / viewportWidth

    // On desktop wide screens with clickable left/right side gutters:
    // keep interior prose area free of page-turning so users can select/copy text freely.
    // Clean clicks in the center 30%~70% still toggle toolbars.
    if (hasDesktopSideGutters) {
      if (relativeX >= 0.3 && relativeX <= 0.7) {
        onToggleChrome()
      }
      return
    }

    // Mobile / touch / narrow viewport: 3-zone full-screen tap
    // Left (0%~30%) -> prevPage, Center (30%~70%) -> toggle toolbars, Right (70%~100%) -> nextPage
    if (relativeX < 0.3) {
      prevPage()
    } else if (relativeX > 0.7) {
      nextPage()
    } else {
      onToggleChrome()
    }
  }

  const stride = frameSize.width + COLUMN_GAP
  const translateX = Math.round(currentPage * stride)

  const trackStyle: CSSProperties =
    frameSize.width > 0 && frameSize.height > 0
      ? ({
          width: `${frameSize.width}px`,
          height: `${frameSize.height}px`,
          columnWidth: `${frameSize.width}px`,
          columnGap: `${COLUMN_GAP}px`,
          fontSize: `${fontSize}px`,
          transform: `translate3d(-${translateX}px, 0, 0)`,
          WebkitTransform: `translate3d(-${translateX}px, 0, 0)`,
          transition:
            mode === 'slide'
              ? 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)'
              : 'none',
          '--ln-page-h': `${frameSize.height}px`,
          '--ln-page-img-max-h': `${Math.max(160, frameSize.height - 24)}px`,
        } as CSSProperties)
      : { fontSize: `${fontSize}px`, opacity: 0 }

  return (
    <div
      ref={frameRef}
      onPointerDown={handlePointerDown}
      onClick={handleFrameClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      className="ln-flip-stage ln-paginated-viewport relative h-full w-full overflow-hidden select-text"
    >
      {/* Multi-column paginated chapter flow (direct children for strict WebKit column breaks) */}
      <div
        ref={trackRef}
        style={trackStyle}
        className="ln-reader-content ln-reader-paginated"
        dangerouslySetInnerHTML={{ __html: paginatedHtml }}
      />

      {/* 3D Paper-flip leaf & dynamic shadow overlay (flip mode only) */}
      {mode === 'flip' && flipAnim && (
        <div
          key={flipAnim.key}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
        >
          <div className="ln-flip-shadow-sweep absolute inset-0 bg-gradient-to-r from-black/20 via-black/8 to-transparent" />

          <div
            className={`absolute inset-0 rounded-r-sm ${LEAF_PAPER_STYLES[theme]} ${
              flipAnim.direction === 'next' ? 'ln-flip-leaf-next' : 'ln-flip-leaf-prev'
            }`}
          >
            <div className="absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-black/12 to-transparent" />
            <div className="absolute inset-y-0 right-0 w-5 bg-gradient-to-l from-black/10 to-transparent" />
          </div>
        </div>
      )}
    </div>
  )
})

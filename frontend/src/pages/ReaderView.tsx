import {
  ArrowLeft,
  BookOpen,
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Images,
  List,
  Loader2,
  Minus,
  Moon,
  Plus,
  ScrollText,
  Sparkles,
  Sun,
  X,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import type { ReadingMode } from '../api/auth'
import {
  getBookToc,
  getChapterDetail,
  getReadingProgress,
  updateReadingProgress,
  type BookTocResponse,
  type ChapterDetailResponse,
} from '../api/books'
import { getApiErrorMessage, getStoredToken } from '../api/client'
import { AIAssistDrawer } from '../components/AIAssistDrawer'
import { IllustrationGalleryModal } from '../components/IllustrationGalleryModal'
import { InlineImageLightbox } from '../components/InlineImageLightbox'
import {
  PaginatedChapterView,
  type PaginatedChapterHandle,
  type PaginatedLanding,
} from '../components/PaginatedChapterView'
import { useAuth } from '../context/useAuth'

type ReaderTheme = 'light' | 'sepia' | 'dark'

const THEME_STORAGE_KEY = 'ln_reader_theme'
const FONT_SIZE_STORAGE_KEY = 'ln_reader_font_size'
const MIN_FONT_SIZE = 14
const MAX_FONT_SIZE = 26

const THEME_STYLES: Record<
  ReaderTheme,
  {
    label: string
    page: string
    bar: string
    drawer: string
    muted: string
    button: string
    activeChapter: string
    divider: string
  }
> = {
  light: {
    label: '纯白',
    page: 'bg-white text-stone-900',
    bar: 'bg-white/90 border-stone-200 text-stone-800',
    drawer: 'bg-white text-stone-900 border-stone-200',
    muted: 'text-stone-500',
    button: 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100',
    activeChapter: 'bg-amber-50 text-amber-900 font-semibold border-l-2 border-amber-600',
    divider: 'border-stone-200',
  },
  sepia: {
    label: '羊皮纸',
    page: 'bg-[#f5ecd9] text-[#3d2f22]',
    bar: 'bg-[#efe3cb]/92 border-[#dfd0b2] text-[#3d2f22]',
    drawer: 'bg-[#f4e9d3] text-[#3d2f22] border-[#dfd0b2]',
    muted: 'text-[#7c664f]',
    button: 'border-[#d7c5a3] bg-[#ebe0c9] text-[#4c3a29] hover:bg-[#e3d3b4]',
    activeChapter: 'bg-[#e7d6b6] text-[#3d2f22] font-semibold border-l-2 border-[#9a6b32]',
    divider: 'border-[#dfd0b2]',
  },
  dark: {
    label: '暗夜',
    page: 'bg-[#14161b] text-stone-200',
    bar: 'bg-[#1b1e25]/92 border-stone-800 text-stone-200',
    drawer: 'bg-[#1a1d24] text-stone-200 border-stone-800',
    muted: 'text-stone-400',
    button: 'border-stone-700 bg-stone-800/80 text-stone-200 hover:bg-stone-700',
    activeChapter: 'bg-amber-500/15 text-amber-300 font-semibold border-l-2 border-amber-400',
    divider: 'border-stone-800',
  },
}

const READING_MODE_OPTIONS: {
  key: ReadingMode
  label: string
  title: string
  icon: typeof ScrollText
}[] = [
  { key: 'scroll', label: '滚动', title: '纵向滚动阅读', icon: ScrollText },
  { key: 'slide', label: '平移', title: '横向平移分页', icon: Columns2 },
  { key: 'flip', label: '翻页', title: '仿真 3D 翻页', icon: BookOpen },
]

function readInitialTheme(): ReaderTheme {
  const saved = localStorage.getItem(THEME_STORAGE_KEY)
  if (saved === 'light' || saved === 'sepia' || saved === 'dark') {
    return saved
  }
  return 'sepia'
}

function readInitialFontSize(): number {
  const raw = Number(localStorage.getItem(FONT_SIZE_STORAGE_KEY))
  if (Number.isFinite(raw) && raw >= MIN_FONT_SIZE && raw <= MAX_FONT_SIZE) {
    return raw
  }
  return 18
}

function computeScrollPercent(): number {
  const scrollingEl = document.scrollingElement || document.documentElement
  const maxScrollable = scrollingEl.scrollHeight - window.innerHeight
  if (maxScrollable <= 0) {
    return 0
  }
  const scrollTop = window.scrollY || scrollingEl.scrollTop || 0
  const raw = (scrollTop / maxScrollable) * 100
  return Math.round(Math.min(100, Math.max(0, raw)) * 10) / 10
}

function sendProgressKeepalive(
  bookId: number,
  chapterId: number,
  scrollPercent: number,
): void {
  const token = getStoredToken()
  if (!token) {
    return
  }
  const normalized = Math.round(Math.min(100, Math.max(0, scrollPercent)) * 10) / 10
  void fetch(`/api/v1/books/${bookId}/progress`, {
    method: 'PUT',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      chapter_id: chapterId,
      scroll_percent: normalized,
    }),
  }).catch(() => {
    // Ignore unload network interruptions
  })
}

const SCROLL_SYNC_DEBOUNCE_MS = 1500
const PAGE_SYNC_DEBOUNCE_MS = 450
const CHROME_AUTO_HIDE_MS = 3500
const SCROLL_HIDE_THRESHOLD_PX = 28

export function ReaderView() {
  const { user, updatePreferences } = useAuth()
  const { bookId: bookIdParam } = useParams<{ bookId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  const bookId = Number(bookIdParam)
  const isInvalidBookId = !Number.isFinite(bookId) || bookId <= 0
  const readingMode: ReadingMode = user?.reading_mode ?? 'scroll'
  const isPaginated = readingMode === 'slide' || readingMode === 'flip'

  const initialChapterQueryRef = useRef<number | null>(
    Number(searchParams.get('chapter')) || null,
  )
  const articleRef = useRef<HTMLElement | null>(null)
  const paginatedRef = useRef<PaginatedChapterHandle | null>(null)
  const pendingScrollRestoreRef = useRef<{ chapterId: number; percent: number } | null>(null)
  const shouldScrollTopOnNextChapterRef = useRef<boolean>(false)
  const suppressScrollSyncUntilRef = useRef<number>(0)
  const scrollDebounceTimerRef = useRef<number | null>(null)
  const pageSyncTimerRef = useRef<number | null>(null)
  const dirtyScrollRef = useRef<{ chapterId: number; scrollPercent: number } | null>(null)
  const lastSyncedRef = useRef<{ chapterId: number; scrollPercent: number } | null>(null)
  const scrollChromeAnchorYRef = useRef<number>(0)
  const chromeVisibleRef = useRef<boolean>(true)

  const [toc, setToc] = useState<BookTocResponse | null>(null)
  const [activeChapterId, setActiveChapterId] = useState<number | null>(null)
  const [chapter, setChapter] = useState<ChapterDetailResponse | null>(null)

  const [loadedBookId, setLoadedBookId] = useState<number | null>(null)
  const [cloudProgressOrderIndex, setCloudProgressOrderIndex] = useState<number>(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [tocOpen, setTocOpen] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false)
  const [chromeVisible, setChromeVisible] = useState(true)
  const [chromeActivityTick, setChromeActivityTick] = useState(0)
  const [inlineLightbox, setInlineLightbox] = useState<{
    src: string
    alt: string | null
  } | null>(null)

  const [paginatedLanding, setPaginatedLanding] = useState<PaginatedLanding>({
    type: 'first',
  })
  const [paginatedInfo, setPaginatedInfo] = useState<{
    currentPage: number
    totalPages: number
    percent: number
  }>({ currentPage: 0, totalPages: 1, percent: 0 })

  const [theme, setTheme] = useState<ReaderTheme>(readInitialTheme)
  const [fontSize, setFontSize] = useState<number>(readInitialFontSize)

  const styles = THEME_STYLES[theme]
  const loadingToc = !isInvalidBookId && loadedBookId !== bookId && !errorMsg
  const loadingChapter = Boolean(
    !isInvalidBookId &&
      activeChapterId !== null &&
      chapter?.id !== activeChapterId &&
      !errorMsg,
  )
  const displayError = isInvalidBookId ? '无效的书籍 ID。' : errorMsg
  const hasOverlayOpen =
    tocOpen || galleryOpen || aiDrawerOpen || inlineLightbox !== null

  useEffect(() => {
    chromeVisibleRef.current = chromeVisible
    if (chromeVisible) {
      scrollChromeAnchorYRef.current = window.scrollY
    }
  }, [chromeVisible])

  // Auto-hide toolbars after 3.5s of inactivity (paused while any drawer/modal/lightbox is open)
  useEffect(() => {
    if (!chromeVisible || hasOverlayOpen || loadingToc || Boolean(displayError) || !chapter) {
      return
    }
    const timer = window.setTimeout(() => {
      setChromeVisible(false)
    }, CHROME_AUTO_HIDE_MS)

    return () => window.clearTimeout(timer)
  }, [chromeVisible, hasOverlayOpen, chromeActivityTick, loadingToc, displayError, chapter])

  const bumpChromeActivity = useCallback(() => {
    setChromeActivityTick((tick) => tick + 1)
  }, [])

  const syncProgressToCloud = useCallback(
    (targetChapterId: number, scrollPercent: number, force = false) => {
      if (isInvalidBookId) {
        return
      }
      const normalized = Math.round(Math.min(100, Math.max(0, scrollPercent)) * 10) / 10
      const prev = lastSyncedRef.current
      if (
        !force &&
        prev &&
        prev.chapterId === targetChapterId &&
        Math.abs(prev.scrollPercent - normalized) < 0.5
      ) {
        dirtyScrollRef.current = null
        return
      }
      lastSyncedRef.current = { chapterId: targetChapterId, scrollPercent: normalized }
      dirtyScrollRef.current = null
      void updateReadingProgress(bookId, {
        chapter_id: targetChapterId,
        scroll_percent: normalized,
      }).catch(() => {
        // Silent background sync; keep reading uninterrupted
      })
    },
    [bookId, isInvalidBookId],
  )

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(fontSize))
  }, [fontSize])

  // Load book TOC and cloud reading progress in parallel once per bookId
  useEffect(() => {
    if (isInvalidBookId) {
      return
    }

    let cancelled = false

    void Promise.all([
      getBookToc(bookId),
      getReadingProgress(bookId).catch(() => null),
    ])
      .then(([tocData, cloudProgress]) => {
        if (cancelled) return
        setErrorMsg(null)
        setToc(tocData)
        setLoadedBookId(bookId)

        if (tocData.chapters.length === 0) {
          setActiveChapterId(null)
          return
        }

        const validIds = new Set(tocData.chapters.map((c) => c.id))
        const savedChapterId = Number(localStorage.getItem(`ln_last_chapter_${bookId}`)) || null
        const queryChapterId = initialChapterQueryRef.current
        const cloudChapterId =
          cloudProgress && validIds.has(cloudProgress.chapter_id)
            ? cloudProgress.chapter_id
            : null

        let resolvedChapterId = tocData.chapters[0].id
        if (queryChapterId && validIds.has(queryChapterId)) {
          resolvedChapterId = queryChapterId
        } else if (cloudChapterId) {
          resolvedChapterId = cloudChapterId
        } else if (savedChapterId && validIds.has(savedChapterId)) {
          resolvedChapterId = savedChapterId
        }

        shouldScrollTopOnNextChapterRef.current = false
        if (cloudProgress && cloudChapterId) {
          const matchedTocChapter = tocData.chapters.find(
            (c) => c.id === cloudChapterId,
          )
          if (matchedTocChapter) {
            setCloudProgressOrderIndex(matchedTocChapter.order_index)
          }
        }
        if (cloudProgress && cloudChapterId === resolvedChapterId) {
          lastSyncedRef.current = {
            chapterId: cloudProgress.chapter_id,
            scrollPercent: cloudProgress.scroll_percent,
          }
          if (cloudProgress.scroll_percent > 0) {
            pendingScrollRestoreRef.current = {
              chapterId: cloudProgress.chapter_id,
              percent: cloudProgress.scroll_percent,
            }
            setPaginatedLanding({
              type: 'percent',
              value: cloudProgress.scroll_percent,
            })
          } else {
            setPaginatedLanding({ type: 'first' })
          }
        } else {
          setPaginatedLanding({ type: 'first' })
        }

        setActiveChapterId(resolvedChapterId)
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadedBookId(bookId)
          setErrorMsg(getApiErrorMessage(error, '无法加载书籍目录'))
        }
      })

    return () => {
      cancelled = true
    }
  }, [bookId, isInvalidBookId])

  // Load active chapter content
  useEffect(() => {
    if (isInvalidBookId || !activeChapterId) {
      return
    }

    let cancelled = false

    void getChapterDetail(bookId, activeChapterId)
      .then((data) => {
        if (cancelled) return
        setErrorMsg(null)
        setChapter(data)
        localStorage.setItem(`ln_last_chapter_${bookId}`, String(data.id))
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMsg(getApiErrorMessage(error, '无法加载章节内容'))
        }
      })

    return () => {
      cancelled = true
    }
  }, [bookId, isInvalidBookId, activeChapterId])

  // Scroll-mode restoration after chapter DOM mounts (and after illustrations load)
  useEffect(() => {
    if (isPaginated || !chapter) {
      return
    }

    const pending = pendingScrollRestoreRef.current
    if (pending && pending.chapterId === chapter.id) {
      let userInterrupted = false
      let cancelled = false
      let raf1 = 0
      let raf2 = 0
      let settleTimer = 0
      const targetPercent = pending.percent

      const markInterrupted = () => {
        userInterrupted = true
        pendingScrollRestoreRef.current = null
      }

      const applyRestore = () => {
        if (cancelled || userInterrupted) {
          return
        }
        const scrollingEl = document.scrollingElement || document.documentElement
        const maxScrollable = scrollingEl.scrollHeight - window.innerHeight
        if (maxScrollable > 0) {
          suppressScrollSyncUntilRef.current = Date.now() + 800
          window.scrollTo({
            top: (maxScrollable * targetPercent) / 100,
            behavior: 'auto',
          })
        }
      }

      suppressScrollSyncUntilRef.current = Date.now() + 1200

      raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(() => {
          applyRestore()
          settleTimer = window.setTimeout(() => {
            if (!cancelled) {
              applyRestore()
              pendingScrollRestoreRef.current = null
            }
          }, 260)
        })
      })

      const imgNodes = Array.from(articleRef.current?.querySelectorAll('img') ?? [])
      const handleImageLoad = () => {
        applyRestore()
      }
      for (const img of imgNodes) {
        if (!img.complete) {
          img.addEventListener('load', handleImageLoad, { once: true })
        }
      }

      window.addEventListener('wheel', markInterrupted, { passive: true, once: true })
      window.addEventListener('touchstart', markInterrupted, { passive: true, once: true })
      window.addEventListener('pointerdown', markInterrupted, { passive: true, once: true })

      return () => {
        cancelled = true
        window.cancelAnimationFrame(raf1)
        window.cancelAnimationFrame(raf2)
        window.clearTimeout(settleTimer)
        for (const img of imgNodes) {
          img.removeEventListener('load', handleImageLoad)
        }
        window.removeEventListener('wheel', markInterrupted)
        window.removeEventListener('touchstart', markInterrupted)
        window.removeEventListener('pointerdown', markInterrupted)
      }
    }

    if (shouldScrollTopOnNextChapterRef.current) {
      shouldScrollTopOnNextChapterRef.current = false
      suppressScrollSyncUntilRef.current = Date.now() + 700
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [isPaginated, chapter])

  // Scroll-mode debounced silent progress sync + flush on pagehide / unmount
  useEffect(() => {
    if (
      isPaginated ||
      isInvalidBookId ||
      !activeChapterId ||
      !chapter ||
      chapter.id !== activeChapterId
    ) {
      return
    }

    const flushPendingWithKeepalive = () => {
      if (scrollDebounceTimerRef.current !== null) {
        window.clearTimeout(scrollDebounceTimerRef.current)
        scrollDebounceTimerRef.current = null
      }
      const pendingDirty = dirtyScrollRef.current
      if (!pendingDirty || pendingDirty.chapterId !== activeChapterId) {
        return
      }
      const prev = lastSyncedRef.current
      if (
        prev &&
        prev.chapterId === pendingDirty.chapterId &&
        Math.abs(prev.scrollPercent - pendingDirty.scrollPercent) < 0.5
      ) {
        dirtyScrollRef.current = null
        return
      }
      lastSyncedRef.current = pendingDirty
      dirtyScrollRef.current = null
      sendProgressKeepalive(bookId, pendingDirty.chapterId, pendingDirty.scrollPercent)
    }

    const handleScroll = () => {
      if (Date.now() < suppressScrollSyncUntilRef.current) {
        scrollChromeAnchorYRef.current = window.scrollY
        return
      }
      // Auto-dismiss open toolbars once user scrolls deliberately past threshold
      if (
        chromeVisibleRef.current &&
        Math.abs(window.scrollY - scrollChromeAnchorYRef.current) >=
          SCROLL_HIDE_THRESHOLD_PX
      ) {
        setChromeVisible(false)
      }
      const currentPercent = computeScrollPercent()
      dirtyScrollRef.current = {
        chapterId: activeChapterId,
        scrollPercent: currentPercent,
      }
      if (scrollDebounceTimerRef.current !== null) {
        window.clearTimeout(scrollDebounceTimerRef.current)
      }
      scrollDebounceTimerRef.current = window.setTimeout(() => {
        scrollDebounceTimerRef.current = null
        syncProgressToCloud(activeChapterId, computeScrollPercent())
      }, SCROLL_SYNC_DEBOUNCE_MS)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingWithKeepalive()
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('pagehide', flushPendingWithKeepalive)
    window.addEventListener('beforeunload', flushPendingWithKeepalive)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('pagehide', flushPendingWithKeepalive)
      window.removeEventListener('beforeunload', flushPendingWithKeepalive)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      flushPendingWithKeepalive()
    }
  }, [isPaginated, bookId, isInvalidBookId, activeChapterId, chapter, syncProgressToCloud])

  // Paginated-mode keepalive flush on pagehide / unmount
  useEffect(() => {
    if (!isPaginated || isInvalidBookId || !activeChapterId) {
      return
    }

    const flushPaginated = () => {
      if (pageSyncTimerRef.current !== null) {
        window.clearTimeout(pageSyncTimerRef.current)
        pageSyncTimerRef.current = null
      }
      const pendingDirty = dirtyScrollRef.current
      if (!pendingDirty || pendingDirty.chapterId !== activeChapterId) {
        return
      }
      lastSyncedRef.current = pendingDirty
      dirtyScrollRef.current = null
      sendProgressKeepalive(bookId, pendingDirty.chapterId, pendingDirty.scrollPercent)
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushPaginated()
      }
    }

    window.addEventListener('pagehide', flushPaginated)
    window.addEventListener('beforeunload', flushPaginated)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.removeEventListener('pagehide', flushPaginated)
      window.removeEventListener('beforeunload', flushPaginated)
      document.removeEventListener('visibilitychange', handleVisibility)
      flushPaginated()
    }
  }, [isPaginated, bookId, isInvalidBookId, activeChapterId])

  const selectChapter = useCallback(
    (targetId: number, landing: PaginatedLanding = { type: 'first' }) => {
      if (scrollDebounceTimerRef.current !== null) {
        window.clearTimeout(scrollDebounceTimerRef.current)
        scrollDebounceTimerRef.current = null
      }
      if (pageSyncTimerRef.current !== null) {
        window.clearTimeout(pageSyncTimerRef.current)
        pageSyncTimerRef.current = null
      }
      dirtyScrollRef.current = null
      pendingScrollRestoreRef.current = null
      shouldScrollTopOnNextChapterRef.current = landing.type === 'first'
      setPaginatedLanding(landing)
      setActiveChapterId(targetId)
      setSearchParams({ chapter: String(targetId) }, { replace: true })
      setTocOpen(false)
      setChromeVisible(false)
      const initialPercent =
        landing.type === 'last' ? 100 : landing.type === 'percent' ? landing.value : 0
      syncProgressToCloud(targetId, initialPercent, true)
    },
    [setSearchParams, syncProgressToCloud],
  )

  const goPrevChapter = useCallback(() => {
    if (chapter?.prev_chapter_id) {
      selectChapter(
        chapter.prev_chapter_id,
        isPaginated ? { type: 'last' } : { type: 'first' },
      )
    }
  }, [chapter, isPaginated, selectChapter])

  const goNextChapter = useCallback(() => {
    if (chapter?.next_chapter_id) {
      selectChapter(chapter.next_chapter_id, { type: 'first' })
    }
  }, [chapter, selectChapter])

  const handlePaginatedStateChange = useCallback(
    (state: { currentPage: number; totalPages: number; percent: number }) => {
      setPaginatedInfo((prev) =>
        prev.currentPage === state.currentPage &&
        prev.totalPages === state.totalPages &&
        prev.percent === state.percent
          ? prev
          : state,
      )
    },
    [],
  )

  const handlePaginatedUserTurn = useCallback(
    (percent: number) => {
      if (chromeVisibleRef.current) {
        setChromeVisible(false)
      }
      if (!activeChapterId) {
        return
      }
      dirtyScrollRef.current = { chapterId: activeChapterId, scrollPercent: percent }
      if (pageSyncTimerRef.current !== null) {
        window.clearTimeout(pageSyncTimerRef.current)
      }
      pageSyncTimerRef.current = window.setTimeout(() => {
        pageSyncTimerRef.current = null
        syncProgressToCloud(activeChapterId, percent)
      }, PAGE_SYNC_DEBOUNCE_MS)
    },
    [activeChapterId, syncProgressToCloud],
  )

  const handleChangeReadingMode = useCallback(
    (nextMode: ReadingMode) => {
      if (nextMode === readingMode) {
        return
      }
      // Preserve current reading position seamlessly across mode switches
      const currentPercent = isPaginated
        ? (paginatedRef.current?.getCurrentPercent() ?? paginatedInfo.percent)
        : computeScrollPercent()

      if (chapter) {
        if (nextMode === 'scroll') {
          pendingScrollRestoreRef.current = {
            chapterId: chapter.id,
            percent: currentPercent,
          }
          shouldScrollTopOnNextChapterRef.current = false
        } else {
          setPaginatedLanding({ type: 'percent', value: currentPercent })
        }
        syncProgressToCloud(chapter.id, currentPercent)
      }

      void updatePreferences({ reading_mode: nextMode }).catch(() => {
        // Optimistic update rolls back automatically on failure
      })
    },
    [
      readingMode,
      isPaginated,
      paginatedInfo.percent,
      chapter,
      syncProgressToCloud,
      updatePreferences,
    ],
  )

  const toggleChrome = useCallback(() => {
    setChromeVisible((prev) => {
      const next = !prev
      if (next) {
        scrollChromeAnchorYRef.current = window.scrollY
      }
      return next
    })
    setChromeActivityTick((tick) => tick + 1)
  }, [])

  const handleScrollStageClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const target = event.target as HTMLElement | null
      if (!target) {
        return
      }

      // Priority 1: Inline illustration click opens fullscreen lightbox
      const imgEl = target.closest('img')
      if (imgEl instanceof HTMLImageElement) {
        setInlineLightbox({ src: imgEl.src, alt: imgEl.alt || null })
        return
      }

      // Priority 2: Ignore clicks on interactive controls or when text is selected
      if (target.closest('a, button, input, textarea, nav, header, footer')) {
        return
      }
      const selection = window.getSelection()
      if (selection && selection.toString().trim().length > 0) {
        return
      }

      // Priority 3: Center zone tap (horizontal 30%~70%, vertical outside top/bottom bars)
      const vw = window.innerWidth
      const vh = window.innerHeight
      if (vw <= 0 || vh <= 0) {
        return
      }
      const relX = event.clientX / vw
      const inVerticalContentZone = event.clientY > 72 && event.clientY < vh - 64
      if (relX >= 0.3 && relX <= 0.7 && inVerticalContentZone) {
        toggleChrome()
      }
    },
    [toggleChrome],
  )

  // Keyboard shortcuts: Left / Right for page (paginated) or chapter (scroll), Esc to close TOC
  useEffect(() => {
    if (galleryOpen || aiDrawerOpen || inlineLightbox !== null) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (event.key === 'Escape' && tocOpen) {
        setTocOpen(false)
      } else if (event.key === 'ArrowLeft' && !tocOpen) {
        if (isPaginated) {
          paginatedRef.current?.prevPage()
        } else {
          goPrevChapter()
        }
      } else if (event.key === 'ArrowRight' && !tocOpen) {
        if (isPaginated) {
          paginatedRef.current?.nextPage()
        } else {
          goNextChapter()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [galleryOpen, aiDrawerOpen, inlineLightbox, tocOpen, isPaginated, goPrevChapter, goNextChapter])

  const currentReadOrderIndex = useMemo(() => {
    const activeOrder = chapter?.order_index ?? 0
    return Math.max(cloudProgressOrderIndex, activeOrder)
  }, [cloudProgressOrderIndex, chapter])

  const currentChapterPosition = useMemo(() => {
    if (!toc || !chapter) return null
    const idx = toc.chapters.findIndex((c) => c.id === chapter.id)
    return idx >= 0 ? idx + 1 : chapter.order_index
  }, [toc, chapter])

  const canGoPrevPage = Boolean(
    paginatedInfo.currentPage > 0 || chapter?.prev_chapter_id,
  )
  const canGoNextPage = Boolean(
    paginatedInfo.currentPage < paginatedInfo.totalPages - 1 || chapter?.next_chapter_id,
  )

  const showToolbars =
    chromeVisible ||
    tocOpen ||
    galleryOpen ||
    aiDrawerOpen ||
    loadingToc ||
    Boolean(displayError) ||
    !chapter

  return (
    <div
      className={`transition-colors duration-200 ${styles.page} ${
        isPaginated
          ? 'ln-paginated-viewport fixed inset-0 flex h-[100dvh] w-full flex-col overflow-hidden'
          : 'pb-safe min-h-[100dvh]'
      }`}
    >
      {/* Borderless iOS status-bar safe-area mask so scrolling text never collides with the Dynamic Island / clock */}
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed inset-x-0 top-0 z-20 h-[env(safe-area-inset-top,0px)] transition-colors duration-200 ${styles.page}`}
      />

      {/* Floating Top Toolbar across ALL modes (fixed + transform/opacity, zero reflow) */}
      <header
        onPointerDown={bumpChromeActivity}
        onClick={bumpChromeActivity}
        className={`pt-safe fixed inset-x-0 top-0 z-30 border-b backdrop-blur-md transition-all duration-250 ease-out ${
          showToolbars
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none -translate-y-full opacity-0'
        } ${styles.bar}`}
      >
        {/* Row 1: Primary navigation, title, and desktop reading controls */}
        <div className="mx-auto flex h-13 max-w-6xl items-center justify-between gap-2 px-3 sm:h-14 sm:gap-3 sm:px-6">
          {/* Left: Back to shelf + TOC + optional Gallery + AI Assistant */}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Link
              to="/"
              aria-label="返回书架"
              className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition sm:h-auto sm:px-2.5 sm:py-1.5 ${styles.button}`}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden md:inline">返回书架</span>
            </Link>

            <button
              type="button"
              onClick={() => setTocOpen(true)}
              aria-label="打开目录"
              className={`inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition sm:h-auto sm:px-2.5 sm:py-1.5 ${styles.button}`}
            >
              <List className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">目录</span>
            </button>

            {user?.enable_gallery && (
              <button
                type="button"
                onClick={() => setGalleryOpen(true)}
                title="插画画廊"
                aria-label="打开插画画廊"
                className={`inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition sm:h-auto sm:px-2.5 sm:py-1.5 ${styles.button}`}
              >
                <Images className="h-3.5 w-3.5" />
                <span className="hidden md:inline">插画</span>
              </button>
            )}

            {chapter && (
              <button
                type="button"
                onClick={() => setAiDrawerOpen(true)}
                title="防剧透 AI 助手"
                aria-label="打开防剧透 AI 助手"
                className={`inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition sm:h-auto sm:px-2.5 sm:py-1.5 ${styles.button}`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span className="hidden md:inline">AI 助手</span>
              </button>
            )}
          </div>

          {/* Center: Book & chapter title */}
          <div className="min-w-0 flex-1 text-right sm:text-center">
            <p className="truncate text-xs font-semibold sm:text-sm">
              {toc?.title || '加载中...'}
            </p>
            {chapter && (
              <p className={`truncate text-[10px] sm:text-[11px] ${styles.muted}`}>
                {chapter.title}
              </p>
            )}
          </div>

          {/* Right (md+): Reading mode switcher + Font size + Theme switcher */}
          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <div
              role="group"
              aria-label="翻书方式"
              className={`flex items-center rounded-lg border p-0.5 ${styles.divider}`}
            >
              {READING_MODE_OPTIONS.map(({ key, label, title, icon: Icon }) => {
                const active = readingMode === key
                return (
                  <button
                    key={key}
                    type="button"
                    title={title}
                    aria-label={title}
                    aria-pressed={active}
                    onClick={() => handleChangeReadingMode(key)}
                    className={`inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
                      active
                        ? theme === 'dark'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-zinc-900 text-white shadow-xs'
                        : 'opacity-70 hover:opacity-100'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline">{label}</span>
                  </button>
                )
              })}
            </div>

            <div className={`flex items-center rounded-lg border ${styles.divider}`}>
              <button
                type="button"
                aria-label="减小字号"
                disabled={fontSize <= MIN_FONT_SIZE}
                onClick={() => setFontSize((s) => Math.max(MIN_FONT_SIZE, s - 2))}
                className="cursor-pointer px-2 py-1.5 opacity-80 transition hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[34px] text-center text-xs font-medium tabular-nums">
                {fontSize}
              </span>
              <button
                type="button"
                aria-label="增大字号"
                disabled={fontSize >= MAX_FONT_SIZE}
                onClick={() => setFontSize((s) => Math.min(MAX_FONT_SIZE, s + 2))}
                className="cursor-pointer px-2 py-1.5 opacity-80 transition hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className={`flex items-center rounded-lg border p-0.5 ${styles.divider}`}>
              {(
                [
                  { key: 'light', icon: Sun, title: '纯白主题' },
                  { key: 'sepia', icon: BookOpenText, title: '羊皮纸主题' },
                  { key: 'dark', icon: Moon, title: '暗夜主题' },
                ] as const
              ).map(({ key, icon: Icon, title }) => {
                const active = theme === key
                return (
                  <button
                    key={key}
                    type="button"
                    title={title}
                    aria-label={title}
                    onClick={() => setTheme(key)}
                    className={`cursor-pointer rounded-md p-1.5 transition ${
                      active
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'opacity-70 hover:opacity-100'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Row 2 (mobile < md): Compact mode, font-size, and theme controls with zero overflow */}
        <div
          className={`flex items-center justify-between gap-2 border-t px-3 py-1.5 md:hidden ${styles.divider}`}
        >
          {/* Reading mode switcher */}
          <div
            role="group"
            aria-label="翻书方式"
            className={`flex items-center rounded-lg border p-0.5 ${styles.divider}`}
          >
            {READING_MODE_OPTIONS.map(({ key, label, title, icon: Icon }) => {
              const active = readingMode === key
              return (
                <button
                  key={key}
                  type="button"
                  title={title}
                  aria-label={title}
                  aria-pressed={active}
                  onClick={() => handleChangeReadingMode(key)}
                  className={`inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
                    active
                      ? theme === 'dark'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-zinc-900 text-white shadow-xs'
                      : 'opacity-70'
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  <span>{label}</span>
                </button>
              )
            })}
          </div>

          {/* Font size controls */}
          <div className={`flex items-center rounded-lg border ${styles.divider}`}>
            <button
              type="button"
              aria-label="减小字号"
              disabled={fontSize <= MIN_FONT_SIZE}
              onClick={() => setFontSize((s) => Math.max(MIN_FONT_SIZE, s - 2))}
              className="cursor-pointer px-2 py-1 text-xs opacity-80 disabled:opacity-30"
            >
              A-
            </button>
            <span className="min-w-[26px] text-center text-[11px] tabular-nums">
              {fontSize}
            </span>
            <button
              type="button"
              aria-label="增大字号"
              disabled={fontSize >= MAX_FONT_SIZE}
              onClick={() => setFontSize((s) => Math.min(MAX_FONT_SIZE, s + 2))}
              className="cursor-pointer px-2 py-1 text-xs opacity-80 disabled:opacity-30"
            >
              A+
            </button>
          </div>

          {/* Theme switcher */}
          <div className={`flex items-center rounded-lg border p-0.5 ${styles.divider}`}>
            {(
              [
                { key: 'light', icon: Sun, title: '纯白主题' },
                { key: 'sepia', icon: BookOpenText, title: '羊皮纸主题' },
                { key: 'dark', icon: Moon, title: '暗夜主题' },
              ] as const
            ).map(({ key, icon: Icon, title }) => {
              const active = theme === key
              return (
                <button
                  key={key}
                  type="button"
                  title={title}
                  aria-label={title}
                  onClick={() => setTheme(key)}
                  className={`cursor-pointer rounded-md p-1.5 transition ${
                    active
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'opacity-70'
                  }`}
                >
                  <Icon className="h-3 w-3" />
                </button>
              )
            })}
          </div>
        </div>
      </header>

      {/* Main Reader Stage */}
      {isPaginated ? (
        <>
          <main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4 pt-[calc(0.85rem+env(safe-area-inset-top))] pb-[calc(1.6rem+env(safe-area-inset-bottom))] sm:px-10 md:pt-[calc(4.5rem+env(safe-area-inset-top))] md:pb-[calc(3.75rem+env(safe-area-inset-bottom))]">
            {loadingToc ? (
              <div className="flex flex-1 flex-col items-center justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-amber-600" />
                <p className={`mt-3 text-sm ${styles.muted}`}>正在打开书籍...</p>
              </div>
            ) : displayError ? (
              <div className="my-auto rounded-2xl border border-rose-300/60 bg-rose-500/10 p-8 text-center">
                <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
                  {displayError}
                </p>
                <Link
                  to="/"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2 text-xs font-medium text-white"
                >
                  返回书架
                </Link>
              </div>
            ) : !toc || toc.chapters.length === 0 ? (
              <div className="my-auto text-center">
                <p className={`text-sm ${styles.muted}`}>
                  {toc?.parse_status === 'completed'
                    ? '这本书暂未提取到可阅读章节。'
                    : '这本书尚未解析完成，请稍后返回书架查看。'}
                </p>
                <Link
                  to="/"
                  className={`mt-5 inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-xs font-medium ${styles.button}`}
                >
                  返回书架
                </Link>
              </div>
            ) : loadingChapter && !chapter ? (
              <div className="flex flex-1 flex-col items-center justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-amber-600" />
                <p className={`mt-3 text-sm ${styles.muted}`}>正在加载章节正文...</p>
              </div>
            ) : chapter ? (
              <div
                className={`min-h-0 flex-1 transition-opacity duration-150 ${
                  loadingChapter ? 'opacity-50' : 'opacity-100'
                }`}
              >
                <PaginatedChapterView
                  ref={paginatedRef}
                  chapter={chapter}
                  chapterPosition={currentChapterPosition}
                  totalChapters={toc.chapters.length}
                  mode={readingMode}
                  fontSize={fontSize}
                  theme={theme}
                  landing={paginatedLanding}
                  onPageStateChange={handlePaginatedStateChange}
                  onUserPageTurn={handlePaginatedUserTurn}
                  onRequestPrevChapter={goPrevChapter}
                  onRequestNextChapter={goNextChapter}
                  onToggleChrome={toggleChrome}
                  onImageClick={setInlineLightbox}
                />
              </div>
            ) : null}
          </main>

          {/* Subtle minimal page progress indicator when toolbars are hidden in fullscreen */}
          {toc && chapter && !showToolbars && (
            <div
              aria-hidden="true"
              className={`pb-safe pointer-events-none fixed inset-x-0 bottom-1 z-20 flex justify-center text-[10px] tabular-nums opacity-55 ${styles.muted}`}
            >
              <span>
                {paginatedInfo.currentPage + 1} / {paginatedInfo.totalPages}
              </span>
            </div>
          )}

          {/* Floating Paginated Bottom Bar with iOS bottom safe-area inset */}
          {toc && chapter && (
            <footer
              onPointerDown={bumpChromeActivity}
              onClick={bumpChromeActivity}
              className={`pb-safe fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-md transition-all duration-250 ease-out ${
                showToolbars
                  ? 'translate-y-0 opacity-100'
                  : 'pointer-events-none translate-y-full opacity-0'
              } ${styles.bar}`}
            >
              <div className="mx-auto flex h-12 max-w-3xl items-center justify-between gap-2 px-4 sm:px-10">
                <button
                  type="button"
                  disabled={!canGoPrevPage || loadingChapter}
                  onClick={() => paginatedRef.current?.prevPage()}
                  className={`inline-flex cursor-pointer items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-35 ${styles.button}`}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  {paginatedInfo.currentPage === 0 ? '上一章' : '上一页'}
                </button>

                <button
                  type="button"
                  onClick={() => setTocOpen(true)}
                  className={`cursor-pointer truncate text-xs tabular-nums transition hover:opacity-100 ${styles.muted}`}
                >
                  {paginatedInfo.currentPage + 1}/{paginatedInfo.totalPages} 页 ·
                  {currentChapterPosition}/{toc.chapters.length} 章
                </button>

                <button
                  type="button"
                  disabled={!canGoNextPage || loadingChapter}
                  onClick={() => paginatedRef.current?.nextPage()}
                  className={`inline-flex cursor-pointer items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-35 ${styles.button}`}
                >
                  {paginatedInfo.currentPage >= paginatedInfo.totalPages - 1
                    ? '下一章'
                    : '下一页'}
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </footer>
          )}
        </>
      ) : (
        <>
          <main
            onClick={handleScrollStageClick}
            className="mx-auto max-w-3xl px-5 pt-[calc(6.5rem+env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-10 md:pt-[calc(5.25rem+env(safe-area-inset-top))]"
          >
            {loadingToc ? (
              <div className="flex flex-col items-center justify-center py-32">
                <Loader2 className="h-7 w-7 animate-spin text-amber-600" />
                <p className={`mt-3 text-sm ${styles.muted}`}>正在打开书籍...</p>
              </div>
            ) : displayError ? (
              <div className="my-16 rounded-2xl border border-rose-300/60 bg-rose-500/10 p-8 text-center">
                <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
                  {displayError}
                </p>
                <Link
                  to="/"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2 text-xs font-medium text-white"
                >
                  返回书架
                </Link>
              </div>
            ) : !toc || toc.chapters.length === 0 ? (
              <div className="my-16 text-center">
                <p className={`text-sm ${styles.muted}`}>
                  {toc?.parse_status === 'completed'
                    ? '这本书暂未提取到可阅读章节。'
                    : '这本书尚未解析完成，请稍后返回书架查看。'}
                </p>
                <Link
                  to="/"
                  className={`mt-5 inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-xs font-medium ${styles.button}`}
                >
                  返回书架
                </Link>
              </div>
            ) : loadingChapter && !chapter ? (
              <div className="flex flex-col items-center justify-center py-32">
                <Loader2 className="h-7 w-7 animate-spin text-amber-600" />
                <p className={`mt-3 text-sm ${styles.muted}`}>正在加载章节正文...</p>
              </div>
            ) : chapter ? (
              <>
                <div className={`mb-8 border-b pb-5 ${styles.divider}`}>
                  <p className={`text-xs font-medium tracking-wider uppercase ${styles.muted}`}>
                    Chapter {currentChapterPosition} / {toc.chapters.length}
                    {chapter.word_count > 0 ? ` · ${chapter.word_count.toLocaleString()} 字` : ''}
                  </p>
                  <h1 className="mt-2 text-2xl font-bold leading-snug sm:text-3xl">
                    {chapter.title}
                  </h1>
                </div>

                <article
                  ref={articleRef}
                  style={{ fontSize: `${fontSize}px` }}
                  className={`ln-reader-content transition-opacity duration-150 ${
                    loadingChapter ? 'opacity-50' : 'opacity-100'
                  }`}
                  dangerouslySetInnerHTML={{ __html: chapter.content_html }}
                />

                {/* End-of-chapter inline navigation */}
                <nav
                  aria-label="章节导航"
                  className={`mt-14 flex items-center justify-between gap-3 border-t pt-8 ${styles.divider}`}
                >
                  <button
                    type="button"
                    disabled={!chapter.prev_chapter_id || loadingChapter}
                    onClick={goPrevChapter}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${styles.button}`}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    上一章
                  </button>

                  <button
                    type="button"
                    onClick={() => setTocOpen(true)}
                    className={`cursor-pointer rounded-xl border px-4 py-2.5 text-xs font-medium transition ${styles.button}`}
                  >
                    目录 ({currentChapterPosition}/{toc.chapters.length})
                  </button>

                  <button
                    type="button"
                    disabled={!chapter.next_chapter_id || loadingChapter}
                    onClick={goNextChapter}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${styles.button}`}
                  >
                    下一章
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </nav>
              </>
            ) : null}
          </main>

          {/* Floating Scroll-Mode Bottom Bar (syncs smoothly with top toolbar auto-hide) */}
          {toc && chapter && (
            <footer
              onPointerDown={bumpChromeActivity}
              onClick={bumpChromeActivity}
              className={`pb-safe fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-md transition-all duration-250 ease-out ${
                showToolbars
                  ? 'translate-y-0 opacity-100'
                  : 'pointer-events-none translate-y-full opacity-0'
              } ${styles.bar}`}
            >
              <div className="mx-auto flex h-12 max-w-3xl items-center justify-between gap-2 px-4 sm:px-10">
                <button
                  type="button"
                  disabled={!chapter.prev_chapter_id || loadingChapter}
                  onClick={goPrevChapter}
                  className={`inline-flex cursor-pointer items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-35 ${styles.button}`}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  上一章
                </button>

                <button
                  type="button"
                  onClick={() => setTocOpen(true)}
                  className={`cursor-pointer truncate text-xs tabular-nums transition hover:opacity-100 ${styles.muted}`}
                >
                  目录 · 第 {currentChapterPosition}/{toc.chapters.length} 章
                </button>

                <button
                  type="button"
                  disabled={!chapter.next_chapter_id || loadingChapter}
                  onClick={goNextChapter}
                  className={`inline-flex cursor-pointer items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-35 ${styles.button}`}
                >
                  下一章
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </footer>
          )}
        </>
      )}

      {/* Slide-over TOC Drawer */}
      {tocOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-[1px]"
            onClick={() => setTocOpen(false)}
          />

          <aside
            className={`relative z-10 flex h-full w-full flex-col border-r shadow-2xl sm:w-80 ${styles.drawer}`}
          >
            <div className={`pt-safe border-b ${styles.divider}`}>
              <div className="flex items-start justify-between gap-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  {toc?.cover_url && (
                    <img
                      src={toc.cover_url}
                      alt={toc.title}
                      className="h-14 w-10 shrink-0 rounded object-cover shadow-xs"
                    />
                  )}
                  <div className="min-w-0">
                    <h2 className="line-clamp-2 text-sm font-bold leading-snug">
                      {toc?.title}
                    </h2>
                    <p className={`mt-0.5 truncate text-xs ${styles.muted}`}>
                      {toc?.author || '未知作者'} · 共 {toc?.chapters.length ?? 0} 章
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  aria-label="关闭目录"
                  onClick={() => setTocOpen(false)}
                  className="cursor-pointer rounded-lg p-1.5 opacity-70 transition hover:opacity-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="pb-safe-4 flex-1 overflow-y-auto py-2">
              {toc?.chapters.map((item) => {
                const isActive = item.id === activeChapterId
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectChapter(item.id, { type: 'first' })}
                    className={`flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left text-sm transition hover:bg-black/5 ${
                      isActive ? styles.activeChapter : ''
                    }`}
                  >
                    <span className="truncate">{item.title}</span>
                    {item.word_count > 0 && (
                      <span className={`shrink-0 text-[11px] tabular-nums ${styles.muted}`}>
                        {item.word_count}字
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </aside>
        </div>
      )}

      {/* On-demand spoiler-safe Illustration Gallery & Lightbox */}
      {galleryOpen && user?.enable_gallery && !isInvalidBookId && (
        <IllustrationGalleryModal
          bookId={bookId}
          bookTitle={toc?.title || ''}
          currentReadOrderIndex={currentReadOrderIndex}
          hideUnread={user.hide_unread_illustrations}
          onClose={() => setGalleryOpen(false)}
        />
      )}

      {/* Spoiler-free AI Assistant Right Drawer */}
      {aiDrawerOpen && chapter && !isInvalidBookId && (
        <AIAssistDrawer
          bookId={bookId}
          bookTitle={toc?.title || ''}
          chapterId={chapter.id}
          chapterOrderIndex={chapter.order_index}
          chapterTitle={chapter.title}
          onClose={() => setAiDrawerOpen(false)}
        />
      )}

      {/* Inline Chapter Illustration Lightbox */}
      {inlineLightbox && (
        <InlineImageLightbox
          src={inlineLightbox.src}
          alt={inlineLightbox.alt}
          onClose={() => setInlineLightbox(null)}
        />
      )}
    </div>
  )
}

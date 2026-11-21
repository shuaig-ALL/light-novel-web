import {
  ArrowLeft,
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  List,
  Loader2,
  Minus,
  Moon,
  Plus,
  Sun,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  getBookToc,
  getChapterDetail,
  type BookTocResponse,
  type ChapterDetailResponse,
} from '../api/books'
import { getApiErrorMessage } from '../api/client'

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

export function ReaderView() {
  const { bookId: bookIdParam } = useParams<{ bookId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  const bookId = Number(bookIdParam)
  const isInvalidBookId = !Number.isFinite(bookId) || bookId <= 0
  const initialChapterQueryRef = useRef<number | null>(
    Number(searchParams.get('chapter')) || null,
  )

  const [toc, setToc] = useState<BookTocResponse | null>(null)
  const [activeChapterId, setActiveChapterId] = useState<number | null>(null)
  const [chapter, setChapter] = useState<ChapterDetailResponse | null>(null)

  const [loadedBookId, setLoadedBookId] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [tocOpen, setTocOpen] = useState(false)

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

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(fontSize))
  }, [fontSize])

  // Load book TOC once per bookId
  useEffect(() => {
    if (isInvalidBookId) {
      return
    }

    let cancelled = false

    void getBookToc(bookId)
      .then((data) => {
        if (cancelled) return
        setErrorMsg(null)
        setToc(data)
        setLoadedBookId(bookId)

        if (data.chapters.length === 0) {
          setActiveChapterId(null)
          return
        }

        const validIds = new Set(data.chapters.map((c) => c.id))
        const savedChapterId = Number(localStorage.getItem(`ln_last_chapter_${bookId}`)) || null
        const queryChapterId = initialChapterQueryRef.current

        if (queryChapterId && validIds.has(queryChapterId)) {
          setActiveChapterId(queryChapterId)
        } else if (savedChapterId && validIds.has(savedChapterId)) {
          setActiveChapterId(savedChapterId)
        } else {
          setActiveChapterId(data.chapters[0].id)
        }
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
        window.scrollTo({ top: 0, behavior: 'smooth' })
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

  const selectChapter = useCallback(
    (targetId: number) => {
      setActiveChapterId(targetId)
      setSearchParams({ chapter: String(targetId) }, { replace: true })
      setTocOpen(false)
    },
    [setSearchParams],
  )

  const goPrev = useCallback(() => {
    if (chapter?.prev_chapter_id) {
      selectChapter(chapter.prev_chapter_id)
    }
  }, [chapter, selectChapter])

  const goNext = useCallback(() => {
    if (chapter?.next_chapter_id) {
      selectChapter(chapter.next_chapter_id)
    }
  }, [chapter, selectChapter])

  // Keyboard shortcuts: Left / Right for prev/next chapter, Esc to close TOC
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (event.key === 'Escape' && tocOpen) {
        setTocOpen(false)
      } else if (event.key === 'ArrowLeft' && !tocOpen) {
        goPrev()
      } else if (event.key === 'ArrowRight' && !tocOpen) {
        goNext()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tocOpen, goPrev, goNext])

  const currentChapterPosition = useMemo(() => {
    if (!toc || !chapter) return null
    const idx = toc.chapters.findIndex((c) => c.id === chapter.id)
    return idx >= 0 ? idx + 1 : chapter.order_index
  }, [toc, chapter])

  return (
    <div className={`min-h-screen transition-colors duration-200 ${styles.page}`}>
      {/* Sticky Top Toolbar */}
      <header
        className={`sticky top-0 z-30 border-b backdrop-blur-md transition-colors duration-200 ${styles.bar}`}
      >
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-3 sm:px-6">
          {/* Left: Back to shelf + TOC trigger */}
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${styles.button}`}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">返回书架</span>
            </Link>

            <button
              type="button"
              onClick={() => setTocOpen(true)}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${styles.button}`}
            >
              <List className="h-3.5 w-3.5" />
              <span>目录</span>
            </button>
          </div>

          {/* Center: Book & chapter title */}
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-sm font-semibold">
              {toc?.title || '加载中...'}
            </p>
            {chapter && (
              <p className={`truncate text-[11px] ${styles.muted}`}>
                {chapter.title}
              </p>
            )}
          </div>

          {/* Right: Font size & theme switcher */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Font size adjuster */}
            <div className={`hidden items-center rounded-lg border sm:flex ${styles.divider}`}>
              <button
                type="button"
                aria-label="减小字号"
                disabled={fontSize <= MIN_FONT_SIZE}
                onClick={() => setFontSize((s) => Math.max(MIN_FONT_SIZE, s - 2))}
                className="cursor-pointer px-2 py-1.5 opacity-80 transition hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[38px] text-center text-xs font-medium tabular-nums">
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

            {/* Theme switcher: Pure White / Sepia / Dark */}
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
      </header>

      {/* Mobile font-size quick bar */}
      <div className={`flex items-center justify-center gap-3 border-b py-1.5 text-xs sm:hidden ${styles.divider}`}>
        <span className={styles.muted}>字号</span>
        <button
          type="button"
          disabled={fontSize <= MIN_FONT_SIZE}
          onClick={() => setFontSize((s) => Math.max(MIN_FONT_SIZE, s - 2))}
          className={`rounded border px-2 py-0.5 ${styles.button} disabled:opacity-40`}
        >
          A-
        </button>
        <span className="tabular-nums">{fontSize}px</span>
        <button
          type="button"
          disabled={fontSize >= MAX_FONT_SIZE}
          onClick={() => setFontSize((s) => Math.min(MAX_FONT_SIZE, s + 2))}
          className={`rounded border px-2 py-0.5 ${styles.button} disabled:opacity-40`}
        >
          A+
        </button>
      </div>

      {/* Main Reader Content */}
      <main className="mx-auto max-w-3xl px-5 pt-8 pb-24 sm:px-10 sm:pt-12">
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
              style={{ fontSize: `${fontSize}px` }}
              className={`ln-reader-content transition-opacity duration-150 ${
                loadingChapter ? 'opacity-50' : 'opacity-100'
              }`}
              dangerouslySetInnerHTML={{ __html: chapter.content_html }}
            />

            {/* Bottom chapter navigation */}
            <nav
              aria-label="章节导航"
              className={`mt-14 flex items-center justify-between gap-3 border-t pt-8 ${styles.divider}`}
            >
              <button
                type="button"
                disabled={!chapter.prev_chapter_id || loadingChapter}
                onClick={goPrev}
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
                onClick={goNext}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${styles.button}`}
              >
                下一章
                <ChevronRight className="h-4 w-4" />
              </button>
            </nav>
          </>
        ) : null}
      </main>

      {/* Slide-over TOC Drawer */}
      {tocOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-[1px]"
            onClick={() => setTocOpen(false)}
          />

          {/* Drawer panel */}
          <aside
            className={`relative z-10 flex h-full w-80 max-w-[85vw] flex-col border-r shadow-2xl ${styles.drawer}`}
          >
            <div className={`flex items-start justify-between gap-3 border-b p-4 ${styles.divider}`}>
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

            <div className="flex-1 overflow-y-auto py-2">
              {toc?.chapters.map((item) => {
                const isActive = item.id === activeChapterId
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectChapter(item.id)}
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
    </div>
  )
}

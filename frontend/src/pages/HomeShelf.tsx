import {
  BookOpen,
  Loader2,
  LogOut,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteBook, getBooks, uploadBook, type BookListItem } from '../api/books'
import { getApiErrorMessage } from '../api/client'
import { BookShelf } from '../components/BookShelf'
import { useAuth } from '../context/useAuth'

type ShelfSortKey = 'recent_read' | 'recent_upload' | 'title'

const SORT_OPTIONS: { key: ShelfSortKey; label: string }[] = [
  { key: 'recent_read', label: '最近阅读' },
  { key: 'recent_upload', label: '最近上传' },
  { key: 'title', label: '书名' },
]

function parseTimestamp(iso: string | null): number {
  if (!iso) return 0
  const parsed = Date.parse(iso)
  return Number.isFinite(parsed) ? parsed : 0
}

export function HomeShelf() {
  const navigate = useNavigate()
  const { user, updatePreferences, logout } = useAuth()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const dragCounterRef = useRef(0)

  const [books, setBooks] = useState<BookListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedBookId, setExpandedBookId] = useState<number | null>(null)
  const [uploadState, setUploadState] = useState<{
    current: number
    total: number
    percent: number
  } | null>(null)
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<ShelfSortKey>('recent_read')

  const [bookToDelete, setBookToDelete] = useState<BookListItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [prefsError, setPrefsError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ type: 'info' | 'error'; text: string } | null>(null)

  const uploading = uploadState !== null

  const refreshBooks = useCallback(async (showSpinner = false) => {
    if (showSpinner) {
      setLoading(true)
    }
    try {
      const data = await getBooks()
      setBooks(data)
    } catch (error) {
      if (showSpinner) {
        setNotice({
          type: 'error',
          text: getApiErrorMessage(error, '无法加载书架列表，请确认后端服务已启动'),
        })
      }
    } finally {
      if (showSpinner) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void getBooks()
      .then((data) => {
        if (!cancelled) {
          setBooks(data)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setNotice({
            type: 'error',
            text: getApiErrorMessage(error, '无法加载书架列表，请确认后端服务已启动'),
          })
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
  }, [])

  const hasPendingBooks = books.some(
    (b) => b.parse_status === 'pending' || b.parse_status === 'processing',
  )

  // Poll automatically while any book is being parsed in the background
  useEffect(() => {
    if (!hasPendingBooks) {
      return
    }
    const timer = window.setInterval(() => {
      void refreshBooks(false)
    }, 1800)

    return () => window.clearInterval(timer)
  }, [hasPendingBooks, refreshBooks])

  // Close delete confirmation, settings modal, or expanded touch book with Escape
  useEffect(() => {
    if (!bookToDelete && !settingsOpen && expandedBookId === null) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (bookToDelete && !deleting) {
          setBookToDelete(null)
        } else if (settingsOpen) {
          setSettingsOpen(false)
        } else if (expandedBookId !== null) {
          setExpandedBookId(null)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [bookToDelete, deleting, settingsOpen, expandedBookId])

  const filteredAndSortedBooks = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase()
    const matched = keyword
      ? books.filter((book) => {
          const titleMatch = book.title.toLowerCase().includes(keyword)
          const authorMatch = (book.author || '').toLowerCase().includes(keyword)
          return titleMatch || authorMatch
        })
      : books

    return [...matched].sort((a, b) => {
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title, 'zh-CN')
      }
      if (sortBy === 'recent_upload') {
        const diff = parseTimestamp(b.created_at) - parseTimestamp(a.created_at)
        return diff !== 0 ? diff : b.id - a.id
      }
      const readA = parseTimestamp(a.last_read_at)
      const readB = parseTimestamp(b.last_read_at)
      if (readA !== readB) {
        return readB - readA
      }
      const createdDiff = parseTimestamp(b.created_at) - parseTimestamp(a.created_at)
      return createdDiff !== 0 ? createdDiff : b.id - a.id
    })
  }, [books, searchQuery, sortBy])

  const handleTogglePreference = async (
    key: 'enable_gallery' | 'hide_unread_illustrations',
    nextValue: boolean,
  ) => {
    setPrefsError(null)
    setSavingPrefs(true)
    try {
      await updatePreferences({ [key]: nextValue })
    } catch (error) {
      setPrefsError(getApiErrorMessage(error, '保存偏好设置失败，请稍后重试'))
    } finally {
      setSavingPrefs(false)
    }
  }

  const triggerFilePicker = () => {
    fileInputRef.current?.click()
  }

  const handleUploadFiles = useCallback(
    async (incomingFiles: FileList | File[]) => {
      const files = Array.from(incomingFiles)
      if (files.length === 0) {
        return
      }

      const validEpubs = files.filter((file) =>
        file.name.toLowerCase().endsWith('.epub'),
      )
      const skippedCount = files.length - validEpubs.length

      if (validEpubs.length === 0) {
        setNotice({ type: 'error', text: '仅支持导入 .epub 格式的轻小说文件。' })
        return
      }

      setNotice(null)
      const uploadedTitles: string[] = []
      const failedNames: string[] = []

      for (let i = 0; i < validEpubs.length; i += 1) {
        const file = validEpubs[i]
        setUploadState({ current: i + 1, total: validEpubs.length, percent: 0 })
        try {
          const res = await uploadBook(file, (percent) => {
            setUploadState({ current: i + 1, total: validEpubs.length, percent })
          })
          uploadedTitles.push(res.title)
        } catch {
          failedNames.push(file.name)
        }
      }

      setUploadState(null)

      if (uploadedTitles.length > 0) {
        await refreshBooks(false)
        const baseText =
          uploadedTitles.length === 1
            ? `《${uploadedTitles[0]}》已加入书架，正在后台解析封面与章节...`
            : `已批量导入 ${uploadedTitles.length} 本轻小说，正在后台依次解析...`
        const extras: string[] = []
        if (skippedCount > 0) extras.push(`已跳过 ${skippedCount} 个非 EPUB 文件`)
        if (failedNames.length > 0) extras.push(`${failedNames.length} 本上传失败`)
        setNotice({
          type: failedNames.length > 0 ? 'error' : 'info',
          text: extras.length > 0 ? `${baseText}（${extras.join('，')}）` : baseText,
        })
      } else {
        setNotice({
          type: 'error',
          text: `上传失败（${failedNames.join('、')}），请检查文件后重试。`,
        })
      }
    },
    [refreshBooks],
  )

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files
    if (!selectedFiles || selectedFiles.length === 0) {
      return
    }
    const copy = Array.from(selectedFiles)
    event.target.value = ''
    await handleUploadFiles(copy)
  }

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('Files')) {
      return
    }
    event.preventDefault()
    dragCounterRef.current += 1
    setIsDraggingFiles(true)
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('Files')) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('Files')) {
      return
    }
    event.preventDefault()
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
    if (dragCounterRef.current === 0) {
      setIsDraggingFiles(false)
    }
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragCounterRef.current = 0
    setIsDraggingFiles(false)
    if (uploading) {
      return
    }
    const droppedFiles = event.dataTransfer.files
    if (droppedFiles && droppedFiles.length > 0) {
      void handleUploadFiles(droppedFiles)
    }
  }

  const handleBackgroundClick = (event: MouseEvent<HTMLDivElement>) => {
    if (expandedBookId === null) {
      return
    }
    const target = event.target as HTMLElement | null
    if (!target?.closest('[data-book-spine="true"]')) {
      setExpandedBookId(null)
    }
  }

  const handleSelectBook = (book: BookListItem) => {
    setExpandedBookId(null)
    navigate(`/read/${book.id}`)
  }

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const handleConfirmDelete = async () => {
    if (!bookToDelete || deleting) {
      return
    }
    const target = bookToDelete
    setDeleting(true)
    setNotice(null)

    try {
      await deleteBook(target.id)
      localStorage.removeItem(`ln_last_chapter_${target.id}`)
      setBookToDelete(null)
      setExpandedBookId((prev) => (prev === target.id ? null : prev))
      setNotice({ type: 'info', text: `已从书架移除《${target.title}》。` })
      await refreshBooks(false)
    } catch (error) {
      setNotice({
        type: 'error',
        text: getApiErrorMessage(error, '删除失败，请稍后重试'),
      })
    } finally {
      setDeleting(false)
    }
  }

  const uploadButtonLabel = uploadState
    ? uploadState.total > 1
      ? `${uploadState.current}/${uploadState.total} (${uploadState.percent}%)`
      : `${uploadState.percent}%`
    : '导入 EPUB'

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleBackgroundClick}
      className="pb-safe min-h-[100dvh] bg-white text-zinc-900"
    >
      {/* Visually hidden file input using sr-only for reliable iOS Safari Files picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".epub,application/epub+zip"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(e) => void handleFileChange(e)}
      />

      {/* Minimalist pure-white top navigation bar with iOS safe-area top inset */}
      <header className="pt-safe sticky top-0 z-30 border-b border-zinc-100 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-3 sm:h-16 sm:px-8">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-900 sm:h-9 sm:w-9">
              <BookOpen className="h-4 w-4 sm:h-4.5 sm:w-4.5" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold tracking-tight text-zinc-900 sm:text-lg">
                私人轻小说文库
              </h1>
              <p className="hidden text-[11px] text-zinc-400 sm:block">
                Light Novel Library · 藏书 {books.length} 册
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
            {hasPendingBooks && (
              <span className="hidden items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700 md:inline-flex">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />
                后台解析中
              </span>
            )}

            <button
              type="button"
              onClick={() => void refreshBooks(true)}
              title="刷新书架"
              aria-label="刷新书架"
              className="hidden h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900 sm:inline-flex"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
                strokeWidth={1.75}
              />
            </button>

            <button
              type="button"
              disabled={uploading}
              onClick={triggerFilePicker}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 sm:gap-2 sm:px-4 sm:text-sm"
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin sm:h-4 sm:w-4" />
              ) : (
                <Upload className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} />
              )}
              <span className="sm:hidden">{uploading ? uploadButtonLabel : '导入'}</span>
              <span className="hidden sm:inline">{uploadButtonLabel}</span>
            </button>

            <div className="mx-0.5 hidden h-5 w-px bg-zinc-200 sm:block" />

            {user && (
              <div className="hidden items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-medium text-zinc-700 md:inline-flex">
                <User className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.75} />
                <span className="max-w-[110px] truncate">{user.username}</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setPrefsError(null)
                setSettingsOpen(true)
              }}
              title="偏好设置"
              aria-label="偏好设置"
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900"
            >
              <Settings className="h-4 w-4" strokeWidth={1.75} />
            </button>

            <button
              type="button"
              onClick={handleLogout}
              title="退出登录"
              aria-label="退出登录"
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900 md:w-auto md:px-2.5"
            >
              <LogOut className="h-4 w-4 md:h-3.5 md:w-3.5" strokeWidth={1.75} />
              <span className="hidden md:inline">退出</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main bookshelf container */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
        {notice && (
          <div
            className={`mb-5 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs sm:mb-6 sm:text-sm ${
              notice.type === 'error'
                ? 'border-zinc-300 bg-zinc-50 text-zinc-900'
                : 'border-zinc-200 bg-zinc-50/80 text-zinc-700'
            }`}
          >
            <span>{notice.text}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="关闭提示"
              className="cursor-pointer rounded p-1 text-zinc-400 transition hover:text-zinc-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Shelf toolbar: title + minimalist search & sort controls */}
        <div className="mb-6 flex flex-col gap-3 px-0.5 sm:flex-row sm:items-center sm:justify-between sm:px-1">
          <div className="flex items-center justify-between sm:block">
            <div>
              <p className="text-xs font-medium tracking-wider text-zinc-400 uppercase">
                My Bookshelf
              </p>
              {books.length > 0 && (
                <p className="mt-0.5 text-xs text-zinc-400">
                  <span className="hidden sm:inline">
                    悬停书本转正预览 · 支持直接拖入本地 .epub 文件
                  </span>
                  <span className="sm:hidden">
                    轻点书脊展开封面 · 再点即可进入阅读
                  </span>
                </p>
              )}
            </div>
            {hasPendingBooks && (
              <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-700 md:hidden">
                <Loader2 className="h-3 w-3 animate-spin text-zinc-500" />
                解析中
              </span>
            )}
          </div>

          {books.length > 0 && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2.5">
              {/* Minimalist search box (16px on mobile to prevent iOS Safari focus zoom) */}
              <div className="relative w-full sm:w-56">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
                  strokeWidth={1.75}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索书名或作者..."
                  aria-label="搜索书名或作者"
                  className="w-full rounded-lg border border-zinc-200 bg-white py-2 pr-8 pl-8 text-base text-zinc-900 placeholder:text-zinc-400 transition focus:border-zinc-900 focus:outline-none sm:py-1.5 sm:text-xs"
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label="清空搜索"
                    onClick={() => setSearchQuery('')}
                    className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded p-1 text-zinc-400 transition hover:text-zinc-900"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Minimalist sort switcher (full-width 3-column bar on mobile portrait) */}
              <div
                role="group"
                aria-label="书架排序方式"
                className="grid w-full grid-cols-3 items-center rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 sm:inline-flex sm:w-auto"
              >
                {SORT_OPTIONS.map(({ key, label }) => {
                  const active = sortBy === key
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSortBy(key)}
                      className={`cursor-pointer rounded-md px-2.5 py-1.5 text-center text-xs font-medium transition sm:py-1 ${
                        active
                          ? 'bg-white text-zinc-900 shadow-xs'
                          : 'text-zinc-500 hover:text-zinc-800'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {loading && books.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-28 text-zinc-400">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
            <p className="mt-3 text-sm">正在加载私人书架...</p>
          </div>
        ) : books.length > 0 && filteredAndSortedBooks.length === 0 ? (
          <div className="mx-auto mt-10 max-w-md rounded-2xl border border-dashed border-zinc-200 bg-white px-6 py-12 text-center">
            <Search className="mx-auto h-6 w-6 text-zinc-300" strokeWidth={1.75} />
            <p className="mt-3 text-sm font-medium text-zinc-800">
              未找到与「{searchQuery.trim()}」匹配的轻小说
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              试试更换关键词，或清空搜索查看全部藏书
            </p>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="mt-5 cursor-pointer rounded-lg border border-zinc-200 bg-white px-4 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              清空搜索
            </button>
          </div>
        ) : (
          <BookShelf
            books={filteredAndSortedBooks}
            expandedBookId={expandedBookId}
            onExpandBook={setExpandedBookId}
            onSelectBook={handleSelectBook}
            onDeleteBook={setBookToDelete}
            onRequestUpload={triggerFilePicker}
          />
        )}
      </main>

      {/* Fullscreen drag-and-drop EPUB upload overlay */}
      {isDraggingFiles && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-white/88 p-6 backdrop-blur-xs sm:p-10"
        >
          <div className="flex h-full w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed border-zinc-300 bg-white/75 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 text-zinc-900 shadow-xs">
              <Upload className="h-6 w-6" strokeWidth={1.75} />
            </div>
            <p className="mt-5 text-lg font-semibold tracking-tight text-zinc-900">
              松开即可导入轻小说
            </p>
            <p className="mt-1.5 text-xs text-zinc-400">
              支持一次拖入多本本地 .epub 文件，自动加入私人书架并解析
            </p>
          </div>
        </div>
      )}

      {/* Minimalist preferences modal (bottom-sheet style on mobile, centered card on sm+) */}
      {settingsOpen && user && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="preferences-dialog-title"
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
        >
          <div
            className="fixed inset-0 bg-zinc-950/35 backdrop-blur-[2px]"
            onClick={() => setSettingsOpen(false)}
          />

          <div className="pb-safe-4 relative z-10 w-full rounded-t-2xl border border-zinc-200 bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-900">
                  <Settings className="h-4 w-4" strokeWidth={1.75} />
                </div>
                <div>
                  <h2
                    id="preferences-dialog-title"
                    className="text-base font-semibold text-zinc-900"
                  >
                    阅读偏好设置
                  </h2>
                  <p className="text-xs text-zinc-400">
                    修改将实时同步至云端账号（{user.username}）
                  </p>
                </div>
              </div>

              <button
                type="button"
                aria-label="关闭设置"
                onClick={() => setSettingsOpen(false)}
                className="cursor-pointer rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-50 hover:text-zinc-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {prefsError && (
              <div
                role="alert"
                className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
              >
                {prefsError}
              </div>
            )}

            <div className="mt-5 divide-y divide-zinc-100 rounded-xl border border-zinc-200/80 bg-zinc-50/40">
              {/* Switch 1: Enable illustration gallery */}
              <div className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900">
                    启用插画画廊
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                    开启后在阅读器顶部工具栏显示全书插画画廊入口，关闭时保持极简界面。
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={user.enable_gallery}
                  disabled={savingPrefs}
                  onClick={() =>
                    void handleTogglePreference('enable_gallery', !user.enable_gallery)
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-60 ${
                    user.enable_gallery ? 'bg-zinc-900' : 'bg-zinc-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4.5 w-4.5 rounded-full bg-white shadow-xs transition-transform ${
                      user.enable_gallery ? 'translate-x-[22px]' : 'translate-x-[3px]'
                    }`}
                  />
                </button>
              </div>

              {/* Switch 2: Hide unread chapter illustrations */}
              <div className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900">
                    隐藏未读章节插画（防剧透）
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                    画廊中位于当前阅读进度之后的插画默认高斯模糊遮挡，防止提前剧透。
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={user.hide_unread_illustrations}
                  disabled={savingPrefs}
                  onClick={() =>
                    void handleTogglePreference(
                      'hide_unread_illustrations',
                      !user.hide_unread_illustrations,
                    )
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-60 ${
                    user.hide_unread_illustrations ? 'bg-zinc-900' : 'bg-zinc-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4.5 w-4.5 rounded-full bg-white shadow-xs transition-transform ${
                      user.hide_unread_illustrations
                        ? 'translate-x-[22px]'
                        : 'translate-x-[3px]'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between text-xs text-zinc-400">
              <span>{savingPrefs ? '正在同步设置...' : '所有开关改动会自动保存'}</span>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="cursor-pointer rounded-lg border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Minimalist delete confirmation modal */}
      {bookToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-book-dialog-title"
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
        >
          <div
            className="fixed inset-0 bg-zinc-950/35 backdrop-blur-[2px]"
            onClick={() => !deleting && setBookToDelete(null)}
          />

          <div className="pb-safe-4 relative z-10 w-full rounded-t-2xl border border-zinc-200 bg-white p-5 shadow-2xl sm:max-w-sm sm:rounded-2xl sm:p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-900">
                <Trash2 className="h-4.5 w-4.5" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <h2
                  id="delete-book-dialog-title"
                  className="text-base font-semibold text-zinc-900"
                >
                  确认删除书籍？
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
                  即将永久删除
                  <span className="font-medium text-zinc-900">
                    《{bookToDelete.title}》
                  </span>
                  ，包括数据库章节记录与本地 EPUB、封面及插画文件，此操作无法撤销。
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setBookToDelete(null)}
                className="cursor-pointer rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleConfirmDelete()}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {deleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

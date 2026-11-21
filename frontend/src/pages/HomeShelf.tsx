import { BookOpen, Loader2, LogOut, RefreshCw, Settings, Trash2, Upload, User, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteBook, getBooks, uploadBook, type BookListItem } from '../api/books'
import { getApiErrorMessage } from '../api/client'
import { BookShelf } from '../components/BookShelf'
import { useAuth } from '../context/useAuth'

export function HomeShelf() {
  const navigate = useNavigate()
  const { user, updatePreferences, logout } = useAuth()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [books, setBooks] = useState<BookListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [bookToDelete, setBookToDelete] = useState<BookListItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [prefsError, setPrefsError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ type: 'info' | 'error'; text: string } | null>(null)

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

  // Close delete confirmation or settings modal with Escape
  useEffect(() => {
    if (!bookToDelete && !settingsOpen) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (bookToDelete && !deleting) {
          setBookToDelete(null)
        } else if (settingsOpen) {
          setSettingsOpen(false)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [bookToDelete, deleting, settingsOpen])

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

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }

    if (!file.name.toLowerCase().endsWith('.epub')) {
      setNotice({ type: 'error', text: '仅支持上传 .epub 格式的轻小说文件。' })
      return
    }

    setUploading(true)
    setUploadProgress(0)
    setNotice(null)

    try {
      const res = await uploadBook(file, (percent) => setUploadProgress(percent))
      setNotice({
        type: 'info',
        text: `《${res.title}》已加入书架，正在后台解析封面与章节...`,
      })
      await refreshBooks(false)
    } catch (error) {
      setNotice({
        type: 'error',
        text: getApiErrorMessage(error, '上传失败，请检查文件后重试'),
      })
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const handleSelectBook = (book: BookListItem) => {
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

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".epub,application/epub+zip"
        className="hidden"
        onChange={(e) => void handleFileChange(e)}
      />

      {/* Minimalist pure-white top navigation bar */}
      <header className="sticky top-0 z-30 border-b border-zinc-100 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-900">
              <BookOpen className="h-4.5 w-4.5" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-zinc-900 sm:text-lg">
                私人轻小说文库
              </h1>
              <p className="hidden text-[11px] text-zinc-400 sm:block">
                Light Novel Library · 藏书 {books.length} 册
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {hasPendingBooks && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />
                后台解析中
              </span>
            )}

            <button
              type="button"
              onClick={() => void refreshBooks(true)}
              title="刷新书架"
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.75} />
            </button>

            <button
              type="button"
              disabled={uploading}
              onClick={triggerFilePicker}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  上传中 {uploadProgress}%
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" strokeWidth={1.75} />
                  导入 EPUB
                </>
              )}
            </button>

            <div className="mx-0.5 hidden h-5 w-px bg-zinc-200 sm:block" />

            {user && (
              <div className="hidden items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-medium text-zinc-700 sm:inline-flex">
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
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span className="hidden md:inline">退出</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main bookshelf container */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
        {notice && (
          <div
            className={`mb-6 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
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

        <div className="mb-4 flex items-baseline justify-between px-1">
          <p className="text-xs font-medium tracking-wider text-zinc-400 uppercase">
            My Bookshelf
          </p>
          {books.length > 0 && (
            <p className="text-xs text-zinc-400">
              悬停书本转正预览 · 点击进入沉浸式阅读
            </p>
          )}
        </div>

        {loading && books.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-28 text-zinc-400">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
            <p className="mt-3 text-sm">正在加载私人书架...</p>
          </div>
        ) : (
          <BookShelf
            books={books}
            onSelectBook={handleSelectBook}
            onDeleteBook={setBookToDelete}
            onRequestUpload={triggerFilePicker}
          />
        )}
      </main>

      {/* Minimalist preferences modal */}
      {settingsOpen && user && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="preferences-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="fixed inset-0 bg-zinc-950/35 backdrop-blur-[2px]"
            onClick={() => setSettingsOpen(false)}
          />

          <div className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="fixed inset-0 bg-zinc-950/35 backdrop-blur-[2px]"
            onClick={() => !deleting && setBookToDelete(null)}
          />

          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
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

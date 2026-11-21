import { BookOpen, Loader2, RefreshCw, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getBooks, uploadBook, type BookListItem } from '../api/books'
import { getApiErrorMessage } from '../api/client'
import { BookShelf } from '../components/BookShelf'

export function HomeShelf() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [books, setBooks] = useState<BookListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
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
            onRequestUpload={triggerFilePicker}
          />
        )}
      </main>
    </div>
  )
}

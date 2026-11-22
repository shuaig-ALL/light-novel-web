import {
  apiClient,
  clearStoredToken,
  getStoredToken,
  UNAUTHORIZED_EVENT,
} from './client'

export type ParseStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface BookUploadResponse {
  id: number
  title: string
  parse_status: ParseStatus
  message: string
}

export interface BookListItem {
  id: number
  title: string
  author: string | null
  description: string | null
  cover_url: string | null
  spine_color: string
  parse_status: ParseStatus
  parse_error: string | null
  total_chapters: number
  sort_order: number
  last_chapter_title: string | null
  progress_percent: number | null
  last_read_at: string | null
  created_at: string
  updated_at: string
}

export interface ChapterTocItem {
  id: number
  order_index: number
  title: string
  word_count: number
}

export interface BookTocResponse {
  book_id: number
  title: string
  author: string | null
  cover_url: string | null
  spine_color: string
  parse_status: ParseStatus
  total_chapters: number
  chapters: ChapterTocItem[]
}

export interface ChapterDetailResponse {
  id: number
  book_id: number
  order_index: number
  title: string
  content_html: string
  word_count: number
  prev_chapter_id: number | null
  next_chapter_id: number | null
}

export interface BookDeleteResponse {
  id: number
  title: string
  message: string
}

export interface BookReorderResponse {
  updated_count: number
  book_ids: number[]
  message: string
}

export interface ReadingProgress {
  book_id: number
  chapter_id: number
  scroll_percent: number
  updated_at: string
}

export interface ReadingProgressUpdatePayload {
  chapter_id: number
  scroll_percent: number
}

export interface IllustrationItem {
  url: string
  alt: string | null
  is_cover: boolean
  chapter_id: number | null
  chapter_order_index: number
  chapter_title: string
}

export interface BookIllustrationsResponse {
  book_id: number
  title: string
  total: number
  illustrations: IllustrationItem[]
}

export type AIAssistMode = 'recap' | 'characters' | 'qa'

export interface AIAssistPayload {
  mode: AIAssistMode
  chapter_id?: number
  question?: string
}

export interface AIAssistMeta {
  max_order_index: number
  chapter_title: string
  included_chapters: number
}

export interface AIAssistStreamHandlers {
  onMeta?: (meta: AIAssistMeta) => void
  onDelta: (content: string) => void
  onDone?: () => void
  onError?: (message: string) => void
}

export async function uploadBook(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<BookUploadResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const { data } = await apiClient.post<BookUploadResponse>('/books/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (evt) => {
      if (onProgress && evt.total) {
        onProgress(Math.round((evt.loaded * 100) / evt.total))
      }
    },
  })
  return data
}

export async function getBooks(): Promise<BookListItem[]> {
  const { data } = await apiClient.get<BookListItem[]>('/books')
  return data
}

export async function getBookToc(bookId: number): Promise<BookTocResponse> {
  const { data } = await apiClient.get<BookTocResponse>(`/books/${bookId}/toc`)
  return data
}

export async function getChapterDetail(
  bookId: number,
  chapterId: number,
): Promise<ChapterDetailResponse> {
  const { data } = await apiClient.get<ChapterDetailResponse>(
    `/books/${bookId}/chapters/${chapterId}`,
  )
  return data
}

export async function deleteBook(bookId: number): Promise<BookDeleteResponse> {
  const { data } = await apiClient.delete<BookDeleteResponse>(`/books/${bookId}`)
  return data
}

export async function reorderBooks(bookIds: number[]): Promise<BookReorderResponse> {
  const { data } = await apiClient.put<BookReorderResponse>('/books/reorder', {
    book_ids: bookIds,
  })
  return data
}

export async function getReadingProgress(
  bookId: number,
): Promise<ReadingProgress | null> {
  const { data } = await apiClient.get<ReadingProgress | null>(
    `/books/${bookId}/progress`,
  )
  return data
}

export async function updateReadingProgress(
  bookId: number,
  payload: ReadingProgressUpdatePayload,
): Promise<ReadingProgress> {
  const { data } = await apiClient.put<ReadingProgress>(
    `/books/${bookId}/progress`,
    payload,
  )
  return data
}

export async function getBookIllustrations(
  bookId: number,
): Promise<BookIllustrationsResponse> {
  const { data } = await apiClient.get<BookIllustrationsResponse>(
    `/books/${bookId}/illustrations`,
  )
  return data
}

export async function streamBookAIAssist(
  bookId: number,
  payload: AIAssistPayload,
  handlers: AIAssistStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const token = getStoredToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`/api/v1/books/${bookId}/ai/assist`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal,
  })

  if (response.status === 401) {
    clearStoredToken()
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    throw new Error('登录状态已失效，请重新登录。')
  }

  if (!response.ok) {
    let detail = `请求失败（HTTP ${response.status}）`
    try {
      const errJson = await response.json()
      if (typeof errJson?.detail === 'string' && errJson.detail.trim()) {
        detail = errJson.detail.trim()
      }
    } catch {
      // Fall back to default message
    }
    throw new Error(detail)
  }

  if (!response.body) {
    throw new Error('浏览器不支持流式响应读取。')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  const processLine = (rawLine: string) => {
    const line = rawLine.trim()
    if (!line || !line.startsWith('data:')) {
      return
    }
    const jsonPart = line.slice(5).trim()
    if (!jsonPart) {
      return
    }
    try {
      const event = JSON.parse(jsonPart) as
        | ({ type: 'meta' } & AIAssistMeta)
        | { type: 'delta'; content: string }
        | { type: 'done' }
        | { type: 'error'; message: string }

      if (event.type === 'meta') {
        handlers.onMeta?.({
          max_order_index: event.max_order_index,
          chapter_title: event.chapter_title,
          included_chapters: event.included_chapters,
        })
      } else if (event.type === 'delta' && event.content) {
        handlers.onDelta(event.content)
      } else if (event.type === 'error') {
        handlers.onError?.(event.message || 'AI 生成发生错误。')
      } else if (event.type === 'done') {
        handlers.onDone?.()
      }
    } catch {
      // Ignore malformed chunk
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        break
      }
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        processLine(line)
      }
    }
    buffer += decoder.decode()
    if (buffer.trim()) {
      for (const line of buffer.split(/\r?\n/)) {
        processLine(line)
      }
    }
  } finally {
    reader.releaseLock()
  }
}

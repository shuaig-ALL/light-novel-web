import { apiClient } from './client'

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

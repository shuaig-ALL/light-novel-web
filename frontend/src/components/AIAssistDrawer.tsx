import {
  AlertCircle,
  BookText,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { streamBookAIAssist, type AIAssistMode } from '../api/books'

interface AIAssistDrawerProps {
  bookId: number
  bookTitle: string
  chapterId: number
  chapterOrderIndex: number
  chapterTitle: string
  onClose: () => void
}

interface AssistantEntry {
  id: number
  mode: AIAssistMode
  promptLabel: string
  boundaryText: string
  content: string
  streaming: boolean
  error?: string
}

export function AIAssistDrawer({
  bookId,
  bookTitle,
  chapterId,
  chapterOrderIndex,
  chapterTitle,
  onClose,
}: AIAssistDrawerProps) {
  const [entries, setEntries] = useState<AssistantEntry[]>([])
  const [question, setQuestion] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)

  const abortControllerRef = useRef<AbortController | null>(null)
  const listEndRef = useRef<HTMLDivElement | null>(null)
  const nextIdRef = useRef(1)

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setIsStreaming(false)
    setEntries((prev) =>
      prev.map((item) => (item.streaming ? { ...item, streaming: false } : item)),
    )
  }, [])

  // Abort active stream on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  // Close drawer with Escape
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // Keep latest streamed text visible
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [entries])

  const runAssist = useCallback(
    async (mode: AIAssistMode, customQuestion?: string) => {
      if (isStreaming) {
        return
      }

      const trimmedQuestion = customQuestion?.trim()
      if (mode === 'qa' && !trimmedQuestion) {
        return
      }

      const entryId = nextIdRef.current++
      const promptLabel =
        mode === 'recap'
          ? '生成前情提要'
          : mode === 'characters'
            ? '梳理出场角色'
            : trimmedQuestion || '防剧透问答'

      const boundaryText = `第 1 章 ~ 第 ${chapterOrderIndex} 章（${chapterTitle}）`

      setEntries((prev) => [
        ...prev,
        {
          id: entryId,
          mode,
          promptLabel,
          boundaryText,
          content: '',
          streaming: true,
        },
      ])

      const controller = new AbortController()
      abortControllerRef.current = controller
      setIsStreaming(true)

      try {
        await streamBookAIAssist(
          bookId,
          {
            mode,
            chapter_id: chapterId,
            ...(mode === 'qa' ? { question: trimmedQuestion } : {}),
          },
          {
            onMeta: (meta) => {
              setEntries((prev) =>
                prev.map((item) =>
                  item.id === entryId
                    ? {
                        ...item,
                        boundaryText: `第 1 章 ~ 第 ${meta.max_order_index} 章（${meta.chapter_title}）`,
                      }
                    : item,
                ),
              )
            },
            onDelta: (chunk) => {
              setEntries((prev) =>
                prev.map((item) =>
                  item.id === entryId
                    ? { ...item, content: item.content + chunk }
                    : item,
                ),
              )
            },
            onError: (message) => {
              setEntries((prev) =>
                prev.map((item) =>
                  item.id === entryId
                    ? { ...item, error: message, streaming: false }
                    : item,
                ),
              )
            },
            onDone: () => {
              setEntries((prev) =>
                prev.map((item) =>
                  item.id === entryId ? { ...item, streaming: false } : item,
                ),
              )
            },
          },
          controller.signal,
        )
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }
        const message =
          error instanceof Error && error.message
            ? error.message
            : '请求 AI 助手失败，请稍后重试。'
        setEntries((prev) =>
          prev.map((item) =>
            item.id === entryId
              ? { ...item, error: message, streaming: false }
              : item,
          ),
        )
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null
        }
        setIsStreaming(false)
        setEntries((prev) =>
          prev.map((item) =>
            item.id === entryId ? { ...item, streaming: false } : item,
          ),
        )
      }
    },
    [bookId, chapterId, chapterOrderIndex, chapterTitle, isStreaming],
  )

  const handleSubmitQuestion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = question.trim()
    if (!trimmed || isStreaming) {
      return
    }
    setQuestion('')
    void runAssist('qa', trimmed)
  }

  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      const trimmed = question.trim()
      if (trimmed && !isStreaming) {
        setQuestion('')
        void runAssist('qa', trimmed)
      }
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="防剧透 AI 轻小说助手"
      className="fixed inset-0 z-50 flex justify-end"
    >
      {/* Subtle backdrop */}
      <div
        className="fixed inset-0 bg-zinc-950/25 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Minimalist pure-white right drawer */}
      <aside className="relative z-10 flex h-full w-[420px] max-w-[92vw] flex-col border-l border-zinc-200 bg-white text-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-900">
              <Sparkles className="h-4 w-4" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold tracking-tight text-zinc-900">
                AI 伴读助手
              </h2>
              <p className="truncate text-[11px] text-zinc-400">
                {bookTitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {entries.length > 0 && !isStreaming && (
              <button
                type="button"
                title="清空对话"
                aria-label="清空对话"
                onClick={() => setEntries([])}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-400 transition hover:bg-zinc-50 hover:text-zinc-900"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            )}
            <button
              type="button"
              aria-label="关闭 AI 助手"
              onClick={onClose}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Strict spoiler-free boundary indicator */}
        <div className="border-b border-zinc-100 bg-zinc-50/80 px-5 py-2.5">
          <div className="flex items-center gap-2 text-xs text-zinc-600">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-zinc-800" strokeWidth={1.75} />
            <span className="truncate">
              仅基于第 1 章 ~ 第 {chapterOrderIndex} 章（{chapterTitle}）生成，绝不剧透
            </span>
          </div>
        </div>

        {/* Quick one-click action buttons */}
        <div className="grid grid-cols-2 gap-2.5 border-b border-zinc-100 px-5 py-3.5">
          <button
            type="button"
            disabled={isStreaming}
            onClick={() => void runAssist('recap')}
            className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <BookText className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.75} />
            生成前情提要
          </button>

          <button
            type="button"
            disabled={isStreaming}
            onClick={() => void runAssist('characters')}
            className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Users className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.75} />
            梳理出场角色
          </button>
        </div>

        {/* Streaming response history */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {entries.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-400">
                <Sparkles className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <p className="mt-4 text-sm font-medium text-zinc-800">
                严守阅读进度的防剧透伴读
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
                你可以一键回顾前情提要、整理已出场人物关系，或在下方针对当前已读剧情自由提问。
              </p>
            </div>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="space-y-2.5">
                {/* User prompt chip */}
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-zinc-900 px-3.5 py-2 text-xs leading-relaxed text-white">
                    {entry.promptLabel}
                  </div>
                </div>

                {/* Assistant streaming card */}
                <div className="rounded-2xl rounded-tl-sm border border-zinc-200 bg-zinc-50/70 px-4 py-3 text-sm leading-relaxed text-zinc-800">
                  <p className="mb-2 text-[10px] font-medium text-zinc-400">
                    上下文范围：{entry.boundaryText}
                  </p>

                  {entry.error ? (
                    <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-700">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
                      <span>{entry.error}</span>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap break-words text-[13.5px] leading-7 text-zinc-800">
                      {entry.content}
                      {entry.streaming && (
                        <span
                          aria-hidden="true"
                          className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-xs bg-zinc-900 align-middle"
                        />
                      )}
                      {!entry.streaming && !entry.content && (
                        <span className="text-xs text-zinc-400">（已停止生成）</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={listEndRef} />
        </div>

        {/* Bottom Q&A input bar */}
        <form
          onSubmit={handleSubmitQuestion}
          className="border-t border-zinc-100 bg-white px-4 py-3"
        >
          {isStreaming && (
            <div className="mb-2 flex justify-center">
              <button
                type="button"
                onClick={stopStreaming}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600 shadow-xs transition hover:bg-zinc-50 hover:text-zinc-900"
              >
                <Square className="h-3 w-3 fill-current" />
                停止生成
              </button>
            </div>
          )}

          <div className="flex items-end gap-2 rounded-xl border border-zinc-200 bg-zinc-50/60 px-3 py-2 transition focus-within:border-zinc-900 focus-within:bg-white">
            <textarea
              rows={1}
              value={question}
              disabled={isStreaming}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              placeholder="针对已读章节提问（如：主角为什么来到这里？）"
              className="max-h-28 flex-1 resize-none bg-transparent py-1 text-xs leading-5 text-zinc-900 placeholder:text-zinc-400 focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={isStreaming || !question.trim()}
              aria-label="发送防剧透提问"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-zinc-900 text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          </div>
        </form>
      </aside>
    </div>
  )
}

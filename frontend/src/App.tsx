import { useEffect, useState } from 'react'

type HealthStatus =
  | { state: 'loading' }
  | { state: 'ok'; service: string }
  | { state: 'error'; message: string }

const API_BASE_URL = 'http://localhost:8000'

async function fetchHealth(signal?: AbortSignal): Promise<HealthStatus> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/health`, { signal })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const data: { status: string; service: string } = await response.json()
    return { state: 'ok', service: data.service }
  } catch (err) {
    const message = err instanceof Error ? err.message : '无法连接到后端服务'
    return { state: 'error', message }
  }
}

function App() {
  const [health, setHealth] = useState<HealthStatus>({ state: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    void fetchHealth(controller.signal).then((result) => {
      if (!controller.signal.aborted) {
        setHealth(result)
      }
    })
    return () => controller.abort()
  }, [])

  const handleRetry = async () => {
    setHealth({ state: 'loading' })
    const result = await fetchHealth()
    setHealth(result)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <section className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">
          Phase 1 · Skeleton
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-stone-900">
          私人轻小说文库
        </h1>
        <p className="mt-2 text-sm text-stone-600">
          Vite + React + TypeScript + Tailwind CSS 前端骨架已就绪。
        </p>

        <div className="mt-6 rounded-xl border border-stone-200 bg-stone-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-stone-500">
              后端 API 状态
            </span>
            <button
              type="button"
              onClick={() => void handleRetry()}
              className="cursor-pointer rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 transition hover:bg-stone-100"
            >
              重新检测
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2 text-sm">
            {health.state === 'loading' && (
              <>
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400" />
                <span className="text-stone-600">正在检测 /api/v1/health ...</span>
              </>
            )}
            {health.state === 'ok' && (
              <>
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span className="font-medium text-emerald-700">
                  已连接（{health.service}）
                </span>
              </>
            )}
            {health.state === 'error' && (
              <>
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                <span className="text-rose-700">
                  未连接：{health.message}
                </span>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}

export default App

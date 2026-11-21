import { AlertCircle, BookOpen, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { getApiErrorMessage } from '../api/client'
import { useAuth } from '../context/useAuth'

type AuthMode = 'login' | 'register'

export function LoginPage() {
  const { user, initializing, login, register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const redirectTo =
    (location.state as { from?: string } | null)?.from || '/'

  const [mode, setMode] = useState<AuthMode>('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (!initializing && user) {
    return <Navigate to={redirectTo} replace />
  }

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode)
    setErrorMsg(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMsg(null)

    const trimmedUsername = username.trim()
    if (!trimmedUsername) {
      setErrorMsg(mode === 'login' ? '请输入用户名或邮箱。' : '请输入用户名。')
      return
    }

    if (mode === 'register') {
      if (trimmedUsername.length < 2) {
        setErrorMsg('用户名长度至少为 2 个字符。')
        return
      }
      if (!email.trim()) {
        setErrorMsg('请输入邮箱地址。')
        return
      }
      if (password.length < 6) {
        setErrorMsg('密码长度至少为 6 位。')
        return
      }
      if (password !== confirmPassword) {
        setErrorMsg('两次输入的密码不一致。')
        return
      }
    } else if (!password) {
      setErrorMsg('请输入密码。')
      return
    }

    setSubmitting(true)
    try {
      if (mode === 'login') {
        await login({ username: trimmedUsername, password })
      } else {
        await register({
          username: trimmedUsername,
          email: email.trim(),
          password,
        })
      }
      navigate(redirectTo, { replace: true })
    } catch (error) {
      setErrorMsg(
        getApiErrorMessage(
          error,
          mode === 'login' ? '登录失败，请检查账号和密码。' : '注册失败，请检查输入信息。',
        ),
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="pt-safe pb-safe flex min-h-[100dvh] flex-col items-center justify-center bg-white px-4 py-12 text-zinc-900">
      <div className="w-full max-w-[380px]">
        {/* Brand header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-900 shadow-xs">
            <BookOpen className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-zinc-900">
            私人轻小说文库
          </h1>
          <p className="mt-1 text-xs tracking-wide text-zinc-400">
            Light Novel Library
          </p>
        </div>

        {/* Minimalist monochrome card */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-7">
          {/* Segmented mode switcher */}
          <div className="mb-6 grid grid-cols-2 rounded-lg border border-zinc-200 bg-zinc-50 p-1">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`cursor-pointer rounded-md py-1.5 text-sm font-medium transition ${
                mode === 'login'
                  ? 'bg-white text-zinc-900 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`cursor-pointer rounded-md py-1.5 text-sm font-medium transition ${
                mode === 'register'
                  ? 'bg-white text-zinc-900 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              注册
            </button>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs leading-relaxed text-rose-700"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form noValidate onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div>
              <label
                htmlFor="auth-username"
                className="mb-1.5 block text-xs font-medium text-zinc-700"
              >
                {mode === 'login' ? '用户名或邮箱' : '用户名'}
              </label>
              <input
                id="auth-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={mode === 'login' ? '输入用户名或邮箱' : '至少 2 个字符'}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3.5 py-2.5 text-base text-zinc-900 placeholder:text-zinc-400 transition focus:border-zinc-900 focus:outline-none sm:text-sm"
              />
            </div>

            {mode === 'register' && (
              <div>
                <label
                  htmlFor="auth-email"
                  className="mb-1.5 block text-xs font-medium text-zinc-700"
                >
                  邮箱
                </label>
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3.5 py-2.5 text-base text-zinc-900 placeholder:text-zinc-400 transition focus:border-zinc-900 focus:outline-none sm:text-sm"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="auth-password"
                className="mb-1.5 block text-xs font-medium text-zinc-700"
              >
                密码
              </label>
              <div className="relative">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'login' ? '输入密码' : '至少 6 位密码'}
                  className="w-full rounded-lg border border-zinc-200 bg-white py-2.5 pr-10 pl-3.5 text-base text-zinc-900 placeholder:text-zinc-400 transition focus:border-zinc-900 focus:outline-none sm:text-sm"
                />
                <button
                  type="button"
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex cursor-pointer items-center px-3 text-zinc-400 transition hover:text-zinc-700"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" strokeWidth={1.75} />
                  ) : (
                    <Eye className="h-4 w-4" strokeWidth={1.75} />
                  )}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <div>
                <label
                  htmlFor="auth-confirm-password"
                  className="mb-1.5 block text-xs font-medium text-zinc-700"
                >
                  确认密码
                </label>
                <input
                  id="auth-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入密码"
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3.5 py-2.5 text-base text-zinc-900 placeholder:text-zinc-400 transition focus:border-zinc-900 focus:outline-none sm:text-sm"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === 'login'
                ? submitting
                  ? '登录中...'
                  : '进入私人书架'
                : submitting
                  ? '注册中...'
                  : '创建账号并进入'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-[11px] text-zinc-400">
          每位用户拥有独立的私人云端书架与阅读空间
        </p>
      </div>
    </div>
  )
}

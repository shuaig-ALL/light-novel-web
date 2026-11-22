import axios from 'axios'

export const TOKEN_STORAGE_KEY = 'ln_access_token'
export const UNAUTHORIZED_EVENT = 'ln:unauthorized'

export function getStoredToken(): string | null {
  return (
    localStorage.getItem(TOKEN_STORAGE_KEY) ||
    sessionStorage.getItem(TOKEN_STORAGE_KEY)
  )
}

export function setStoredToken(token: string, rememberMe = true): void {
  if (rememberMe) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token)
    sessionStorage.removeItem(TOKEN_STORAGE_KEY)
  } else {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token)
    localStorage.removeItem(TOKEN_STORAGE_KEY)
  }
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
  sessionStorage.removeItem(TOKEN_STORAGE_KEY)
}

export const apiClient = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
})

function isAuthEndpoint(url: string): boolean {
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/register') ||
    url.includes('/auth/me')
  )
}

apiClient.interceptors.request.use((config) => {
  const requestUrl = config.url || ''
  const skipAuthHeader =
    requestUrl.includes('/auth/login') || requestUrl.includes('/auth/register')

  if (!skipAuthHeader) {
    const token = getStoredToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const requestUrl = error.config?.url || ''
      const onLoginPage = window.location.pathname === '/login'

      if (!isAuthEndpoint(requestUrl) && !onLoginPage) {
        clearStoredToken()
        window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
      }
    }
    return Promise.reject(error)
  },
)

export function getApiErrorMessage(error: unknown, fallback = '请求失败，请稍后重试'): string {
  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data
    if (typeof responseData === 'string' && responseData.trim()) {
      return responseData.trim()
    }
    const detail = responseData?.detail
    if (typeof detail === 'string' && detail.trim()) {
      return detail.trim()
    }
    if (Array.isArray(detail) && detail.length > 0) {
      const firstMsg = detail[0]?.msg
      if (typeof firstMsg === 'string' && firstMsg.trim()) {
        return firstMsg.trim()
      }
    }
    return fallback
  }
  if (error instanceof Error && error.message && !error.message.startsWith('Request failed')) {
    return error.message
  }
  return fallback
}

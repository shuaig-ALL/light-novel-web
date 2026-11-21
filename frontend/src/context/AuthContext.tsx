import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  fetchCurrentUser,
  loginUser,
  registerUser,
  type LoginPayload,
  type RegisterPayload,
  type UserInfo,
} from '../api/auth'
import {
  clearStoredToken,
  getStoredToken,
  setStoredToken,
  UNAUTHORIZED_EVENT,
} from '../api/client'
import { AuthContext, type AuthContextValue } from './useAuth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [initializing, setInitializing] = useState<boolean>(() => Boolean(getStoredToken()))

  useEffect(() => {
    const token = getStoredToken()
    if (!token) {
      return
    }

    let cancelled = false
    void fetchCurrentUser()
      .then((me) => {
        if (!cancelled) {
          setUser(me)
        }
      })
      .catch(() => {
        clearStoredToken()
        if (!cancelled) {
          setUser(null)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setInitializing(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null)
    }
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized)
  }, [])

  const login = useCallback(async (payload: LoginPayload): Promise<UserInfo> => {
    const res = await loginUser(payload)
    setStoredToken(res.access_token)
    setUser(res.user)
    return res.user
  }, [])

  const register = useCallback(async (payload: RegisterPayload): Promise<UserInfo> => {
    const res = await registerUser(payload)
    setStoredToken(res.access_token)
    setUser(res.user)
    return res.user
  }, [])

  const logout = useCallback(() => {
    clearStoredToken()
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      initializing,
      login,
      register,
      logout,
    }),
    [user, initializing, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

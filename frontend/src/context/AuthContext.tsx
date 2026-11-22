import axios from 'axios'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  fetchCurrentUser,
  loginUser,
  registerUser,
  updateUserPreferences,
  type LoginPayload,
  type RegisterPayload,
  type UserInfo,
  type UserPreferencesPayload,
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
      .catch((error) => {
        if (
          axios.isAxiosError(error) &&
          (error.response?.status === 401 || error.response?.status === 403)
        ) {
          clearStoredToken()
        }
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
    const rememberMe = payload.remember_me ?? true
    const res = await loginUser({ ...payload, remember_me: rememberMe })
    setStoredToken(res.access_token, rememberMe)
    setUser(res.user)
    return res.user
  }, [])

  const register = useCallback(async (payload: RegisterPayload): Promise<UserInfo> => {
    const res = await registerUser(payload)
    setStoredToken(res.access_token, true)
    setUser(res.user)
    return res.user
  }, [])

  const updatePreferences = useCallback(
    async (payload: UserPreferencesPayload): Promise<UserInfo> => {
      let previousUser: UserInfo | null = null
      setUser((prev) => {
        previousUser = prev
        if (!prev) return prev
        return {
          ...prev,
          ...(payload.enable_gallery !== undefined
            ? { enable_gallery: payload.enable_gallery }
            : {}),
          ...(payload.hide_unread_illustrations !== undefined
            ? { hide_unread_illustrations: payload.hide_unread_illustrations }
            : {}),
          ...(payload.reading_mode !== undefined
            ? { reading_mode: payload.reading_mode }
            : {}),
        }
      })

      try {
        const updated = await updateUserPreferences(payload)
        setUser(updated)
        return updated
      } catch (error) {
        if (previousUser) {
          setUser(previousUser)
        }
        throw error
      }
    },
    [],
  )

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
      updatePreferences,
      logout,
    }),
    [user, initializing, login, register, updatePreferences, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

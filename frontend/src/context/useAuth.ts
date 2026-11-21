import { createContext, useContext } from 'react'
import type { LoginPayload, RegisterPayload, UserInfo } from '../api/auth'

export interface AuthContextValue {
  user: UserInfo | null
  initializing: boolean
  login: (payload: LoginPayload) => Promise<UserInfo>
  register: (payload: RegisterPayload) => Promise<UserInfo>
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth 必须在 AuthProvider 内使用')
  }
  return context
}
